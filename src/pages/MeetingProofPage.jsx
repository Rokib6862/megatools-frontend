// ============================================================
// MEGA TOOLS — MeetingProof Page (React · Single preview)
// Meeting Call Screenshot · Glass always ON · iPhone/Android
// White mode default · Uniform screenshot size (430:932)
// Screenshot content: Dark = pure black · Light = pure white
// Isolated — no connection to Inbox / Links / Sessions / DB
// ============================================================
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';

// ---------------- SCOPED CSS ----------------
const STYLE_CSS = `
.mt-meetingproof, .mt-meetingproof *{box-sizing:border-box;}
.mt-meetingproof{
  --bg-primary:#0F172A;--bg-card:#1E293B;--bg-hover:#273549;
  --border:#334155;--border-light:#475569;
  --text-primary:#E2E8F0;--text-muted:#94A3B8;--text-faint:#64748B;
  --accent:#6366F1;--accent-light:#818CF8;--accent-bg:rgba(99,102,241,0.15);
  --success:#10B981;--success-bg:rgba(16,185,129,0.15);
  --warning:#F59E0B;--warning-bg:rgba(245,158,11,0.15);
  --danger:#EF4444;--danger-bg:rgba(239,68,68,0.15);
  --info:#38BDF8;--info-bg:rgba(56,189,248,0.15);
  --input-bg:#0F172A;--text:#E2E8F0;--input-border:#334155;
  --card-bg:#1E293B;--card-border:#334155;
  background:var(--bg-primary);color:var(--text-primary);
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
  padding:20px;height:100%;width:100%;overflow:hidden;
  display:flex;flex-direction:column;
  -webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-touch-callout:none;
}
.mt-meetingproof input{background:var(--input-bg)!important;color:var(--text)!important;border:1px solid var(--input-border)!important;font-family:inherit;-webkit-user-select:text;user-select:text;}
.mt-meetingproof input::placeholder{color:#64748B;}
.mt-meetingproof input:focus{border-color:var(--accent)!important;outline:none;}

/* Preview container — perfect fit, uniform aspect */
.mt-meetingproof .preview-outer{
  display:flex;justify-content:center;align-items:center;
  width:100%;height:100%;overflow:hidden;
  padding:16px;box-sizing:border-box;
}
.mt-meetingproof .device-frame{
  position:relative;
  aspect-ratio:430/932;
  height:100%;width:auto;
  max-width:100%;max-height:100%;
  border-radius:10px;overflow:hidden;
  box-shadow:0 10px 30px rgba(0,0,0,0.55);
  border:2px solid #1e293b;
  background:#ffffff;
  flex-shrink:0;
}
@supports not (aspect-ratio: 1/1){
  .mt-meetingproof .device-frame{height:100%;width:calc(100% * 430 / 932);max-width:100%;}
}
.mt-meetingproof .preview-inner{
  position:relative;
  width:100%;height:100%;
  display:flex;overflow:hidden;
}
.mt-meetingproof .dl-btn{padding:6px 12px;font-size:11px;font-weight:700;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background 0.15s;font-family:inherit;background:#10b981;}
.mt-meetingproof .dl-btn:hover{background:#059669;}
.mt-meetingproof .copy-btn{padding:6px 12px;font-size:11px;font-weight:700;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background 0.15s;background:#dc2626;font-family:inherit;}
.mt-meetingproof .copy-btn:hover{background:#b91c1c;}
.mt-meetingproof .copy-btn:active{background:#991b1b;}
.mt-meetingproof .picker-dropdown{animation:fadeInUp 0.18s ease-out;}
.mt-meetingproof .seg{display:flex;background:#0F172A;border:1px solid var(--border-light);border-radius:22px;padding:3px;position:relative;width:100%;height:32px;}
.mt-meetingproof .seg-thumb{position:absolute;top:3px;left:3px;width:calc(50% - 3px);height:calc(100% - 6px);background:var(--accent);border-radius:18px;transition:transform 0.28s cubic-bezier(0.4,0,0.2,1);box-shadow:0 2px 6px rgba(99,102,241,0.4);}
.mt-meetingproof .seg[data-mode="android"] .seg-thumb{transform:translateX(calc(100% + 3px));}
.mt-meetingproof .seg-opt{flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-muted);cursor:pointer;position:relative;z-index:2;letter-spacing:0.3px;user-select:none;}
.mt-meetingproof .seg[data-mode="iphone"] .seg-opt.iphone-opt{color:#ffffff;}
.mt-meetingproof .seg[data-mode="android"] .seg-opt.android-opt{color:#ffffff;}
@keyframes fadeInUp{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
@keyframes pulse{0%,80%,100%{opacity:0.3;}40%{opacity:1;}}
`;

