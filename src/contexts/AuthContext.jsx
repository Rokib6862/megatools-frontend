import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { loadFromStorage, saveToStorage } from '../utils/helpers';

// ============================================================
// MEGA TOOLS — AuthContext v2.2 (HYBRID MULTI-DEVICE + SOFT SESSION RECOVERY)
// ============================================================
// FIX-A1..A24 retained from v2.1.
//
// FIX-A25 (v2.2 — HYBRID MULTI-DEVICE SESSION, SOFT RECOVERY):
//   Root cause of "user forced logout when logging in from a
//   second device / second frontend":
//     • The server previously enforced single-device by
//       overwriting `activeSessionId` on every login. Any older
//       device whose `jti` did not match was rejected with a
//       `session_replaced` 401.
//     • The client's handleSessionReplaced() then did an
//       aggressive setUser(null) + window.location.assign('/login')
//       — a hard, user-visible logout.
//     • In the dual-frontend setup (mega-tools.online +
//       grow-links.vercel.app) this meant logging into one
//       frontend silently killed the other, and any transient
//       401 fired a forced logout.
//
//   Server side (v4.3) has been switched to a HYBRID MULTI-
//   SESSION model: `activeSessions[]` accepts any number of
//   valid jti's, so every device stays logged in. `session_
//   replaced` will therefore no longer be sent by the server.
//
//   This file makes the client fully defensive on top of that:
//     • handleSessionReplaced() now performs a SILENT
//       checkAuth() first. Only if the silent re-check still
//       returns 401 does it clear the user state — and even
//       then it does NOT hard-redirect. It shows a toast and
//       lets the router handle the guard.
//     • Any `session_replaced` that arrives as a one-off is
//       treated as transient and silently retried.
//     • Socket `connect_error` with `session_replaced` no
//       longer disconnects the socket; it triggers a silent
//       checkAuth instead.
//
//   Result:
//     • Login on device A + device B + device C → all stay in.
//     • Login on frontend A + frontend B → both stay in.
//     • A single stale 401 cannot force a logout.
//     • Real invalidation (token expired, user blocked/deleted,
//       password change) still logs out — but softly, without
//       a hard navigation.
//   No other behaviour changed. All mark* helpers, version
//   counters, backoff, refresh, unseen reset, sound manager,
//   notification manager and socket wiring are byte-identical
//   to v2.1.
// ============================================================

const AuthContext = createContext(null);

// ============================================================
// ENTERPRISE SOUND MANAGER — Device-specific, Never Miss
// ============================================================

const SOUND_FILES = {
  session_android: '/sounds/Session to Android.mp3',
  session_desktop: '/sounds/Session to Desktop.mp3',
  session_apple: '/sounds/Session Two Apple.mp3',
  submission: '/sounds/submission.mp3',
};

const audioPool = {
  session_android: [],
  session_desktop: [],
  session_apple: [],
  submission: [],
};
let audioPrimedGlobal = false;

