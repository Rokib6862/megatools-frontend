import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { loadFromStorage, saveToStorage } from '../utils/helpers';

// FIX-A1 (v1.1): sound cleanup on unmount — prevent audio leak.
// FIX-A2 (v1.1): Notification safety — permission + HTTPS check.
// FIX-A3 (v1.1): visibilitychange handler no longer fails silently
//                when user._id is null.
// FIX-A4 (v1.1): expose socketUrl via resolveSocketUrl() so
//                components can connect the same way (used by
//                LiveInboxPage polling fallback).
// FIX-A5 (v1.1): `isConnected` derived from socket connect/disconnect
//                events — exposed to pages that need it as dependency.
// FIX-A6 (v1.2): central submission sound + gesture prime + no unmount blanking.
// FIX-A7 (v1.3 — 3-TIER): added `isAdmin` and `isAdminOrOwner` flags.
//                `isOwner` remains for backward compatibility.

const AuthContext = createContext(null);

// ============================================================
// ENTERPRISE SOUND MANAGER — Multi-layer, Never Miss
// ============================================================

const SOUND_FILES = {
  click: '/sounds/Click.mp3',
  session: '/sounds/Session .mp3',
  submission: '/sounds/submission.mp3',
};

const audioPool = { click: [], session: [], submission: [] };
let audioPrimedGlobal = false;

function initAudioPool() {
  Object.keys(SOUND_FILES).forEach(key => {
    audioPool[key] = [];
    for (let i = 0; i < 3; i++) {
      const audio = new Audio(SOUND_FILES[key]);
      audio.preload = 'auto';
      try { audio.load(); } catch (_) {}
      audioPool[key].push(audio);
    }
  });
}

function getAudioInstance(soundKey) {
  const pool = audioPool[soundKey] || [];
  if (pool.length === 0) return null;
  for (const audio of pool) {
    if (audio.paused) return audio;
  }
  return pool[0];
}

function playSound(soundKey) {
  const audio = getAudioInstance(soundKey);
  if (!audio) return;
  try {
    if (audio.duration && isFinite(audio.duration)) {
      audio.currentTime = 0;
    }
  } catch (_) {}
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      const retryPlay = () => {
        try {
          const retry = () => { try { audio.play().catch(() => {}); } catch (_) {} };
          if (audio.readyState >= 3) {
            try { audio.currentTime = 0; } catch (_) {}
            retry();
          } else {
            audio.addEventListener('canplaythrough', retry, { once: true });
            try { audio.load(); } catch (_) {}
          }
        } catch (_) {}
        document.removeEventListener('click', retryPlay);
        document.removeEventListener('touchstart', retryPlay);
        document.removeEventListener('keydown', retryPlay);
      };
      document.addEventListener('click', retryPlay, { once: true });
      document.addEventListener('touchstart', retryPlay, { once: true });
      document.addEventListener('keydown', retryPlay, { once: true });
    });
  }
}

function primeAllAudio() {
  if (audioPrimedGlobal) return;
  audioPrimedGlobal = true;
  Object.keys(audioPool).forEach(key => {
    (audioPool[key] || []).forEach(a => {
      if (!a) return;
      try {
        a.muted = true;
        const p = a.play();
        const restore = () => {
          try { a.pause(); a.currentTime = 0; } catch (_) {}
          try { a.muted = false; } catch (_) {}
        };
        if (p && typeof p.then === 'function') p.then(restore).catch(restore);
        else restore();
      } catch (_) {
        try { a.muted = false; } catch (_) {}
      }
    });
  });
}

function notify(title, body) {
  try {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.isSecureContext &&
      Notification.permission === 'granted'
    ) {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'megatools',
        requireInteraction: true,
        silent: false,
      });
    }
  } catch (e) {}
  const originalTitle = document.title;
  document.title = `🔴 ${title} — Mega Tools`;
  setTimeout(() => { document.title = originalTitle; }, 5000);
}

initAudioPool();

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function resolveSocketUrl() {
  try {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '');
  } catch {}
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return 'http://localhost:5000';
    }
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