// ---------------- CONSTANTS ----------------
const DEVICE_IOS = { key: 'ios', logicalW: 393, logicalH: 852, scale: 3 };

const PRESET_IMAGES = [
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741224/1da6b08f22e16709846a1dc4d3173e12_f_xy42jm.jpg',
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741224/b4886ed8e462ca0b718e2a5c314739cc_f_k4pvm6.jpg',
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741224/e339c21271fdf59e54e8dc90b1968270_f_qxrb1j.jpg',
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741223/62a8a1072aeb849f72f9ca16e44de3b2_f_x2w0je.jpg',
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741224/067d171f55078c4fa57c5edd33a3970e_f_kiebn2.jpg',
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741224/e67e0f224ce3ef7b1db7eed1f15667bf_f_a7riba.jpg',
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1756005370/d704b4bc28f27e6422fa4d416af4bd6e_f_mzb5zr.jpg',
];

const CUSTOM_LOGO = `<img src="https://res.cloudinary.com/dxobnjf5l/image/upload/v1790731013/images_n2mkds-removebg-preview_gkiil8.png" style="width:18px;height:18px;object-fit:contain;display:block;background:transparent;" />`;

const StatusIcons = {
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  videoLogo: CUSTOM_LOGO,
  signal:
    '<svg width="13" height="9" viewBox="0 0 13 9" fill="currentColor"><rect x="0" y="6" width="2.4" height="3" rx="0.6"/><rect x="3.4" y="4" width="2.4" height="5" rx="0.6"/><rect x="6.8" y="2" width="2.4" height="7" rx="0.6"/><rect x="10.2" y="0" width="2.4" height="9" rx="0.6"/></svg>',
  wifi: '<svg width="12" height="9" viewBox="0 0 12 9" fill="currentColor"><path d="M6 8.4l-1.8-2a2.6 2.6 0 013.6 0L6 8.4zM2.7 4.4a5.8 5.8 0 016.6 0l-.85.95a4.6 4.6 0 00-4.9 0L2.7 4.4zM.65 2.3a8.7 8.7 0 0110.7 0l-.85.95a7.3 7.3 0 00-9 0L.65 2.3z"/></svg>',
  battery:
    '<svg width="20" height="10" viewBox="0 0 20 10" fill="none"><rect x="0.5" y="0.5" width="17" height="9" rx="2.6" stroke="currentColor" stroke-width="1" opacity="0.4"/><rect x="2" y="2" width="14" height="6" rx="1.6" fill="currentColor"/><path d="M18.5 3.5v3a1.4 1.4 0 000-3z" fill="currentColor" opacity="0.4"/></svg>',
  micOn:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>',
  videoOn:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
  share:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  hand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 00-4 0v5"/><path d="M14 10V4a2 2 0 00-4 0v6"/><path d="M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 012.83-2.82L7 15"/></svg>',
  more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  endCall:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
};

