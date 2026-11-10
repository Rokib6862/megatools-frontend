// ============================================================
// MEGA TOOLS — LiveInboxPage v61.6 (INSTANT COUNTERS, NO FLASH)
// ============================================================
// FIX-L28..L42 retained from v61.5.
//
// FIX-L43 (v61.6 — COUNTBOX ZERO-FLASH ELIMINATED):
//   Root cause of the "Total Session / Total Submission shows
//   '0 / 0' for a few hundred ms on every reload, then updates":
//     • `pStats` initial state was `initialSnapshot?.pStats ||
//       { uniqueSessions: 0, uniqueSubmissions: 0, totalClicks: 0 }`.
//     • When the localStorage snapshot was missing (first visit,
//       cache expired, user change), the initial value fell back
//       to that zero object.
//     • The first paint therefore rendered "0 / 0" — a visible
//       flash — until /sessions/stats/summary resolved 100–500 ms
//       later and replaced the zeros with the real all-time values.
//
//   Fix:
//     • `pStats` now initialises to `initialSnapshot?.pStats ?? null`.
//       A cache hit → real numbers instantly. A cache miss → null.
//     • The new CountBox (LiveInboxBase v56.4) renders "—" for a
//       null/undefined stats object instead of coercing it to 0.
//       The user sees a neutral dash for the first frame, then the
//       real number — never a "0 → real" flash.
//     • A dedicated `useEffect` now fires fetchStatsSummary() in
//       parallel with fetchAll() on mount, so the counter reaches
//       the real value as fast as possible, without waiting for
//       the much slower /sessions list response.
//     • The socket delta handlers use `(p?.uniqueSessions ?? 0) + 1`
//       (and `- 1` for auto-delete), so a pending null state never
//       produces NaN.
//     • writeInboxCache still writes a zero-object when pStats is
//       null (keeps the cache shape stable for older readers).
//
//   Net effect:
//     reload → cache hit  : [24] [24]  → [24] [24]  (no flash)
//     reload → cache miss : [—]  [—]   → [24] [24]  (no zero-flash)
//   No other behaviour changed. Sessions table, socket handlers,
//   timer, unseen clear, server auto-delete (FIX-L41), single-
//   sound-source (FIX-L42), users cache and pagination are
//   byte-identical to v61.5.
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, copyToClipboard } from '../utils/helpers';
import { readUsersMapCache, writeUsersMapCache, mapToUsersList } from '../utils/usersMapCache';
import { PP, getTotalFormDataCount, BTN, CountBox, SessionRow } from './LiveInboxBase';
import LiveInboxExpandedRow from './LiveInboxExpandedRow';

const RETRY_MAX = 1;
const TIMER_REFRESH_MS = 10 * 60 * 1000;
const TIMER_TICK_MS = 30 * 1000;
const TIMER_BACKOFF_MS = 5 * 60 * 1000;
const AUTO_POLL_MS = 90 * 1000;
const MAX_DEDUPE_KEYS = 500;

const CACHE_VERSION = 'v61_1';
const CACHE_MAX_SESSIONS = 200;
const CACHE_WRITE_DEBOUNCE_MS = 150;

const getEffectiveStatus = (s) => s?.status || (s?.isLive ? 'Online' : 'Offline');

function formatCountdown(ms) {
  if (!ms || ms <= 0) return '0Hr';
  const totalMinutes = Math.ceil(ms / (1000 * 60));
  const hours = Math.ceil(totalMinutes / 60);
  return hours + 'Hr';
}

const SYSTEM_FIELDS = [
  'step',
  'stepNumber',
  'attempt',
  'status',
  'collectedTypes',
  'screenResolution',
  'timestamp',
  'userAgent',
  'platform',
  'language',
  'timezone',
  'submittedAt',
  'source',
  'url',
  'currentUrl',
  'entryUrl',
  'browser',
];
const extractFormValues = (session) => {
  const subs = session?.submissions || [];
  const values = [];
  for (const sub of subs) {
    const keys = Object.keys(sub).filter((k) => !SYSTEM_FIELDS.includes(k) && k !== 'submittedAt');
    for (const key of keys) {
      if (sub[key] !== undefined && sub[key] !== null && sub[key] !== '')
        values.push(String(sub[key]));
      if (values.length >= 3) return values;
    }
  }
  return values;
};

function submissionFingerprint(formData) {
  if (!formData || typeof formData !== 'object') return '';
  const keys = Object.keys(formData)
    .filter((k) => !SYSTEM_FIELDS.includes(k) && k !== 'submittedAt')
    .sort();
  const clean = {};
  for (const k of keys) {
    const v = formData[k];
    if (v === undefined || v === null || v === '') continue;
    clean[k] = String(v).trim();
  }
  try {
    return JSON.stringify(clean);
  } catch (_) {
    return '';
  }
}

function userKeys(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj)
    .filter((k) => !SYSTEM_FIELDS.includes(k) && k !== 'submittedAt')
    .sort();
}

function isKeySubset(small, big) {
  if (!Array.isArray(small) || !Array.isArray(big)) return false;
  if (small.length === 0) return false;
  const set = new Set(big);
  return small.every((k) => set.has(k));
}

