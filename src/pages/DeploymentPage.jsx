// ============================================================
// MEGA TOOLS — DeploymentPage v4.2 (FOLDERS CACHE + SWR)
// ============================================================
// FIX-DP-SHORT1, v3.0, v3.1, v4.0, v4.1 retained.
//
// FIX-DP-CACHE1 (v4.2 — PERSISTENT FOLDERS CACHE):
//   Root cause of the "Ready Kits page shows an empty
//   category dropdown for a moment on every visit" complaint:
//     • `links` already hydrated from localStorage
//       (LINKS_CACHE_KEY, v4.1) but `folders` started as
//       `useState([])` and only filled after /api/folders
//       resolved. The category tabs on top of the page flashed
//       empty until that round-trip finished.
//
//   This version mirrors the same cache pattern used elsewhere:
//     • FOLDERS_CACHE_KEY   = 'megatools_folders_cache_v1'
//     • FOLDERS_CACHE_VERSION = 'v42_1'
//     • Synchronous hydrate inside useState() — the folder
//       list is available on the very first paint.
//     • loadFolders() writes the fresh payload to the cache on
//       success, so the next visit is instant.
//     • loadFolders() failure no longer wipes folders — the last
//       good cached snapshot survives.
//     • loadLinks() failure no longer wipes links — cached list
//       stays visible.
//   No other behaviour changed. ZIP generation, preview, server
//   override resolution and the toast system are byte-identical.
// ============================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils/helpers';

const LINKS_CACHE_KEY = 'megatools_links_cache';
const FOLDERS_CACHE_KEY = 'megatools_folders_cache_v1';
const FOLDERS_CACHE_VERSION = 'v42_1';
const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

function loadJSZip() {
  return new Promise((resolve, reject) => {
    if (window.JSZip) return resolve(window.JSZip);
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.async = true;
    s.onload = () =>
      window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip load failed'));
    s.onerror = () => reject(new Error('JSZip CDN error'));
    document.body.appendChild(s);
  });
}

// FIX-DP-CACHE1: safe read/write of the folders snapshot
function readFoldersCache() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(FOLDERS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== FOLDERS_CACHE_VERSION) return null;
    if (!Array.isArray(parsed.folders)) return null;
    return parsed.folders;
  } catch (_) {
    return null;
  }
}

function writeFoldersCache(folders) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!Array.isArray(folders)) return;
    localStorage.setItem(
      FOLDERS_CACHE_KEY,
      JSON.stringify({
        version: FOLDERS_CACHE_VERSION,
        folders,
        ts: Date.now(),
      })
    );
  } catch (_) {}
}

function extractHostname(url) {
  try {
    const s = String(url || '').trim();
    if (!s) return '';
    const withProto = /^https?:\/\//i.test(s) ? s : 'https://' + s;
    return new URL(withProto).hostname || '';
  } catch {
    return '';
  }
}