// ---------------- HELPERS ----------------
function getUSTime() {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const parts = fmt.formatToParts(new Date());
    let hour = '',
      minute = '';
    for (const p of parts) {
      if (p.type === 'hour') hour = p.value;
      if (p.type === 'minute') minute = p.value;
    }
    return `${parseInt(hour, 10)}:${minute}`;
  } catch {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    h = h % 12 || 12;
    return `${h}:${m}`;
  }
}
function formatUSPhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return '';
  const area = digits.slice(0, 3),
    prefix = digits.slice(3, 6),
    line = digits.slice(6, 10);
  if (digits.length < 4) return digits.length <= 3 ? `+1 (${area}` : `+1 (${area}) ${prefix}`;
  if (digits.length < 7) return `+1 (${area}) ${prefix}`;
  return `+1 (${area}) ${prefix}-${line}`;
}
function useImageUpload() {
  const [image, setImage] = useState(null);
  const inputRef = useRef(null);
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      const r = new FileReader();
      r.onload = () => setImage(r.result);
      r.readAsDataURL(file);
    }
  }, []);
  const trigger = useCallback(() => inputRef.current?.click(), []);
  return { image, setImage, inputRef, handleFile, trigger };
}
function renderHtmlToCanvas(htmlString, logicalW, logicalH, scale) {
  return new Promise((resolve) => {
    const off = document.createElement('div');
    off.style.cssText = `position:fixed;left:-10000px;top:0;width:${logicalW}px;height:${logicalH}px;overflow:hidden;background:#ffffff;`;
    off.innerHTML = htmlString;
    document.body.appendChild(off);
    const imgs = off.querySelectorAll('img');
    let loaded = 0;
    const total = imgs.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window
        .html2canvas(off, {
          backgroundColor: null,
          scale,
          useCORS: true,
          logging: false,
          allowTaint: true,
          width: logicalW,
          height: logicalH,
          windowWidth: logicalW,
          windowHeight: logicalH,
        })
        .then((c) => {
          if (document.body.contains(off)) document.body.removeChild(off);
          resolve(c);
        })
        .catch(() => {
          if (document.body.contains(off)) document.body.removeChild(off);
          resolve(null);
        });
    };
    if (total === 0) return finish();
    imgs.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) {
        loaded++;
        if (loaded === total) finish();
      } else {
        img.onload = () => {
          loaded++;
          if (loaded === total) finish();
        };
        img.onerror = () => {
          loaded++;
          if (loaded === total) finish();
        };
      }
    });
    setTimeout(finish, 2000);
  });
}
function ensureHtml2Canvas() {
  return new Promise((resolve) => {
    if (typeof window.html2canvas !== 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}
async function copyCanvasToClipboard(canvas) {
  if (!canvas) return false;
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && canvas.toBlob) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return true;
      }
    }
  } catch {}
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const tmp = document.createElement('div');
    tmp.contentEditable = 'true';
    tmp.style.cssText = 'position:fixed;left:-10000px;top:0;';
    tmp.innerHTML = `<img src="${dataUrl}" />`;
    document.body.appendChild(tmp);
    const r = document.createRange();
    r.selectNodeContents(tmp);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    const ok = document.execCommand('copy');
    s.removeAllRanges();
    document.body.removeChild(tmp);
    return ok;
  } catch {
    return false;
  }
}
const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 12,
  background: 'var(--input-bg)',
  color: 'var(--text)',
  border: '1px solid var(--input-border)',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

// ---------------- SMALL COMPONENTS ----------------
function ToggleSwitch({ checked, onChange, ariaLabel }) {
  return (
    <button
      onClick={onChange}
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 999,
        border: '1px solid ' + (checked ? 'var(--accent)' : 'var(--border-light)'),
        cursor: 'pointer',
        padding: 0,
        background: checked ? 'var(--accent)' : 'var(--bg-primary)',
        transition: 'background 0.2s ease, border-color 0.2s ease',
        outline: 'none',
        flexShrink: 0,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 21 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  );
}
function ToggleRow({ label, checked, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.02em',
          userSelect: 'none',
        }}
      >
        {label}
      </span>
      <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}