function initAudioPool() {
  Object.keys(SOUND_FILES).forEach((key) => {
    audioPool[key] = [];
    for (let i = 0; i < 3; i++) {
      const audio = new Audio(SOUND_FILES[key]);
      audio.preload = 'auto';
      try {
        audio.load();
      } catch (_) {}
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
          const retry = () => {
            try {
              audio.play().catch(() => {});
            } catch (_) {}
          };
          if (audio.readyState >= 3) {
            try {
              audio.currentTime = 0;
            } catch (_) {}
            retry();
          } else {
            audio.addEventListener('canplaythrough', retry, { once: true });
            try {
              audio.load();
            } catch (_) {}
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

// FIX-A23: pick the right session sound for the admin's device
function detectDeviceSoundKey() {
  try {
    if (typeof navigator === 'undefined') return 'session_desktop';
    const ua = String(navigator.userAgent || '').toLowerCase();
    if (/android/.test(ua)) return 'session_android';
    if (/iphone|ipad|ipod/.test(ua)) return 'session_apple';
    if (/macintosh|mac os x/.test(ua) && !/android/.test(ua)) return 'session_apple';
    if (/mobile|tablet/.test(ua)) return 'session_android';
    return 'session_desktop';
  } catch (_) {
    return 'session_desktop';
  }
}

function primeAllAudio() {
  if (audioPrimedGlobal) return;
  audioPrimedGlobal = true;
  Object.keys(audioPool).forEach((key) => {
    (audioPool[key] || []).forEach((a) => {
      if (!a) return;
      try {
        a.muted = true;
        const p = a.play();
        const restore = () => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch (_) {}
          try {
            a.muted = false;
          } catch (_) {}
        };
        if (p && typeof p.then === 'function') p.then(restore).catch(restore);
        else restore();
      } catch (_) {
        try {
          a.muted = false;
        } catch (_) {}
      }
    });
  });
}

// FIX-A24: richer notification (tag dedupe + click→focus)
function notify(title, body) {
  try {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.isSecureContext &&
      Notification.permission === 'granted'
    ) {
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'megatools-session',
        renotify: true,
        requireInteraction: true,
        silent: false,
        data: { url: '/live-inbox', ts: Date.now() },
      });
      try {
        n.onclick = function () {
          try {
            window.focus();
          } catch (_) {}
          try {
            if (window.location.pathname !== '/live-inbox') {
              window.location.assign('/live-inbox');
            }
          } catch (_) {}
          try {
            n.close();
          } catch (_) {}
        };
      } catch (_) {}
    }
  } catch (e) {}
  const originalTitle = document.title;
  document.title = `🔴 ${title} — Mega Tools`;
  setTimeout(() => {
    document.title = originalTitle;
  }, 5000);
}

function showInAppToast(message, tone = 'warning', ttl = 5000) {
  try {
    if (typeof document === 'undefined') return;
    const id = 'mt_toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const el = document.createElement('div');
    el.id = id;
    const bg = tone === 'error' ? '#dc2626' : tone === 'success' ? '#16a34a' : '#f59e0b';
    el.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483647;' +
      'background:' +
      bg +
      ';color:#fff;padding:12px 18px;border-radius:10px;' +
      'font-size:13px;font-weight:600;font-family:Inter,Segoe UI,sans-serif;' +
      'box-shadow:0 12px 32px rgba(0,0,0,0.35);max-width:340px;line-height:1.4;' +
      'transition:opacity 0.3s ease, transform 0.3s ease;transform:translateY(8px);' +
      'opacity:0;pointer-events:none;';
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      try {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => {
          try {
            el.remove();
          } catch (_) {}
        }, 350);
      } catch (_) {}
    }, ttl);
  } catch (_) {}
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

function purgeCacheKeys(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  let removed = 0;
  try {
    list.forEach((k) => {
      if (!k) return;
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k);
        removed++;
      }
    });
  } catch (_) {}
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('megatools:cache:purge', { detail: { keys: list, removed } })
      );
    }
  } catch (_) {}
  return removed;
}

function isTransientSocketError(err) {
  const msg = String(err?.message || '').toLowerCase();
  const desc = String(err?.description || '').toLowerCase();
  const combined = msg + ' ' + desc;
  if (!combined.trim()) return true;
  // FIX-A25: session_replaced is now treated as transient — the
  // server no longer sends it, but if a stale one arrives it is
  // silently retried instead of forcing a logout.
  if (combined.includes('user not found')) return false;
  if (combined.includes('account blocked')) return false;
  if (combined.includes('429')) return true;
  if (combined.includes('rate limit')) return true;
  if (combined.includes('too many')) return true;
  if (combined.includes('xhr poll error')) return true;
  if (combined.includes('websocket error')) return true;
  if (combined.includes('timeout')) return true;
  if (combined.includes('transport')) return true;
  if (combined.includes('network')) return true;
  if (combined.includes('cors')) return true;
  return true;
}