function extractSlug(baseUrl) {
  let s = String(baseUrl || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const parts = s.split('/').filter(Boolean);
  const rest = parts.slice(1);
  if (rest.length === 0) return '';
  return rest[rest.length - 1];
}

function resolveServerOverride(folders, link) {
  if (!Array.isArray(folders) || !link) return '';
  const host = extractHostname(link.baseUrl).toLowerCase();
  if (!host) return '';
  const f = folders.find((x) => String(x.name || '').toLowerCase() === host);
  if (!f || !f.overrides) return '';
  const v = f.overrides[String(link._id)];
  return typeof v === 'string' ? v : '';
}

export default function DeploymentPage() {
  const { user, linksVersion } = useAuth();
  const userTrackingCode = user?.trackingCode || '';

  const [links, setLinks] = useState(() => {
    try {
      const cached = localStorage.getItem(LINKS_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {}
    return [];
  });

  // FIX-DP-CACHE1: hydrate folders synchronously so the category
  // tabs render on the first paint.
  const [folders, setFolders] = useState(() => {
    const cached = readFoldersCache();
    return Array.isArray(cached) ? cached : [];
  });

  const [activeFilter, setActiveFilter] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [toast, setToast] = useState('');
  const [toastPos, setToastPos] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  };

  const loadLinks = useCallback(() => {
    api
      .get('/links')
      .then((r) => {
        const fresh = r.data?.links || r.data || [];
        setLinks(fresh);
        try {
          localStorage.setItem(LINKS_CACHE_KEY, JSON.stringify(fresh));
        } catch {}
      })
      .catch(() => {
        // FIX-DP-CACHE1: keep cached links if network fails
      });
  }, []);

  const loadFolders = useCallback(() => {
    api
      .get('/folders')
      .then((r) => {
        const list = r.data?.folders;
        if (Array.isArray(list)) {
          setFolders(list);
          writeFoldersCache(list);
        }
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status !== 401 && status !== 404) {
          console.warn('[DeploymentPage] folders fetch failed:', status);
        }
        // FIX-DP-CACHE1: keep cached folders if network fails
      });
  }, []);

  useEffect(() => {
    loadLinks();
    loadFolders();
  }, [loadLinks, loadFolders, linksVersion]);

  const deploymentLinks = links.filter(
    (l) =>
      l.category !== 'personal' &&
      l.category !== 'message' &&
      l.category !== 'reply' &&
      l.linksCategory !== 'message' &&
      l.linksCategory !== 'reply' &&
      l.showInDeployment !== false &&
      l.showDeployUrl !== false
  );
  const deploymentCategories = [
    ...new Set(deploymentLinks.map((l) => l.category).filter(Boolean)),
  ].sort();

  useEffect(() => {
    if (deploymentCategories.length > 0 && !activeFilter) {
      setActiveFilter(deploymentCategories[0]);
    }
  }, [deploymentCategories, activeFilter]);

  const filteredLinks = activeFilter
    ? deploymentLinks.filter((l) => l.category === activeFilter)
    : [];

  const getDisplayUrl = (link) => {
    const base = (link.baseUrl || '').replace(/\/$/, '');
    const code = link.baseCode || link.slug || '';
    return base + '/' + userTrackingCode + (code ? '_' + code : '');
  };

  const copyUrl = (url, e) => {
    copyToClipboard(url);
    if (e) {
      setToastPos({ x: e.clientX, y: e.clientY });
    } else {
      setToastPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
    showToast('URL copied!');
  };

  const handleDownloadZip = async () => {
    if (downloading) return;
    if (!filteredLinks.length) {
      showToast('No links in current view');
      return;
    }
    setDownloading(true);
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();

      const ROUTES = {};
      filteredLinks.forEach((link) => {
        const domain = extractHostname(link.baseUrl);
        const slug = extractSlug(link.baseUrl) || link.baseCode || link.slug || '';
        if (!domain || !slug) return;

        const defaultCode =
          userTrackingCode + (link.baseCode || link.slug ? '_' + (link.baseCode || link.slug) : '');
        const serverOv = resolveServerOverride(folders, link);
        const code = serverOv || defaultCode;

        if (!code) return;
        ROUTES[slug] = { domain, code };
      });

      const routeCount = Object.keys(ROUTES).length;
      if (routeCount === 0) {
        showToast('No valid links to package');
        setDownloading(false);
        return;
      }

      const userName = user?.username || 'User';

      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<meta name="referrer" content="no-referrer" />
<meta name="theme-color" content="#0b1120" />
<title>Welcome</title>
<script>
(function () {
  "use strict";
  var ROUTES = ${JSON.stringify(ROUTES, null, 2)};
  var path = decodeURIComponent(location.pathname || "/");
  var segs = path.split("/").filter(Boolean);
  if (segs.length > 0 && ROUTES[segs[0]]) {
    var r = ROUTES[segs[0]];
    var target = location.protocol + "//" + r.domain + "/" + segs[0] + "/" + r.code;
    location.replace(target);
  }
})();
</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(circle at 20% 20%,#1a1f3a 0%,#0f172a 45%,#0a0d1a 100%);color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:560px;width:100%;background:rgba(30,41,59,.55);border:1px solid rgba(148,163,184,.15);border-radius:24px;padding:56px 44px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.55)}
  .logo{width:72px;height:72px;margin:0 auto 26px;border-radius:18px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:#fff;box-shadow:0 12px 30px rgba(99,102,241,.45)}
  h1{font-size:28px;font-weight:600;margin-bottom:14px;color:#f1f5f9}
  p{font-size:15px;line-height:1.7;color:#94a3b8;max-width:420px;margin:0 auto}
  .badge{display:inline-flex;align-items:center;gap:8px;margin-top:32px;padding:9px 18px;border-radius:999px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;font-size:13px;font-weight:500}
  .dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px #22c55e;animation:pulse 1.8s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(1.15)}}
</style>
</head>
<body>
<div class="card">
  <div class="logo">&#9670;</div>
  <h1>Welcome</h1>
  <p>${userName} &middot; deployment ready. Everything is working as expected.</p>
  <span class="badge"><span class="dot"></span> Online</span>
</div>
</body>
</html>`;

      const redirectsTxt = '/* /index.html 200\n';

      zip.file('index.html', indexHtml);
      zip.file('spect/index.html', indexHtml);
      zip.file('spect/200.html', indexHtml);
      zip.file('_redirects', redirectsTxt);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deploy-${userName}-${userTrackingCode || 'hub'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(`ZIP ready — ${routeCount} route(s). Deploy anywhere.`);
    } catch (err) {
      console.error('[ReadyKits] ZIP error:', err);
      showToast('Failed to generate ZIP');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ padding: '16px 20px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <style>{`
        .rk-table{width:100%;border-collapse:collapse;border-spacing:0}
        .rk-table th{background:#1E293B;padding:11px 14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#94a3b8;border-bottom:2px solid #334155;white-space:nowrap;text-align:left}
        .rk-table th:first-child,.rk-table th:nth-child(4),.rk-table th:nth-child(6){text-align:center}
        .rk-table td{padding:11px 14px;border-bottom:1px solid #1E293B;vertical-align:middle;font-size:13px;color:#F8FAFC}
        .rk-table tbody tr{transition:background 0.1s}
        .rk-table tbody tr:hover{background:rgba(99,102,241,0.06)}
        .rk-table tbody tr:last-child td{border-bottom:none}
        .rk-num{color:#94a3b8;font-weight:600;font-size:12px}
        .rk-name{font-weight:600;color:#F8FAFC;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:140px}
        .rk-cat{display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.25);white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis}
        .rk-preview{color:#818cf8;cursor:pointer;font-weight:500;font-size:12px;white-space:nowrap}
        .rk-preview:hover{color:#a78bfa}
        .rk-url-input{width:100%;height:36px;padding:0 12px;background:#0F172A;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:11px;outline:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box;transition:border 0.15s}
        .rk-url-input:hover{border-color:#6366f1}
        .rk-time{color:#94a3b8;font-size:11px;white-space:nowrap}
        .rk-pill{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all 0.15s;white-space:nowrap;flex:1 1 auto;min-width:0;max-width:100%}
        .rk-pill.on{background:#f59e0b;color:#000}
        .rk-pill.off{background:#1E293B;color:#94a3b8;border:1px solid #334155}
        .rk-pill.off:hover{background:#334155;color:#fff}
        .rk-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
        .rk-toast{position:fixed;background:#1e293b;padding:8px 14px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.5);border-left:3px solid #10b981;z-index:9999;animation:rkSlide 0.2s ease;display:flex;align-items:center;gap:6px;font-size:11px;color:#f8fafc;pointer-events:none;white-space:nowrap}
        @keyframes rkSlide{from{transform:translate(-50%, -80%);opacity:0}to{transform:translate(-50%, -120%);opacity:1}}
        .rk-download{padding:8px 16px;font-size:12px;font-weight:700;background:#6366f1;color:#fff;border:none;border-radius:7px;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,0.35);white-space:nowrap;transition:all 0.15s}
        .rk-download:hover:not(:disabled){background:#4f46e5}
        .rk-download:disabled{background:#475569;cursor:not-allowed;opacity:0.7}
      `}</style>

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
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f59e0b' }}>
            📋 Ready Kits
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94a3b8' }}>
            Tracking: <code style={{ color: '#818cf8', fontWeight: 600 }}>{userTrackingCode}</code>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="rk-download"
            onClick={handleDownloadZip}
            disabled={downloading || filteredLinks.length === 0}
          >
            {downloading ? '⏳ Generating…' : '⬇️ Download ZIP'}
          </button>
        </div>
      </div>

      {deploymentCategories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, width: '100%' }}>
          {deploymentCategories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveFilter(c)}
              className={`rk-pill ${activeFilter === c ? 'on' : 'off'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          borderRadius: 10,
          border: '1px solid #334155',
          background: '#1E293B',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="rk-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 150 }}>Name</th>
                <th style={{ width: 130 }}>Category</th>
                <th style={{ width: 80 }}>Preview</th>
                <th>Visitor Ready URL</th>
                <th style={{ width: 80 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinks.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    No links in this category.
                  </td>
                </tr>
              )}
              {filteredLinks.map((link, i) => {
                const url = getDisplayUrl(link);
                return (
                  <tr key={link._id}>
                    <td style={{ textAlign: 'center' }}>
                      <span className="rk-num">{i + 1}</span>
                    </td>
                    <td>
                      <span className="rk-name" title={link.name}>
                        {link.name}
                      </span>
                    </td>
                    <td>
                      <span className="rk-cat">{link.category || '—'}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewUrl(url);
                          setShowPreview(true);
                        }}
                        className="rk-preview"
                      >
                        👁 Preview
                      </span>
                    </td>
                    <td>
                      <input
                        className="rk-url-input"
                        type="text"
                        value={url}
                        readOnly
                        onClick={(e) => copyUrl(url, e)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="rk-time">
                        {link.created_at
                          ? new Date(link.created_at).toLocaleDateString('en-US', {
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

      {showPreview && previewUrl && (
        <div className="rk-modal-overlay" onClick={() => setShowPreview(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 375,
              height: 700,
              maxHeight: '92vh',
              borderRadius: 18,
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                background: '#0f172a',
                padding: '10px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>📱 Preview</span>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#fff',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
            <iframe
              src={previewUrl}
              style={{ width: '100%', height: 'calc(100% - 50px)', border: 'none' }}
              title="Preview"
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="rk-toast" style={{ left: toastPos.x, top: toastPos.y }}>
          <span>✅</span> {toast}
        </div>
      )}
    </div>
  );
}
