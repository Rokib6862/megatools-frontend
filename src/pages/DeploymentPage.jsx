// ============================================================
// MEGA TOOLS — DeploymentPage v2.0
// FIX-DP-SHORT1: Shortener + Manage Domains removed
//   (Shortener only exists in Custom URLs page)
// ============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils/helpers';

const LINKS_CACHE_KEY = 'megatools_links_cache';

function getSiteOrigin() {
  if (typeof window === 'undefined') return '';
  return (window.location.origin || '').replace(/\/$/, '');
}

export default function DeploymentPage() {
  const { user, linksVersion } = useAuth();
  const userTrackingCode = user?.trackingCode || '';

  const [links, setLinks] = useState(() => {
    try {
      const cached = localStorage.getItem(LINKS_CACHE_KEY);
      if (cached) { const data = JSON.parse(cached); if (Array.isArray(data) && data.length > 0) return data; }
    } catch {}
    return [];
  });
  const [activeFilter, setActiveFilter] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [toast, setToast] = useState('');
  const [toastPos, setToastPos] = useState({ x: 0, y: 0 });
  const toastTimer = useRef(null);

  const showToast = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2000); };

  const loadLinks = useCallback(() => {
    api.get('/links').then(r => {
      const fresh = r.data?.links || r.data || [];
      setLinks(fresh);
      try { localStorage.setItem(LINKS_CACHE_KEY, JSON.stringify(fresh)); } catch {}
    }).catch(() => {});
  }, []);
  useEffect(() => { loadLinks(); }, [loadLinks, linksVersion]);

  const deploymentLinks = links.filter(l => l.category !== 'personal' && l.category !== 'message' && l.category !== 'reply' && l.linksCategory !== 'message' && l.linksCategory !== 'reply' && l.showInDeployment !== false && l.showDeployUrl !== false);
  const deploymentCategories = [...new Set(deploymentLinks.map(l => l.category).filter(Boolean))].sort();

  useEffect(() => {
    if (deploymentCategories.length > 0 && !activeFilter) {
      setActiveFilter(deploymentCategories[0]);
    }
  }, [deploymentCategories, activeFilter]);

  const filteredLinks = activeFilter ? deploymentLinks.filter(l => l.category === activeFilter) : [];

  const getDisplayUrl = (link) => {
    const base = (link.baseUrl || '').replace(/\/$/, '');
    const code = link.baseCode || link.slug || '';
    return base + '/' + userTrackingCode + (code ? '_' + code : '');
  };

  const copyUrl = (url, e) => { copyToClipboard(url); if (e) { setToastPos({ x: e.clientX, y: e.clientY }); } else { setToastPos({ x: window.innerWidth/2, y: window.innerHeight/2 }); } showToast('URL copied!'); };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '100%', margin: '0 auto' }}>
      <style>{`
        .rt-table{width:100%;border-collapse:collapse;border-spacing:0}
        .rt-table th{background:#1E293B;padding:12px 16px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#94a3b8;border-bottom:2px solid #334155;white-space:nowrap;text-align:left}
        .rt-table th:first-child,.rt-table th:nth-child(4),.rt-table th:nth-child(6){text-align:center}
        .rt-table td{padding:12px 16px;border-bottom:1px solid #1E293B;vertical-align:middle;font-size:13px;color:#F8FAFC}
        .rt-table tbody tr{transition:background 0.1s}
        .rt-table tbody tr:hover{background:rgba(99,102,241,0.06)}
        .rt-table tbody tr:last-child td{border-bottom:none}
        .rt-num{color:#94a3b8;font-weight:600;font-size:12px}
        .rt-name{font-weight:600;color:#F8FAFC;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:140px}
        .rt-cat{display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.25);white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis}
        .rt-preview{color:#818cf8;cursor:pointer;font-weight:500;font-size:12px;white-space:nowrap}
        .rt-preview:hover{color:#a78bfa}
        .rt-url-input{width:100%;height:38px;padding:0 12px;background:#0F172A;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:11px;outline:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box;transition:border 0.15s}
        .rt-url-input:hover{border-color:#6366f1}
        .rt-time{color:#94a3b8;font-size:11px;white-space:nowrap}
        .rt-pill{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 18px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all 0.15s;white-space:nowrap;flex:1 1 auto;min-width:0;max-width:100%}
        .rt-pill.on{background:#f59e0b;color:#000}
        .rt-pill.off{background:#1E293B;color:#94a3b8;border:1px solid #334155}
        .rt-pill.off:hover{background:#334155;color:#fff}
        .rt-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
        .rt-toast{position:fixed;background:#1e293b;padding:8px 14px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.5);border-left:3px solid #10b981;z-index:9999;animation:rtSlide 0.2s ease;display:flex;align-items:center;gap:6px;font-size:11px;color:#f8fafc;pointer-events:none;white-space:nowrap}
        @keyframes rtSlide{from{transform:translate(-50%, -80%);opacity:0}to{transform:translate(-50%, -120%);opacity:1}}
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div><h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#f59e0b' }}>📋 Ready Kits</h2><p style={{ margin: '2px 0 0', fontSize: 10, color: '#94a3b8' }}>Tracking: <code style={{ color: '#818cf8', fontWeight: 600 }}>{userTrackingCode}</code></p></div>
      </div>

      {deploymentCategories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, width: '100%' }}>
          {deploymentCategories.map(c => (<button key={c} onClick={() => setActiveFilter(c)} className={`rt-pill ${activeFilter===c?'on':'off'}`}>{c}</button>))}
        </div>
      )}

      <div style={{ borderRadius: 10, border: '1px solid #334155', background: '#1E293B', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="rt-table">
            <thead><tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 150 }}>Name</th>
              <th style={{ width: 130 }}>Category</th>
              <th style={{ width: 80 }}>Preview</th>
              <th>Visitor Ready URL</th>
              <th style={{ width: 80 }}>Time</th>
            </tr></thead>
            <tbody>
              {filteredLinks.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>No links in this category.</td></tr>}
              {filteredLinks.map((link, i) => { const url = getDisplayUrl(link); return (
                <tr key={link._id}>
                  <td style={{ textAlign: 'center' }}><span className="rt-num">{i + 1}</span></td>
                  <td><span className="rt-name" title={link.name}>{link.name}</span></td>
                  <td><span className="rt-cat">{link.category || '—'}</span></td>
                  <td style={{ textAlign: 'center' }}><span onClick={(e) => { e.stopPropagation(); setPreviewUrl(url); setShowPreview(true); }} className="rt-preview">👁 Preview</span></td>
                  <td><input className="rt-url-input" type="text" value={url} readOnly onClick={(e) => copyUrl(url, e)} /></td>
                  <td style={{ textAlign: 'center' }}><span className="rt-time">{link.created_at ? new Date(link.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) : '—'}</span></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>

      {showPreview && previewUrl && (<div className="rt-modal-overlay" onClick={() => setShowPreview(false)}><div onClick={e => e.stopPropagation()} style={{ width: 375, height: 700, maxHeight: '92vh', borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}><div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>📱 Preview</span><button onClick={() => setShowPreview(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 14 }}>✕</button></div><iframe src={previewUrl} style={{ width: '100%', height: 'calc(100% - 50px)', border: 'none' }} title="Preview" /></div></div>)}

      {toast && (<div className="rt-toast" style={{ left: toastPos.x, top: toastPos.y }}><span>✅</span> {toast}</div>)}
    </div>
  );
}