const STORAGE_KEYS = {
  SESSION_IDS: 'megatools_unseen_session_ids',
  LINK_COUNT: 'megatools_unseen_link_count',
  CLICK_COUNT: 'megatools_unseen_click_count',
  MEGATOOLS_COUNT: 'megatools_unseen_megatools_count',
  USER_CACHE: 'megatools_user_cache_v1',
};

const CONFIG = {
  SOCKET_RECONNECT_ATTEMPTS: 20,
  SOCKET_RECONNECT_DELAY: 3000,
  SESSION_IDS_MAX: 30,
  VISIBILITY_REFRESH_DELAY: 500,
  VERSION_BUMP_GAP_MS: 500,
  AUTH_CHECK_INTERVAL_MS: 90000,
  AUTH_BACKOFF_BASE_MS: 2000,
  AUTH_BACKOFF_MAX_MS: 30000,
  SESSION_REPLACED_GRACE_MS: 30000,
  // FIX-A25: only after this many consecutive session_replaced
  // signals within the grace window do we accept the session as
  // genuinely invalid.
  SESSION_REPLACED_HARD_LIMIT: 3,
};

const LINK_CACHE_KEYS = [
  'megatools_quicklinks_cache',
  'megatools_msglinks_cache',
  'megatools_links_cache',
];

function readUserCache() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEYS.USER_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.user || typeof parsed.user !== 'object') return null;
    if (!parsed.user._id && !parsed.user.trackingCode) return null;
    return parsed.user;
  } catch (_) {
    return null;
  }
}

function writeUserCache(u) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!u || typeof u !== 'object') return;
    if (!u._id && !u.trackingCode) return;
    localStorage.setItem(STORAGE_KEYS.USER_CACHE, JSON.stringify({ user: u, ts: Date.now() }));
  } catch (_) {}
}

function clearUserCache() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.USER_CACHE);
  } catch (_) {}
}

