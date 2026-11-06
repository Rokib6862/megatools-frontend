// ============================================================
// MEGA TOOLS — QuickLinksPage v3.4
// FIX-QL-DL1: Download feature removed (ZIP only in Custom URLs)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils/helpers';

const CACHE_KEY = 'megatools_quicklinks_cache';

function getSiteOrigin() {
  if (typeof window === 'undefined') return '';
  return (window.location.origin || '').replace(/\/$/, '');
}

export default function QuickLinksPage() {
  const { user, linksVersion } = useAuth();
  const userTrackingCode = user?.trackingCode || '';

  const getCached = () => { try { const d=JSON.parse(localStorage.getItem(CACHE_KEY)); return d?.l?.length?d:null; } catch { return null; } };
  const cache = getCached();

  const [links, setLinks] = useState(cache?.l||[]);
  const [showForm, setShowForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editLink, setEditLink] = useState(null);
  const [form, setForm] = useState({ name: '', baseUrl: '', category: '' });
  const [showNewFilterInput, setShowNewFilterInput] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const saveCache = (l) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({l,ts:Date.now()})); } catch {} };

  const loadLinks = useCallback(() => {
    api.get('/links').then(r => { const d = r.data?.links || r.data || []; setLinks(d); saveCache(d); }).catch(() => setLinks([]));
  }, []);
  useEffect(() => { loadLinks(); }, [linksVersion]);

  const quickLinks = links.filter(l => l.inboxView !== 'message' && l.category !== 'message' && l.category !== 'personal');
  const categories = [...new Set(quickLinks.map(l => l.category).filter(Boolean))].sort();
  const filteredLinks = activeFilter === 'all' ? quickLinks : quickLinks.filter(l => l.category === activeFilter);

  const handleSave = async () => {
    if (!form.name) return alert('Name is required');
    if (!form.category) return alert('Category is required');
    const cleanBase = (form.baseUrl || '').split('#')[0].split('?')[0].replace(/\/$/, '');
    const baseUrl = cleanBase || getSiteOrigin();
    try {
      await api.post('/links', { name: form.name, baseUrl, category: form.category, inboxView: 'quick', showInInbox: true, showInDeployment: true, showDeployUrl: true, userView: true, imageUrl: '' });
      setForm({ name: '', baseUrl: '', category: '' });
      setShowNewFilterInput(false); setShowForm(false); loadLinks();
    } catch { alert('Failed to create link'); }
  };

  const handleEdit = (link) => {
    setEditLink(link);
    setForm({ name: link.name, baseUrl: link.baseUrl || '', category: link.category || '' });
    setShowEditForm(true);
  };

  const handleEditSave = async () => {
    if (!form.name) return alert('Name is required');
    if (!form.category) return alert('Category is required');
    const cleanBase = (form.baseUrl || '').split('#')[0].split('?')[0].replace(/\/$/, '');
    try {
      await api.put('/links/' + editLink._id, { name: form.name, baseUrl: cleanBase, category: form.category, showInInbox: true, showDeployUrl: true, userView: true });
      setShowEditForm(false); setEditLink(null); loadLinks();
    } catch { alert('Failed to update link'); }
  };

  const handleDelete = async (link) => { if (!window.confirm(`Delete "${link.name}"?`)) return; try { await api.delete('/links/' + link._id); loadLinks(); } catch {} };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#6366f1', whiteSpace: 'nowrap' }}>⚡ Quick External URL</h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Tracking: <code style={{ color: 'var(--accent)', fontWeight: 700 }}>{userTrackingCode || 'N/A'}</code></span>
          {quickLinks.length > 0 && (
            <span style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)', whiteSpace: 'nowrap' }}>
              {quickLinks.length} link{quickLinks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setForm({ name: '', baseUrl: '', category: '' }); setShowNewFilterInput(false); setShowForm(true); }} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}>+ Add Quick Link</button>
        </div>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={() => setActiveFilter('all')} style={catBtn(activeFilter === 'all')}>All ({quickLinks.length})</button>
          {categories.map(cat => { const count = quickLinks.filter(l => l.category === cat).length; return <button key={cat} onClick={() => setActiveFilter(cat)} style={catBtn(activeFilter === cat)}>{cat} ({count})</button>; })}
        </div>
      )}

      <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--card-border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead><tr style={{ background: 'var(--table-header-bg)', borderBottom: '2px solid var(--table-border)' }}><th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Name</th><th style={{ ...th, textAlign: 'left' }}>Category</th><th style={{ ...th, textAlign: 'left' }}>External URL</th><th style={th}>Action</th><th style={th}>Created</th></tr></thead>
            <tbody>
              {filteredLinks.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 15 }}>No quick links yet.</td></tr>}
              {filteredLinks.map((link, i) => {
                const fullUrl = `${(link.baseUrl || '').replace(/\/$/, '')}/${userTrackingCode}_${link.baseCode || ''}`;
                return (<tr key={link._id} style={{ borderBottom: '1px solid var(--table-border)', height: 52 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--table-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...td, color: 'var(--text-muted)', fontSize: 13 }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600, fontSize: 13 }}>{link.name}</td>
                  <td style={{ ...td, textAlign: 'left', color: '#6366f1', fontSize: 12, fontWeight: 500 }}>{link.category || '—'}</td>
                  <td style={td}><input type="text" readOnly value={fullUrl} onClick={(e) => { e.target.select(); copyToClipboard(e.target.value); setCopiedId(link._id); setTimeout(() => setCopiedId(null), 1500); }} style={urlInput(copiedId === link._id)} title="Click to copy" /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => handleEdit(link)} style={editBtn}>✏️ Edit</button>
                      <button onClick={() => handleDelete(link)} style={deleteBtn}>🗑️ Delete</button>
                    </div>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{link.created_at ? new Date(link.created_at).toLocaleDateString() : '—'}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={modalOverlay}><div onClick={e => e.stopPropagation()} style={modalContent}>
          <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#6366f1', textAlign: 'center' }}>⚡ Add Quick External URL</h3>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Create a new quick action link.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div><label style={lbl}>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} placeholder="e.g. Google" /></div>
            <div><label style={lbl}>Base URL</label><input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={inp} placeholder="https://your-domain.com" /></div>
          </div>
          <div style={{ marginBottom: 16 }}><label style={lbl}>Category *</label><select value={form.category} onChange={e => { const v = e.target.value; if (v === '__new__') { setShowNewFilterInput(true); } else { setForm({ ...form, category: v }); setShowNewFilterInput(false); } }} style={inp}><option value="">Select category</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}<option value="__new__">+ Add New Category</option></select>{showNewFilterInput && <input placeholder="New category name" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...inp, marginTop: 10 }} />}</div>
          <div style={{ display: 'flex', gap: 12 }}><button onClick={() => setShowForm(false)} style={cancelBtn}>Cancel</button><button onClick={handleSave} style={saveBtn}>Create Link</button></div>
        </div></div>
      )}

      {showEditForm && editLink && (
        <div onClick={() => setShowEditForm(false)} style={modalOverlay}><div onClick={e => e.stopPropagation()} style={modalContent}>
          <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#f59e0b', textAlign: 'center' }}>✏️ Edit Link</h3>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Update link details.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div><label style={lbl}>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Base URL</label><input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 16 }}><label style={lbl}>Category *</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{ display: 'flex', gap: 12 }}><button onClick={() => setShowEditForm(false)} style={cancelBtn}>Cancel</button><button onClick={handleEditSave} style={{ ...saveBtn, background: '#f59e0b' }}>Update Link</button></div>
        </div></div>
      )}
    </div>
  );
}

const th = { padding: '12px 10px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', textAlign: 'center', whiteSpace: 'nowrap' };
const lbl = { fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 };
const inp = { width: '100%', padding: '13px 16px', fontSize: 15, background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: 10, outline: 'none', boxSizing: 'border-box' };
const urlInput = (isCopied) => ({ width: '100%', padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', background: 'var(--input-bg)', color: isCopied ? '#10b981' : 'var(--accent)', border: `2px solid ${isCopied ? '#10b981' : 'var(--input-border)'}`, borderRadius: 6, outline: 'none', cursor: 'pointer' });
const catBtn = (active) => ({ padding: '6px 14px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer', background: active ? '#6366f1' : 'var(--bg-secondary)', color: active ? '#fff' : 'var(--text-muted)' });
const deleteBtn = { background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: '6px 10px', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' };
const editBtn = { background: '#f59e0b', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: '6px 10px', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' };
const cancelBtn = { flex: 1, padding: '14px', fontSize: 15, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--card-border)', borderRadius: 10, cursor: 'pointer' };
const saveBtn = { flex: 2, padding: '14px', fontSize: 16, fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalContent = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 16, padding: 32, width: 600, maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto' };