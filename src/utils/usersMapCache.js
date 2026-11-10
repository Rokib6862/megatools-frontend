// ============================================================
// MEGA TOOLS — usersMapCache.js v1.0
// ============================================================
// Centralized cache for the /auth/users-map response.
//
// WHY THIS EXISTS:
//   Both TrashPage and LiveInboxPage previously kept `users` in
//   a plain `useState([])`, populated only after the first fetch
//   resolved. That produced a visible flicker on every reload:
//     frame 1 → fallback name ("4", "V", "—")
//     frame 2 → real name ("Admin", "MD OBAIDUL HOQUE ALIM")
//   This module stores the LAST known users map in localStorage
//   so the first frame already renders the correct name.
//
// SHAPE:
//   users list = array of
//     { trackingCode, name, username, email, role, phone, ... }
//   It is already the exact shape both pages consume from
//   `loadAuxData` / `fetchAll`.
//
// SAFETY:
//   * Version-tagged (`USERS_MAP_VERSION`) — any schema change
//     invalidates old snapshots.
//   * Bounded (MAX_USERS) so a huge tenant never blows the
//     5 MB localStorage budget.
//   * Never throws — every call is wrapped.
//   * Exposes `clearUsersMapCache()` which Trash / Inbox /
//     AuthContext can call on userDeleted / userBlocked socket
//     events to drop a stale map.
// ============================================================

const USERS_MAP_CACHE_KEY = 'megatools_users_map_v1';
const USERS_MAP_VERSION = 'v1_1';
const MAX_USERS = 1000;

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function readUsersMapCache() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(USERS_MAP_CACHE_KEY);
    if (!raw) return [];
    const parsed = safeParse(raw);
    if (!parsed || parsed.version !== USERS_MAP_VERSION) return [];
    if (!Array.isArray(parsed.users)) return [];
    return parsed.users;
  } catch (_) {
    return [];
  }
}

export function writeUsersMapCache(usersList) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!Array.isArray(usersList)) return;
    const bounded = usersList.slice(0, MAX_USERS);
    const payload = {
      version: USERS_MAP_VERSION,
      users: bounded,
      ts: Date.now(),
    };
    localStorage.setItem(USERS_MAP_CACHE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Ignore quota / private-mode errors.
  }
}

export function clearUsersMapCache() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(USERS_MAP_CACHE_KEY);
  } catch (_) {}
}

// Convert the raw map returned by GET /auth/users-map into the
// array shape both pages consume. Extracted here so every caller
// uses the exact same normalization.
export function mapToUsersList(map) {
  if (!map || typeof map !== 'object') return [];
  try {
    return Object.entries(map).map(([trackingCode, info]) => ({
      trackingCode,
      name: info?.name || info?.username || trackingCode,
      username: info?.username || '',
      email: info?.email || '',
      role: info?.role || '',
      phone: info?.phone || '',
      profilePic: info?.profilePic || '',
      status: info?.status || 'active',
      parentId: info?.parentId || null,
      createdBy: info?.createdBy || null,
      created_at: info?.created_at || '',
      ...info,
    }));
  } catch (_) {
    return [];
  }
}