function mergeSubmissions(localArr, remoteArr) {
  const local = Array.isArray(localArr) ? localArr : [];
  const remote = Array.isArray(remoteArr) ? remoteArr : [];
  if (local.length === 0) return remote;
  if (remote.length === 0) return local;

  const merged = [...local, ...remote];
  merged.sort((a, b) => new Date(a?.submittedAt || 0) - new Date(b?.submittedAt || 0));

  const out = [];
  for (const sub of merged) {
    if (!sub || typeof sub !== 'object') continue;
    const keys = userKeys(sub);
    if (keys.length === 0) continue;
    const fp = submissionFingerprint(sub);

    let folded = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[i];
      const prevKeys = userKeys(prev);
      const prevFp = submissionFingerprint(prev);

      if (fp && fp === prevFp) {
        folded = true;
        break;
      }

      const sameKeySet = prevKeys.length === keys.length && prevKeys.every((k, j) => k === keys[j]);
      if (sameKeySet) continue;

      if (isKeySubset(prevKeys, keys)) {
        out[i] = sub;
        folded = true;
        break;
      }
      if (isKeySubset(keys, prevKeys)) {
        folded = true;
        break;
      }
    }
    if (!folded) out.push(sub);
  }
  return out;
}

function clearClientCaches() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('megatools_sessions') ||
        k.startsWith('megatools_inbox') ||
        k.startsWith('megatools_aux') ||
        k.startsWith('megatools_stats') ||
        k === 'sessionsCache' ||
        k === 'megatools_sessions_cache'
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    });
  } catch (_) {}
}

function cacheKeyFor(uCode, page) {
  return `megatools_inbox_${CACHE_VERSION}_${uCode || 'anon'}_p${page || 1}`;
}

function readInboxCache(uCode, page) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(cacheKeyFor(uCode, page));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CACHE_VERSION) return null;
    if (!Array.isArray(parsed.sessions)) return null;
    return {
      sessions: parsed.sessions,
      pStats: parsed.pStats || null,
      tp: Number(parsed.tp) || 1,
      ts: Number(parsed.ts) || 0,
    };
  } catch (_) {
    return null;
  }
}

function writeInboxCache(uCode, page, sessions, pStats, tp) {
  try {
    if (typeof localStorage === 'undefined') return;
    const bounded = Array.isArray(sessions) ? sessions.slice(0, CACHE_MAX_SESSIONS) : [];
    const payload = {
      version: CACHE_VERSION,
      sessions: bounded,
      pStats: pStats || { uniqueSessions: 0, uniqueSubmissions: 0, totalClicks: 0 },
      tp: Number(tp) || 1,
      ts: Date.now(),
    };
    localStorage.setItem(cacheKeyFor(uCode, page), JSON.stringify(payload));
  } catch (_) {}
}

