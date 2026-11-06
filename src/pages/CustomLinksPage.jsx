// ============================================================
// MEGA TOOLS — CustomLinksPage v12.0 (FAST LOAD + CACHE)
// Performance:
//   - localStorage cache → instant show (no waiting)
//   - Background refresh → silent API update
//   - Cache TTL: 5 minutes
//   - Multi-tab sync via storage event
// Category sub-filter + domain isolation preserved
// ============================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { copyToClipboard } from '../utils/helpers';

const CUSTOM_DOMAINS_KEY = 'megatools_customurls_domains';
const CUSTOM_OVERRIDES_KEY = 'megatools_customurls_overrides';
const LINKS_CACHE_KEY = 'megatools_customurls_links_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BACKEND_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:5000';
const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const makeKey = (linkId, domain) => `${linkId}__${domain || ''}`;

function loadJSZip() {
  return new Promise((resolve, reject) => {
    if (window.JSZip) return resolve(window.JSZip);
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.async = true;
    s.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip load failed'));
    s.onerror = () => reject(new Error('JSZip CDN error'));
    document.body.appendChild(s);
  });
}

function extractBasePath(baseUrl) {
  let s = String(baseUrl || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  const slashIdx = s.indexOf('/');
  if (slashIdx >= 0) s = s.slice(slashIdx + 1);
  return s.replace(/\/$/, '');
}

function getCachedLinks() {
  try {
    const raw = localStorage.getItem(LINKS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || !parsed.ts) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch { return null; }
}

function saveLinksCache(data) {
  try {
    localStorage.setItem(LINKS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export default function CustomLinksPage() {
  const { user } = useAuth();
  const toast = useToast();
  const userTrackingCode = user?.trackingCode || '';

  // Initial load from cache (instant, no loading screen)
  const initialCached = getCachedLinks();
  const [items, setItems] = useState(initialCached || []);
  const [loading, setLoading] = useState(!initialCached); // only show loading if no cache
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ domain: '' });
  const [copiedId, setCopiedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [domains, setDomains] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [customizeItem, setCustomizeItem] = useState(null);
  const [customizeDomain, setCustomizeDomain] = useState('');
  const [customizeSuffix, setCustomizeSuffix] = useState('');

  useEffect(() => {
    try {
      const savedDomains = JSON.parse(localStorage.getItem(CUSTOM_DOMAINS_KEY) || '[]');
      const savedOverrides = JSON.parse(localStorage.getItem(CUSTOM_OVERRIDES_KEY) || '{}');
      setDomains(Array.isArray(savedDomains) ? savedDomains : []);
      setOverrides(savedOverrides && typeof savedOverrides === 'object' ? savedOverrides : {});
    } catch { setDomains([]); setOverrides({}); }
  }, []);

  // Multi-tab sync: if another tab modifies cache, update state
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LINKS_CACHE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.data && Array.isArray(parsed.data)) {
            setItems(parsed.data);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const saveDomains = (d) => {
    setDomains(d);
    try { localStorage.setItem(CUSTOM_DOMAINS_KEY, JSON.stringify(d)); } catch {}
  };
  const saveOverrides = (m) => {
    setOverrides(m);
    try { localStorage.setItem(CUSTOM_OVERRIDES_KEY, JSON.stringify(m)); } catch {}
  };

  const loadLinks = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const r = await api.get('/links');
      const all = r.data?.links || r.data || [];
      const quick = (Array.isArray(all) ? all : []).filter(l =>
        l.inboxView !== 'message' &&
        l.category !== 'message' &&
        l.category !== 'personal'
      );
      setItems(quick);
      saveLinksCache(quick);
    } catch (err) {
      if (err.response?.status !== 401 && !initialCached) {
        toast.error('Failed to load custom URLs');
      }
      if (!initialCached) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast, initialCached]);

  // Background refresh on mount (silent — no loading state if cache exists)
  useEffect(() => {
    loadLinks(!initialCached);
  }, [loadLinks, initialCached]);

  useEffect(() => {
    if (domains.length > 0 && (!activeFolder || !domains.includes(activeFolder))) {
      setActiveFolder(domains[0]);
    }
    if (domains.length === 0) setActiveFolder(null);
  }, [domains, activeFolder]);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach(l => { if (l.category) set.add(l.category); });
    return [...set].sort();
  }, [items]);

  useEffect(() => {
    if (categories.length > 0) {
      if (!activeCategory || !categories.includes(activeCategory)) {
        setActiveCategory(categories[0]);
      }
    } else {
      setActiveCategory(null);
    }
  }, [activeFolder, categories, activeCategory]);

  const filteredItems = useMemo(() => {
    if (!activeCategory) return [];
    return items.filter(l => l.category === activeCategory);
  }, [items, activeCategory]);

  const getDefaultSuffix = (link) => {
    const tc = userTrackingCode || '';
    const bc = link.baseCode || link.slug || '';
    if (tc && bc) return `${tc}_${bc}`;
    return tc || bc || '';
  };

  const getSuffix = (link, domain) => {
    const o = overrides[makeKey(link._id, domain)];
    return o || getDefaultSuffix(link);
  };

  const openAdd = () => {
    setForm({ domain: '' });
    setShowForm(true);
  };

  const openCustomize = (item) => {
    setCustomizeItem(item);
    setCustomizeDomain(activeFolder);
    setCustomizeSuffix(getSuffix(item, activeFolder));
  };

  const handleSaveCustomize = () => {
    if (!customizeItem || !customizeDomain) return;
    const val = (customizeSuffix || '').trim();
    const k = makeKey(customizeItem._id, customizeDomain);
    const next = { ...overrides };
    const def = getDefaultSuffix(customizeItem);
    if (!val || val === def) {
      delete next[k];
      toast.success('Reverted to default');
    } else {
      next[k] = val;
      toast.success('Link customized');
    }
    saveOverrides(next);
    setCustomizeItem(null);
    setCustomizeDomain('');
    setCustomizeSuffix('');
  };

  const handleSave = () => {
    let d = form.domain.trim();
    if (!d) { toast.error('Domain is required'); return; }
    d = d.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (domains.includes(d)) { toast.error('Domain already exists'); return; }
    if (saving) return;
    setSaving(true);
    try {
      saveDomains([...domains, d]);
      toast.success('Domain added');
      setShowForm(false);
      setForm({ domain: '' });
      setActiveFolder(d);
    } catch (err) {
      toast.error('Failed to add domain');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFolder = () => {
    const domainName = activeFolder;
    if (!domainName) return;
    if (!window.confirm(`Delete folder "${domainName}"?`)) return;
    saveDomains(domains.filter(d => d !== domainName));
    toast.success('Folder deleted');
    if (activeFolder === domainName) setActiveFolder(domains.filter(d => d !== domainName)[0] || null);
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
  };

  const buildVisitorUrl = (link, domain) => {
    if (!domain) return link.baseUrl || '';
    const basePath = extractBasePath(link.baseUrl);
    const suffix = getSuffix(link, domain);
    return basePath ? `https://${domain}/${basePath}/${suffix}` : `https://${domain}/${suffix}`;
  };

  const truncLabel = (s, n = 32) => {
    if (!s) return '—';
    return s.length > n ? s.slice(0, n) + '…' : s;
  };

  const handleDownloadZip = async () => {
    if (downloading) return;
    if (!items.length) { toast.error('No Quick Links to package'); return; }
    setDownloading(true);
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();

      const routes = items.map(link => {
        const basePath = extractBasePath(link.baseUrl);
        const originalSuffix = getDefaultSuffix(link);
        return {
          path: basePath,
          target: `${BACKEND_URL}/s/${originalSuffix}`,
          name: link.name || originalSuffix,
          category: link.category || '',
        };
      }).filter(r => r.path);

      const groupMap = {};
      routes.forEach(r => {
        const cat = r.category || 'general';
        if (!groupMap[cat]) groupMap[cat] = [];
        groupMap[cat].push(r);
      });

      const groupBlocks = Object.keys(groupMap).map(cat => {
        const list = groupMap[cat];
        const cards = list.map(r => `
        <a class="card" href="/${r.path}/" target="_blank" rel="noopener">
          <span class="path">/${r.path}/</span>
          <span class="target">→ ${r.target}</span>
          <span class="arrow">↗</span>
        </a>`).join('');
        return `
        <section class="group">
          <div class="group-head"><h3>${cat}</h3><span class="badge">${list.length} routes</span></div>
          <div class="grid">${cards}</div>
        </section>`;
      }).join('');

      const indexHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Redirect Hub — ${user?.username || 'User'}</title>
<meta name="robots" content="noindex, nofollow" />
<link rel="stylesheet" href="/assets/style.css" /></head><body>
<header class="topbar"><div class="brand"><span class="dot"></span><h1>Redirect Hub — ${user?.username || 'User'}</h1></div><div class="status" id="net-status">Checking…</div></header>
<main class="wrap"><h2>All Endpoints</h2><p class="sub">Click any path to test redirect.</p>
<section class="search-box"><input id="search" type="text" placeholder="Filter path…" autocomplete="off" /><span id="count" class="count">0 routes</span></section>
<div id="groups">${groupBlocks}</div></main>
<footer class="footer"><span>${user?.username || 'User'} · redirect layer</span><span id="build">v1.0</span></footer>
<script src="/assets/app.js" defer></script></body></html>`;

      const appJs = `(function () {
  "use strict";
  const ROUTES = ${JSON.stringify(routes, null, 2)};
  const container = document.getElementById("groups");
  const searchInput = document.getElementById("search");
  const countEl = document.getElementById("count");
  function render(filter) {
    const q = (filter || "").trim().toLowerCase();
    container.innerHTML = "";
    let visible = 0;
    const grouped = {};
    ROUTES.forEach(r => {
      if (!q || r.path.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) {
        const cat = r.category || "general";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(r);
        visible++;
      }
    });
    Object.keys(grouped).forEach(cat => {
      const section = document.createElement("section");
      section.className = "group";
      const head = document.createElement("div");
      head.className = "group-head";
      head.innerHTML = "<h3>" + cat + "</h3><span class='badge'>" + grouped[cat].length + " routes</span>";
      section.appendChild(head);
      const grid = document.createElement("div");
      grid.className = "grid";
      grouped[cat].forEach(r => {
        const card = document.createElement("a");
        card.className = "card";
        card.href = "/" + r.path + "/";
        card.target = "_blank";
        card.rel = "noopener";
        card.innerHTML = '<span class="path">/' + r.path + '/</span><span class="target">→ ' + r.target + '</span><span class="arrow">↗</span>';
        grid.appendChild(card);
      });
      section.appendChild(grid);
      container.appendChild(section);
    });
    countEl.textContent = visible + " route" + (visible !== 1 ? "s" : "");
  }
  if (searchInput) searchInput.addEventListener("input", e => render(e.target.value));
  function setStatus() {
    const el = document.getElementById("net-status");
    if (!el) return;
    el.textContent = navigator.onLine ? "● Online" : "● Offline";
  }
  window.addEventListener("online", setStatus);
  window.addEventListener("offline", setStatus);
  render("");
  setStatus();
})();`;

      const styleCss = `:root{--bg:#0b0f14;--card:#151d2a;--line:#222d40;--txt:#e6edf6;--txt-2:#8fa3bd;--accent:#4f8cff;--ok:#22c55e}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(900px 500px at 50% -10%,#16202f,var(--bg) 60%);color:var(--txt);min-height:100vh}
.topbar{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.brand h1{font-size:16px;font-weight:700}
.status{font-size:11px;font-weight:700;color:var(--ok)}
.wrap{max-width:960px;margin:0 auto;padding:32px 24px}
h2{font-size:20px;margin-bottom:6px}
.sub{color:var(--txt-2);font-size:13px;margin-bottom:20px}
.search-box{display:flex;gap:10px;align-items:center;margin-bottom:20px}
.search-box input{flex:1;padding:10px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:13px;outline:none}
.count{font-size:11px;color:var(--txt-2);font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.group{margin-bottom:24px}
.group-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.group-head h3{font-size:14px;font-weight:700;color:var(--txt)}
.badge{background:rgba(79,140,255,0.15);color:var(--accent);font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;border:1px solid rgba(79,140,255,0.3)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.card{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--txt);transition:all 0.2s}
.card:hover{border-color:var(--accent);transform:translateY(-1px)}
.path{font-family:ui-monospace,monospace;font-size:12px;font-weight:700;color:var(--accent)}
.target{font-size:11px;color:var(--txt-2);flex:1;text-align:right;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arrow{color:var(--txt-2);font-size:14px}
.footer{max-width:960px;margin:40px auto 20px;padding:20px 24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:11px;color:var(--txt-2)}`;

      const uniquePaths = [...new Set(routes.map(r => r.path))].sort((a, b) => b.length - a.length);
      let redirectsTxt = `# ============================================================\n# MASTER REDIRECT MAP — ${user?.username || 'User'}\n# ============================================================\n\n`;
      uniquePaths.forEach(path => {
        const route = routes.find(r => r.path === path);
        if (route) redirectsTxt += `/${path}/*    ${route.target}    301\n`;
      });
      redirectsTxt += `\n# SAFETY\n/.env              /404.html   404\n/.git/*            /404.html   404\n\n# SPA fallback\n/*                 /index.html  200\n`;

      let toml = `# ============================================================\n# Netlify Configuration — ${user?.username || 'User'}\n# ============================================================\n\n[build]\n  publish = "."\n\n`;
      uniquePaths.forEach(path => {
        const route = routes.find(r => r.path === path);
        if (route) toml += `[[redirects]]\n  from = "/${path}/*"\n  to = "${route.target}"\n  status = 301\n  force = true\n\n`;
      });
      toml += `[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n\n[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "SAMEORIGIN"\n    X-Content-Type-Options = "nosniff"\n    Referrer-Policy = "strict-origin-when-cross-origin"\n`;

      const goHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Redirecting…</title><meta name="robots" content="noindex, nofollow" />
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0f14;color:#e6edf6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;margin:0}.box{background:#151d2a;border:1px solid #222d40;border-radius:16px;padding:36px 40px;max-width:480px;width:100%;text-align:center}.spin{width:44px;height:44px;border-radius:50%;border:3px solid #222d40;border-top-color:#4f8cff;margin:0 auto 20px;animation:sp 0.9s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}h1{font-size:19px;font-weight:600;margin-bottom:10px}p{color:#8fa3bd;font-size:13.5px}.url{font-family:ui-monospace,monospace;font-size:12px;color:#4f8cff;word-break:break-all;background:#0d1420;padding:8px 12px;border-radius:8px;border:1px solid #222d40;margin:14px 0}a{color:#4f8cff;text-decoration:none;font-size:13px}</style>
</head><body><div class="box"><div class="spin"></div><h1>Redirecting…</h1><p>Resolving your destination</p><div class="url" id="dest">—</div><a id="manual" href="#">Click here if not redirected</a></div>
<script>
(function(){
  var ROUTES = ${JSON.stringify(routes)};
  var path = window.location.pathname.slice(1).split('/')[0];
  var match = ROUTES.find(function(r){ return r.path === path; });
  if (match) {
    document.getElementById('dest').textContent = match.target;
    document.getElementById('manual').href = match.target;
    setTimeout(function(){ window.location.replace(match.target); }, 800);
  } else {
    document.getElementById('dest').textContent = 'Unknown route: /' + path;
  }
})();
</script></body></html>`;

      const notFoundHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>404</title><meta name="robots" content="noindex, nofollow" /><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0f14;color:#e6edf6;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;margin:0}h1{font-size:60px;color:#ef4444;margin:0 0 10px}p{color:#8fa3bd}a{color:#4f8cff;text-decoration:none}</style></head><body><div><h1>404</h1><p>Page not found</p><a href="/">Back to hub</a></div></body></html>`;

      const readme = `# Redirect Hub — ${user?.username || 'User'}\n\nDeploy: Netlify Drop → drag → deploy → copy URL → add in Custom URLs\n\nRoutes (${routes.length}):\n${routes.map(r => `- /${r.path}/* → ${r.target}`).join('\n')}\n`;

      zip.file('index.html', indexHtml);
      zip.file('404.html', notFoundHtml);
      zip.file('_redirects', redirectsTxt);
      zip.file('netlify.toml', toml);
      zip.file('README.md', readme);
      zip.file('assets/app.js', appJs);
      zip.file('assets/style.css', styleCss);
      zip.file('go/index.html', goHtml);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `megatools-${user?.username || 'user'}-${userTrackingCode || 'hub'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('ZIP downloaded! Deploy on Netlify Drop.');
    } catch (err) {
      console.error('[CustomURLs] ZIP error:', err);
      toast.error('Failed to generate ZIP');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>Custom URLs</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleDownloadZip}
            disabled={downloading || items.length === 0}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700,
              background: downloading ? '#6b7280' : '#6366f1',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: (downloading || items.length === 0) ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
              opacity: items.length === 0 ? 0.5 : 1,
            }}
          >
            {downloading ? '⏳ Generating…' : '⬇️ Download ZIP'}
          </button>
          <button onClick={openAdd} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}>+ Add Link</button>
        </div>
      </div>

      {loading && !initialCached && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>}

      {!loading && domains.length === 0 && (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 15 }}>
          No custom domains yet. Click <strong>+ Add Link</strong> to add one.
        </div>
      )}

      {domains.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 12, whiteSpace: 'nowrap' }}>
          {domains.map(name => {
            const active = activeFolder === name;
            return (
              <div key={name} onClick={() => setActiveFolder(name)} title={name}
                style={{
                  padding: '8px 14px',
                  background: active ? 'rgba(16,185,129,0.18)' : 'var(--card-bg)',
                  border: `2px solid ${active ? '#10b981' : 'var(--card-border)'}`,
                  borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  flexShrink: 0, minWidth: 140, maxWidth: 260,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#10b981' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncLabel(name, 28)}</span>
              </div>
            );
          })}
        </div>
      )}

      {activeFolder && categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {categories.map(cat => {
            const count = items.filter(l => l.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: activeCategory === cat ? '#6366f1' : 'var(--bg-secondary)',
                  color: activeCategory === cat ? '#fff' : 'var(--text-muted)',
                }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {activeFolder && (
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--card-border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '10px 14px', background: 'var(--table-header-bg)', borderBottom: '2px solid var(--table-border)', gap: 10 }}>
            <button onClick={handleDeleteFolder} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>🗑️ Delete All</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '2px solid var(--table-border)' }}>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={{ ...th, textAlign: 'left', width: 150 }}>Name</th>
                  <th style={{ ...th, width: 100 }}>Category</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 380, width: '45%' }}>Visitor Ready URL</th>
                  <th style={{ ...th, width: 130 }}>Action</th>
                  <th style={{ ...th, width: 100 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>No links in this category.</td></tr>
                )}
                {filteredItems.map((item, i) => {
                  const visitorUrl = buildVisitorUrl(item, activeFolder);
                  return (
                    <tr key={item._id || i} style={{ borderBottom: '1px solid var(--table-border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--table-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ ...td, color: 'var(--text-muted)', fontSize: 13, verticalAlign: 'top', paddingTop: 12 }}>{i + 1}</td>
                      <td style={{ ...td, textAlign: 'left', fontSize: 13, verticalAlign: 'top', paddingTop: 12, whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.name || '—'}</td>
                      <td style={{ ...td, fontSize: 12, verticalAlign: 'top', paddingTop: 12, color: 'var(--text-muted)' }}>{item.category || '—'}</td>
                      <td style={{ ...td, verticalAlign: 'top', padding: '8px 10px' }}>
                        <textarea readOnly value={visitorUrl} onClick={() => handleCopy(visitorUrl)} title="Click to copy" rows={1} style={urlInput(copiedId === visitorUrl)} />
                      </td>
                      <td style={{ ...td, verticalAlign: 'top', paddingTop: 12 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button onClick={() => openCustomize(item)} style={customizeBtn}>⚙️ Customize</button>
                        </div>
                      </td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, verticalAlign: 'top', paddingTop: 12, whiteSpace: 'nowrap' }}>
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
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
          <div onClick={e => e.stopPropagation()} style={modalContent}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Add Custom Domain</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Domain *</label>
              <input type="text" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} style={inp} placeholder="e.g. short.link" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>e.g. "short.link" → all Quick Links will use this domain</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel} disabled={saving} style={{ ...cancelBtn, opacity: saving ? 0.5 : 1 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Add Domain'}</button>
            </div>
          </div>
        </div>
      )}

      {customizeItem && (
        <div onClick={() => setCustomizeItem(null)} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalContent, width: 520, maxWidth: '95%', padding: 20 }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>⚙️ Customize Link</h3>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--input-border)', borderRadius: 7, overflow: 'hidden', marginBottom: 12, background: 'var(--input-bg)', fontFamily: 'monospace', fontSize: 13 }}>
              <span style={{ padding: '9px 10px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRight: '1px solid var(--input-border)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                https://{customizeDomain || 'yourdomain'}/{extractBasePath(customizeItem.baseUrl)}/
              </span>
              <input type="text" value={customizeSuffix} onChange={e => setCustomizeSuffix(e.target.value)} style={{ flex: 1, padding: '9px 10px', background: 'transparent', color: '#10b981', border: 'none', outline: 'none', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }} placeholder="suffix" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomize(); }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, padding: '8px 10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, lineHeight: 1.5 }}>
              ℹ️ Path is fixed. Only the suffix is editable.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCustomizeItem(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleSaveCustomize} style={saveBtn}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '12px 10px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', textAlign: 'center' };
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5, letterSpacing: '0.04em' };
const inp = { width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: 7, outline: 'none', boxSizing: 'border-box' };
const urlInput = (isCopied) => ({ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--input-bg)', color: isCopied ? '#10b981' : 'var(--accent)', border: `2px solid ${isCopied ? '#10b981' : 'var(--input-border)'}`, borderRadius: 6, outline: 'none', cursor: 'pointer', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, wordBreak: 'break-word', minHeight: 32, boxSizing: 'border-box' });
const customizeBtn = { background: '#f59e0b', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: '6px 10px', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' };
const cancelBtn = { flex: 1, padding: '9px 12px', fontSize: 13, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer' };
const saveBtn = { flex: 2, padding: '9px 12px', fontSize: 13, fontWeight: 700, background: '#10b981', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalContent = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 18, width: 420, maxWidth: '95%' };