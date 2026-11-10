import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, copyToClipboard } from '../utils/helpers';
import { readUsersMapCache, writeUsersMapCache, mapToUsersList } from '../utils/usersMapCache';
import {
  PP,
  getSubSeen,
  setSubSeen,
  SYSTEM_FIELDS,
  isSystemField,
  getSubs,
  getTotalSubCount,
  getTotalFormDataCount,
  BTN,
  Avatar,
  RoleBadge,
  CountryFlag,
  CountBox,
  isUserSession,
} from './LiveInboxBase';

// ============================================================
// MEGA TOOLS — TrashPage v25.3 (USERS CACHE + SILENT REFRESH)
// ============================================================
// FIX-TR1..TR7 retained from v25.2.
//
// FIX-TR8 (v25.3 — USERS CACHE + NAME-FLICKER FIX):
//   Root cause of the "name changes twice on every reload"
//   complaint:
//     • `sessions` was hydrated from localStorage (v25.1) but
//       `users` started as `useState([])`.
//     • The first paint therefore rendered the fallback
//       `trackingCode.slice(-8)` ("4", "V", "U") for each row.
//     • Only after /auth/users-map resolved did `setUsers(...)`
//       swap those fallbacks for the real names
//       ("Admin", "MD OBAIDUL HOQUE ALIM") — the visible flicker.
//   Fix:
//     • Users map is now cached via utils/usersMapCache.js
//       (`megatools_users_map_v1`, shared with LiveInboxPage).
//     • `users` initial state hydrates from that cache
//       synchronously, so the first paint already shows the
//       real names.
//     • After /auth/users-map resolves, the cache is rewritten
//       via writeUsersMapCache(uList) — kept hot between pages.
//     • fetchAll is memoized through fetchAllRef so socket
//       handlers no longer close over a stale version.
//   No other behaviour changed. Pagination, More dropdown,
//   StatField, countdown, download — all identical.
// ============================================================

const CACHE_KEY = 'megatools_trash_v25';
const CACHE_TTL = 60 * 60 * 1000;
const RETRY_MAX = 3;
const TRASH_RETENTION_MS = 24 * 60 * 60 * 1000; // 24h

const MORE_COLORS = [
  { bg: '#D97706', hover: '#EA580C', border: '#B45309' },
  { bg: '#2563EB', hover: '#1D4ED8', border: '#1E40AF' },
  { bg: '#7C3AED', hover: '#6D28D9', border: '#5B21B6' },
  { bg: '#059669', hover: '#047857', border: '#065F46' },
];
const MORE_OPEN_COLOR = { bg: '#DC2626', hover: '#B91C1C', border: '#991B1B' };

const getEffectiveStatus = (s) => s?.status || (s?.isLive ? 'Online' : 'Offline');

const safeToast = (toast, kind, msg) => {
  try {
    if (toast && typeof toast[kind] === 'function') return toast[kind](msg);
    if (toast && typeof toast.success === 'function') return toast.success(msg);
  } catch (_) {}
};

