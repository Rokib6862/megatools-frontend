// ============================================================
// MEGA TOOLS — CustomLinksPage v23.3
// Custom URL — SERVER-MIRRORED extractBasePath + CLIENT VALIDATION
// ============================================================
// v23.2 CHANGE (2026-11-09) — CLIENT HARDENING (FIX-CL13..CL17)
//   retained verbatim.
//
// FIX-CL18 (v23.3 — SKELETON INSTEAD OF HARDCODED "Loading…"):
//   Root cause of the "brief flash of the string 'Loading…'"
//   complaint when opening Custom URLs:
//     • The first-paint block was a plain text "Loading…".
//     • It only disappeared once loadAll() finished, so the
//       user saw a text flash even when the cache was warm.
//   This version:
//     • Replaces "Loading…" with a table-shaped skeleton
//       (header strip + 5 shimmer rows) that visually matches
//       the real table — no text, no layout jump.
//     • The skeleton is only rendered when BOTH caches are
//       empty (isFirstLoad === true AND zero folders). On a
//       warm cache the skeleton never appears; the cached
//       folder chips + rows paint immediately and the silent
//       background refresh updates them in place.
//     • The skeleton uses the same palette + shimmer keyframes
//       already used elsewhere in the project.
//   No other behaviour changed. Every v23.2 handler, cache
//   key, validation rule, and modal is byte-identical.
// ============================================================
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { copyToClipboard } from '../utils/helpers';

const CACHE_BASE = {
  links: 'megatools_customurls_links',
  folders: 'megatools_customurls_folders',
};
const LEGACY_KEYS = [
  'megatools_customurls_links_cache_v1',
  'megatools_customurls_folders_cache_v1',
];

function cacheKey(kind, userId) {
  return `${CACHE_BASE[kind]}_${userId || 'anon'}`;
}

function extractBasePath(baseUrl) {
  let s = String(baseUrl || '').trim();
  if (!s) return '';
  s = s.replace(/^(?:https?:\/\/)+/i, '');
  const segments = s.split('/').filter(Boolean);
  const fqdnRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
  let i = 0;
  while (i < segments.length && fqdnRe.test(segments[i])) i++;
  return segments.slice(i).join('/');
}

function isValidDomainName(name) {
  if (!name) return false;
  const s = String(name).trim().toLowerCase();
  if (s.length < 4 || s.length > 253) return false;
  if (!s.includes('.')) return false;
  if (/[\/\s?#@]/.test(s)) return false;
  const labels = s.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label) return false;
    if (label.length < 1 || label.length > 63) return false;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return false;
  return true;
}

function normalizeDomainInput(raw) {
  let d = String(raw || '')
    .trim()
    .toLowerCase();
  if (!d) return '';
  d = d
    .replace(/^(?:https?:\/\/)+/i, '')
    .replace(/\/.*$/, '')
    .replace(/\/$/, '');
  return d;
}

function sortFoldersByName(list) {
  return [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function readJsonCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ts && Date.now() - parsed.ts < 1000 * 60 * 60 * 6) {
      return parsed.data;
    }
  } catch (_) {}
  return null;
}

function writeJsonCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (_) {}
}

