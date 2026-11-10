// ============================================================
// MEGA TOOLS — UserManagementPage v4.7 (PERSISTENT CACHE + SWR)
// ============================================================
// FIX-UM1..13 retained from v4.6.
//
// FIX-UM14 (v4.7 — PERSISTENT CACHE + INSTANT HYDRATE):
//   Root cause of the "Users Hub shows an empty table for a
//   second every time you open it" complaint:
//     • `users` state started as `useState([])`.
//     • `loadUsers()` fired on mount and on every `usersVersion`
//       bump, so the table blanked out until /auth/users-list
//       replied.
//
//   This version mirrors the same cache pattern already used by
//   LiveInboxPage / QuickLinksPage / CustomLinksPage:
//     • CACHE_KEY = 'megatools_users_cache_v1'
//     • CACHE_VERSION = 'v47_1'
//     • Synchronous hydrate inside useState() so the first paint
//       after reload / sidebar click already shows the last-known
//       user list.
//     • Debounced write effect (150 ms) persists users + stats
//       after every material change.
//     • `loadUsers(silent)` — silent mode (true) never touches
//       the visible table until the new payload arrives AND does
//       not show toast errors for transient failures. The normal
//       mount call runs silent when a snapshot is available, so
//       reload never flashes empty.
//     • usersVersion bumps (from socket) trigger a silent
//       refresh, not a blank-and-refetch.
//   The filter (search) path also stays instant: the cached list
//   is filtered client-side, then a silent background refresh
//   reconciles with the server. No spinner anywhere.
// ============================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatDate, copyToClipboard } from '../utils/helpers';

const USERS_PER_PAGE = 20;

// FIX-UM14: persistent cache
const CACHE_KEY = 'megatools_users_cache_v1';
const CACHE_VERSION = 'v47_1';
const CACHE_WRITE_DEBOUNCE_MS = 150;
const CACHE_MAX_USERS = 500;

function readUsersCache() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CACHE_VERSION) return null;
    if (!Array.isArray(parsed.users)) return null;
    return {
      users: parsed.users,
      stats: parsed.stats || { total: 0, active: 0, blocked: 0 },
      ts: Number(parsed.ts) || 0,
    };
  } catch (_) {
    return null;
  }
}

function writeUsersCache(users, stats) {
  try {
    if (typeof localStorage === 'undefined') return;
    const bounded = Array.isArray(users) ? users.slice(0, CACHE_MAX_USERS) : [];
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        users: bounded,
        stats: stats || { total: 0, active: 0, blocked: 0 },
        ts: Date.now(),
      })
    );
  } catch (_) {}
}

function clearUsersCache() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(CACHE_KEY);
  } catch (_) {}
}

const safeToast = (toast, kind, msg) => {
  try {
    if (toast && typeof toast[kind] === 'function') return toast[kind](msg);
    if (toast && typeof toast.success === 'function') return toast.success(msg);
  } catch (_) {}
};

const deriveRoleFromToken = (token, fallbackType) => {
  const t = String(token || '').toUpperCase();
  if (t.startsWith('ADM-')) return 'admin';
  if (t.startsWith('OWN-')) return 'admin';
  if (t.startsWith('USR-')) return 'user';
  if (t.startsWith('REF-')) return 'user';
  if (fallbackType === 'admin' || fallbackType === 'owner') return 'admin';
  return 'user';
};

const RoleTag = ({ role, small }) => {
  const isAdmin = role === 'admin';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: small ? '2px 7px' : '2px 8px',
        borderRadius: 4,
        fontSize: small ? 9 : 10,
        fontWeight: 800,
        background: isAdmin ? 'rgba(168,85,247,0.18)' : 'rgba(59,130,246,0.18)',
        color: isAdmin ? '#a855f7' : '#3b82f6',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {isAdmin ? 'ADMIN' : 'USER'}
    </span>
  );
};