function formatTrashCountdown(deletedAtIso) {
  if (!deletedAtIso) return '—';
  const t = new Date(deletedAtIso).getTime();
  if (!Number.isFinite(t)) return '—';
  const elapsed = Date.now() - t;
  if (elapsed < 0) return 'Just now';
  const remaining = Math.max(0, TRASH_RETENTION_MS - elapsed);
  if (remaining <= 0) return 'Deleting soon';
  const totalMinutes = Math.floor(remaining / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m left`;
}

export default function TrashPage() {
  const { user, socketRef, isConnected, isAdmin } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'owner';
  const isAdminOrOwner = isOwner || isAdmin;

  const loadCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.t > CACHE_TTL) return null;
      return data;
    } catch {
      return null;
    }
  };
  const saveCache = (s, p, tp, pg) => {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ s: s.slice(0, 50), p, tp, pg: pg || 1, t: Date.now() })
      );
    } catch {}
  };

  const cache = loadCache();

  const [sessions, setSessions] = useState(cache?.s || []);
  // FIX-TR8: hydrate users from the shared cache so first paint
  // already has real names — no fallback flicker.
  const [users, setUsers] = useState(() => readUsersMapCache());
  const [pStats, setPStats] = useState(cache?.p || { uniqueSessions: 0, uniqueSubmissions: 0 });
  const [page, setPage] = useState(cache?.pg || 1);
  const [tp, setTp] = useState(cache?.tp || 1);
  const [moreOpenId, setMoreOpenId] = useState(null);

  const loadingRef = useRef(false);
  const abortRef = useRef(null);
  const isUnmounting = useRef(false);
  const fetchAllRef = useRef(null);

  const sortSessions = (list) =>
    [...list].sort(
      (a, b) =>
        new Date(b.deletedAt || b.timestamp || 0) - new Date(a.deletedAt || a.timestamp || 0)
    );

  const fetchAll = useCallback(
    async (retryCount = 0) => {
      if (loadingRef.current) return;
      if (isUnmounting.current) return;
      loadingRef.current = true;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      try {
        const [tRes, sRes] = await Promise.all([
          api.get('/trash?page=' + page + '&limit=' + PP, { signal }),
          api.get('/trash/stats', { signal }).catch(() => ({ data: {} })),
        ]);

        try {
          const uRes = await api.get('/auth/users-map', { signal });
          const map = uRes.data || {};
          const uList = mapToUsersList(map);
          if (!isUnmounting.current) {
            setUsers(uList);
            // FIX-TR8: keep shared users cache hot
            writeUsersMapCache(uList);
          }
        } catch (_) {
          /* silent — users only needed for display */
        }

        let d = tRes.data?.sessions;
        if (!Array.isArray(d)) d = Array.isArray(tRes.data) ? tRes.data : [];

        const sorted = sortSessions(d);
        const statsTotal =
          Number(sRes.data?.total) || Number(sRes.data?.uniqueSessions) || d.length;
        const statsSubs = Number(sRes.data?.uniqueSubmissions) || 0;
        if (isUnmounting.current) return;
        setSessions(sorted);
        setTp(tRes.data?.totalPages || 1);
        setPStats({ uniqueSessions: statsTotal, uniqueSubmissions: statsSubs });
        saveCache(
          sorted,
          { uniqueSessions: statsTotal, uniqueSubmissions: statsSubs },
          tRes.data?.totalPages || 1,
          page
        );
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          loadingRef.current = false;
          return;
        }
        if (err.response?.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (retryCount < RETRY_MAX) {
          await new Promise((r) => setTimeout(r, 2000));
          loadingRef.current = false;
          return fetchAll(retryCount + 1);
        }
      } finally {
        loadingRef.current = false;
      }
    },
    [page]
  );

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  useEffect(() => {
    if (fetchAllRef.current) fetchAllRef.current(0);
  }, [page]);

  useEffect(() => {
    return () => {
      isUnmounting.current = true;
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  useEffect(() => {
    const s = socketRef?.current;
    if (!s) return;
    const refresh = () => {
      if (fetchAllRef.current) fetchAllRef.current(0);
    };
    s.on('globalInboxCleared', refresh);
    s.on('trashPermanentlyCleared', refresh);
    return () => {
      s.off('globalInboxCleared', refresh);
      s.off('trashPermanentlyCleared', refresh);
    };
  }, [isConnected, socketRef]);

  const toggleMore = useCallback((sid) => {
    setMoreOpenId((prev) => (prev === sid ? null : sid));
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const r = await api.get('/trash/export?format=csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trash_export_' + Date.now() + '.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      safeToast(toast, 'success', 'Download started');
    } catch {
      safeToast(toast, 'error', 'Download failed');
    }
  }, [toast]);

  const findUserByTrackingCode = (tc) => {
    if (!tc) return null;
    const ownerCode = tc.includes('_') ? tc.split('_')[0] : tc;
    const exact = users.find((u) => u.trackingCode === tc);
    if (exact) return exact;
    const byOwner = users.find((u) => u.trackingCode === ownerCode);
    if (byOwner) return byOwner;
    let best = null;
    let bestLen = 0;
    for (const u of users) {
      const utc = u?.trackingCode || '';
      if (!utc) continue;
      if (tc === utc || tc.startsWith(utc + '_')) {
        if (utc.length > bestLen) {
          best = u;
          bestLen = utc.length;
        }
      }
    }
    if (best) return best;
    return users.find((u) => u.username === tc || u.name === tc) || null;
  };

  const allSessions = useMemo(() => sortSessions(sessions), [sessions]);

  const FormField = ({ value }) => {
    const display = value === null || value === undefined ? '' : String(value);
    const copyable = display.length > 0;
    return (
      <div
        onClick={() => {
          if (copyable) {
            copyToClipboard(display);
            safeToast(toast, 'success', 'Copied');
          }
        }}
        title={copyable ? 'Click to copy' : ''}
        style={{
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 8px',
          height: 30,
          background: '#1E3A5F',
          border: '1px solid #3B82F6',
          borderRadius: 2,
          cursor: copyable ? 'pointer' : 'default',
          overflow: 'hidden',
          boxShadow: '0 0 8px rgba(59,130,246,0.3)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: '#E2E8F0',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {display}
        </span>
      </div>
    );
  };

  const StatField = ({ label, value }) => {
    const display = value === null || value === undefined || value === '' ? '—' : String(value);
    const copyable = display !== '—' && display !== 'Deleted';
    return (
      <div
        onClick={() => {
          if (copyable) {
            copyToClipboard(display);
            safeToast(toast, 'success', 'Copied');
          }
        }}
        title={display}
        style={{
          minWidth: 0,
          height: 42,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 5,
          padding: '0 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          cursor: copyable ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: '#94A3B8',
            textTransform: 'uppercase',
            fontWeight: 700,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#E2E8F0',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: 2,
          }}
        >
          {display}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '8px 10px' }}>
      <style>
        {
          '@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}.ir:hover td{background:var(--table-hover)!important}.it{width:100%;table-layout:fixed;border-collapse:collapse}.it th,.it td{padding:0 4px;overflow:visible;vertical-align:middle;border-right:1px solid var(--table-border);border-bottom:1px solid var(--table-border)}.it th:last-child,.it td:last-child{border-right:none}'
        }
      </style>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            background: '#1E293B',
            borderRadius: 8,
            padding: '14px 12px',
            textAlign: 'center',
            border: '1px solid #334155',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f87171' }}>
            {pStats.uniqueSessions || 0}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#94A3B8',
              marginTop: 4,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            My Trash Session
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 10,
          marginBottom: 6,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={handleDownload}
          title="Download CSV"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid #f87171',
            color: '#f87171',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 10px',
          }}
        >
          ⬇ Download
        </button>
      </div>

      <div
        style={{
          background: 'var(--card-bg)',
          borderRadius: 10,
          border: '1px solid rgba(239,68,68,0.25)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="it">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  borderBottom: '2px solid rgba(239,68,68,0.3)',
                  height: 46,
                }}
              >
                {['#', 'User Name', 'Status', 'Device', 'More', 'Code', 'Deleted / TTL'].map(
                  (h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '0 6px',
                        fontSize: 10,
                        textAlign: i === 1 ? 'left' : 'center',
                        fontWeight: 800,
                        color: '#f87171',
                        textTransform: 'uppercase',
                        letterSpacing: '.04em',
                        whiteSpace: 'nowrap',
                        lineHeight: '46px',
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {allSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>
                    <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.4 }}>🗑️</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Trash is Empty</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      Deleted inbox sessions will appear here (auto-delete after 24h)
                    </div>
                  </td>
                </tr>
              ) : (
                allSessions.map((s, i) => {
                  const rn = (page - 1) * PP + i + 1;
                  const deviceLabel = s?.deviceType === 'Mobile' ? 'Mobile' : 'Desktop';
                  const u = findUserByTrackingCode(s?.trackingCode);
                  const userName =
                    u?.name || u?.username || (s?.trackingCode ? s.trackingCode.slice(-8) : '—');
                  const isMoreOpen = moreOpenId === s?._id;
                  const fd = s?.formData || {};
                  const dk = getSubs(s);
                  const formDataCount = getTotalFormDataCount(s);
                  const colorSet = isMoreOpen
                    ? MORE_OPEN_COLOR
                    : MORE_COLORS[i % MORE_COLORS.length];
                  const ttl = formatTrashCountdown(s?.deletedAt);

                  return (
                    <React.Fragment key={s?._id || i}>
                      <tr
                        className="ir"
                        style={{
                          borderBottom: isMoreOpen ? 'none' : '1px solid var(--table-border)',
                          height: 48,
                          transition: 'background .1s',
                        }}
                      >
                        <td
                          style={{
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '0 4px',
                          }}
                        >
                          {rn}
                        </td>
                        <td style={{ textAlign: 'left', padding: '0 10px', overflow: 'hidden' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                          >
                            <Avatar name={userName} pic={u?.profilePic} size={24} />
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                minWidth: 0,
                                lineHeight: 1.3,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: 'var(--text)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={userName}
                              >
                                {userName}
                              </span>
                              <span
                                style={{
                                  fontSize: 9,
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {s?.trackingCode || '—'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0 4px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(100,116,139,0.12)',
                              border: '1px solid #64748b',
                              borderRadius: 8,
                              padding: '4px 10px',
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#64748b',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#64748b',
                                display: 'inline-block',
                              }}
                            ></span>{' '}
                            Deleted
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0 4px' }}>
                          <span
                            style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}
                          >
                            {deviceLabel}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0 4px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMore(s?._id);
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = colorSet.hover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = colorSet.bg;
                            }}
                            style={{
                              background: colorSet.bg,
                              border: `1px solid ${colorSet.border}`,
                              color: '#fff',
                              borderRadius: 5,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '7px 14px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                            }}
                          >
                            {isMoreOpen ? 'Close ▴' : 'More ▾'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0 4px' }}>
                          <span
                            style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}
                            title={s?.trackingCode || ''}
                          >
                            {s?.trackingCode?.slice(-8) || '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0 4px' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              lineHeight: 1.2,
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              {s?.deletedAt ? timeAgo(s.deletedAt) : '—'}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                color: ttl === 'Deleting soon' ? '#f87171' : '#fbbf24',
                                fontWeight: 700,
                              }}
                              title="Time until permanent delete"
                            >
                              {ttl}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isMoreOpen && (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: 0,
                              background: '#0F172A',
                              borderBottom: '1px solid var(--table-border)',
                            }}
                          >
                            <div
                              style={{
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                              }}
                            >
                              {dk.length > 0 && (
                                <div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#A78BFA',
                                      marginBottom: 6,
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                    }}
                                  >
                                    📋 Form Data
                                  </div>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(6, 1fr)',
                                      gap: 3,
                                    }}
                                  >
                                    {dk.map((k, idx) => (
                                      <FormField key={idx} value={fd[k]} />
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: '#f87171',
                                    textTransform: 'uppercase',
                                    marginBottom: 6,
                                    letterSpacing: '.05em',
                                  }}
                                >
                                  📱 Visitor Info
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(10, 1fr)',
                                    gap: 5,
                                    marginBottom: 5,
                                  }}
                                >
                                  <StatField label="Status" value="Deleted" />
                                  <StatField label="Visitor ID" value={s?.visitorId || '—'} />
                                  <StatField label="Device" value={s?.deviceType || 'N/A'} />
                                  <StatField label="IP" value={s?.ip || '—'} />
                                  <StatField label="Clicks" value={String(s?.clicks || 0)} />
                                  <StatField label="Form Data" value={String(formDataCount)} />
                                  <StatField
                                    label="Submissions"
                                    value={String(s?.submissions?.length || 0)}
                                  />
                                  <StatField
                                    label="First Seen"
                                    value={
                                      s?.timestamp ? new Date(s.timestamp).toLocaleString() : '—'
                                    }
                                  />
                                  <StatField
                                    label="Deleted At"
                                    value={
                                      s?.deletedAt ? new Date(s.deletedAt).toLocaleString() : '—'
                                    }
                                  />
                                  <StatField label="Deleted By" value={s?.deletedBy || '—'} />
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 3fr',
                                    gap: 5,
                                  }}
                                >
                                  <StatField label="Session ID" value={s?._id || '—'} />
                                  <StatField label="Browser" value={s?.browser || 'N/A'} />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
            padding: 10,
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            Page <strong>{page}</strong> of <strong>{tp}</strong>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(tp, p + 1))}
            disabled={page === tp}
            style={{
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              cursor: page === tp ? 'not-allowed' : 'pointer',
              opacity: page === tp ? 0.5 : 1,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