function SegmentedToggle({ mode, onChange }) {
  return (
    <div className="seg" data-mode={mode} role="group" aria-label="Device toggle">
      <div className="seg-thumb" />
      <div className="seg-opt iphone-opt" onClick={() => onChange('iphone')}>
        🍎 iPhone
      </div>
      <div className="seg-opt android-opt" onClick={() => onChange('android')}>
        🤖 Android
      </div>
    </div>
  );
}
function ImagePicker({ currentImage, onSelect, onUpload, inputRef, onFileChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 10,
          fontWeight: 700,
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          background: currentImage ? 'var(--success)' : 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontFamily: 'inherit',
        }}
      >
        {currentImage ? <>✅ Photo Selected</> : <>📷 Choose Photo</>}
        <span style={{ fontSize: 8, opacity: 0.8, marginLeft: 2 }}>▼</span>
      </button>
      {open && (
        <div
          className="picker-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--card-bg)',
            border: '1px solid var(--border-light)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 10px 6px',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
            }}
          >
            Gallery
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 6,
              padding: 8,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {PRESET_IMAGES.map((url, i) => {
              const sel = currentImage === url,
                hov = hovered === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onSelect(url);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    position: 'relative',
                    padding: 0,
                    border: sel
                      ? '2px solid var(--accent)'
                      : hov
                        ? '2px solid var(--accent-light)'
                        : '2px solid transparent',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: '#0b0f18',
                    aspectRatio: '1 / 1',
                    transform: hov ? 'scale(1.04)' : 'scale(1)',
                    transition: 'transform 0.12s, border-color 0.15s',
                  }}
                >
                  <img
                    src={url}
                    alt=""
                    draggable="false"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      pointerEvents: 'none',
                    }}
                    loading="lazy"
                  />
                  {sel && (
                    <span
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(99,102,241,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onUpload();
            }}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              border: 'none',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 13 }}>⬆</span> Upload from Device
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// ---------------- THEME (only affects screenshot content colors) ----------------
function getTheme(isDark) {
  if (isDark)
    return {
      bg: '#000000',
      topBarBg: 'rgba(0,0,0,0.55)',
      topBarBorder: 'rgba(255,255,255,0.06)',
      ctrlBg: 'rgba(255,255,255,0.10)',
      ctrlBorder: 'rgba(255,255,255,0.18)',
      ctrlIcon: '#ffffff',
      ctrlLabel: '#e2e8f0',
      endBg: '#ef4444',
      endIcon: '#ffffff',
      endBorder: '#ef4444',
      dotColor: '#64748b',
      avatarBg: 'rgba(30,41,59,0.9)',
      avatarText: '#94a3b8',
      avatarBorder: 'rgba(255,255,255,0.85)',
      avatarShadow: '0 6px 20px rgba(0,0,0,0.7)',
      callerNameColor: '#ffffff',
      callerNameShadow: '0 2px 8px rgba(0,0,0,0.9)',
      subText: '#94a3b8',
      statusText: '#ffffff',
      statusIcon: '#ffffff',
      profileBg: 'rgba(30,41,59,0.9)',
      profileBorder: 'rgba(255,255,255,0.4)',
      labelColor: '#cbd5e1',
      phoneColor: '#ffffff',
      infoColor: '#cbd5e1',
      infoBorder: 'rgba(255,255,255,0.4)',
      logoColor: '#ffffff',
      iconMuted: '#cbd5e1',
      divider: 'rgba(255,255,255,0.10)',
    };
  return {
    bg: '#ffffff',
    topBarBg: 'rgba(255,255,255,0.70)',
    topBarBorder: 'rgba(0,0,0,0.08)',
    ctrlBg: 'rgba(0,0,0,0.05)',
    ctrlBorder: 'rgba(0,0,0,0.10)',
    ctrlIcon: '#0f172a',
    ctrlLabel: '#334155',
    endBg: '#ef4444',
    endIcon: '#ffffff',
    endBorder: '#ef4444',
    dotColor: '#94a3b8',
    avatarBg: 'rgba(226,232,240,0.9)',
    avatarText: '#475569',
    avatarBorder: 'rgba(255,255,255,0.98)',
    avatarShadow: '0 6px 20px rgba(0,0,0,0.22)',
    callerNameColor: '#0f172a',
    callerNameShadow: '0 1px 2px rgba(255,255,255,0.95)',
    subText: '#475569',
    statusText: '#0f172a',
    statusIcon: '#0f172a',
    profileBg: 'rgba(226,232,240,0.9)',
    profileBorder: 'rgba(0,0,0,0.15)',
    labelColor: '#334155',
    phoneColor: '#0f172a',
    infoColor: '#475569',
    infoBorder: 'rgba(0,0,0,0.3)',
    logoColor: '#0f172a',
    iconMuted: '#334155',
    divider: 'rgba(0,0,0,0.10)',
  };
}