export default function UserManagementPage() {
  const { user, markMegaToolsSeen, isOwner, isAdmin, usersVersion } = useAuth();
  const toast = useToast();
  const canManage = isOwner || isAdmin;

  // FIX-UM14: hydrate synchronously from cache
  const initialSnapshot = useMemo(() => readUsersCache(), []);
  const [users, setUsers] = useState(() => initialSnapshot?.users || []);
  const [stats, setStats] = useState(
    () => initialSnapshot?.stats || { total: 0, active: 0, blocked: 0 }
  );
  const [search, setSearch] = useState('');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedDetailUser, setSelectedDetailUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [showRefModal, setShowRefModal] = useState(false);
  const [allRefLinks, setAllRefLinks] = useState([]);
  const [generatedLinks, setGeneratedLinks] = useState([]);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [refsLoading, setRefsLoading] = useState(false);

  const isUnmounting = useRef(false);
  const cacheWriteTimerRef = useRef(null);

  // FIX-UM13: Role is locked by actor
  const forcedTargetRole = isOwner ? 'admin' : 'user';
  const roleLabel = forcedTargetRole === 'admin' ? 'Admin' : 'User';

  useEffect(() => {
    isUnmounting.current = false;
    return () => {
      isUnmounting.current = true;
      if (cacheWriteTimerRef.current) {
        clearTimeout(cacheWriteTimerRef.current);
        cacheWriteTimerRef.current = null;
      }
    };
  }, []);

  // FIX-UM14: debounced cache write
  useEffect(() => {
    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    cacheWriteTimerRef.current = setTimeout(() => {
      writeUsersCache(users, stats);
      cacheWriteTimerRef.current = null;
    }, CACHE_WRITE_DEBOUNCE_MS);
    return () => {
      if (cacheWriteTimerRef.current) {
        clearTimeout(cacheWriteTimerRef.current);
        cacheWriteTimerRef.current = null;
      }
    };
  }, [users, stats]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isOwner || isAdmin) markMegaToolsSeen();
  }, [isOwner, isAdmin, markMegaToolsSeen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // FIX-UM14: silent mode — used for background revalidation
  const loadUsers = useCallback(
    (silent = false) => {
      return api
        .get('/auth/users-list')
        .then((r) => {
          if (isUnmounting.current) return;
          let data = Array.isArray(r.data) ? r.data : [];

          if (isAdmin && user?._id) {
            data = data.filter((u) => String(u._id) !== String(user._id));
          }

          if (search) {
            const q = search.toLowerCase();
            data = data.filter(
              (u) =>
                (u.name || '').toLowerCase().includes(q) ||
                (u.email || '').toLowerCase().includes(q) ||
                (u.username || '').toLowerCase().includes(q)
            );
          }
          setUsers(data);
          setStats({
            total: data.length,
            active: data.filter((u) => u.status === 'active').length,
            blocked: data.filter((u) => u.status === 'blocked').length,
          });
        })
        .catch((err) => {
          console.error('[UserMgmt] Load failed:', err);
          if (!isUnmounting.current && !silent && err?.response?.status !== 401) {
            safeToast(toast, 'error', 'Failed to load users');
          }
        });
    },
    [search, toast, isAdmin, user?._id]
  );

  const loadRefLinks = useCallback(async () => {
    setRefsLoading(true);
    try {
      const r = await api.get('/auth/referrals');
      const all = Array.isArray(r.data) ? r.data : [];
      const pending = all.filter((rc) => rc && rc.token && rc.used !== true);
      const filtered = isOwner ? pending : pending.filter((rc) => rc.createdBy === user?._id);
      filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setAllRefLinks(filtered);
      return filtered;
    } catch (err) {
      console.error('[UserMgmt] loadRefLinks failed:', err);
      setAllRefLinks([]);
      return [];
    } finally {
      setRefsLoading(false);
    }
  }, [isOwner, user]);

  // FIX-UM14: mount → silent if snapshot present, normal otherwise
  const hasSnapshotRef = useRef(!!initialSnapshot);
  useEffect(() => {
    loadUsers(hasSnapshotRef.current);
  }, [loadUsers, usersVersion]);

  const canManageUser = useCallback(
    (u) => {
      if (!u) return false;
      if (isOwner) return u.role !== 'owner';
      if (isAdmin) {
        if (u.role === 'owner' || u.role === 'admin') return false;
        return u.parentId && String(u.parentId) === String(user?._id);
      }
      return false;
    },
    [isOwner, isAdmin, user?._id]
  );

  const handleBlock = async (u) => {
    setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...x, status: 'blocked' } : x)));
    setStats((s) => ({ ...s, active: Math.max(0, s.active - 1), blocked: s.blocked + 1 }));
    setSelectedDetailUser(null);
    try {
      await api.patch(`/auth/block/${u._id}`);
      safeToast(toast, 'success', `${u.name || u.email} blocked`);
      loadUsers(true);
    } catch (err) {
      console.error('[UserMgmt] Block failed:', err);
      safeToast(toast, 'error', 'Failed to block user');
      loadUsers(true);
    }
  };

  const handleUnblock = async (u) => {
    setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...x, status: 'active' } : x)));
    setStats((s) => ({ ...s, active: s.active + 1, blocked: Math.max(0, s.blocked - 1) }));
    setSelectedDetailUser(null);
    try {
      await api.patch(`/auth/unblock/${u._id}`);
      safeToast(toast, 'success', `${u.name || u.email} unblocked`);
      loadUsers(true);
    } catch (err) {
      console.error('[UserMgmt] Unblock failed:', err);
      safeToast(toast, 'error', 'Failed to unblock user');
      loadUsers(true);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete "${u.name || u.email}"? This cannot be undone.`)) return;
    setUsers((prev) => prev.filter((x) => x._id !== u._id));
    setSelectedDetailUser(null);
    try {
      await api.delete(`/auth/user/${u._id}`);
      safeToast(toast, 'success', 'User deleted');
      loadUsers(true);
    } catch (err) {
      console.error('[UserMgmt] Delete failed:', err);
      safeToast(toast, 'error', 'Failed to delete user');
      loadUsers(true);
    }
  };

  const handleGenerateRefLink = async () => {
    if (generateLoading) return;
    setGenerateLoading(true);
    try {
      const body = { count: 1, targetRole: forcedTargetRole };
      const res = await api.post('/auth/generate-referral-link', body);
      const backendTarget = res.data?.targetRole || forcedTargetRole;
      if (res.data?.links?.length > 0) {
        const enriched = res.data.links.map((l) => ({
          ...l,
          role: deriveRoleFromToken(l.token, backendTarget),
        }));
        setGeneratedLinks((prev) => [...enriched, ...prev]);
        safeToast(
          toast,
          'success',
          `${backendTarget === 'admin' ? 'Admin' : 'User'} referral link generated!`
        );
      }
      await loadRefLinks();
    } catch (err) {
      console.error('[UserMgmt] Generate ref link failed:', err);
      const msg = err?.response?.data?.message || 'Failed to generate link';
      safeToast(toast, 'error', msg);
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleOpenRefModal = useCallback(async () => {
    setGeneratedLinks([]);
    await loadRefLinks();
    setShowRefModal(true);
  }, [loadRefLinks]);

  const usersById = useMemo(() => {
    const m = new Map();
    for (const x of users) m.set(x._id, x);
    return m;
  }, [users]);

  const filteredRefLinks = useMemo(() => {
    return allRefLinks.filter((rc) => {
      const r = deriveRoleFromToken(rc.token, rc.targetRole || rc.type);
      return r === forcedTargetRole;
    });
  }, [allRefLinks, forcedTargetRole]);

  const filteredGeneratedLinks = useMemo(() => {
    return generatedLinks.filter((gl) => {
      const r = gl.role || deriveRoleFromToken(gl.token, gl.targetRole);
      return r === forcedTargetRole;
    });
  }, [generatedLinks, forcedTargetRole]);

  const getCreatedByName = useCallback(
    (u) => {
      if (!u) return '—';
      if (u.createdByName) return u.createdByName;
      const id = u.createdBy || u.parentId;
      if (!id) return u.parentUsername || u.createdByRole || '—';
      const creator = usersById.get(id);
      if (creator) return creator.name || creator.username || creator.email || '—';
      return u.parentUsername || '—';
    },
    [usersById]
  );

  const getRoleBadge = (role) => {
    if (role === 'owner') return { bg: 'var(--danger-bg)', color: 'var(--danger)' };
    if (role === 'admin') return { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' };
    return { bg: 'var(--info-bg)', color: 'var(--info)' };
  };

  if (!canManage) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        Access denied.
      </div>
    );
  }

  const isSmall = windowWidth < 1100;
  const totalPages = Math.ceil(users.length / USERS_PER_PAGE) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const paginatedUsers = users.slice((safePage - 1) * USERS_PER_PAGE, safePage * USERS_PER_PAGE);

  const selfId = user?._id || '';

  const detailFieldStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '11px 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    gap: 14,
  };
  const detailLabelStyle = { fontSize: 12, color: '#94a3b8', fontWeight: 500, flexShrink: 0 };
  const detailValueStyle = {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: 600,
    textAlign: 'right',
    wordBreak: 'break-all',
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            👥 Users Hub
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            All users ·{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats.total}</span> total
          </p>
        </div>
        <button
          onClick={handleOpenRefModal}
          style={{
            padding: '10px 16px',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--purple-bg)',
            color: 'var(--purple)',
            border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          🔗 Referral Links
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        {[
          { l: 'Total Users', v: stats.total, c: '#6366f1' },
          { l: 'Active Users', v: stats.active, c: '#4ade80' },
          { l: 'Block Users', v: stats.blocked || 0, c: '#ef4444' },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '16px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div
              style={{
                fontSize: 11,
                color: '#94a3b8',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {s.l}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--card-bg)',
            borderRadius: 10,
            padding: '0 14px',
            border: '1px solid var(--card-border)',
            flex: 1,
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
          <input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '12px 0',
              fontSize: 13,
              background: 'transparent',
              color: 'var(--text)',
              border: 'none',
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: '#1e293b',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: isSmall ? 600 : 800 }}
          >
            <thead>
              <tr
                style={{ background: '#0f172a', borderBottom: '2px solid rgba(255,255,255,0.06)' }}
              >
                {['#', 'Name', 'Email', 'Role', 'Created By', 'Action', 'Time'].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '12px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: 40,
                      color: 'var(--text-muted)',
                      fontSize: 13,
                    }}
                  >
                    No users found
                  </td>
                </tr>
              )}
              {paginatedUsers.map((u, idx) => {
                const realIndex = (safePage - 1) * USERS_PER_PAGE + idx + 1;
                const isBlocked = u.status === 'blocked';
                const isSelf = u._id === selfId;
                const canTouch = !isSelf && canManageUser(u);
                return (
                  <tr
                    key={u._id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', height: 50 }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{realIndex}</td>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#e2e8f0' }}>
                      {u.name || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'left', color: '#38bdf8' }}>{u.email}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: getRoleBadge(u.role).bg,
                          color: getRoleBadge(u.role).color,
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'left', color: '#fbbf24' }}>
                      {getCreatedByName(u)}
                    </td>
                    <td style={td}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 4,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {canTouch &&
                          (isBlocked ? (
                            <button
                              onClick={() => handleUnblock(u)}
                              style={{
                                background: '#16a34a',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 11,
                                padding: '7px 12px',
                                borderRadius: 4,
                                fontWeight: 700,
                              }}
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlock(u)}
                              style={{
                                background: '#f59e0b',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 11,
                                padding: '7px 12px',
                                borderRadius: 4,
                                fontWeight: 700,
                              }}
                            >
                              Block
                            </button>
                          ))}
                        {canTouch && (
                          <button
                            onClick={() => handleDelete(u)}
                            style={{
                              background: '#ef4444',
                              border: 'none',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 11,
                              padding: '7px 12px',
                              borderRadius: 4,
                              fontWeight: 700,
                            }}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedDetailUser(u)}
                          style={{
                            background: '#3b82f6',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: '7px 12px',
                            borderRadius: 4,
                            fontWeight: 700,
                          }}
                        >
                          More
                        </button>
                      </div>
                    </td>
                    <td style={{ ...td, color: '#64748b' }}>{formatDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {users.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            padding: '16px 0',
            marginTop: 4,
          }}
        >
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              background: safePage === 1 ? '#334155' : '#475569',
              color: safePage === 1 ? '#64748b' : '#e2e8f0',
              border: 'none',
              borderRadius: 6,
              cursor: safePage === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, padding: '0 8px' }}>
            Page {safePage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              background: safePage === totalPages ? '#334155' : '#475569',
              color: safePage === totalPages ? '#64748b' : '#e2e8f0',
              border: 'none',
              borderRadius: 6,
              cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}

      {selectedDetailUser && (
        <div
          onClick={() => setSelectedDetailUser(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 16,
              width: '100%',
              maxWidth: 600,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '18px 22px',
                borderBottom: '1px solid #334155',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {selectedDetailUser.name?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: '#f1f5f9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedDetailUser.name || '—'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  @{selectedDetailUser.username || '—'}
                </div>
              </div>
              <button
                onClick={() => setSelectedDetailUser(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 22,
                  cursor: 'pointer',
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '6px 22px', overflowY: 'auto', flex: 1 }}>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Email</span>
                <span style={detailValueStyle}>{selectedDetailUser.email || '—'}</span>
              </div>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Phone</span>
                <span style={detailValueStyle}>{selectedDetailUser.phone || '—'}</span>
              </div>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Role</span>
                <span style={detailValueStyle}>{selectedDetailUser.role || '—'}</span>
              </div>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Tracking Code</span>
                <span style={detailValueStyle}>{selectedDetailUser.trackingCode || '—'}</span>
              </div>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Referral Token</span>
                <span style={detailValueStyle}>{selectedDetailUser.referralToken || '—'}</span>
              </div>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Created By</span>
                <span style={detailValueStyle}>{getCreatedByName(selectedDetailUser)}</span>
              </div>
              <div style={{ ...detailFieldStyle, borderBottom: 'none' }}>
                <span style={detailLabelStyle}>Joined</span>
                <span style={detailValueStyle}>{formatDate(selectedDetailUser.created_at)}</span>
              </div>
            </div>

            {selectedDetailUser._id !== selfId && canManageUser(selectedDetailUser) && (
              <div
                style={{
                  padding: '14px 22px',
                  borderTop: '1px solid #334155',
                  flexShrink: 0,
                  display: 'flex',
                  gap: 10,
                }}
              >
                {selectedDetailUser.status === 'blocked' ? (
                  <button
                    onClick={() => handleUnblock(selectedDetailUser)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      background: '#16a34a',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 8,
                    }}
                  >
                    Unblock User
                  </button>
                ) : (
                  <button
                    onClick={() => handleBlock(selectedDetailUser)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      background: '#f59e0b',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 8,
                    }}
                  >
                    Block User
                  </button>
                )}
                <button
                  onClick={() => handleDelete(selectedDetailUser)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: '#ef4444',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                  }}
                >
                  Delete User
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showRefModal && (
        <div
          onClick={() => setShowRefModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 16,
              padding: '22px 26px',
              width: 620,
              maxWidth: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                🔗 Referral Links
              </h3>
              <button
                onClick={() => setShowRefModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'rgba(167,139,250,0.06)',
                border: '1px solid rgba(167,139,250,0.2)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <button
                onClick={handleGenerateRefLink}
                disabled={generateLoading}
                style={{
                  width: '100%',
                  padding: '11px 18px',
                  background:
                    forcedTargetRole === 'admin'
                      ? 'linear-gradient(135deg,#a855f7,#8b5cf6)'
                      : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: generateLoading ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  opacity: generateLoading ? 0.6 : 1,
                }}
              >
                {generateLoading ? 'Generating...' : `🔗 Generate ${roleLabel} Referral Link`}
              </button>

              {filteredGeneratedLinks.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {filteredGeneratedLinks.map((gl, i) => {
                    const role = gl.role || deriveRoleFromToken(gl.token, gl.targetRole);
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'rgba(167,139,250,0.1)',
                          border: '1px solid rgba(167,139,250,0.25)',
                          borderRadius: 8,
                          padding: '7px 10px',
                        }}
                      >
                        <RoleTag role={role} />
                        <code
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#a78bfa',
                            fontFamily: 'Consolas, monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={gl.link}
                        >
                          {gl.link}
                        </code>
                        <span
                          style={{
                            fontSize: 9,
                            color: '#4ade80',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ● NEW
                        </span>
                        <button
                          onClick={() => {
                            copyToClipboard(gl.link);
                            safeToast(toast, 'info', 'Link copied!');
                          }}
                          style={{
                            flexShrink: 0,
                            padding: '3px 10px',
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              Pending {roleLabel} Referrals ({filteredRefLinks.length})
              {refsLoading ? ' — loading...' : ''}
            </div>

            {refsLoading && allRefLinks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 26, color: '#94a3b8', fontSize: 11 }}>
                Loading referrals...
              </div>
            ) : filteredRefLinks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 26, color: '#94a3b8', fontSize: 11 }}>
                No pending {roleLabel.toLowerCase()} referrals.
                <br />
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  Used referrals are auto-deleted.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {filteredRefLinks.map((rc, i) => {
                  const role = deriveRoleFromToken(rc.token, rc.targetRole || rc.type);
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        padding: '7px 10px',
                      }}
                    >
                      <RoleTag role={role} />
                      <code
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 10,
                          fontFamily: 'Consolas, monospace',
                          fontWeight: 600,
                          color: '#e2e8f0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={rc.link || rc.token}
                      >
                        {rc.link || rc.token}
                      </code>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#4ade80',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ● Pending
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(rc.link || rc.token);
                          safeToast(toast, 'info', 'Copied!');
                        }}
                        style={{
                          flexShrink: 0,
                          padding: '3px 10px',
                          background: '#475569',
                          border: 'none',
                          color: '#fff',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const td = {
  padding: '9px 8px',
  fontSize: 12,
  color: '#e2e8f0',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};