const STORAGE_KEYS = {
  SESSION_IDS: 'megatools_unseen_session_ids',
  LINK_COUNT: 'megatools_unseen_link_count',
  CLICK_COUNT: 'megatools_unseen_click_count',
  MEGATOOLS_COUNT: 'megatools_unseen_megatools_count',
};

const CONFIG = {
  SOCKET_RECONNECT_ATTEMPTS: 10,
  SOCKET_RECONNECT_DELAY: 3000,
  SESSION_IDS_MAX: 30,
  VISIBILITY_REFRESH_DELAY: 500,
  VERSION_BUMP_GAP_MS: 500,
  AUTH_CHECK_INTERVAL_MS: 60000,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [linksVersion, setLinksVersion] = useState(0);
  const [usersVersion, setUsersVersion] = useState(0);

  const [unseenSessionIds, setUnseenSessionIds] = useState(() => loadFromStorage(STORAGE_KEYS.SESSION_IDS, []));
  const [unseenLinkCount, setUnseenLinkCount] = useState(() => loadFromStorage(STORAGE_KEYS.LINK_COUNT, 0));
  const [unseenClickCount, setUnseenClickCount] = useState(() => loadFromStorage(STORAGE_KEYS.CLICK_COUNT, 0));
  const [unseenMegaToolsCount, setUnseenMegaToolsCount] = useState(() => loadFromStorage(STORAGE_KEYS.MEGATOOLS_COUNT, 0));

  const socketRef = useRef(null);
  const visibilityTimeoutRef = useRef(null);
  const isInitialMount = useRef(true);
  const isUnmounting = useRef(false);

  const lastClickMapRef = useRef({});
  const socketEventListenersRef = useRef([]);

  const lastSessionsBumpRef = useRef(0);
  const lastLinksBumpRef = useRef(0);
  const lastUsersBumpRef = useRef(0);

  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      try {
        socketEventListenersRef.current.forEach(({ event, handler }) => {
          socketRef.current.off(event, handler);
        });
        socketEventListenersRef.current = [];
        socketRef.current.off();
        socketRef.current.disconnect();
      } catch (e) {}
      socketRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const bumpSessionsVersion = useCallback(() => {
    if (isUnmounting.current) return;
    const now = Date.now();
    if (now - lastSessionsBumpRef.current < CONFIG.VERSION_BUMP_GAP_MS) return;
    lastSessionsBumpRef.current = now;
    setSessionsVersion(v => v + 1);
  }, []);

  const bumpLinksVersion = useCallback(() => {
    if (isUnmounting.current) return;
    const now = Date.now();
    if (now - lastLinksBumpRef.current < CONFIG.VERSION_BUMP_GAP_MS) return;
    lastLinksBumpRef.current = now;
    setLinksVersion(v => v + 1);
  }, []);

  const bumpUsersVersion = useCallback(() => {
    if (isUnmounting.current) return;
    const now = Date.now();
    if (now - lastUsersBumpRef.current < CONFIG.VERSION_BUMP_GAP_MS) return;
    lastUsersBumpRef.current = now;
    setUsersVersion(v => v + 1);
  }, []);

  useEffect(() => {
    const handler = () => primeAllAudio();
    document.addEventListener('click', handler, { once: true, capture: true });
    document.addEventListener('touchstart', handler, { once: true, capture: true });
    document.addEventListener('keydown', handler, { once: true, capture: true });
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('touchstart', handler, true);
      document.removeEventListener('keydown', handler, true);
    };
  }, []);

  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    if (isUnmounting.current) return;
    saveToStorage(STORAGE_KEYS.SESSION_IDS, unseenSessionIds);
    saveToStorage(STORAGE_KEYS.LINK_COUNT, unseenLinkCount);
    saveToStorage(STORAGE_KEYS.CLICK_COUNT, unseenClickCount);
    saveToStorage(STORAGE_KEYS.MEGATOOLS_COUNT, unseenMegaToolsCount);
  }, [unseenSessionIds, unseenLinkCount, unseenClickCount, unseenMegaToolsCount]);

  useEffect(() => {
    try {
      if (user && 'Notification' in window && window.isSecureContext && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) {}
  }, [user]);

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      setError(null);
    }
    catch (err) {
      if (err.response?.status === 401) setUser(null);
    }
    finally { setLoading(false); }
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true); setError(null);
    try { const res = await api.post('/auth/login', { email, password }); setUser(res.data.user); return res.data; }
    catch (err) { const msg = err.response?.data?.message || 'Login failed.'; setError(msg); throw new Error(msg); }
    finally { setLoading(false); }
  }, []);

  const signup = useCallback(async (data) => {
    setLoading(true); setError(null);
    try { return (await api.post('/auth/signup', data)).data; }
    catch (err) { const msg = err.response?.data?.message || 'Signup failed.'; setError(msg); throw new Error(msg); }
    finally { setLoading(false); }
  }, []);

  const logout = useCallback(async () => {
    if (isUnmounting.current) return;
    setLoading(true);
    try { await api.post('/auth/logout'); } catch (err) {}
    setUser(null); setError(null); setLoading(false);
    setSessionsVersion(0); setLinksVersion(0); setUsersVersion(0);
    setUnseenClickCount(0); setUnseenMegaToolsCount(0);
    lastSessionsBumpRef.current = 0; lastLinksBumpRef.current = 0; lastUsersBumpRef.current = 0;
    lastClickMapRef.current = {};
    cleanupSocket();
    setIsConnected(false);
    document.title = 'Mega Tools';
  }, [cleanupSocket]);

  const markSessionSeen = useCallback((sessionId) => { setUnseenSessionIds(prev => prev.filter(id => id !== sessionId)); }, []);
  const markLinksSeen = useCallback(() => setUnseenLinkCount(0), []);
  const markClicksSeen = useCallback(() => setUnseenClickCount(0), []);
  const markMegaToolsSeen = useCallback(() => { setUnseenMegaToolsCount(0); saveToStorage(STORAGE_KEYS.MEGATOOLS_COUNT, 0); }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isUnmounting.current) {
        checkAuth();
      }
    }, CONFIG.AUTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkAuth]);

  useEffect(() => {
    const handlePageShow = () => {
      if (!isUnmounting.current) {
        checkAuth();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [checkAuth]);

  useEffect(() => {
    const handleVisibility = () => {
      if (isUnmounting.current) return;
      if (document.visibilityState === 'hidden') {
        if (socketRef.current && user?._id) {
          try { socketRef.current.emit('visitorAway', { userId: user._id }); } catch (e) {}
        }
      } else {
        checkAuth();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
    };
  }, [user?._id, checkAuth]);

  useEffect(() => {
    if (!user) {
      cleanupSocket();
      return;
    }

    const socketUrl = resolveSocketUrl();
    const authToken = getCookie('auth_token');

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: CONFIG.SOCKET_RECONNECT_ATTEMPTS,
      reconnectionDelay: CONFIG.SOCKET_RECONNECT_DELAY,
      auth: { token: authToken || '' }
    });
    socketRef.current = socket;

    const connectHandler = () => {
      if (isUnmounting.current) return;
      setIsConnected(true);
      if (user?.trackingCode && socketRef.current) {
        socketRef.current.emit('joinRoom', user.trackingCode);
      }
    };

    const disconnectHandler = () => {
      if (isUnmounting.current) return;
      setIsConnected(false);
    };

    const sessionDeltaHandler = (d) => {
      if (isUnmounting.current) return;
      if (d?.session?._id && d.type === 'new') {
        setUnseenSessionIds(prev => {
          if (prev.includes(d.session._id)) return prev;
          const updated = [d.session._id, ...prev].slice(0, CONFIG.SESSION_IDS_MAX);
          return updated;
        });
        setUnseenClickCount(prev => prev + 1);
        notify('New Visitor Session', `New session from ${d.session.trackingCode || 'Unknown'}`);
        playSound('session');
      }
    };

    const sessionStatusDeltaHandler = (d) => {
      if (isUnmounting.current) return;
      bumpSessionsVersion();
    };

    const formSubmittedHandler = (d) => {
      if (isUnmounting.current) return;
      playSound('submission');
    };

    const inboxClearedHandler = (data) => {
      if (isUnmounting.current) return;
      if (!data || !data.count) return;
      bumpSessionsVersion();
      notify('Inbox Cleared', `${data.count} sessions cleared`);
      document.title = `Cleared ${data.count} sessions — Mega Tools`;
      setTimeout(() => { document.title = 'Mega Tools'; }, 3000);
    };

    const globalInboxClearedHandler = (data) => {
      if (isUnmounting.current) return;
      if (!data || !data.count) return;
      bumpSessionsVersion();
      notify('Inbox Auto-Cleared', `${data.count} sessions archived to Trash`);
    };

    const linkCreatedHandler = () => {
      if (isUnmounting.current) return;
      bumpLinksVersion();
      setUnseenLinkCount(prev => prev + 1);
      playSound('click');
    };

    const menuUpdatedHandler = () => {
      if (isUnmounting.current) return;
      bumpLinksVersion();
    };

    const reconnectAttemptHandler = () => {
      if (isUnmounting.current) return;
      setIsConnected(false);
    };

    socket.on('connect', connectHandler);
    socket.on('disconnect', disconnectHandler);
    socket.on('sessionDelta', sessionDeltaHandler);
    socket.on('sessionStatusDelta', sessionStatusDeltaHandler);
    socket.on('formSubmitted', formSubmittedHandler);
    socket.on('inboxCleared', inboxClearedHandler);
    socket.on('globalInboxCleared', globalInboxClearedHandler);
    socket.on('linkCreated', linkCreatedHandler);
    socket.on('menuUpdated', menuUpdatedHandler);
    socket.on('reconnect_attempt', reconnectAttemptHandler);

    socketEventListenersRef.current = [
      { event: 'connect', handler: connectHandler },
      { event: 'disconnect', handler: disconnectHandler },
      { event: 'sessionDelta', handler: sessionDeltaHandler },
      { event: 'sessionStatusDelta', handler: sessionStatusDeltaHandler },
      { event: 'formSubmitted', handler: formSubmittedHandler },
      { event: 'inboxCleared', handler: inboxClearedHandler },
      { event: 'globalInboxCleared', handler: globalInboxClearedHandler },
      { event: 'linkCreated', handler: linkCreatedHandler },
      { event: 'menuUpdated', handler: menuUpdatedHandler },
      { event: 'reconnect_attempt', handler: reconnectAttemptHandler },
    ];

    return () => {
      cleanupSocket();
    };
  }, [user?._id, bumpSessionsVersion, bumpLinksVersion, cleanupSocket]);

  useEffect(() => {
    return () => {
      isUnmounting.current = true;
      cleanupSocket();
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
      lastClickMapRef.current = {};
      try {
        Object.keys(audioPool).forEach(key => {
          (audioPool[key] || []).forEach(a => {
            try { a.pause(); } catch (e) {}
          });
        });
      } catch (e) {}
    };
  }, [cleanupSocket]);

  // FIX-A7 (v1.3): 3-tier role flags
  const contextValue = useMemo(() => ({
    user, loading, error,
    login, signup, logout, checkAuth,
    isOwner: user?.role === 'owner',
    isAdmin: user?.role === 'admin',
    isAdminOrOwner: user?.role === 'owner' || user?.role === 'admin',
    isConnected, notify, socketRef,
    playSound,
    resolveSocketUrl,
    sessionsVersion, setSessionsVersion,
    linksVersion, usersVersion,
    unseenSessionIds, setUnseenSessionIds, markSessionSeen,
    unseenLinkCount, markLinksSeen,
    unseenClickCount, setUnseenClickCount, markClicksSeen,
    unseenMegaToolsCount, markMegaToolsSeen,
  }), [
    user, loading, error,
    login, signup, logout, checkAuth,
    isConnected,
    sessionsVersion, setSessionsVersion,
    linksVersion, usersVersion,
    unseenSessionIds, setUnseenSessionIds, markSessionSeen,
    unseenLinkCount, markLinksSeen,
    unseenClickCount, setUnseenClickCount, markClicksSeen,
    unseenMegaToolsCount, markMegaToolsSeen,
  ]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}