// ---------------- UI BUILDER (Meeting · iPhone/Android · Glass always) ----------------
function buildMeetingCall(meImg, otherImg, formattedPhone, isDark, status) {
  const mySrc = meImg || '';
  const otherSrc = otherImg || '';
  const displayNumber = (formattedPhone || '').trim();
  const showStatusBar = !!status.showStatusBar;
  const showMeetingId = status.showMeetingId !== false;
  const time = status.time || '9:41';
  const deviceMode = status.deviceMode || 'iphone';
  const isAndroid = deviceMode === 'android';
  const T = getTheme(isDark);
  const padLR = 16;
  const logoHtml = StatusIcons.videoLogo;

  const glassBackdrop = isDark
    ? 'radial-gradient(circle at 30% 20%, #0a0a0a 0%, #050505 35%, #000000 70%, #000000 100%)'
    : 'radial-gradient(circle at 30% 20%, #ffffff 0%, #fafafa 35%, #ffffff 70%, #ffffff 100%)';
  const glassOpacity = isDark ? 0.15 : 0.25;
  const glassOverlay = isDark
    ? `linear-gradient(180deg, rgba(0,0,0,${glassOpacity}) 0%, rgba(0,0,0,${glassOpacity}) 100%)`
    : `linear-gradient(180deg, rgba(255,255,255,${glassOpacity}) 0%, rgba(255,255,255,${glassOpacity}) 100%)`;
  const glassEdge = isDark
    ? 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(255,255,255,0.06)'
    : 'inset 0 1px 0 rgba(0,0,0,0.04), inset 0 -1px 0 rgba(0,0,0,0.04)';

  const iosStatusBar = `<div style="position:relative;flex-shrink:0;height:48px;z-index:10;"><div style="position:absolute;left:26px;top:0;bottom:0;display:flex;align-items:center;"><span style="font-size:13px;font-weight:600;color:${T.statusText};letter-spacing:0.1px;line-height:1;font-family:-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif;">${time}</span></div><div style="position:absolute;left:50%;top:11px;transform:translateX(-50%);width:96px;height:28px;background:#000;border-radius:16px;z-index:60;"></div><div style="position:absolute;right:16px;top:0;bottom:0;display:flex;align-items:center;gap:4px;"><span style="color:${T.statusIcon};display:flex;align-items:center;line-height:0;">${StatusIcons.signal}</span><span style="color:${T.statusIcon};display:flex;align-items:center;line-height:0;">${StatusIcons.wifi}</span><span style="color:${T.statusIcon};display:flex;align-items:center;line-height:0;">${StatusIcons.battery}</span></div></div>`;
  const androidStatusBar = `<div style="position:relative;flex-shrink:0;height:44px;z-index:10;display:flex;align-items:center;justify-content:space-between;padding:0 20px;"><div style="display:flex;align-items:center;"><span style="font-size:13px;font-weight:600;color:${T.statusText};letter-spacing:0.1px;line-height:1;font-family:Roboto,-apple-system,BlinkMacSystemFont,sans-serif;">${time}</span></div><div style="display:flex;align-items:center;gap:4px;"><span style="color:${T.statusIcon};display:flex;align-items:center;line-height:0;">${StatusIcons.signal}</span><span style="color:${T.statusIcon};display:flex;align-items:center;line-height:0;">${StatusIcons.wifi}</span><span style="color:${T.statusIcon};display:flex;align-items:center;line-height:0;">${StatusIcons.battery}</span></div></div>`;
  const statusBar = showStatusBar ? (isAndroid ? androidStatusBar : iosStatusBar) : '';

  const padLRInner = isAndroid ? 14 : 16;
  const meetingIdSection = showMeetingId
    ? `<span style="font-size:12px;font-weight:700;color:${T.labelColor};letter-spacing:0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">juv-zssv-wsd</span><span style="width:14px;height:14px;border:1.5px solid ${T.infoBorder};border-radius:50%;display:flex;align-items:center;justify-content:center;color:${T.infoColor};font-size:9px;font-weight:bold;line-height:1;flex-shrink:0;">i</span>`
    : '';

  const topBar = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px ${padLRInner}px;flex-shrink:0;background:${T.topBarBg};border-bottom:1px solid ${T.topBarBorder};gap:8px;position:relative;z-index:9;"><div style="display:flex;align-items:center;gap:10px;min-width:0;flex-shrink:0;"><span style="color:${T.iconMuted};display:flex;align-items:center;">${StatusIcons.menu}</span><span style="display:flex;align-items:center;background:transparent;">${logoHtml}</span><span style="font-size:12px;font-weight:700;color:${T.labelColor};letter-spacing:0.2px;white-space:nowrap;">𝐆𝐨𝐨𝐠𝐥𝐞 𝐌𝐞𝐞𝐭</span></div><div style="display:flex;align-items:center;gap:8px;min-width:0;flex-shrink:0;">${meetingIdSection}<span style="width:28px;height:28px;border-radius:50%;overflow:hidden;background:${T.profileBg};border:1.5px solid ${T.profileBorder};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${mySrc ? `<img src="${mySrc}" style="width:100%;height:100%;object-fit:cover;display:block;" />` : `<span style="font-size:10px;font-weight:700;color:${T.avatarText};">Me</span>`}</span></div></div>`;

  const otherSection = otherSrc
    ? `<div style="position:absolute;inset:0;background-image:url('${otherSrc}');background-size:cover;background-position:center;filter:brightness(0.55);"></div><div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 100%);"></div><div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="width:96px;height:96px;border-radius:50%;overflow:hidden;border:3px solid ${T.avatarBorder};box-shadow:${T.avatarShadow};background:${T.avatarBg};"><img src="${otherSrc}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>${displayNumber ? `<div style="font-size:22px;font-weight:600;color:${T.callerNameColor};text-shadow:${T.callerNameShadow};letter-spacing:0.5px;">${displayNumber}</div>` : ''}</div>`
    : `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="width:96px;height:96px;border-radius:50%;background:${T.avatarBg};display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:600;color:${T.avatarText};">C</div>${displayNumber ? `<div style="font-size:22px;font-weight:600;color:${T.callerNameColor};letter-spacing:0.5px;">${displayNumber}</div>` : ''}<div style="font-size:10px;color:${T.subText};">Waiting for others to join…</div><div style="display:flex;gap:4px;"><span style="width:5px;height:5px;border-radius:50%;background:${T.dotColor};animation:pulse 1.4s infinite;"></span><span style="width:5px;height:5px;border-radius:50%;background:${T.dotColor};animation:pulse 1.4s 0.2s infinite;"></span><span style="width:5px;height:5px;border-radius:50%;background:${T.dotColor};animation:pulse 1.4s 0.4s infinite;"></span></div></div>`;

  const meSection = mySrc
    ? `<div style="position:absolute;inset:0;background-image:url('${mySrc}');background-size:cover;background-position:center;filter:brightness(0.55);"></div><div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 100%);"></div><div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="width:96px;height:96px;border-radius:50%;overflow:hidden;border:3px solid ${T.avatarBorder};box-shadow:${T.avatarShadow};background:${T.avatarBg};"><img src="${mySrc}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div></div>`
    : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><div style="width:96px;height:96px;border-radius:50%;background:${T.avatarBg};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;color:${T.avatarText};">Me</div></div>`;

  const controlBtn = (icon, label) => {
    const isEnd = label === 'End';
    const btnBg = isEnd
      ? 'linear-gradient(145deg, #f87171 0%, #ef4444 100%)'
      : isDark
        ? 'rgba(255,255,255,0.10)'
        : 'rgba(0,0,0,0.05)';
    const btnBorder = isEnd
      ? '1px solid rgba(255,255,255,0.30)'
      : isDark
        ? '1px solid rgba(255,255,255,0.18)'
        : '1px solid rgba(0,0,0,0.10)';
    const btnShadow = isEnd
      ? '0 4px 14px rgba(239,68,68,0.45), inset 0 1px 0 rgba(255,255,255,0.3)'
      : isDark
        ? '0 1px 3px rgba(0,0,0,0.5)'
        : '0 1px 3px rgba(0,0,0,0.06)';
    const iconColor = isEnd ? '#ffffff' : T.ctrlIcon;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:0 0 auto;min-width:44px;"><span style="width:40px;height:40px;border-radius:50%;background:${btnBg};border:${btnBorder};display:flex;align-items:center;justify-content:center;color:${iconColor};box-sizing:border-box;box-shadow:${btnShadow};">${icon}</span><span style="font-size:8px;font-weight:600;color:${T.ctrlLabel};letter-spacing:0.2px;">${label}</span></div>`;
  };

  const controlRow = `<div style="display:flex;align-items:flex-start;justify-content:space-evenly;gap:4px;padding:10px ${padLRInner}px ${isAndroid ? 14 : 16}px;flex-shrink:0;background:${T.topBarBg};border-top:1px solid ${T.topBarBorder};position:relative;z-index:9;">${controlBtn(StatusIcons.micOn, 'Mute')}${controlBtn(StatusIcons.videoOn, 'Video')}${controlBtn(StatusIcons.share, 'Share')}${controlBtn(StatusIcons.hand, 'Hand')}${controlBtn(StatusIcons.more, 'More')}${controlBtn(StatusIcons.endCall, 'End')}</div>`;

  return `<div style="width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;color:#ffffff;position:relative;overflow:hidden;background:${T.bg};"><div style="position:absolute;inset:0;background:${glassBackdrop};z-index:0;"></div><div style="position:absolute;inset:0;background:${glassOverlay};backdrop-filter:blur(45px) saturate(190%) brightness(1.03);-webkit-backdrop-filter:blur(45px) saturate(190%) brightness(1.03);box-shadow:${glassEdge};z-index:1;"></div><div style="position:relative;z-index:2;flex:1;display:flex;flex-direction:column;overflow:hidden;">${statusBar}${topBar}<div style="flex:1;display:flex;flex-direction:column;min-height:0;"><div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;border-bottom:1px solid ${T.divider};position:relative;">${otherSection}</div><div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">${meSection}</div></div>${controlRow}</div></div>`;
}