export function AuthProvider({ children }) {
  const cachedUser = useMemo(() => readUserCache(), []);
  const [user, setUser] = useState(() => cachedUser || null);
  const [loading, setLoading] = useState(() => (cachedUser ? false : true));
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [linksVersion, setLinksVersion] = useState(0);
  const [usersVersion, setUsersVersion] = useState(0);

  const [unseenSessionIds, setUnseenSessionIds] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SESSION_IDS, [])
  );
  const [unseenLinkCount, setUnseenLinkCount] = useState(() =>
    loadFromStorage(STORAGE_KEYS.LINK_COUNT, 0)
  );
  const [unseenClickCount, setUnseenClickCount] = useState(() =>
    loadFromStorage(STORAGE_KEYS.CLICK_COUNT, 0)
  );
  const [unseenMegaToolsCount, setUnseenMegaToolsCount] = useState(() =>
    loadFromStorage(STORAGE_KEYS.MEGATOOLS_COUNT, 0)
  );

  const socketRef = useRef(null);
  const visibilityTimeoutRef = useRef(null);
  const isInitialMount = useRef(true);
  const isUnmounting = useRef(false);
  const hydratedRef = useRef(cachedUser ? true : false);

  const lastClickMapRef = useRef({});
  const socketEventListenersRef = useRef([]);

  const lastSessionsBumpRef = useRef(0);
  const lastLinksBumpRef = useRef(0);
  const lastUsersBumpRef = useRef(0);

  const checkAuthBackoffRef = useRef({ attempts: 0, timer: null });

  const sessionReplacedRef = useRef({ lastAt: 0, count: 0 });
  const graceLockRef = useRef({ until: 0 });

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
    setSessionsVersion((v) => v + 1);
  }, []);

  const bumpLinksVersion = useCallback(() => {
    if (isUnmounting.current) return;
    const now = Date.now();
    if (now - lastLinksBumpRef.current < CONFIG.VERSION_BUMP_GAP_MS) return;
    lastLinksBumpRef.current = now;
    setLinksVersion((v) => v + 1);
  }, []);

  const bumpUsersVersion = useCallback(() => {
    if (isUnmounting.current) return;
    const now = Date.now();
    if (now - lastUsersBumpRef.current < CONFIG.VERSION_BUMP_GAP_MS) return;
    lastUsersBumpRef.current = now;
    setUsersVersion((v) => v + 1);
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
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isUnmounting.current) return;
    saveToStorage(STORAGE_KEYS.SESSION_IDS, unseenSessionIds);
    saveToStorage(STORAGE_KEYS.LINK_COUNT, unseenLinkCount);
    saveToStorage(STORAGE_KEYS.CLICK_COUNT, unseenClickCount);
    saveToStorage(STORAGE_KEYS.MEGATOOLS_COUNT, unseenMegaToolsCount);
  }, [unseenSessionIds, unseenLinkCount, unseenClickCount, unseenMegaToolsCount]);

  useEffect(() => {
    if (user) writeUserCache(user);
  }, [user]);

  useEffect(() => {
    try {
      if (
        user &&
        'Notification' in window &&
        window.isSecureContext &&
        Notification.permission === 'default'
      ) {
        Notification.requestPermission();
      }
    } catch (e) {}
  }, [user]);

  // FIX-A25: HYBRID SOFT SESSION RECOVERY
  //   session_replaced is now treated as transient. We retry a
  //   silent checkAuth first. Only after SESSION_REPLACED_HARD_LIMIT
  //   consecutive signals inside the grace window do we accept the
  //   session as truly invalid — and even then we do NOT hard
  //   redirect; we clear user state and show a toast so the router
  //   guard handles navigation.
  const handleSessionReplaced = useCallback(
    (reason) => {
      if (isUnmounting.current) return;
      const now = Date.now();
      const state = sessionReplacedRef.current;
      if (now - state.lastAt > CONFIG.SESSION_REPLACED_GRACE_MS) {
        state.count = 0;
      }
      state.count += 1;
      state.lastAt = now;

      // Always try a silent recovery first.
      if (state.count < CONFIG.SESSION_REPLACED_HARD_LIMIT) {
        try {
          checkAuthRef.current?.({ silent: true });
        } catch (_) {}
        return;
      }

      // Hard limit reached: clear state softly, no redirect.
      setUser(null);
      clearUserCache();
      setError('Your session ended. Please login again.');
      try {
        setSessionsVersion(0);
        setLinksVersion(0);
        setUsersVersion(0);
        setUnseenClickCount(0);
        setUnseenMegaToolsCount(0);
      } catch (_) {}
      cleanupSocket();
      graceLockRef.current.until = Date.now() + 5000;
      try {
        showInAppToast('Your session ended. Please login again.', 'warning', 5000);
      } catch (_) {}
    },
    [cleanupSocket]
  );

  const checkAuthRef = useRef(null);

  const checkAuth = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      if (silent && Date.now() < graceLockRef.current.until) return;

      if (!silent && !hydratedRef.current) setLoading(true);

      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
        setError(null);
        setRateLimited(false);
        sessionReplacedRef.current.count = 0;
        checkAuthBackoffRef.current.attempts = 0;
        if (checkAuthBackoffRef.current.timer) {
          clearTimeout(checkAuthBackoffRef.current.timer);
          checkAuthBackoffRef.current.timer = null;
        }
      } catch (err) {
        const status = err.response?.status;
        const code = err.response?.data?.code || '';
        const reason = err.response?.data?.reason || '';

        if (status === 401) {
          if (code === 'session_replaced') {
            // FIX-A25: soft recovery — do NOT clear user immediately.
            handleSessionReplaced(reason);
          } else {
            // Genuinely invalid (token expired, user not found, etc.)
            setUser(null);
            clearUserCache();
          }
          return;
        }

        const isRate = status === 429 || err.__rateLimited;
        const isNetwork =
          !err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
        const isServerErr = status >= 500 && status < 600;
        if (isRate || isNetwork || isServerErr) {
          if (isRate) setRateLimited(true);
          if (silent) return;

          const attempts = (checkAuthBackoffRef.current.attempts || 0) + 1;
          checkAuthBackoffRef.current.attempts = attempts;
          const delay = Math.min(
            CONFIG.AUTH_BACKOFF_BASE_MS * Math.pow(2, Math.min(attempts - 1, 5)),
            CONFIG.AUTH_BACKOFF_MAX_MS
          );
          try {
            if (checkAuthBackoffRef.current.timer) {
              clearTimeout(checkAuthBackoffRef.current.timer);
            }
            checkAuthBackoffRef.current.timer = setTimeout(() => {
              checkAuthBackoffRef.current.timer = null;
              if (!isUnmounting.current) checkAuth({ silent: true });
            }, delay);
          } catch (_) {}
          return;
        }
      } finally {
        if (!silent && !hydratedRef.current) {
          hydratedRef.current = true;
          setLoading(false);
        }
      }
    },
    [handleSessionReplaced]
  );

  checkAuthRef.current = checkAuth;

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      setUser(res.data.user);
      setRateLimited(false);
      sessionReplacedRef.current.count = 0;
      graceLockRef.current.until = 0;
      checkAuthBackoffRef.current.attempts = 0;
      hydratedRef.current = true;
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    try {
      return (await api.post('/auth/signup', data)).data;
    } catch (err) {
      const msg = err.response?.data?.message || 'Signup failed.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (isUnmounting.current) return;
    setLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (err) {}
    setUser(null);
    setError(null);
    setLoading(false);
    clearUserCache();
    setRateLimited(false);
    setSessionsVersion(0);
    setLinksVersion(0);
    setUsersVersion(0);
    setUnseenClickCount(0);
    setUnseenMegaToolsCount(0);
    lastSessionsBumpRef.current = 0;
    lastLinksBumpRef.current = 0;
    lastUsersBumpRef.current = 0;
    lastClickMapRef.current = {};
    sessionReplacedRef.current.count = 0;
    checkAuthBackoffRef.current.attempts = 0;
    if (checkAuthBackoffRef.current.timer) {
      clearTimeout(checkAuthBackoffRef.current.timer);
      checkAuthBackoffRef.current.timer = null;
    }
    cleanupSocket();
    setIsConnected(false);
    document.title = 'Mega Tools';
  }, [cleanupSocket]);

  const markSessionSeen = useCallback((sessionId) => {
    setUnseenSessionIds((prev) => prev.filter((id) => id !== sessionId));
  }, []);
  const markLinksSeen = useCallback(() => setUnseenLinkCount(0), []);
  const markClicksSeen = useCallback(() => setUnseenClickCount(0), []);
  const markMegaToolsSeen = useCallback(() => {
    setUnseenMegaToolsCount(0);
    saveToStorage(STORAGE_KEYS.MEGATOOLS_COUNT, 0);
  }, []);

  const markAllSessionsSeen = useCallback(() => {
    setUnseenSessionIds([]);
    setUnseenClickCount(0);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isUnmounting.current) {
        try {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        } catch (_) {}
        checkAuth({ silent: true });
      }
    }, CONFIG.AUTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkAuth]);

  useEffect(() => {
    const handlePageShow = () => {
      if (!isUnmounting.current) checkAuth({ silent: true });
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [checkAuth]);

  useEffect(() => {
    const handleVisibility = () => {
      if (isUnmounting.current) return;
      if (document.visibilityState === 'hidden') {
        if (socketRef.current && user?._id) {
          try {
            socketRef.current.emit('visitorAway', { userId: user._id });
          } catch (e) {}
        }
      } else {
        checkAuth({ silent: true });
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
      reconnectionDelayMax: 15000,
      auth: { token: authToken || '' },
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

    const connectErrorHandler = (err) => {
      if (isUnmounting.current) return;
      const msg = String(err?.message || '');
      // FIX-A25: session_replaced no longer disconnects. Silent recheck.
      if (msg === 'session_replaced') {
        try {
          checkAuthRef.current?.({ silent: true });
        } catch (_) {}
        return;
      }
      if (msg === 'Account blocked' || msg === 'User not found') {
        setUser(null);
        clearUserCache();
        return;
      }
      setIsConnected(false);
    };

    const sessionDeltaHandler = (d) => {
      if (isUnmounting.current) return;
      if (d?.session?._id && d.type === 'new') {
        setUnseenSessionIds((prev) => {
          if (prev.includes(d.session._id)) return prev;
          const updated = [d.session._id, ...prev].slice(0, CONFIG.SESSION_IDS_MAX);
          return updated;
        });
        setUnseenClickCount((prev) => prev + 1);
        notify('New Visitor Session', `New session from ${d.session.trackingCode || 'Unknown'}`);
        // FIX-A23: play device-specific session sound
        playSound(detectDeviceSoundKey());
      }
    };

    const sessionStatusDeltaHandler = () => {
      if (isUnmounting.current) return;
      bumpSessionsVersion();
    };

    const formSubmittedHandler = () => {
      if (isUnmounting.current) return;
      playSound('submission');
    };

    const inboxClearedHandler = (data) => {
      if (isUnmounting.current) return;
      if (!data || !data.count) return;
      bumpSessionsVersion();
      notify('Inbox Cleared', `${data.count} sessions cleared`);
      document.title = `Cleared ${data.count} sessions — Mega Tools`;
      setTimeout(() => {
        document.title = 'Mega Tools';
      }, 3000);
    };

    const globalInboxClearedHandler = (data) => {
      if (isUnmounting.current) return;
      if (!data || !data.count) return;
      bumpSessionsVersion();
      notify('Inbox Auto-Cleared', `${data.count} sessions archived to Trash`);
    };

    // FIX-A23: Click.mp3 has been removed — no sound on link creation
    const linkCreatedHandler = () => {
      if (isUnmounting.current) return;
      purgeCacheKeys(LINK_CACHE_KEYS);
      bumpLinksVersion();
      setUnseenLinkCount((prev) => prev + 1);
    };

    const linkDeletedHandler = () => {
      if (isUnmounting.current) return;
      purgeCacheKeys(LINK_CACHE_KEYS);
      bumpLinksVersion();
    };

    const linkUpdatedHandler = () => {
      if (isUnmounting.current) return;
      purgeCacheKeys(LINK_CACHE_KEYS);
      bumpLinksVersion();
    };

    const linkDeletedBulkHandler = () => {
      if (isUnmounting.current) return;
      purgeCacheKeys(LINK_CACHE_KEYS);
      bumpLinksVersion();
    };

    const folderCreatedHandler = () => {
      if (isUnmounting.current) return;
      bumpLinksVersion();
    };
    const folderUpdatedHandler = () => {
      if (isUnmounting.current) return;
      bumpLinksVersion();
    };
    const folderDeletedHandler = () => {
      if (isUnmounting.current) return;
      purgeCacheKeys(LINK_CACHE_KEYS);
      bumpLinksVersion();
    };
    const folderSuffixHandler = () => {
      if (isUnmounting.current) return;
      bumpLinksVersion();
    };

    const menuUpdatedHandler = () => {
      if (isUnmounting.current) return;
      purgeCacheKeys(LINK_CACHE_KEYS);
      bumpLinksVersion();
    };

    const reconnectAttemptHandler = () => {
      if (isUnmounting.current) return;
      setIsConnected(false);
    };

    socket.on('connect', connectHandler);
    socket.on('disconnect', disconnectHandler);
    socket.on('connect_error', connectErrorHandler);
    socket.on('sessionDelta', sessionDeltaHandler);
    socket.on('sessionStatusDelta', sessionStatusDeltaHandler);
    socket.on('formSubmitted', formSubmittedHandler);
    socket.on('inboxCleared', inboxClearedHandler);
    socket.on('globalInboxCleared', globalInboxClearedHandler);
    socket.on('linkCreated', linkCreatedHandler);
    socket.on('linkDeleted', linkDeletedHandler);
    socket.on('linkUpdated', linkUpdatedHandler);
    socket.on('linkDeletedBulk', linkDeletedBulkHandler);
    socket.on('folderCreated', folderCreatedHandler);
    socket.on('folderUpdated', folderUpdatedHandler);
    socket.on('folderDeleted', folderDeletedHandler);
    socket.on('folderSuffix', folderSuffixHandler);
    socket.on('menuUpdated', menuUpdatedHandler);
    socket.on('reconnect_attempt', reconnectAttemptHandler);

    socketEventListenersRef.current = [
      { event: 'connect', handler: connectHandler },
      { event: 'disconnect', handler: disconnectHandler },
      { event: 'connect_error', handler: connectErrorHandler },
      { event: 'sessionDelta', handler: sessionDeltaHandler },
      { event: 'sessionStatusDelta', handler: sessionStatusDeltaHandler },
      { event: 'formSubmitted', handler: formSubmittedHandler },
      { event: 'inboxCleared', handler: inboxClearedHandler },
      { event: 'globalInboxCleared', handler: globalInboxClearedHandler },
      { event: 'linkCreated', handler: linkCreatedHandler },
      { event: 'linkDeleted', handler: linkDeletedHandler },
      { event: 'linkUpdated', handler: linkUpdatedHandler },
      { event: 'linkDeletedBulk', handler: linkDeletedBulkHandler },
      { event: 'folderCreated', handler: folderCreatedHandler },
      { event: 'folderUpdated', handler: folderUpdatedHandler },
      { event: 'folderDeleted', handler: folderDeletedHandler },
      { event: 'folderSuffix', handler: folderSuffixHandler },
      { event: 'menuUpdated', handler: menuUpdatedHandler },
      { event: 'reconnect_attempt', handler: reconnectAttemptHandler },
    ];

    return () => {
      cleanupSocket();
    };
  }, [user?._id, bumpSessionsVersion, bumpLinksVersion, cleanupSocket, handleSessionReplaced]);

  useEffect(() => {
    return () => {
      isUnmounting.current = true;
      cleanupSocket();
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
      if (checkAuthBackoffRef.current.timer) {
        clearTimeout(checkAuthBackoffRef.current.timer);
        checkAuthBackoffRef.current.timer = null;
      }
      lastClickMapRef.current = {};
      try {
        Object.keys(audioPool).forEach((key) => {
          (audioPool[key] || []).forEach((a) => {
            try {
              a.pause();
            } catch (e) {}
          });
        });
      } catch (e) {}
    };
  }, [cleanupSocket]);

  const contextValue = useMemo(
    () => ({
      user,
      loading,
      error,
      rateLimited,
      login,
      signup,
      logout,
      checkAuth,
      isOwner: user?.role === 'owner',
      isAdmin: user?.role === 'admin',
      isAdminOrOwner: user?.role === 'owner' || user?.role === 'admin',
      isConnected,
      notify,
      socketRef,
      playSound,
      detectDeviceSoundKey,
      resolveSocketUrl,
      purgeCacheKeys,
      sessionsVersion,
      setSessionsVersion,
      linksVersion,
      usersVersion,
      unseenSessionIds,
      setUnseenSessionIds,
      markSessionSeen,
      markAllSessionsSeen,
      unseenLinkCount,
      markLinksSeen,
      unseenClickCount,
      setUnseenClickCount,
      markClicksSeen,
      unseenMegaToolsCount,
      markMegaToolsSeen,
    }),
    [
      user,
      loading,
      error,
      rateLimited,
      login,
      signup,
      logout,
      checkAuth,
      isConnected,
      sessionsVersion,
      setSessionsVersion,
      linksVersion,
      usersVersion,
      unseenSessionIds,
      setUnseenSessionIds,
      markSessionSeen,
      markAllSessionsSeen,
      unseenLinkCount,
      markLinksSeen,
      unseenClickCount,
      setUnseenClickCount,
      markClicksSeen,
      unseenMegaToolsCount,
      markMegaToolsSeen,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