export default function LiveInboxPage() {
  const { user, socketRef, isConnected, isAdmin, markAllSessionsSeen } = useAuth();
  const toast = useToast();
  const uCode = user?.trackingCode || '';
  const isOwner = user?.role === 'owner';
  const isOwnerOrAdmin = isOwner || isAdmin;

  const initialPage = 1;
  const initialSnapshot = useMemo(() => readInboxCache(uCode, initialPage), [uCode]);

  const [sessions, setSessions] = useState(() => initialSnapshot?.sessions || []);
  const [links, setLinks] = useState([]);
  const [users, setUsers] = useState(() => readUsersMapCache());
  // FIX-L43: null = "unknown" (cache miss) → CountBox shows "—"
  const [pStats, setPStats] = useState(() => initialSnapshot?.pStats || null);
  const [page, setPage] = useState(initialPage);
  const [tp, setTp] = useState(() => initialSnapshot?.tp || 1);
  const [showCat, setShowCat] = useState(false);
  const [qSid, setQSid] = useState(null);
  const [selCat, setSelCat] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [infoS, setInfoS] = useState(null);
  const [msgTexts, setMsgTexts] = useState({});
  const [globalTimer, setGlobalTimer] = useState('24Hr');
  const [timerMs, setTimerMs] = useState(0);
  const [moreOpenId, setMoreOpenId] = useState(null);
  const [uploadTargetSid, setUploadTargetSid] = useState(null);

  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const lastEventSeq = useRef({});
  const lastSessionSeen = useRef({});
  const initialLoadDone = useRef(false);
  const pollTimerRef = useRef(null);
  const fetchAllRef = useRef(null);
  const auxDataLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const reconcileLocksRef = useRef({});
  const fetchRateLimitedRef = useRef(false);
  const timerRateLimitedUntilRef = useRef(0);

  const cacheIdentityRef = useRef({ uCode, page });
  useEffect(() => {
    cacheIdentityRef.current = { uCode, page };
  }, [uCode, page]);

  const cacheWriteTimerRef = useRef(null);
  const scheduleCacheWrite = useCallback((nextSessions, nextPStats, nextTp) => {
    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    cacheWriteTimerRef.current = setTimeout(() => {
      const { uCode: u, page: p } = cacheIdentityRef.current || {};
      writeInboxCache(u, p, nextSessions, nextPStats, nextTp);
      cacheWriteTimerRef.current = null;
    }, CACHE_WRITE_DEBOUNCE_MS);
  }, []);

  const sessionsRef = useRef([]);
  const linksRef = useRef([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  useEffect(() => {
    scheduleCacheWrite(sessions, pStats, tp);
  }, [sessions, pStats, tp, scheduleCacheWrite]);

  const didMarkSeenOnMountRef = useRef(false);
  useEffect(() => {
    if (didMarkSeenOnMountRef.current) return;
    didMarkSeenOnMountRef.current = true;
    try {
      markAllSessionsSeen();
    } catch (_) {}
  }, [markAllSessionsSeen]);

  const handleRootClick = useCallback(() => {
    try {
      markAllSessionsSeen();
    } catch (_) {}
  }, [markAllSessionsSeen]);

  useEffect(() => {
    return () => {
      if (cacheWriteTimerRef.current) {
        clearTimeout(cacheWriteTimerRef.current);
        cacheWriteTimerRef.current = null;
      }
      const { uCode: u, page: p } = cacheIdentityRef.current || {};
      try {
        writeInboxCache(u, p, sessionsRef.current, undefined, undefined);
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (page === 1) return;
    const snap = readInboxCache(uCode, page);
    if (snap) {
      setSessions(snap.sessions);
      if (snap.pStats) setPStats(snap.pStats);
      setTp(snap.tp || 1);
    } else {
      setSessions([]);
      setTp(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, uCode]);

  const calculateTotalClicks = useCallback(
    (list) => list.reduce((sum, s) => sum + (Number(s?.clicks) || 0), 0),
    []
  );

  const sortSessions = useCallback(
    (list) =>
      [...list].sort((a, b) => {
        if (getEffectiveStatus(a) !== 'Offline' && getEffectiveStatus(b) === 'Offline') return -1;
        if (getEffectiveStatus(a) === 'Offline' && getEffectiveStatus(b) !== 'Offline') return 1;
        return new Date(b.lastActivity || b.timestamp) - new Date(a.lastActivity || a.timestamp);
      }),
    []
  );

  const toggleMore = useCallback((sid) => {
    setMoreOpenId((prev) => (prev === sid ? null : sid));
  }, []);

  const openCategoryPopup = useCallback((sid, cat, msg) => {
    setQSid(sid);
    setSelCat(cat);
    setShowCat(true);
  }, []);

  const loadAuxData = useCallback(async (signal) => {
    if (auxDataLoadedRef.current) return;
    auxDataLoadedRef.current = true;
    try {
      const usersRes = await api.get('/auth/users-map', { signal });
      const map = usersRes.data || {};
      const usersList = mapToUsersList(map);
      setUsers(usersList);
      writeUsersMapCache(usersList);
    } catch (err) {
      console.log('users-map error:', err);
    }
    try {
      const linksRes = await api.get('/links', { signal });
      setLinks(linksRes.data?.links || []);
    } catch (err) {}
  }, []);

  const fetchStatsSummary = useCallback(async (signal) => {
    try {
      const r = await api.get('/sessions/stats/summary', { signal });
      const a = r.data?.all || {};
      setPStats((p) => ({
        ...(p || {}),
        uniqueSessions: a.totalAllTime ?? p?.uniqueSessions ?? 0,
        uniqueSubmissions: a.totalAllTimeSubmissions ?? p?.uniqueSubmissions ?? 0,
        totalClicks: p?.totalClicks ?? 0,
      }));
    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
    }
  }, []);

  const fetchAll = useCallback(
    async (retryCount = 0, isBackground = false) => {
      if (isBackground) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current?.signal;
      try {
        const sRes = await api.get('/sessions?page=' + page + '&limit=' + PP, { signal });
        let d = sRes.data?.sessions;
        if (!Array.isArray(d)) d = Array.isArray(sRes.data) ? sRes.data : [];
        const merged = sortSessions([...d]);
        setSessions(merged);
        setTp(sRes.data?.totalPages || 1);
        setPStats((p) => ({ ...(p || {}), totalClicks: calculateTotalClicks(merged) }));
        if (!auxDataLoadedRef.current) {
          await loadAuxData(signal);
        }
        await fetchStatsSummary(signal);
        initialLoadDone.current = true;
        fetchRateLimitedRef.current = false;
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;

        const isRateLimited = err?.response?.status === 429 || err?.__rateLimited;
        if (isRateLimited) {
          fetchRateLimitedRef.current = true;
          return;
        }

        if (retryCount < RETRY_MAX) {
          await new Promise((r) => setTimeout(r, 3000));
          inFlightRef.current = false;
          return fetchAll(retryCount + 1);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [page, loadAuxData, calculateTotalClicks, sortSessions, fetchStatsSummary]
  );

  const reconcileSession = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      if (reconcileLocksRef.current[sessionId]) return;
      if (fetchRateLimitedRef.current) return;
      reconcileLocksRef.current[sessionId] = true;
      try {
        let fresh = null;

        try {
          const res = await api.get('/data/session-by-id/' + encodeURIComponent(sessionId));
          fresh = res.data?.session || null;
        } catch (_) {}

        if (!fresh || !fresh._id) {
          try {
            const res = await api.get('/sessions?page=1&limit=100');
            const list = res.data?.sessions || res.data || [];
            if (Array.isArray(list)) {
              fresh = list.find((x) => x && x._id === sessionId) || null;
            }
          } catch (_) {}
        }

        if (!fresh || !fresh._id) return;

        setSessions((prev) => {
          const idx = prev.findIndex((x) => x._id === fresh._id);
          if (idx >= 0) {
            const merged = { ...prev[idx], ...fresh };
            merged.submissions = mergeSubmissions(prev[idx].submissions, fresh.submissions);
            const next = [...prev];
            next[idx] = merged;
            return sortSessions(next);
          }
          return sortSessions([fresh, ...prev]);
        });
      } catch (_) {
      } finally {
        try {
          delete reconcileLocksRef.current[sessionId];
        } catch (_) {}
      }
    },
    [sortSessions]
  );

  const fetchTimer = useCallback(async () => {
    if (Date.now() < timerRateLimitedUntilRef.current) return;
    try {
      const res = await api.get('/sessions/timer');
      if (res.data?.remainingMs !== undefined) {
        const ms = Number(res.data.remainingMs) || 0;
        setTimerMs(ms);
        setGlobalTimer(formatCountdown(ms));
      }
    } catch (err) {
      const isRate = err?.response?.status === 429 || err?.__rateLimited;
      if (isRate) {
        timerRateLimitedUntilRef.current = Date.now() + TIMER_BACKOFF_MS;
      }
    }
  }, []);

  useEffect(() => {
    fetchTimer();
    const timerInterval = setInterval(fetchTimer, TIMER_REFRESH_MS);
    return () => clearInterval(timerInterval);
  }, [fetchTimer]);

  useEffect(() => {
    if (!timerMs || timerMs <= 0) return;
    const tick = setInterval(() => {
      setTimerMs((prev) => {
        const next = Math.max(0, prev - TIMER_TICK_MS);
        setGlobalTimer(formatCountdown(next));
        return next;
      });
    }, TIMER_TICK_MS);
    return () => clearInterval(tick);
  }, [timerMs > 0]);

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  // FIX-L43: fire stats summary in parallel on mount.
  // This shortens the "—" window to just one round-trip and does
  // not wait for the much slower /sessions list.
  const didInitialStatsRef = useRef(false);
  useEffect(() => {
    if (didInitialStatsRef.current) return;
    didInitialStatsRef.current = true;
    try {
      fetchStatsSummary(undefined);
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    lastEventSeq.current = {};
    fetchAll(0);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      inFlightRef.current = false;
    };
  }, [page]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (inFlightRef.current) return;
      if (fetchRateLimitedRef.current) return;
      if (!isConnected) return;
      if (fetchAllRef.current) fetchAllRef.current(0, false);
    };
    const id = setInterval(tick, AUTO_POLL_MS);
    return () => clearInterval(id);
  }, [isConnected]);

  useEffect(() => {
    const s = socketRef?.current;
    if (!s) return;

    const dedupe = (key, seq, ts) => {
      const prev = lastEventSeq.current[key];
      if (seq && prev?.seq && seq <= prev.seq) return true;
      if (ts && prev?.ts && ts - prev.ts < 500) return true;
      lastEventSeq.current[key] = { seq: seq || 0, ts: ts || Date.now() };
      return false;
    };

    const hD = (d) => {
      // FIX-L41: server auto-delete (empty+offline TTL).
      if (d?.type === 'deleted' && d?.sessionId) {
        setSessions((prev) => prev.filter((x) => x._id !== d.sessionId));
        setPStats((p) => ({
          ...(p || {}),
          uniqueSessions: Math.max(0, (p?.uniqueSessions ?? 0) - 1),
          totalClicks: p?.totalClicks ?? 0,
        }));
        return;
      }
      if (!d?.session?._id) return;
      if (dedupe(d.session._id, d.seq, d.timestamp ? new Date(d.timestamp).getTime() : null))
        return;
      setSessions((prev) => {
        const idx = prev.findIndex((x) => x._id === d.session._id);
        if (idx >= 0) {
          const item = prev[idx];
          const merged = {
            ...item,
            ...d.session,
            isLive: d.session.isLive !== false,
            status: d.session.status || item.status,
            lastActivity: d.session.lastActivity || new Date().toISOString(),
          };
          merged.submissions = mergeSubmissions(item.submissions, d.session.submissions);
          if (idx > 0) {
            prev.splice(idx, 1);
            prev.unshift(merged);
          } else {
            prev[idx] = merged;
          }
          return [...prev];
        } else {
          prev.unshift({
            ...d.session,
            isLive: true,
            status: 'Online',
            lastActivity: new Date().toISOString(),
          });
          // FIX-L42: no local sound here — AuthContext plays the
          // device-specific session sound on the same socket event.
          const alreadySeen = lastSessionSeen.current[d.session._id];
          if (!alreadySeen) {
            lastSessionSeen.current[d.session._id] = true;
            setPStats((p) => ({
              ...(p || {}),
              uniqueSessions: (p?.uniqueSessions ?? 0) + 1,
              totalClicks: (p?.totalClicks ?? 0) + (Number(d.session?.clicks) || 0),
            }));
          }
          return [...prev];
        }
      });
    };

    const remember = (key) => {
      lastSessionSeen.current[key] = true;
      const keys = Object.keys(lastSessionSeen.current);
      if (keys.length > MAX_DEDUPE_KEYS) {
        keys.slice(0, Math.floor(keys.length / 2)).forEach((k) => {
          delete lastSessionSeen.current[k];
        });
      }
    };

    const hFS = (d) => {
      if (!d) return;

      const sessionId = d.sessionId || null;
      const isDuplicate = !!d.duplicate;
      const fp = submissionFingerprint(d.formData);
      const count = Number(d.submissionCount) || 0;
      const dedupeKey = 'fs_' + (sessionId || d.visitorId || 'anon') + '_' + count + '_' + fp;
      if (lastSessionSeen.current[dedupeKey]) return;
      remember(dedupeKey);

      if (isDuplicate && sessionId) {
        reconcileSession(sessionId);
        return;
      }

      let found = false;
      let needsReconcile = false;
      if (sessionId) {
        setSessions((prev) => {
          const idx = prev.findIndex((x) => x._id === sessionId);
          if (idx >= 0) {
            found = true;
            const local = prev[idx];
            const localSubs = Array.isArray(local.submissions) ? local.submissions : [];

            const incoming = {
              ...d.formData,
              submittedAt: d.timestamp || new Date().toISOString(),
            };
            const nextSubs = mergeSubmissions(localSubs, [incoming]);
            const grew = nextSubs.length > localSubs.length;

            prev[idx] = {
              ...local,
              submissions: nextSubs,
              isLive: true,
              status: 'Online',
              lastActivity: new Date().toISOString(),
              formData: { ...(local.formData || {}), ...(d.formData || {}) },
            };

            if (grew) {
              setPStats((p) => ({
                ...(p || {}),
                uniqueSubmissions: (p?.uniqueSubmissions ?? 0) + 1,
                totalClicks: p?.totalClicks ?? 0,
              }));
            }

            if (count > 0 && localSubs.length + 1 >= count && localSubs.length < count) {
              needsReconcile = true;
            }

            if (idx > 0) {
              const item = prev.splice(idx, 1)[0];
              prev.unshift(item);
            }
          }
          return [...prev];
        });
      }

      if (!found && fetchAllRef.current) {
        fetchAllRef.current(0, false);
        if (sessionId) reconcileSession(sessionId);
      } else if (needsReconcile && sessionId) {
        reconcileSession(sessionId);
      }
    };

    const hMeta = (d) => {
      if (!d?.session?._id) return;
      setSessions((prev) => {
        const idx = prev.findIndex((x) => x._id === d.session._id);
        if (idx < 0) return prev;
        const item = prev[idx];
        const upd = d.session;
        const next = {
          ...item,
          isLive: upd.isLive !== undefined ? upd.isLive : item.isLive,
          status: upd.status || item.status,
          lastActivity: upd.lastActivity || item.lastActivity,
          clicks: upd.clicks !== undefined ? upd.clicks : item.clicks,
          formData: upd.formData || item.formData,
          lockedKeys: upd.lockedKeys || item.lockedKeys,
        };
        const arr = [...prev];
        arr[idx] = next;
        return arr;
      });
      reconcileSession(d.session._id);
    };

    const hStatus = (d) => {
      if (!d?.sessions || !Array.isArray(d.sessions)) return;
      const statusMap = new Map();
      d.sessions.forEach((s) => {
        if (s._id) statusMap.set(s._id, s);
      });
      const wentOnline = [];
      setSessions((prev) => {
        let changed = false;
        const updated = prev.map((x) => {
          const upd = statusMap.get(x._id);
          if (!upd) return x;
          if (
            upd.status === x.status &&
            upd.isLive === x.isLive &&
            upd.lastActivity === x.lastActivity
          )
            return x;
          changed = true;
          if (upd.status === 'Online' && x.status !== 'Online') wentOnline.push(x._id);
          return {
            ...x,
            status: upd.status,
            isLive: upd.isLive,
            lastActivity: upd.lastActivity || x.lastActivity,
          };
        });
        return changed ? sortSessions(updated) : prev;
      });
      if (wentOnline.length > 0) {
        wentOnline.forEach((sid) => reconcileSession(sid));
      }
    };

    const hClear = () => {
      lastSessionSeen.current = {};
      lastEventSeq.current = {};
      setSessions([]);
      setPStats({ uniqueSessions: 0, uniqueSubmissions: 0, totalClicks: 0 });
      clearClientCaches();
      try {
        const { uCode: u, page: p } = cacheIdentityRef.current || {};
        if (u !== undefined || p !== undefined) {
          try {
            localStorage.removeItem(cacheKeyFor(u, p));
          } catch (_) {}
        }
      } catch (_) {}
      if (fetchAllRef.current) fetchAllRef.current(0, false);
      if (fetchTimer) fetchTimer();
    };

    s.on('sessionDelta', hD);
    s.on('sessionMetaDelta', hMeta);
    s.on('formSubmitted', hFS);
    s.on('sessionStatusDelta', hStatus);
    s.on('inboxCleared', hClear);
    s.on('globalInboxCleared', hClear);
    return () => {
      s.off('sessionDelta', hD);
      s.off('sessionMetaDelta', hMeta);
      s.off('formSubmitted', hFS);
      s.off('sessionStatusDelta', hStatus);
      s.off('inboxCleared', hClear);
      s.off('globalInboxCleared', hClear);
      lastEventSeq.current = {};
    };
  }, [isConnected, socketRef, fetchTimer, sortSessions, reconcileSession]);

  const openInfo = useCallback((s) => {
    setInfoS(s);
    setShowInfo(true);
  }, []);
  const getMsg = useCallback((sid) => msgTexts[sid] || '', [msgTexts]);
  const setMsg = useCallback((sid, val) => setMsgTexts((p) => ({ ...p, [sid]: val })), []);

  const actLinks = useMemo(
    () =>
      links.filter(
        (l) =>
          (l.linkType === 'action' || l.linkType === 'both') &&
          (l.showInInbox !== false || l.inboxView === 'message' || l.linksCategory === 'message') &&
          (isOwnerOrAdmin || l.userView !== false)
      ),
    [links, isOwnerOrAdmin]
  );
  const qaL = useMemo(
    () =>
      actLinks.filter(
        (l) =>
          l.inboxView !== 'message' && l.linksCategory !== 'message' && l.inboxAction !== 'message'
      ),
    [actLinks]
  );
  const cats = useMemo(
    () =>
      [...new Set(qaL.map((l) => l.category).filter(Boolean))]
        .sort()
        .filter((c) => c !== 'message'),
    [qaL]
  );
  const allMsgLinks = useMemo(
    () =>
      actLinks.filter(
        (l) =>
          l.inboxView === 'message' || l.linksCategory === 'message' || l.inboxAction === 'message'
      ),
    [actLinks]
  );
  const msgRowLinks = useMemo(
    () =>
      allMsgLinks.filter(
        (l) =>
          l.category !== 'reply' &&
          l.linksCategory !== 'reply' &&
          l.inboxAction !== 'reply' &&
          l.showInSendSection !== true
      ),
    [allMsgLinks]
  );
  const msgSendLinks = useMemo(
    () =>
      allMsgLinks.filter(
        (l) =>
          l.category !== 'reply' &&
          l.linksCategory !== 'reply' &&
          l.inboxAction !== 'reply' &&
          l.showInSendSection === true
      ),
    [allMsgLinks]
  );
  const replyLink = useMemo(
    () =>
      links.find(
        (l) => l.category === 'reply' || l.linksCategory === 'reply' || l.inboxAction === 'reply'
      ) || null,
    [links]
  );

  const getLinkNameByUrl = useCallback((url) => {
    if (!url) return { name: '', category: '' };
    try {
      const p = new URL(url).pathname.split('/').filter(Boolean);
      const l = p[p.length - 1] || '';
      const c = l.split('_').pop() || l;
      const lnk = linksRef.current.find(
        (x) => x.redirectCode === c || x.baseCode === c || x.slug === c
      );
      return { name: lnk?.name || '', category: lnk?.category || '' };
    } catch {
      return { name: '', category: '' };
    }
  }, []);
  const getDomain = useCallback((url) => {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return (
        url
          .replace(/https?:\/\//, '')
          .split('/')[0]
          ?.split('?')[0] || ''
      );
    }
  }, []);

  const redirectVisitor = useCallback(
    async (sid, rc, msg) => {
      if (!sid || !rc) {
        toast.error('Missing session ID or redirect code');
        return;
      }
      const s = sessionsRef.current.find((x) => x?._id === sid);
      if (!s) {
        toast.error('Session not found');
        return;
      }
      const vid = s?.visitorId || s?.ip || '';
      const l = linksRef.current.find(
        (x) => x.redirectCode === rc || x.baseCode === rc || x.slug === rc
      );
      if (!l) {
        toast.error('Link not found');
        return;
      }
      const b = (l?.baseUrl || '').replace(/\/$/, '');
      const tu =
        b +
        '/' +
        uCode +
        '_' +
        rc +
        (vid ? '?vid=' + vid : '') +
        (msg ? '&msg=' + encodeURIComponent(msg) : '');
      try {
        const res = await api.post('/sessions/' + sid + '/redirect-new', {
          targetUrl: tu,
          message: msg || '',
        });
        if (res.data?.success) {
          setMsg(sid, '');
          toast.success('Redirect sent!');
        }
      } catch (err) {
        toast.error('Redirect failed');
      }
    },
    [uCode, setMsg, toast]
  );

  const backToEntry = useCallback(
    async (sid) => {
      if (!sid) return;
      const s = sessionsRef.current.find((x) => x?._id === sid);
      if (!s) return;
      let bc = s?.baseCode || '';
      if (!bc && s?.trackingCode) {
        const parts = s.trackingCode.split('_');
        bc = parts.length >= 2 ? parts[parts.length - 1] : s.trackingCode;
      }
      const l = linksRef.current.find(
        (x) => x.baseCode === bc || x.slug === bc || x.redirectCode === bc
      );
      if (!l) {
        toast.error('Could not determine original link');
        return;
      }
      const rc = l?.redirectCode || l?.baseCode || bc || '';
      const b = (l?.baseUrl || '').replace(/\/$/, '');
      const tu =
        b + '/' + uCode + '_' + rc + '?vid=' + (s?.visitorId || s?.ip || '') + '&_t=' + Date.now();
      try {
        const res = await api.post('/sessions/' + sid + '/redirect-new', {
          targetUrl: tu,
          message: '',
        });
        if (res.data?.success) {
          toast.success('Redirected back!');
        }
      } catch (err) {
        toast.error('Redirect failed');
      }
    },
    [uCode, toast]
  );

  const handleImageUpload = useCallback(
    async (sid) => {
      setUploadTargetSid(sid);
      const f = fileInputRef.current?.files?.[0];
      if (!f) {
        fileInputRef.current?.click();
        return;
      }
      const fd = new FormData();
      fd.append('image', f, 'upload_' + Date.now() + '.png');
      try {
        const r = await api.post('/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        if (r.data?.url) {
          setMsg(sid, r.data.url);
          toast.success('Image uploaded!');
        }
      } catch {
        toast.error('Upload failed');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [setMsg, toast]
  );

  const handleFileChange = useCallback(
    async (e) => {
      const f = e.target.files?.[0];
      if (!f || !uploadTargetSid) return;
      const fd = new FormData();
      fd.append('image', f, 'upload_' + Date.now() + '.png');
      try {
        const r = await api.post('/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        if (r.data?.url) {
          setMsg(uploadTargetSid, r.data.url);
          toast.success('Image uploaded!');
        }
      } catch {
        toast.error('Upload failed');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [uploadTargetSid, setMsg, toast]
  );

  const allSessions = useMemo(() => sortSessions(sessions), [sessions, sortSessions]);

  useEffect(() => {
    setPStats((p) => ({ ...(p || {}), totalClicks: calculateTotalClicks(sessions) }));
  }, [sessions, calculateTotalClicks]);

  const renderExpandedRow = useCallback(
    (props) => {
      return (
        <LiveInboxExpandedRow
          {...props}
          getLinkNameByUrl={getLinkNameByUrl}
          getDomain={getDomain}
          onRedirect={redirectVisitor}
          onBack={backToEntry}
          onCatOpen={openCategoryPopup}
          setMsg={setMsg}
          getMsg={getMsg}
          onImageUpload={handleImageUpload}
        />
      );
    },
    [
      getLinkNameByUrl,
      getDomain,
      redirectVisitor,
      backToEntry,
      openCategoryPopup,
      setMsg,
      getMsg,
      handleImageUpload,
    ]
  );

  const matchedUser = infoS
    ? users.find((u) => {
        const tc = infoS?.trackingCode || '';
        const ownerCode = tc.includes('_') ? tc.split('_')[0] : tc;
        return (
          u.trackingCode === ownerCode ||
          u.trackingCode === tc ||
          tc.startsWith(u.trackingCode) ||
          u.username === tc ||
          u.name === tc
        );
      }) || user
    : null;

  const COL_W = {
    idx: '3%',
    user: '12%',
    status: '13%',
    tryAgain: '9%',
    from1: '14%',
    from2: '10%',
    from3: '10%',
    image: '6%',
    message: '9%',
    replay: '7%',
    more: '6%',
    time: '7%',
  };

  return (
    <div
      onClick={handleRootClick}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 16px',
        background: 'transparent',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 16,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          title={`Inbox auto-archive to Trash in ~${globalTimer}`}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#FFFFFF',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {globalTimer}
        </span>
      </div>

      <CountBox stats={pStats} />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'transparent',
          borderRadius: 0,
          border: 'none',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              minWidth: 1080,
            }}
          >
            <colgroup>
              <col style={{ width: COL_W.idx }} />
              <col style={{ width: COL_W.user }} />
              <col style={{ width: COL_W.status }} />
              <col style={{ width: COL_W.tryAgain }} />
              <col style={{ width: COL_W.from1 }} />
              <col style={{ width: COL_W.from2 }} />
              <col style={{ width: COL_W.from3 }} />
              <col style={{ width: COL_W.image }} />
              <col style={{ width: COL_W.message }} />
              <col style={{ width: COL_W.replay }} />
              <col style={{ width: COL_W.more }} />
              <col style={{ width: COL_W.time }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#0F172A', borderBottom: '2px solid #334155', height: 40 }}>
                {[
                  '#',
                  'User Name',
                  'Status',
                  'Try again',
                  'From 1',
                  'From 2',
                  'From 3',
                  'Image',
                  'Message',
                  'Replay',
                  'More',
                  'Time',
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '0 4px',
                      fontSize: 9,
                      textAlign: 'center',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                      whiteSpace: 'nowrap',
                      lineHeight: '40px',
                      borderRight: '1px solid #334155',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allSessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    style={{
                      padding: '60px 20px',
                      textAlign: 'center',
                      color: '#94A3B8',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ fontSize: 32 }}>📭</div>
                      <div>No sessions found</div>
                    </div>
                  </td>
                </tr>
              ) : (
                allSessions.map((s, i) => {
                  const formVals = extractFormValues(s);
                  return (
                    <SessionRow
                      key={s?._id || i}
                      session={s}
                      index={i}
                      page={page}
                      cats={cats}
                      qaL={qaL}
                      msgRowLinks={msgRowLinks}
                      msgSendLinks={msgSendLinks}
                      replyLink={replyLink}
                      msgTexts={msgTexts}
                      users={users}
                      currentUser={user}
                      onOpenInfo={openInfo}
                      onToggleMore={toggleMore}
                      moreOpenId={moreOpenId}
                      onRedirect={redirectVisitor}
                      onBack={backToEntry}
                      onImageUpload={handleImageUpload}
                      onCatOpen={openCategoryPopup}
                      getMsg={getMsg}
                      setMsg={setMsg}
                      timeAgo={timeAgo}
                      copyToClipboard={copyToClipboard}
                      BTN={BTN}
                      renderExpandedRow={renderExpandedRow}
                      formValues={formVals}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {tp > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px 0',
            flexShrink: 0,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPage((p) => Math.max(1, p - 1));
            }}
            disabled={page === 1}
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: 600,
              background: '#334155',
              color: page === 1 ? '#64748B' : '#E2E8F0',
              border: 'none',
              borderRadius: 4,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>
            Page <strong>{page}</strong> of <strong>{tp}</strong>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPage((p) => Math.min(tp, p + 1));
            }}
            disabled={page === tp}
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: 600,
              background: '#334155',
              color: page === tp ? '#64748B' : '#E2E8F0',
              border: 'none',
              borderRadius: 4,
              cursor: page === tp ? 'not-allowed' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}

      {showInfo && infoS && (
        <div
          onClick={() => setShowInfo(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 14,
              padding: '24px 28px',
              width: 700,
              maxWidth: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: '2px solid #334155',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#E2E8F0' }}>
                🔍 Visitor Information
              </h3>
              <button
                onClick={() => setShowInfo(false)}
                style={{
                  background: '#334155',
                  border: 'none',
                  color: '#E2E8F0',
                  fontSize: 16,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#38BDF8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                }}
              >
                📱 Visitor Info
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
                {[
                  { l: 'Session ID', v: infoS?._id || '—' },
                  { l: 'Visitor ID', v: infoS?.visitorId || '—' },
                  { l: 'Tracking Code', v: infoS?.trackingCode || '—' },
                  { l: 'Status', v: getEffectiveStatus(infoS) },
                  { l: 'Device', v: infoS?.deviceType || 'N/A' },
                  { l: 'Browser', v: (infoS?.browser || 'N/A').substring(0, 50) },
                  { l: 'IP Address', v: infoS?.ip || '—' },
                  { l: 'Clicks', v: infoS?.clicks || 0 },
                  { l: 'Form Data', v: getTotalFormDataCount(infoS) },
                  { l: 'Submissions', v: infoS?.submissions?.length || 0 },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => item.v !== '—' && copyToClipboard(String(item.v))}
                    style={{
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 7,
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                      }}
                    >
                      {item.l}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: '#E2E8F0',
                        fontWeight: 600,
                        wordBreak: 'break-all',
                      }}
                    >
                      {item.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {matchedUser && (
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#A78BFA',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 8,
                  }}
                >
                  👤 User Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
                  {[
                    { l: 'Name', v: matchedUser?.name || '—' },
                    { l: 'Username', v: matchedUser?.username || '—' },
                    { l: 'Email', v: matchedUser?.email || '—' },
                    { l: 'Role', v: matchedUser?.role || '—' },
                    { l: 'Phone', v: matchedUser?.phone || '—' },
                    { l: 'Tracking Code', v: matchedUser?.trackingCode || '—' },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => item.v !== '—' && copyToClipboard(String(item.v))}
                      style={{
                        padding: '5px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 7,
                          color: '#94A3B8',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                        }}
                      >
                        {item.l}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#E2E8F0',
                          fontWeight: 600,
                          wordBreak: 'break-all',
                        }}
                      >
                        {item.v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCat && (
        <div
          onClick={() => setShowCat(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '12vh 24px 24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0F172A',
              border: '1px solid #334155',
              borderRadius: 10,
              padding: '16px 20px',
              width: 700,
              maxWidth: '95%',
              maxHeight: '78vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '1px solid #334155',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#E2E8F0' }}>
                📂 {selCat} Links
              </h3>
              <button
                onClick={() => setShowCat(false)}
                style={{
                  background: '#334155',
                  border: '1px solid #475569',
                  color: '#FFFFFF',
                  fontSize: 18,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  lineHeight: 1,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#475569')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#334155')}
              >
                ✕
              </button>
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: '0 6px',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: 'auto' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#1E293B' }}>
                  <th
                    style={{
                      padding: '8px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#38BDF8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'center',
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      padding: '8px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#38BDF8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'left',
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: '8px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#38BDF8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'left',
                    }}
                  >
                    Action URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {qaL
                  .filter((l) => l?.category === selCat && l?.showInInbox !== false)
                  .map((l, idx) => {
                    const rc = l?.redirectCode || l?.baseCode || l?.slug || '';
                    const vid = sessions.find((s) => s?._id === qSid)?.visitorId || '';
                    const actionUrl =
                      (l?.baseUrl || '').replace(/\/$/, '') +
                      '/' +
                      uCode +
                      '_' +
                      rc +
                      (vid ? '?vid=' + vid : '');
                    return (
                      <tr
                        key={l?._id}
                        onClick={(e) => {
                          e.stopPropagation();
                          redirectVisitor(qSid, rc, getMsg(qSid));
                          setShowCat(false);
                        }}
                        style={{
                          background: '#1E293B',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#273549')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#1E293B')}
                      >
                        <td
                          style={{
                            padding: '10px',
                            fontSize: 11,
                            color: '#94A3B8',
                            textAlign: 'center',
                            fontWeight: 600,
                            borderRadius: '6px 0 0 6px',
                            verticalAlign: 'top',
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{
                            padding: '10px',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'left',
                            color: '#E2E8F0',
                            verticalAlign: 'top',
                            wordBreak: 'break-word',
                          }}
                        >
                          {l?.name}
                        </td>
                        <td
                          style={{
                            padding: '10px',
                            textAlign: 'left',
                            borderRadius: '0 6px 6px 0',
                            verticalAlign: 'top',
                          }}
                        >
                          <div
                            style={{
                              display: 'block',
                              width: '100%',
                              boxSizing: 'border-box',
                              fontFamily: 'monospace',
                              fontSize: 12,
                              color: '#93C5FD',
                              background: 'rgba(59,130,246,0.15)',
                              border: '1px solid rgba(59,130,246,0.3)',
                              borderRadius: 4,
                              padding: '4px 10px',
                              wordBreak: 'break-all',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {actionUrl}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