// FIX-CL18: table-shaped skeleton (used instead of "Loading…")
const SHIMMER_CSS = `
@keyframes clShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;
const shimmerBar = (w, h = 14) => ({
  height: h,
  width: w,
  borderRadius: 4,
  background:
    'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.03) 100%)',
  backgroundSize: '200% 100%',
  animation: 'clShimmer 1.6s linear infinite',
});

const TableSkeleton = React.memo(() => (
  <div
    style={{
      borderRadius: 10,
      border: '1px solid #334155',
      background: '#1E293B',
      overflow: 'hidden',
    }}
  >
    <style>{SHIMMER_CSS}</style>
    <div
      style={{
        background: '#0F172A',
        padding: '14px 18px',
        display: 'flex',
        gap: 16,
        borderBottom: '2px solid #334155',
      }}
    >
      <div style={shimmerBar(28, 10)} />
      <div style={shimmerBar(120, 10)} />
      <div style={shimmerBar(100, 10)} />
      <div style={{ flex: 1, ...shimmerBar('100%', 10) }} />
      <div style={shimmerBar(80, 10)} />
    </div>
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        style={{
          padding: '14px 18px',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          borderBottom: '1px solid #1E293B',
        }}
      >
        <div style={shimmerBar(24, 12)} />
        <div style={shimmerBar(140, 12)} />
        <div style={shimmerBar(90, 12)} />
        <div style={{ flex: 1, ...shimmerBar('100%', 12) }} />
        <div style={shimmerBar(70, 12)} />
      </div>
    ))}
  </div>
));

export default function CustomLinksPage() {
  const { user, linksVersion } = useAuth();
  const toast = useToast();
  const userTrackingCode = user?.trackingCode || '';
  const userId = user?._id || null;

  useEffect(() => {
    try {
      for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    } catch (_) {}
  }, []);

  const linksCacheKey = useMemo(() => cacheKey('links', userId), [userId]);
  const foldersCacheKey = useMemo(() => cacheKey('folders', userId), [userId]);

  const initialLinks = useMemo(() => readJsonCache(linksCacheKey) || [], [linksCacheKey]);
  const initialFolders = useMemo(() => readJsonCache(foldersCacheKey) || [], [foldersCacheKey]);

  const [folders, setFolders] = useState(() => initialFolders);
  const [readyLinks, setReadyLinks] = useState(() => initialLinks);
  const [isFirstLoad, setIsFirstLoad] = useState(
    () => !(initialLinks.length > 0 || initialFolders.length > 0)
  );

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ domain: '' });
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [customizeItem, setCustomizeItem] = useState(null);
  const [customizeDomain, setCustomizeDomain] = useState('');
  const [customizeSuffix, setCustomizeSuffix] = useState('');

  const inflightRef = useRef(false);
  const lastLoadedVersionRef = useRef(-1);
  const lastUserIdRef = useRef(null);

  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;

    const freshLinks = readJsonCache(linksCacheKey) || [];
    const freshFolders = readJsonCache(foldersCacheKey) || [];
    setReadyLinks(freshLinks);
    setFolders(freshFolders);
    setActiveFolderId(null);
    setActiveCategory(null);
    setCustomizeItem(null);
    setShowForm(false);
    setForm({ domain: '' });
    setFormError('');
    setIsFirstLoad(!(freshLinks.length > 0 || freshFolders.length > 0));
    lastLoadedVersionRef.current = -1;
  }, [userId, linksCacheKey, foldersCacheKey]);

  const loadAll = useCallback(
    async (opts = {}) => {
      const { showSkeleton = false } = opts;
      if (inflightRef.current) return;
      inflightRef.current = true;
      if (showSkeleton) setIsFirstLoad(true);

      try {
        const [linksRes, foldersRes] = await Promise.allSettled([
          api.get('/links'),
          api.get('/folders'),
        ]);

        if (linksRes.status === 'fulfilled') {
          const all = linksRes.value?.data?.links || linksRes.value?.data || [];
          const ready = (Array.isArray(all) ? all : []).filter(
            (l) =>
              l.category !== 'personal' &&
              l.category !== 'message' &&
              l.category !== 'reply' &&
              l.linksCategory !== 'message' &&
              l.linksCategory !== 'reply' &&
              l.showInDeployment !== false &&
              l.showDeployUrl !== false
          );
          setReadyLinks(ready);
          writeJsonCache(linksCacheKey, ready);
        } else {
          const status = linksRes.reason?.response?.status;
          if (status !== 401) toast.error('Failed to load links');
        }

        if (foldersRes.status === 'fulfilled') {
          const list = foldersRes.value?.data?.folders;
          const arr = Array.isArray(list) ? list : [];
          setFolders(arr);
          writeJsonCache(foldersCacheKey, arr);
        } else {
          const status = foldersRes.reason?.response?.status;
          if (status === 404) {
            setFolders([]);
            writeJsonCache(foldersCacheKey, []);
          } else if (status !== 401) {
            console.warn('[CustomURLs] folders fetch failed:', status);
          }
        }
      } catch (err) {
        if (err?.response?.status !== 401) toast.error('Failed to load custom URLs');
      } finally {
        inflightRef.current = false;
        setIsFirstLoad(false);
      }
    },
    [toast, linksCacheKey, foldersCacheKey]
  );

  useEffect(() => {
    if (!userId) return;
    if (lastLoadedVersionRef.current === linksVersion) return;
    const isFirst = lastLoadedVersionRef.current === -1;
    lastLoadedVersionRef.current = linksVersion;
    const needsSkeleton = isFirst && readyLinks.length === 0 && folders.length === 0;
    loadAll({ showSkeleton: needsSkeleton });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksVersion, userId]);

  const displayFolders = useMemo(() => {
    return sortFoldersByName(
      folders.map((f) => ({
        _id: f._id,
        name: f.name,
        overrides: f.overrides || {},
        serverBacked: true,
      }))
    );
  }, [folders]);

  const activeFolder = useMemo(() => {
    if (!activeFolderId) return null;
    return folders.find((f) => f._id === activeFolderId) || null;
  }, [folders, activeFolderId]);

  const effectiveDomain = useMemo(() => {
    if (activeFolder) return String(activeFolder.name || '').toLowerCase();
    if (displayFolders.length > 0) return String(displayFolders[0].name || '').toLowerCase();
    return '';
  }, [activeFolder, displayFolders]);

  useEffect(() => {
    if (displayFolders.length === 0) {
      if (activeFolderId) setActiveFolderId(null);
      return;
    }
    const exists = activeFolderId && displayFolders.some((f) => f._id === activeFolderId);
    if (!exists) setActiveFolderId(displayFolders[0]._id || null);
  }, [displayFolders, activeFolderId]);

  const overrides = activeFolder?.overrides || {};

  const getDefaultSuffix = (item) => {
    const tc = userTrackingCode || '';
    const bc = item?.baseCode || item?.slug || '';
    if (tc && bc) return `${tc}_${bc}`;
    return tc || bc || '';
  };

  const getSuffix = (item) => {
    if (!item) return '';
    const ov = overrides[String(item._id)];
    return ov || getDefaultSuffix(item);
  };

  const folderItems = readyLinks;

  const categories = useMemo(() => {
    const set = new Set();
    folderItems.forEach((l) => {
      if (l.category) set.add(l.category);
    });
    return [...set].sort();
  }, [folderItems]);

  useEffect(() => {
    if (categories.length === 0) {
      setActiveCategory(null);
      return;
    }
    if (!activeCategory || !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const filteredItems = useMemo(() => {
    let scope = folderItems;
    if (activeCategory) {
      scope = scope.filter((l) => l.category === activeCategory);
    }
    return scope;
  }, [folderItems, activeCategory]);

  const ensureServerFolder = useCallback(
    async (folderName) => {
      const name = String(folderName || '')
        .trim()
        .toLowerCase();
      if (!name) return null;
      const existing = folders.find((f) => String(f.name).toLowerCase() === name);
      if (existing) return existing._id;
      try {
        const res = await api.post('/folders', { name });
        const folder = res?.data?.folder;
        if (folder) {
          setFolders((prev) =>
            sortFoldersByName([...prev.filter((x) => x._id !== folder._id), folder])
          );
          setActiveFolderId(folder._id);
          return folder._id;
        }
      } catch (err) {
        toast.error(err?.response?.data?.message || 'Failed to register folder');
      }
      return null;
    },
    [folders, toast]
  );

  const openAdd = () => {
    setForm({ domain: '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    const d = normalizeDomainInput(form.domain);

    if (!d) {
      setFormError('Domain is required.');
      return;
    }
    if (!isValidDomainName(d)) {
      setFormError('Invalid domain. Use a real domain like "short.link".');
      return;
    }
    if (displayFolders.some((f) => String(f.name).toLowerCase() === d)) {
      setFormError('Domain already exists.');
      return;
    }
    if (saving) return;

    setFormError('');
    setSaving(true);

    const tempId = 'temp_' + Date.now();
    const optimistic = {
      _id: tempId,
      name: d,
      overrides: {},
      ownerId: userId,
      ownerTrackingCode: userTrackingCode || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setFolders((prev) => sortFoldersByName([...prev, optimistic]));
    setActiveFolderId(tempId);
    setShowForm(false);
    setForm({ domain: '' });

    try {
      const res = await api.post('/folders', { name: d });
      const folder = res?.data?.folder;
      if (folder) {
        setFolders((prev) => {
          const without = prev.filter((x) => x._id !== tempId && x._id !== folder._id);
          return sortFoldersByName([...without, folder]);
        });
        setActiveFolderId(folder._id);
        writeJsonCache(
          foldersCacheKey,
          await api
            .get('/folders')
            .then((r) => r?.data?.folders || [])
            .catch(() => [])
        );
        toast.success('Folder created');
      } else {
        toast.success('Folder created');
        loadAll({});
      }
    } catch (err) {
      setFolders((prev) => prev.filter((x) => x._id !== tempId));
      setActiveFolderId(null);
      const msg = err?.response?.data?.message || 'Failed to add domain';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!activeFolder) {
      toast.error('No folder selected');
      return;
    }
    if (deletingFolder) return;

    const folderName = activeFolder.name;
    if (!window.confirm(`Delete folder "${folderName}"? Ready URLs will NOT be affected.`)) return;

    setDeletingFolder(true);
    const removedFolder = activeFolder;
    const removedIndex = folders.findIndex((f) => f._id === removedFolder._id);

    setFolders((prev) => prev.filter((f) => f._id !== removedFolder._id));
    setActiveFolderId((prev) => (prev === removedFolder._id ? null : prev));

    try {
      let folderId = removedFolder._id;
      if (!folderId || String(folderId).startsWith('temp_')) {
        folderId = await ensureServerFolder(folderName);
        if (!folderId) {
          toast.error('Could not register folder on server');
          loadAll({});
          return;
        }
      }

      const res = await api.delete(`/folders/${folderId}`);
      const data = res?.data || {};

      if (data.success) {
        toast.success(`Folder "${folderName}" deleted (Ready links preserved)`);
      } else {
        toast.error(`Folder "${folderName}" — ${data.message || 'delete failed'}`);
      }
      writeJsonCache(
        foldersCacheKey,
        folders.filter((f) => f._id !== removedFolder._id)
      );
    } catch (err) {
      if (removedIndex >= 0) {
        setFolders((prev) => {
          const list = [...prev];
          list.splice(removedIndex, 0, removedFolder);
          return list;
        });
      } else {
        setFolders((prev) => [...prev, removedFolder]);
      }
      const msg = err?.response?.data?.message || 'Delete failed';
      toast.error(msg);
    } finally {
      setDeletingFolder(false);
    }
  };

  const openCustomize = async (item) => {
    if (!activeFolder) {
      toast.error('No folder selected');
      return;
    }
    if (!activeFolder._id || String(activeFolder._id).startsWith('temp_')) {
      const folderId = await ensureServerFolder(activeFolder.name);
      if (!folderId) return;
    }
    setCustomizeItem(item);
    setCustomizeDomain(activeFolder.name || '');
    setCustomizeSuffix(getSuffix(item));
  };

  const handleSaveCustomize = async () => {
    if (!customizeItem) return;
    const val = String(customizeSuffix || '').trim();
    const linkId = customizeItem._id;
    if (!val) {
      toast.error('Suffix cannot be empty');
      return;
    }

    let folderId = activeFolder?._id;
    if (!folderId || String(folderId).startsWith('temp_')) {
      folderId = await ensureServerFolder(activeFolder?.name);
      if (!folderId) return;
    }

    const prevOverrides = { ...(activeFolder?.overrides || {}) };

    setFolders((prev) =>
      prev.map((f) => {
        if (f._id !== folderId) return f;
        return { ...f, overrides: { ...(f.overrides || {}), [String(linkId)]: val } };
      })
    );
    setCustomizeItem(null);
    setCustomizeDomain('');
    setCustomizeSuffix('');

    setSaving(true);
    try {
      await api.patch(`/folders/${folderId}/suffix/${linkId}`, { suffix: val });
      toast.success('Link customized');
    } catch (err) {
      setFolders((prev) =>
        prev.map((f) => {
          if (f._id !== folderId) return f;
          return { ...f, overrides: prevOverrides };
        })
      );
      const msg = err?.response?.data?.message || 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetCustomize = async (item) => {
    if (!item) return;
    if (!Object.prototype.hasOwnProperty.call(overrides, String(item._id))) return;
    if (!window.confirm('Reset this customized link back to default?')) return;

    let folderId = activeFolder?._id;
    if (!folderId || String(folderId).startsWith('temp_')) {
      folderId = await ensureServerFolder(activeFolder?.name);
      if (!folderId) return;
    }

    const prevOverrides = { ...(activeFolder?.overrides || {}) };

    setFolders((prev) =>
      prev.map((f) => {
        if (f._id !== folderId) return f;
        const ov = { ...(f.overrides || {}) };
        delete ov[String(item._id)];
        return { ...f, overrides: ov };
      })
    );

    try {
      await api.delete(`/folders/${folderId}/suffix/${item._id}`);
      toast.success('Reset to default');
    } catch (err) {
      setFolders((prev) =>
        prev.map((f) => {
          if (f._id !== folderId) return f;
          return { ...f, overrides: prevOverrides };
        })
      );
      const msg = err?.response?.data?.message || 'Reset failed';
      toast.error(msg);
    }
  };

  const handleCopy = (text) => {
    if (!text) return;
    copyToClipboard(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCancel = () => {
    if (saving) return;
    setShowForm(false);
    setForm({ domain: '' });
    setFormError('');
  };

  const buildVisitorUrl = (link) => {
    const dom = effectiveDomain;
    if (!dom) return link.baseUrl || '';
    const basePath = extractBasePath(link.baseUrl);
    const suffix = getSuffix(link);
    return basePath ? `https://${dom}/${basePath}/${suffix}` : `https://${dom}/${suffix}`;
  };

  const truncLabel = (s, n = 28) => {
    if (!s) return '—';
    return s.length > n ? s.slice(0, n) + '…' : s;
  };

  const deleteLabel = useMemo(() => {
    if (!activeFolder) return '🗑️ Delete Folder';
    const shortFolder =
      activeFolder.name.length > 22 ? activeFolder.name.slice(0, 22) + '…' : activeFolder.name;
    if (deletingFolder) return '⏳ Deleting…';
    return `🗑️ Delete Folder "${shortFolder}"`;
  }, [activeFolder, deletingFolder]);

  return (
    <div style={{ padding: '16px 20px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#10b981' }}>
              Custom URLs
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94a3b8' }}>
              Tracking:{' '}
              <code style={{ color: '#818cf8', fontWeight: 600 }}>{userTrackingCode || 'N/A'}</code>
            </p>
          </div>
          {displayFolders.length > 0 && (
            <span
              style={{
                background: 'rgba(16,185,129,0.12)',
                color: '#10b981',
                fontWeight: 700,
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 12,
                border: '1px solid rgba(16,185,129,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {displayFolders.length} domain{displayFolders.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activeFolder && (
            <button
              onClick={handleDeleteFolder}
              disabled={isFirstLoad || deletingFolder}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 700,
                background: deletingFolder ? '#7f1d1d' : '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                cursor: isFirstLoad || deletingFolder ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(239,68,68,0.35)',
                opacity: isFirstLoad || deletingFolder ? 0.7 : 1,
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`Delete folder "${activeFolder.name}" (Ready links are preserved)`}
            >
              {deleteLabel}
            </button>
          )}
          <button
            onClick={openAdd}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
            }}
          >
            + Add Domain
          </button>
        </div>
      </div>

      {/* FIX-CL18: skeleton (only when both caches empty) */}
      {isFirstLoad && displayFolders.length === 0 && <TableSkeleton />}

      {!isFirstLoad && displayFolders.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 15 }}>
          No custom domains yet. Click <strong style={{ color: '#e2e8f0' }}>+ Add Domain</strong> to
          add one.
        </div>
      )}

      {displayFolders.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            marginBottom: 16,
            whiteSpace: 'nowrap',
            scrollbarWidth: 'thin',
          }}
        >
          {displayFolders.map((f) => {
            const active = activeFolderId === f._id;
            return (
              <button
                key={f._id || f.name}
                onClick={() => setActiveFolderId(f._id || null)}
                title={f.name}
                style={{
                  padding: '7px 16px',
                  background: active ? 'rgba(16,185,129,0.18)' : '#1E293B',
                  border: `2px solid ${active ? '#10b981' : '#334155'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  minWidth: 140,
                  maxWidth: 260,
                  transition: 'all 0.15s',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: active ? '#10b981' : '#F8FAFC',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {truncLabel(f.name, 28)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {effectiveDomain && categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, width: '100%', flexWrap: 'wrap' }}>
          {categories.map((cat) => {
            const count = folderItems.filter((l) => l.category === cat).length;
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  border: active ? 'none' : '1px solid #334155',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: active ? '#f59e0b' : '#1E293B',
                  color: active ? '#000' : '#94a3b8',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {effectiveDomain && (
        <div
          style={{
            borderRadius: 10,
            border: '1px solid #334155',
            background: '#1E293B',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={{ ...th, textAlign: 'left', width: 150 }}>Name</th>
                  <th style={{ ...th, width: 130 }}>Category</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 380, width: '45%' }}>
                    Visitor Ready URL
                  </th>
                  <th style={{ ...th, width: 200 }}>Action</th>
                  <th style={{ ...th, width: 80 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: 'center',
                        padding: 40,
                        color: '#94a3b8',
                      }}
                    >
                      {folderItems.length === 0
                        ? 'No Ready links available. Add links from Ready / Quick first.'
                        : 'No links in this category.'}
                    </td>
                  </tr>
                )}
                {filteredItems.map((item, i) => {
                  const visitorUrl = buildVisitorUrl(item);
                  const customized = Object.prototype.hasOwnProperty.call(
                    overrides,
                    String(item._id)
                  );
                  return (
                    <tr
                      key={item._id}
                      style={{ transition: 'background 0.1s' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td
                        style={{
                          ...tdRow,
                          color: '#94a3b8',
                          fontWeight: 600,
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        style={{
                          ...tdRow,
                          textAlign: 'left',
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#F8FAFC',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 150,
                        }}
                        title={item.name}
                      >
                        {item.name || '—'}
                      </td>
                      <td style={tdRow}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 600,
                            background: 'rgba(139,92,246,0.15)',
                            color: '#c4b5fd',
                            border: '1px solid rgba(139,92,246,0.25)',
                            whiteSpace: 'nowrap',
                            maxWidth: 110,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.category || ''}
                        >
                          {item.category || '—'}
                        </span>
                      </td>
                      <td style={tdRow}>
                        <input
                          type="text"
                          readOnly
                          value={visitorUrl}
                          onClick={(e) => {
                            e.target.select();
                            handleCopy(visitorUrl);
                          }}
                          title="Click to copy"
                          style={urlInput(copiedId === visitorUrl)}
                        />
                      </td>
                      <td style={{ ...tdRow, textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button onClick={() => openCustomize(item)} style={customizeBtn}>
                            ⚙️ Customize
                          </button>
                          {customized && (
                            <button
                              onClick={() => handleResetCustomize(item)}
                              style={resetBtn}
                              title="Reset this customized link to default"
                            >
                              🔄 Reset
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdRow, textAlign: 'center' }}>
                        <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: '2-digit',
                              })
                            : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={handleCancel} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalContent}>
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: 16,
                fontWeight: 800,
                color: '#10b981',
                textAlign: 'center',
              }}
            >
              + Add Custom Domain
            </h3>
            <p
              style={{ margin: '0 0 16px 0', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}
            >
              Create a personal folder for your domain.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Domain *</label>
              <input
                type="text"
                value={form.domain}
                onChange={(e) => {
                  setForm({ ...form, domain: e.target.value });
                  setFormError('');
                }}
                style={{
                  ...inp,
                  borderColor: formError ? '#ef4444' : '#334155',
                }}
                placeholder="e.g. short.link"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
              />
              {formError ? (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{formError}</div>
              ) : (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>
                  e.g. "short.link" — this domain is yours only, others won't see it
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCancel}
                disabled={saving}
                style={{ ...cancelBtn, opacity: saving ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ ...saveBtn, opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : 'Add Domain'}
              </button>
            </div>
          </div>
        </div>
      )}

      {customizeItem && (
        <div onClick={() => setCustomizeItem(null)} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalContent, width: 560 }}>
            <h3
              style={{
                margin: '0 0 14px 0',
                fontSize: 16,
                fontWeight: 800,
                color: '#f59e0b',
                textAlign: 'center',
              }}
            >
              ⚙️ Customize Link
            </h3>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Suffix</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#0F172A',
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    padding: '10px 10px',
                    color: '#94a3b8',
                    background: '#1E293B',
                    borderRight: '1px solid #334155',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    fontSize: 12,
                  }}
                >
                  https://{customizeDomain || 'yourdomain'}/{extractBasePath(customizeItem.baseUrl)}
                  /
                </span>
                <input
                  type="text"
                  value={customizeSuffix}
                  onChange={(e) => setCustomizeSuffix(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'transparent',
                    color: '#10b981',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                  placeholder="suffix"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCustomize();
                  }}
                />
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#94a3b8',
                marginBottom: 16,
                padding: '10px 12px',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 6,
                lineHeight: 1.5,
              }}
            >
              ℹ️ Path is fixed. Only the suffix is editable. Changes are saved to the server and
              synced across all devices.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCustomizeItem(null)} style={cancelBtn}>
                Cancel
              </button>
              <button
                onClick={handleSaveCustomize}
                disabled={saving}
                style={{ ...saveBtn, background: '#f59e0b', opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = {
  background: '#1E293B',
  padding: '11px 14px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  color: '#94a3b8',
  borderBottom: '2px solid #334155',
  whiteSpace: 'nowrap',
  textAlign: 'center',
};
const tdRow = {
  padding: '11px 14px',
  borderBottom: '1px solid #1E293B',
  verticalAlign: 'middle',
  fontSize: 13,
  color: '#F8FAFC',
  textAlign: 'center',
};
const lbl = {
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
  letterSpacing: '0.05em',
};
const inp = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 14,
  background: '#0F172A',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};
const urlInput = (isCopied) => ({
  width: '100%',
  height: 36,
  padding: '0 12px',
  background: '#0F172A',
  border: `1px solid ${isCopied ? '#10b981' : '#334155'}`,
  borderRadius: 6,
  color: isCopied ? '#10b981' : '#e2e8f0',
  fontFamily: "'SF Mono', Monaco, Consolas, monospace",
  fontSize: 11,
  outline: 'none',
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  transition: 'border 0.15s',
});
const customizeBtn = {
  background: '#f59e0b',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  padding: '6px 12px',
  borderRadius: 6,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const resetBtn = {
  background: '#ef4444',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  padding: '6px 12px',
  borderRadius: 6,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const cancelBtn = {
  flex: 1,
  padding: '12px',
  fontSize: 14,
  fontWeight: 600,
  background: '#1E293B',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 8,
  cursor: 'pointer',
};
const saveBtn = {
  flex: 2,
  padding: '12px',
  fontSize: 14,
  fontWeight: 700,
  background: '#10b981',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};
const modalOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.78)',
  backdropFilter: 'blur(3px)',
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};
const modalContent = {
  background: '#1E293B',
  border: '1px solid #334155',
  borderRadius: 14,
  padding: 24,
  width: 480,
  maxWidth: '95%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
