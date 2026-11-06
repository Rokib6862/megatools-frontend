// ============================================================
// MEGA TOOLS — MessageLinksPage v2.3
// Dynamic URL handling (no hardcoded localhost)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils/helpers';

const CACHE_KEY = 'megatools_msglinks_cache';

function getSiteOrigin() {
  if (typeof window === 'undefined') return '';
  return (window.location.origin || '').replace(/\/$/, '');
}

const CatButton = ({ active, label, onClick, color = '#10b981' }) => (
  <button onClick={onClick} style={{ flex: 1, padding: '10px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer', background: active ? color : 'var(--bg)', color: active ? '#fff' : 'var(--text-muted)', transition: 'background 0.2s', whiteSpace: 'nowrap', border: active ? 'none' : '1px solid var(--card-border)' }}>{active ? '✅ ' : ''}{label}</button>
);

export default function MessageLinksPage() {
  const { user, linksVersion } = useAuth();
  const userTrackingCode = user?.trackingCode || '';

  const getCached = () => { try { const d=JSON.parse(localStorage.getItem(CACHE_KEY)); return d?.l?.length?d:null; } catch { return null; } };
  const cache = getCached();

  const [links, setLinks] = useState(cache?.l||[]);
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [form, setForm] = useState({ name: '', baseUrl: '', category: 'message_row' });
  const [copiedId, setCopiedId] = useState(null);

  const saveCache = (l) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({l,ts:Date.now()})); } catch {} };

  const loadLinks = useCallback(() => {
    api.get('/links').then(r => { const d = r.data?.links || r.data || []; setLinks(d); saveCache(d); }).catch(() => setLinks([]));
  }, []);
  useEffect(() => { loadLinks(); }, [linksVersion]);

  const messageLinks = links.filter(l => l.inboxView === 'message' || l.category === 'message');
  const replyLink = links.find(l => l.category === 'reply' || l.linksCategory === 'reply');

  const defaultBaseUrl = () => {
    const origin = getSiteOrigin();
    return origin || '';
  };

  const openAdd = () => { setEditingLink(null); setForm({ name: '', baseUrl: defaultBaseUrl(), category: 'message_row' }); setShowForm(true); };
  const openEdit = (link) => { setEditingLink(link); const cat = link.category === 'reply' ? 'reply' : (link.showInSendSection ? 'message_button' : 'message_row'); setForm({ name: link.name || '', baseUrl: link.baseUrl || defaultBaseUrl(), category: cat }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) return alert('Name is required');
    const cleanBase = (form.baseUrl || '').split('#')[0].split('?')[0].replace(/\/$/, '');
    const isReply = form.category === 'reply';
    const isButton = form.category === 'message_button';
    const payload = {
      name: form.name,
      baseUrl: cleanBase || defaultBaseUrl(),
      category: isReply ? 'reply' : 'message',
      linksCategory: isReply ? 'reply' : 'message',
      inboxView: 'message',
      inboxAction: isReply ? 'reply' : 'message',
      showInInbox: true,
      showInDeployment: false,
      showDeployUrl: false,
      userView: true,
      imageUrl: '',
      showInMessageRow: !isButton && !isReply,
      showInSendSection: isButton
    };
    try {
      if (editingLink) { await api.put('/links/' + editingLink._id, payload); }
      else { await api.post('/links', payload); }
      setShowForm(false); setEditingLink(null); loadLinks();
    } catch { alert('Failed to save link'); }
  };

  const handleDelete = async (link) => { if (!window.confirm(`Delete "${link.name}"?`)) return; try { await api.delete('/links/' + link._id); loadLinks(); } catch {} };

  const getLocationLabel = (link) => {
    if (link.category === 'reply') return 'Reply';
    if (link.showInSendSection) return 'Button Area';
    return 'Message Row';
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#ec4899', whiteSpace: 'nowrap' }}>💬 Message External URL</h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Tracking: <code style={{ color: 'var(--accent)', fontWeight: 700 }}>{userTrackingCode || 'N/A'}</code></span>
          {messageLinks.length > 0 && (
            <span style={{ background: 'rgba(236,72,153,0.12)', color: '#ec4899', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(236,72,153,0.3)', whiteSpace: 'nowrap' }}>
              {messageLinks.length} link{messageLinks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={openAdd} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, background: '#ec4899', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(236,72,153,0.25)' }}>+ Add Message Link</button>
        </div>
      </div>

      <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--card-border)', overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}><thead><tr style={{ background: 'var(--table-header-bg)', borderBottom: '2px solid var(--table-border)' }}><th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Name</th><th style={{ ...th, textAlign: 'left' }}>External URL</th><th style={th}>Location</th><th style={th}>Action</th><th style={th}>Created</th></tr></thead><tbody>{messageLinks.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 15 }}>No message links yet.</td></tr>}{messageLinks.map((link, i) => { const fullUrl = `${(link.baseUrl || '').replace(/\/$/, '')}/${userTrackingCode}_${link.baseCode || ''}`; const location = getLocationLabel(link); return (<tr key={link._id} style={{ borderBottom: '1px solid var(--table-border)', height: 52 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--table-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><td style={{ ...td, color: 'var(--text-muted)', fontSize: 13 }}>{i + 1}</td><td style={{ ...td, textAlign: 'left', fontWeight: 600, fontSize: 13 }}>{link.name}</td><td style={td}><input type="text" readOnly value={fullUrl} onClick={(e) => { e.target.select(); copyToClipboard(e.target.value); setCopiedId(link._id); setTimeout(() => setCopiedId(null), 1500); }} style={urlInput(copiedId === link._id)} title="Click to copy" /></td><td style={td}><span style={{ fontSize:12, fontWeight:600, color: location==='Message Row'?'#6366f1':location==='Reply'?'#a5b4fc':'#ec4899' }}>{location}</span></td><td style={td}><div style={{ display:'flex', gap:6, justifyContent:'center' }}><button onClick={() => openEdit(link)} style={editBtn}>✏️ Edit</button><button onClick={() => handleDelete(link)} style={delBtn}>🗑️ Delete</button></div></td><td style={{ ...td, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{link.created_at ? new Date(link.created_at).toLocaleDateString() : '—'}</td></tr>); })}</tbody></table></div></div>

      {showForm && (<div onClick={() => setShowForm(false)} style={modalOverlay}><div onClick={e => e.stopPropagation()} style={modalContent}>
        <h3 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: form.category === 'reply' ? '#6366f1' : '#ec4899', textAlign: 'center' }}>
          {editingLink ? 'Edit' : 'Add'} Message External URL
        </h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <CatButton active={form.category === 'message_row'} label="Message Row" color="#6366f1" onClick={() => setForm({ ...form, category: 'message_row' })} />
          <CatButton active={form.category === 'message_button'} label="Button Area" color="#ec4899" onClick={() => setForm({ ...form, category: 'message_button' })} />
          <CatButton active={form.category === 'reply'} label="Reply" color="#a5b4fc" onClick={() => setForm({ ...form, category: 'reply' })} />
        </div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} placeholder={form.category === 'reply' ? 'e.g. Reply to Visitor' : 'e.g. Welcome Message'} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Base URL</label><input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={inp} placeholder="https://your-domain.com" /></div>
        <div style={{ display: 'flex', gap: 12 }}><button onClick={() => setShowForm(false)} style={cancelBtn}>Cancel</button><button onClick={handleSave} style={{ ...saveBtn, background: form.category === 'reply' ? '#6366f1' : '#ec4899' }}>{editingLink ? 'Update Link' : 'Create Link'}</button></div>
      </div></div>)}
    </div>
  );
}

const th = { padding: '12px 10px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', textAlign: 'center', whiteSpace: 'nowrap' };
const lbl = { fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 };
const inp = { width: '100%', padding: '13px 16px', fontSize: 15, background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: 10, outline: 'none', boxSizing: 'border-box' };
const urlInput = (isCopied) => ({ width: '100%', padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', background: 'var(--input-bg)', color: isCopied ? '#10b981' : 'var(--accent)', border: `2px solid ${isCopied ? '#10b981' : 'var(--input-border)'}`, borderRadius: 6, outline: 'none', cursor: 'pointer' });
const editBtn = { padding: '6px 10px', fontSize: 12, fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
const delBtn = { padding: '6px 10px', fontSize: 12, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
const cancelBtn = { flex: 1, padding: '14px', fontSize: 15, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--card-border)', borderRadius: 10, cursor: 'pointer' };
const saveBtn = { flex: 2, padding: '14px', fontSize: 16, fontWeight: 700, background: '#ec4899', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalContent = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 16, padding: 32, width: 520, maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto' };