// ---------------- MAIN PAGE ----------------
export default function MeetingProofPage() {
  const rootRef = useRef(null);
  const [name, setName] = useState('');
  const [isDark, setIsDark] = useState(false); // WHITE MODE DEFAULT
  const [deviceMode, setDeviceMode] = useState('iphone');
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [time, setTime] = useState(() => getUSTime());
  const [copied, setCopied] = useState(false);
  const meImg = useImageUpload();
  const otherImg = useImageUpload();
  const refreshTimeToUS = useCallback(() => setTime(getUSTime()), []);
  useEffect(() => {
    const i = setInterval(refreshTimeToUS, 60000);
    return () => clearInterval(i);
  }, [refreshTimeToUS]);

  useEffect(() => {
    const n = rootRef.current;
    if (!n) return;
    const ctx = (e) => e.preventDefault();
    const key = (e) => {
      const k = (e.key || '').toLowerCase();
      const blocked =
        k === 'f12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) ||
        (e.ctrlKey && ['u', 's', 'p'].includes(k));
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    n.addEventListener('contextmenu', ctx);
    n.addEventListener('keydown', key, true);
    return () => {
      n.removeEventListener('contextmenu', ctx);
      n.removeEventListener('keydown', key, true);
    };
  }, []);

  const toggleDark = () => {
    setIsDark((v) => !v);
    refreshTimeToUS();
  };
  const toggleStatus = () => {
    setShowStatusBar((v) => !v);
    refreshTimeToUS();
  };
  const handleNameChange = (e) => {
    setName(e.target.value);
    refreshTimeToUS();
  };
  const handleMeFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      meImg.setImage(r.result);
      refreshTimeToUS();
    };
    r.readAsDataURL(file);
  };
  const triggerMeUpload = () => {
    refreshTimeToUS();
    meImg.trigger();
  };

  const formattedPhone = useMemo(() => formatUSPhone(name), [name]);
  const previewHtml = useMemo(
    () =>
      buildMeetingCall(meImg.image, otherImg.image, formattedPhone, isDark, {
        showStatusBar,
        time,
        deviceMode,
      }),
    [meImg.image, otherImg.image, formattedPhone, isDark, showStatusBar, time, deviceMode]
  );

  const handleDownload = () => {
    const device = DEVICE_IOS,
      html = previewHtml;
    const capture = () => {
      const off = document.createElement('div');
      off.style.cssText = `position:fixed;left:-10000px;top:0;width:${device.logicalW}px;height:${device.logicalH}px;overflow:hidden;background:${isDark ? '#000000' : '#ffffff'};`;
      off.innerHTML = html;
      document.body.appendChild(off);
      const imgs = off.querySelectorAll('img');
      let loaded = 0;
      const total = imgs.length;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window
          .html2canvas(off, {
            backgroundColor: null,
            scale: device.scale,
            useCORS: true,
            logging: false,
            allowTaint: true,
            width: device.logicalW,
            height: device.logicalH,
            windowWidth: device.logicalW,
            windowHeight: device.logicalH,
          })
          .then((c) => {
            const a = document.createElement('a');
            a.download = `meeting-${deviceMode}-${isDark ? 'black' : 'white'}.png`;
            a.href = c.toDataURL('image/png');
            a.click();
            if (document.body.contains(off)) document.body.removeChild(off);
          })
          .catch(() => {
            if (document.body.contains(off)) document.body.removeChild(off);
          });
      };
      if (total === 0) return finish();
      imgs.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
          loaded++;
          if (loaded === total) finish();
        } else {
          img.onload = () => {
            loaded++;
            if (loaded === total) finish();
          };
          img.onerror = () => {
            loaded++;
            if (loaded === total) finish();
          };
        }
      });
      setTimeout(finish, 2000);
    };
    if (typeof window.html2canvas === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = capture;
      document.head.appendChild(s);
    } else capture();
  };

  const handleCopy = async () => {
    const device = DEVICE_IOS;
    await ensureHtml2Canvas();
    const canvas = await renderHtmlToCanvas(
      previewHtml,
      device.logicalW,
      device.logicalH,
      device.scale
    );
    if (!canvas) {
      alert('Could not generate image. Please try again.');
      return;
    }
    const ok = await copyCanvasToClipboard(canvas);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else alert('Copy failed. Try again or use a supported browser (Chrome/Edge).');
  };

  return (
    <div className="mt-meetingproof" ref={rootRef}>
      <style>{STYLE_CSS}</style>
      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, gap: 14, padding: '4px 0', width: '100%' }}
      >
        {/* LEFT — Controls */}
        <div style={{ width: 280, flexShrink: 0, maxHeight: '100%', overflowY: 'auto' }}>
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              📹 Meeting · Call Details
            </h3>
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Type Number
              </div>
              <input
                value={name}
                onChange={handleNameChange}
                placeholder="(555) 123-4567"
                inputMode="tel"
                style={inputStyle}
              />
              {formattedPhone && (
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--info)',
                    marginTop: 5,
                    fontFamily: 'monospace',
                  }}
                >
                  → {formattedPhone}
                </div>
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                My Photo
              </div>
              <ImagePicker
                currentImage={meImg.image}
                onSelect={(url) => {
                  meImg.setImage(url);
                  refreshTimeToUS();
                }}
                onUpload={triggerMeUpload}
                inputRef={meImg.inputRef}
                onFileChange={handleMeFile}
              />
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Device
              </div>
              <SegmentedToggle
                mode={deviceMode}
                onChange={(m) => {
                  setDeviceMode(m);
                  refreshTimeToUS();
                }}
              />
            </div>
            <ToggleRow
              label={isDark ? 'Black Glass Mode' : 'White Glass Mode'}
              checked={isDark}
              onChange={toggleDark}
            />
            <ToggleRow label="Status Bar" checked={showStatusBar} onChange={toggleStatus} />
            {showStatusBar && (
              <div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Time
                </div>
                <input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="9:41"
                  style={inputStyle}
                />
              </div>
            )}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div
              style={{
                fontSize: 9,
                color: 'var(--text-faint)',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              🖤 Black Glass Mode = screenshot pure black
              <br />
              🤍 White Glass Mode = screenshot pure white
              <br />
              iPhone = notch · Android = no notch
              <br />
              Download / Copy from above
            </div>
          </div>
        </div>

        {/* RIGHT — Single Preview */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--card-bg)',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--card-border)',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text)',
              flexShrink: 0,
              borderBottom: '1px solid var(--card-border)',
              background: 'var(--bg-primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                flex: 1,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              📹 Meeting Call Screenshot · {deviceMode === 'iphone' ? 'iPhone' : 'Android'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button className="dl-btn" onClick={handleDownload}>
                ⬇ Download
              </button>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: '#0B1220',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            <div className="preview-outer">
              <div className="device-frame" style={{ background: isDark ? '#000000' : '#ffffff' }}>
                <div className="preview-inner" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
