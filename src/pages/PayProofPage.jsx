// ============================================================
// MEGA TOOLS — PayProof Page (React · Sidebar layout)
// Panels: Cash Balance · Tag Search · Payment Failed
// Sidebar: Settings (top) → Inputs (below)
// Settings order: Theme → Device → Status Bar (bottom)
// Status Bar ON reveals Time input (user-editable)
// White mode default
// Isolated — no connection to Inbox / Links / Sessions / DB
// ============================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ---------------- CONSTANTS ----------------
const MALE_PIC =
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790741224/ae4e49c2830fabb2f1b041fbd6535001_f_vj5dqh.jpg';
const FEMALE_PIC =
  'https://res.cloudinary.com/dxobnjf5l/image/upload/v1790744771/5eecac1af44b424469b6c1e2293b0180_f_vytjcf.jpg';
const SAVINGS_ICON = '✈';
const PROFILE_NAVY = '#4b4b6b';
const PAYMENT_WIDTH = 430;
const PAYMENT_HEIGHT = 932;
const MONEY_WIDTH = 330;
const MONEY_HEIGHT = 664;
const EXPORT_SCALE = 3;
const FIXED_CASH_BALANCE = 1243;
const FIXED_SAVINGS = 3300.94;

const MALE_NAMES = [
  'James',
  'John',
  'Robert',
  'Michael',
  'William',
  'David',
  'Richard',
  'Joseph',
  'Thomas',
  'Charles',
  'Christopher',
  'Daniel',
  'Matthew',
  'Anthony',
  'Mark',
  'Donald',
  'Steven',
  'Paul',
  'Andrew',
  'Joshua',
  'Kenneth',
  'Kevin',
  'Brian',
  'George',
  'Timothy',
  'Ronald',
  'Edward',
  'Jason',
  'Jeffrey',
  'Ryan',
  'Jacob',
  'Gary',
  'Nicholas',
  'Eric',
  'Jonathan',
  'Stephen',
  'Larry',
  'Justin',
  'Scott',
  'Brandon',
  'Benjamin',
  'Samuel',
  'Gregory',
  'Alexander',
  'Patrick',
  'Frank',
  'Raymond',
  'Jack',
  'Dennis',
  'Jerry',
  'Tyler',
  'Aaron',
  'Jose',
  'Adam',
  'Nathan',
  'Henry',
  'Zachary',
  'Douglas',
  'Peter',
  'Kyle',
  'Noah',
  'Ethan',
  'Jeremy',
  'Walter',
  'Christian',
  'Keith',
  'Roger',
  'Terry',
  'Austin',
  'Sean',
  'Gerald',
  'Carl',
  'Harold',
  'Dylan',
  'Arthur',
  'Lawrence',
  'Jordan',
  'Jesse',
  'Bryan',
  'Billy',
];
const FEMALE_NAMES = [
  'Emma',
  'Sophia',
  'Olivia',
  'Ava',
  'Mia',
  'Isabella',
  'Amelia',
  'Harper',
  'Evelyn',
  'Abigail',
  'Emily',
  'Ella',
  'Elizabeth',
  'Camila',
  'Luna',
  'Sofia',
  'Avery',
  'Mila',
  'Aria',
  'Scarlett',
  'Penelope',
  'Layla',
  'Chloe',
  'Victoria',
  'Madison',
  'Eleanor',
  'Grace',
  'Nora',
  'Riley',
  'Zoey',
  'Hannah',
  'Hazel',
  'Lily',
  'Ellie',
  'Violet',
  'Lillian',
  'Zoe',
  'Stella',
  'Aurora',
  'Natalie',
  'Emilia',
  'Everly',
  'Leah',
  'Aubrey',
  'Willow',
  'Addison',
  'Lucy',
  'Audrey',
  'Bella',
  'Nova',
  'Brooklyn',
  'Paisley',
  'Savannah',
  'Claire',
  'Skylar',
  'Isla',
  'Genesis',
  'Naomi',
  'Elena',
  'Caroline',
  'Eliana',
  'Anna',
  'Maya',
  'Valentina',
  'Ruby',
  'Kennedy',
  'Ivy',
  'Ariana',
  'Aaliyah',
  'Cora',
  'Madelyn',
  'Alice',
  'Kinsley',
  'Hailey',
  'Gabriella',
  'Allison',
  'Gianna',
  'Serenity',
  'Samantha',
  'Sarah',
  'Autumn',
  'Quinn',
  'Eva',
  'Piper',
  'Sophie',
  'Sadie',
  'Delilah',
  'Josephine',
  'Nevaeh',
  'Adeline',
  'Arya',
  'Emery',
  'Lydia',
  'Clara',
  'Vivian',
  'Madeline',
  'Peyton',
  'Julia',
  'Rylee',
  'Brielle',
];

function pickRandomNames(count) {
  const all = [
    ...MALE_NAMES.map((n) => ({ name: n, gender: 'male' })),
    ...FEMALE_NAMES.map((n) => ({ name: n, gender: 'female' })),
  ];
  return all.sort(() => Math.random() - 0.5).slice(0, count);
}
function buildTagVariants(count) {
  const suffixes = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  const variants = [];
  const used = {};
  let safety = 0;
  while (variants.length < count && safety < 200) {
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    if (!used[s]) {
      used[s] = true;
      variants.push(s);
    }
    safety++;
  }
  return variants;
}
function makeHandle(name) {
  return (
    '@' +
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );
}
function getCurrentTime() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  h = h % 12 || 12;
  return h + ':' + m + ' ' + (now.getHours() >= 12 ? 'PM' : 'AM');
}

// ---------------- CSS ----------------
const STYLE_CSS = `
.mt-payproof * { box-sizing: border-box; }
.mt-payproof { --bg-body:#0F172A;--bg-app:#1E293B;--bg-panel:linear-gradient(180deg,#1E293B 0%,#0F172A 100%);--bg-input:#0F172A;--bg-card:#1E293B;--bg-panel-header:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);--text-primary:#E2E8F0;--text-secondary:#94A3B8;--text-muted:#64748B;--border-light:#334155;--border-medium:#475569;--shadow-sm:0 2px 8px rgba(0,0,0,0.4);--shadow-md:0 4px 12px rgba(0,0,0,0.5);--shadow-lg:0 4px 16px rgba(0,0,0,0.5);--divider:#334155;--label-bg:#334155;--label-text:#E2E8F0;--accent-primary:#818CF8;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg-body); height:100%; width:100%; padding:16px; overflow:hidden; display:flex; }
.mt-payproof .layout{display:flex;gap:14px;width:100%;height:100%;min-height:0;}
@media (max-width:1100px){.mt-payproof .layout{flex-direction:column;overflow:auto;}}

/* -------- Sidebar (scrollable) -------- */
.mt-payproof .sidebar{width:290px;flex-shrink:0;display:flex;flex-direction:column;gap:12px;overflow-y:auto;max-height:100%;padding-right:6px;scrollbar-width:thin;scrollbar-color:#475569 transparent;}
.mt-payproof .sidebar::-webkit-scrollbar{width:6px;}
.mt-payproof .sidebar::-webkit-scrollbar-thumb{background:#475569;border-radius:3px;}
@media (max-width:1100px){.mt-payproof .sidebar{width:100%;max-height:none;overflow:visible;}}
.mt-payproof .side-card{background:var(--bg-app);border:1px solid var(--border-light);border-radius:12px;padding:14px;box-shadow:var(--shadow-md);display:flex;flex-direction:column;gap:12px;}
.mt-payproof .side-title{font-size:11px;font-weight:800;color:#A78BFA;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 2px 0;display:flex;align-items:center;gap:6px;}
.mt-payproof .field{display:flex;flex-direction:column;gap:4px;}
.mt-payproof .field label{font-size:9px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;}
.mt-payproof .field input{width:100%;padding:9px 11px;font-size:12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-light);border-radius:6px;outline:none;font-family:inherit;transition:border-color 0.15s,box-shadow 0.15s;}
.mt-payproof .field input:focus{border-color:var(--accent-primary);box-shadow:0 0 0 2px rgba(129,140,248,0.2);}

/* -------- Toggles -------- */
.mt-payproof .toggle-block{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:8px;padding:10px 12px;}
.mt-payproof .toggle-label{font-size:11px;font-weight:700;color:var(--text-primary);letter-spacing:0.3px;display:flex;align-items:center;gap:6px;white-space:nowrap;}
.mt-payproof .theme-seg,.mt-payproof .device-seg{display:flex;background:#0F172A;border:1px solid var(--border-medium);border-radius:18px;padding:2px;position:relative;width:118px;height:28px;flex-shrink:0;cursor:pointer;user-select:none;}
.mt-payproof .theme-seg-thumb,.mt-payproof .device-seg-thumb{position:absolute;top:2px;left:2px;width:calc(50% - 2px);height:calc(100% - 4px);background:#6366F1;border-radius:14px;transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);box-shadow:0 2px 6px rgba(0,0,0,0.4);}
.mt-payproof[data-theme="light"] .theme-seg-thumb{transform:translateX(0%);}
.mt-payproof[data-theme="dark"] .theme-seg-thumb{transform:translateX(100%);}
.mt-payproof[data-device="ios"] .device-seg-thumb{transform:translateX(0%);}
.mt-payproof[data-device="android"] .device-seg-thumb{transform:translateX(100%);}
.mt-payproof .theme-seg-opt,.mt-payproof .device-seg-opt{flex:1;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:var(--text-muted);position:relative;z-index:2;letter-spacing:0.2px;pointer-events:none;}
.mt-payproof[data-theme="light"] .theme-seg-opt.light-opt{color:#fff;}
.mt-payproof[data-theme="dark"] .theme-seg-opt.dark-opt{color:#fff;}
.mt-payproof[data-device="ios"] .device-seg-opt.ios-opt{color:#fff;}
.mt-payproof[data-device="android"] .device-seg-opt.android-opt{color:#fff;}
.mt-payproof .global-switch{position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;}
.mt-payproof .global-switch input{opacity:0;width:100%;height:100%;margin:0;cursor:pointer;position:absolute;top:0;left:0;z-index:3;}
.mt-payproof .global-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#475569;transition:.25s;border-radius:22px;pointer-events:none;}
.mt-payproof .global-slider:before{position:absolute;content:"";height:16px;width:16px;left:3px;bottom:3px;background-color:#fff;transition:.25s;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.25);}
.mt-payproof .global-switch input:checked + .global-slider{background-color:#10b981;}
.mt-payproof .global-switch input:checked + .global-slider:before{transform:translateX(18px);}

/* -------- Panels area (uniform, no scroll) -------- */
.mt-payproof .panels-area{flex:1;min-width:0;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;background:var(--bg-app);border:1px solid var(--border-light);border-radius:12px;box-shadow:var(--shadow-lg);overflow:hidden;}
@media (max-width:1400px){.mt-payproof .panels-area{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media (max-width:900px){.mt-payproof .panels-area{grid-template-columns:minmax(0,1fr);}}

.mt-payproof .panel-column{
  display:flex;flex-direction:column;gap:8px;
  padding:10px 8px 12px;
  min-width:0;min-height:0;position:relative;
  border-right:1px solid var(--divider);
  background:var(--bg-panel);
  overflow:hidden;
  scrollbar-width:none;-ms-overflow-style:none;
}
.mt-payproof .panel-column::-webkit-scrollbar{display:none;width:0;height:0;}
.mt-payproof .panel-column:last-child{border-right:none;}

.mt-payproof .column-label{
  display:flex;align-items:center;justify-content:center;gap:5px;
  font-size:10px;font-weight:800;color:var(--label-text);
  text-transform:uppercase;letter-spacing:0.8px;
  padding:6px;background:var(--label-bg);border-radius:5px;
  border:1px solid var(--border-light);
  position:sticky;top:0;z-index:5;flex-shrink:0;
}
.mt-payproof .column-label .dot{width:6px;height:6px;border-radius:50%;display:inline-block;}
.mt-payproof .panel-column:nth-child(1) .column-label .dot{background:#6366f1;}
.mt-payproof .panel-column:nth-child(2) .column-label .dot{background:#10b981;}
.mt-payproof .panel-column:nth-child(3) .column-label .dot{background:#ef4444;}

.mt-payproof .panel-block{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;flex:1;min-height:0;}
.mt-payproof .panel-header{display:flex;flex-direction:column;gap:6px;width:100%;padding:6px 8px;border-radius:6px;background:var(--bg-panel-header);flex-shrink:0;}
.mt-payproof .header-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;}
.mt-payproof .header-btn{padding:6px 5px;font-size:10px;font-weight:700;border-radius:5px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;width:100%;color:#fff;font-family:inherit;}
.mt-payproof .header-btn.download{background:#10b981;}
.mt-payproof .header-btn.download:hover{background:#059669;}
.mt-payproof .header-btn.copy{background:#6366f1;}
.mt-payproof .header-btn.copy:hover{background:#4f46e5;}
.mt-payproof .filter-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;}
.mt-payproof .filter-btn{padding:6px 5px;font-size:10px;font-weight:700;border-radius:5px;border:2px solid #475569;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;width:100%;background:#334155;color:#cbd5e1;font-family:inherit;}
.mt-payproof .filter-btn:hover{background:#475569;color:#fff;}
.mt-payproof .filter-btn.active{background:#f59e0b;border-color:#f59e0b;color:#1e293b;}
.mt-payproof .filter-btn.active:hover{background:#d97706;border-color:#d97706;}

/* -------- Screenshot frame -------- */
.mt-payproof .screenshot-frame{
  position:relative;width:100%;flex:1;min-height:0;
  overflow:hidden;border-radius:8px;background:var(--bg-app);
  border:1px solid var(--border-light);box-shadow:var(--shadow-sm);
  display:flex;align-items:center;justify-content:center;
}
.mt-payproof .screenshot-panel{
  position:absolute;top:0;left:0;
  width:430px;height:932px;background:#fff;
  overflow:hidden;transform-origin:top left;
}
.mt-payproof .screenshot-frame.money-frame .screenshot-panel{width:330px;height:664px;}
.mt-payproof .panel-content{width:100%;height:100%;overflow:hidden;display:flex;}
.mt-payproof .panel-content-inner{
  width:100%;height:100%;display:flex;flex:1;overflow:hidden;
  scrollbar-width:none;-ms-overflow-style:none;
}
.mt-payproof .panel-content-inner::-webkit-scrollbar{display:none;width:0;height:0;}
`;

// ---------------- MAIN COMPONENT ----------------
export default function PayProofPage() {
  const rootRef = useRef(null);
  const [theme, setTheme] = useState('light'); // WHITE MODE DEFAULT
  const [device, setDevice] = useState('ios');
  const [statusBar, setStatusBar] = useState(true);
  const [time, setTime] = useState('9:41'); // USER-EDITABLE TIME
  const [amount, setAmount] = useState('');
  const [tag, setTag] = useState('');
  const [profile, setProfile] = useState('');
  const [failedStyle, setFailedStyle] = useState('style1');

  const panelsMeta = useRef([]);
  const resizeObserverRef = useRef(null);

  // ---- Theme helper ----
  const getScreenTheme = useCallback(() => {
    const isDark = theme === 'dark';
    return {
      bg: isDark ? '#0f172a' : '#ffffff',
      textPrimary: isDark ? '#f1f5f9' : '#111111',
      textSecondary: isDark ? '#94a3b8' : '#999999',
      textMuted: isDark ? '#64748b' : '#8a8a8a',
      divider: isDark ? '#334155' : '#e0e0e0',
      dividerSoft: isDark ? '#1e293b' : '#f0f0f0',
      cardBg: isDark ? '#1e293b' : '#ffffff',
      pillBg: isDark ? '#334155' : '#f0f4f8',
      pillText: isDark ? '#f1f5f9' : '#1e293b',
      pillBorder: isDark ? '#475569' : '#e2e8f0',
      accentGreenBg: isDark ? '#064e3b' : '#f0fdf4',
      accentGreenText: isDark ? '#6ee7b7' : '#16a34a',
      accentGreenBorder: isDark ? '#065f46' : '#bbf7d0',
      statusColor: isDark ? '#f1f5f9' : '#000000',
      searchBg: isDark ? '#334155' : '#f1f5f9',
      searchText: isDark ? '#94a3b8' : '#94a3b8',
      cashBg: isDark ? '#0f172a' : '#f7f5f7',
      cashCardBg: isDark ? '#1e293b' : '#ffffff',
      cashTitleText: isDark ? '#f1f5f9' : '#37343a',
      cashTextPrimary: isDark ? '#f1f5f9' : '#302d33',
      cashTextSecondary: isDark ? '#94a3b8' : '#454148',
      cashTextMuted: isDark ? '#64748b' : '#79747b',
      cashBtnBg: isDark ? '#334155' : '#f4f2f4',
      cashBtnText: isDark ? '#f1f5f9' : '#464248',
      cashNavBg: isDark ? '#1e293b' : '#ffffff',
      cashNavBorder: isDark ? '#334155' : '#e8e5e8',
      cashNavMoneyText: isDark ? '#f1f5f9' : '#48444a',
      cashNavIconColor: isDark ? '#64748b' : '#c4c1c5',
      cashAccountText: isDark ? '#94a3b8' : '#817d84',
      cashAccountArrow: isDark ? '#64748b' : '#c9c6ca',
      cashCardTitleText: isDark ? '#e2e8f0' : '#4a474d',
      cashCardArrow: isDark ? '#64748b' : '#cfccd0',
      cashCardValue: isDark ? '#f1f5f9' : '#353239',
    };
  }, [theme]);

  const getDisplayName = useCallback(() => {
    const p = (profile || '').trim();
    if (p) return p;
    const t = (tag || '').trim().replace(/^\$/, '').replace(/^@/, '').trim();
    if (t) return t;
    return 'Name';
  }, [profile, tag]);

  const getTagHandle = useCallback(() => {
    const t = (tag || '').trim().replace(/^\$/, '').replace(/^@/, '').trim();
    if (t) return '@' + t.toLowerCase().replace(/[^a-z0-9]/g, '');
    const p = (profile || '').trim();
    if (p) return '@' + p.toLowerCase().replace(/[^a-z0-9]/g, '');
    return '@name';
  }, [tag, profile]);

  const getInitial = useCallback(() => {
    const n = getDisplayName();
    if (n === 'Name') return 'N';
    return n.charAt(0).toUpperCase();
  }, [getDisplayName]);

  // ---- Status bar (uses user-editable `time`) ----
  const buildStatusBarHTML = useCallback(
    (show, t) => {
      if (!show) return '';
      if (device === 'ios') {
        return `<div style="position:relative;flex-shrink:0;height:52px;z-index:10;"><div style="position:absolute;left:26px;top:0;bottom:0;display:flex;align-items:center;"><span style="font-size:15px;font-weight:600;color:${t.statusColor};letter-spacing:0.1px;line-height:1;font-family:-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif;">${time}</span></div><div style="position:absolute;left:50%;top:12px;transform:translateX(-50%);width:104px;height:30px;background:#000;border-radius:16px;z-index:60;"></div><div style="position:absolute;right:20px;top:0;bottom:0;display:flex;align-items:center;gap:5px;"><svg width="20" height="14" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="0.5" fill="${t.statusColor}"/><rect x="5" y="5" width="3" height="7" rx="0.5" fill="${t.statusColor}"/><rect x="10" y="2" width="3" height="10" rx="0.5" fill="${t.statusColor}"/><rect x="15" y="0" width="3" height="12" rx="0.5" fill="${t.statusColor}"/></svg><svg width="20" height="14" viewBox="0 0 25 12"><rect x="0" y="1" width="21" height="10" rx="2" stroke="${t.statusColor}" stroke-width="1.2" fill="none"/><rect x="2" y="3" width="17" height="6" rx="1" fill="${t.statusColor}"/><rect x="22" y="4" width="2" height="4" rx="1" fill="${t.statusColor}"/></svg></div></div>`;
      }
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 6px;flex-shrink:0;z-index:10;"><span style="font-size:14px;font-weight:600;color:${t.statusColor};letter-spacing:0.1px;line-height:1;padding-left:2px;">${time}</span><div style="display:flex;align-items:center;gap:5px;"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="0.5" fill="${t.statusColor}"/><rect x="5" y="5" width="3" height="7" rx="0.5" fill="${t.statusColor}"/><rect x="10" y="2" width="3" height="10" rx="0.5" fill="${t.statusColor}"/><rect x="15" y="0" width="3" height="12" rx="0.5" fill="${t.statusColor}"/></svg><svg width="18" height="12" viewBox="0 0 25 12"><rect x="0" y="1" width="21" height="10" rx="2" stroke="${t.statusColor}" stroke-width="1.2" fill="none"/><rect x="2" y="3" width="17" height="6" rx="1" fill="${t.statusColor}"/><rect x="22" y="4" width="2" height="4" rx="1" fill="${t.statusColor}"/></svg></div></div>`;
    },
    [device, time]
  );

  const makeSavingsAvatar = useCallback(
    (size) =>
      `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${theme === 'dark' ? '#1e293b' : '#fafafa'};border:1px solid ${theme === 'dark' ? '#334155' : '#eee'};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#14a9ff;font-size:${Math.round(size * 0.48)}px;line-height:1;">${SAVINGS_ICON}</div>`,
    [theme]
  );

  const makeRepliedAvatar = useCallback((size, letter) => {
    const L = letter || 'A';
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffffff;font-size:${Math.round(size * 0.45)}px;line-height:1;font-weight:800;letter-spacing:0.5px;box-shadow:0 1px 2px rgba(16,185,129,0.3);">${L}</div>`;
  }, []);

  // ---- Payment Failed Style 1 ----
  const buildPaymentFailedStyle1HTML = useCallback(
    (show) => {
      const t = getScreenTheme();
      const dynamicName = getDisplayName();
      const statusBarHTML = buildStatusBarHTML(show, t);
      const topGap = device === 'ios' ? '30px' : '22px';
      return `<div style="width:100%;height:100%;background:${t.bg};font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative;">${statusBarHTML}<div style="flex:1;overflow:hidden;padding:0 40px;display:flex;flex-direction:column;min-height:0;position:relative;"><div style="width:60px;height:60px;border-radius:50%;background:#ff3b4d;display:flex;align-items:center;justify-content:center;color:#fff;font-size:42px;line-height:1;font-weight:500;margin-top:${topGap};flex-shrink:0;">×</div><div style="width:100%;font-size:25px;line-height:33px;font-weight:650;letter-spacing:-0.2px;color:${t.textPrimary};margin-top:20px;flex-shrink:0;">This person can't send and receive money right now due to settings on their account</div><div style="margin-top:24px;font-size:16px;font-weight:600;color:${t.textMuted};flex-shrink:0;">To ${dynamicName}</div></div><div style="position:absolute;left:40px;right:40px;bottom:40px;height:52px;border-radius:30px;background:#00d95b;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;font-weight:700;">Done</div></div>`;
    },
    [getScreenTheme, getDisplayName, buildStatusBarHTML, device]
  );

  // ---- Payment Failed Style 2 ----
  const buildPaymentFailedStyle2HTML = useCallback(
    (show) => {
      const dynamicName = getDisplayName();
      const dynamicHandle = getTagHandle();
      const dynamicInitial = getInitial();
      const t = getScreenTheme();
      const statusBarHTML = buildStatusBarHTML(show, t);
      const avatarHTML = `<div style="width:72px;height:72px;border-radius:50%;background:${PROFILE_NAVY};display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:30px;line-height:1;font-weight:600;border:2px solid ${theme === 'dark' ? '#475569' : '#d0cdd0'};box-shadow:inset 0 1px 3px rgba(0,0,0,0.18),0 1px 2px rgba(0,0,0,0.05);">${dynamicInitial}</div>`;
      const topGap = show ? (device === 'ios' ? '10px' : '4px') : '28px';
      return `<div style="width:100%;height:100%;background:${t.bg};font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative;">${statusBarHTML}<div style="position:relative;height:34px;margin-top:${topGap};padding:0 26px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;"><div style="position:relative;width:26px;height:26px;"><div style="position:absolute;width:24px;height:3px;background:${t.textPrimary};border-radius:2px;top:11px;left:1px;transform:rotate(45deg);"></div><div style="position:absolute;width:24px;height:3px;background:${t.textPrimary};border-radius:2px;top:11px;left:1px;transform:rotate(-45deg);"></div></div><div style="display:flex;align-items:center;justify-content:center;gap:5px;width:34px;height:26px;"><span style="width:5px;height:5px;border-radius:50%;background:${t.textPrimary};display:block;"></span><span style="width:5px;height:5px;border-radius:50%;background:${t.textPrimary};display:block;"></span><span style="width:5px;height:5px;border-radius:50%;background:${t.textPrimary};display:block;"></span></div></div><div style="display:flex;flex-direction:column;align-items:center;margin-top:36px;flex-shrink:0;">${avatarHTML}<div style="margin-top:16px;font-size:17px;line-height:22px;font-weight:700;color:${t.textPrimary};">${dynamicName}</div><div style="margin-top:4px;font-size:14px;line-height:18px;font-weight:400;color:${t.textMuted};">Payment to ${dynamicHandle}</div></div><div style="display:flex;flex-direction:column;align-items:center;margin-top:64px;flex-shrink:0;"><div style="font-size:64px;line-height:68px;font-weight:650;letter-spacing:-2px;color:${theme === 'dark' ? '#475569' : '#c8c6ca'};">$0</div><div style="margin-top:8px;font-size:15px;line-height:19px;color:${theme === 'dark' ? '#475569' : '#c6c2c7'};">For take money</div><div style="margin-top:3px;font-size:14px;line-height:18px;color:${theme === 'dark' ? '#475569' : '#c6c2c7'};">Today at ${time.replace(/\s[AP]M$/, '')}</div></div><div style="position:absolute;left:40px;right:40px;bottom:40px;height:62px;border-radius:34px;background:#ef4444;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:20px;line-height:1;font-weight:700;box-shadow:0 4px 14px rgba(239,68,68,0.4);">Failed</div></div>`;
    },
    [
      getScreenTheme,
      getDisplayName,
      getTagHandle,
      getInitial,
      buildStatusBarHTML,
      theme,
      device,
      time,
    ]
  );

  // ---- Tag Search ----
  const buildTagSearchHTML = useCallback(
    (session, show) => {
      const displayTag = (tag || '').trim();
      const num = parseFloat((amount || '0').replace(/[^0-9.]/g, ''));
      const hasDecimal = (amount || '').includes('.');
      const formatted =
        '$' +
        (isNaN(num)
          ? '0'
          : num.toLocaleString('en-US', {
              minimumFractionDigits: hasDecimal ? 2 : 0,
              maximumFractionDigits: 2,
            }));
      const t = getScreenTheme();
      const kbBg = theme === 'dark' ? '#1e293b' : '#d1d3d9';
      const kbKeyBg = theme === 'dark' ? '#475569' : '#fff';
      const kbKeyText = theme === 'dark' ? '#f1f5f9' : '#333';
      const kbWideBg = theme === 'dark' ? '#334155' : '#adb5bd';
      const kbWideText = theme === 'dark' ? '#cbd5e1' : '#333';
      const kbBorder = theme === 'dark' ? '#1e293b' : '#c8c8c8';
      const avatarColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      const tagBaseRaw = displayTag.replace(/^\$/, '').trim() || 'Name';
      const topHandle = '@' + tagBaseRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      const profileTrim = (profile || '').trim();
      const firstDisplayName = profileTrim ? profileTrim : tagBaseRaw;
      const contacts = session.contacts;
      const base = tagBaseRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      const suffixes = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
      const tagVariants = session.tagVariants.map(
        (_, i) => base + suffixes[(session.picPosition + i * 7) % suffixes.length]
      );
      const allContacts = [
        { name: firstDisplayName, user: topHandle, isDynamic: true },
        { name: contacts[0].name, user: makeHandle(tagVariants[0]) },
        { name: contacts[1].name, user: makeHandle(tagVariants[1]) },
        { name: contacts[2].name, user: makeHandle(tagVariants[2]) },
      ];
      const contactsHTML = allContacts
        .map((c, i) => {
          let avatarHTML;
          if (c.isDynamic) {
            const nameForInitial = profileTrim || tagBaseRaw;
            const initial = nameForInitial.split(/\s+/)[0].charAt(0).toUpperCase();
            avatarHTML = `<div style="width:50px;height:50px;border-radius:50%;background:${PROFILE_NAVY};color:#fff;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initial}</div>`;
          } else {
            const bg = avatarColors[i % avatarColors.length];
            const letter = c.name.charAt(0).toUpperCase();
            avatarHTML = `<div style="width:50px;height:50px;border-radius:50%;background:${bg};color:#fff;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${letter}</div>`;
          }
          return `<div style="display:flex;align-items:center;gap:14px;padding:14px 0;flex-shrink:0;">${avatarHTML}<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:16px;color:${t.textPrimary};">${c.name}</div><div style="font-size:13px;color:${t.textSecondary};">${c.user}</div></div><span style="font-size:20px;color:${t.textMuted};">›</span></div>`;
        })
        .join('');
      const sectionLabelStyle = `font-size:12px;font-weight:800;color:${t.textMuted};text-transform:uppercase;letter-spacing:1px;`;
      const dividerStyle = `height:1px;background:${t.divider};margin:12px 0;`;
      const statusBarHTML = buildStatusBarHTML(show, t);
      const kbRows = [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
        ['123', '@', 'space', '.', '↵'],
      ];
      const keyboardHTML = kbRows
        .map(
          (row) =>
            `<div style="display:flex;justify-content:center;gap:6px;margin-bottom:11px;">${row
              .map((key) => {
                const isWide = ['⇧', '⌫', '123', '↵'].includes(key);
                const isSpace = key === 'space';
                const bg = isWide ? kbWideBg : kbKeyBg;
                const txtColor = isWide ? kbWideText : kbKeyText;
                return `<span style="display:flex;align-items:center;justify-content:center;${isSpace ? 'flex:4;' : isWide ? 'max-width:56px;' : 'flex:1;max-width:38px;'}height:48px;border-radius:7px;background:${bg};font-size:${isWide ? '12px' : '17px'};color:${txtColor};box-shadow:0 1px 1px rgba(0,0,0,0.08);${isWide ? 'font-weight:600;' : ''}${isSpace ? 'font-size:13px;color:#888;' : ''}">${key}</span>`;
              })
              .join('')}</div>`
        )
        .join('');
      return `<div style="width:100%;height:100%;background:${t.bg};font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;overflow:hidden;">${statusBarHTML}<div style="flex:1;overflow:hidden;padding:0 26px;display:flex;flex-direction:column;min-height:0;justify-content:space-between;"><div><div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0 16px;margin-top:${show ? '14px' : '28px'};flex-shrink:0;"><span style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:${t.textPrimary};line-height:1;">✕</span><span style="font-size:23px;font-weight:700;color:${t.textPrimary};">${formatted}</span><span style="padding:10px 24px;border-radius:22px;background:#00d632;color:#fff;font-size:16px;font-weight:700;">Pay</span></div><div style="padding:10px 0;flex-shrink:0;"><div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid ${t.divider};padding-bottom:10px;"><span style="font-size:13px;color:${t.textPrimary};text-transform:uppercase;letter-spacing:0.7px;font-weight:800;flex-shrink:0;">To</span><span style="flex:1;font-size:17px;color:${tagBaseRaw ? t.textPrimary : t.textMuted};">${tagBaseRaw ? tagBaseRaw : 'Name'}</span></div></div><div style="padding:8px 0 12px;flex-shrink:0;"><div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid ${t.divider};padding:8px 0;"><span style="font-size:13px;color:${t.textPrimary};text-transform:uppercase;letter-spacing:0.7px;font-weight:800;flex-shrink:0;">For</span><span style="flex:1;font-size:16px;color:${t.textMuted};">Add a note</span></div></div><div style="${dividerStyle}flex-shrink:0;"></div><div style="${sectionLabelStyle}padding:0 0 10px;flex-shrink:0;">Suggested</div><div style="display:flex;flex-direction:column;flex-shrink:0;">${contactsHTML}</div><div style="${dividerStyle}flex-shrink:0;"></div><div style="${sectionLabelStyle}padding:0 0 12px;flex-shrink:0;">Contacts</div></div><div style="display:flex;justify-content:center;padding:0 0 16px;flex-shrink:0;"><button style="padding:11px 26px;font-size:15px;font-weight:700;background:transparent;color:#0077b6;border:1.5px solid #0077b6;border-radius:22px;cursor:pointer;">Enable Contacts</button></div></div><div style="background:${kbBg};border-top:1px solid ${kbBorder};padding:10px 6px 4px;flex-shrink:0;">${keyboardHTML}<div style="width:120px;height:6px;background:${theme === 'dark' ? '#94a3b8' : '#333'};border-radius:3px;margin:12px auto 10px;"></div></div></div>`;
    },
    [tag, amount, profile, getScreenTheme, buildStatusBarHTML, theme]
  );

  // ---- Money ----
  const buildMoneyHTML = useCallback(
    (show) => {
      const formatted =
        '$' +
        FIXED_CASH_BALANCE.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      const shortFormatted = '$' + Math.round(FIXED_CASH_BALANCE).toLocaleString('en-US');
      const savingsFormatted =
        '$' +
        FIXED_SAVINGS.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      const t = getScreenTheme();
      const statusBarTextColor = theme === 'dark' ? '#f1f5f9' : '#29272b';
      const statusBarIconFill = theme === 'dark' ? '#f1f5f9' : '#29272b';
      const statusBarHTML = show
        ? `<div style="position:absolute;top:0;left:0;right:0;height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-size:12px;font-weight:700;color:${statusBarTextColor};z-index:10;"><span>${time}</span><div style="display:flex;align-items:center;gap:5px;"><svg width="15" height="10" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="0.5" fill="${statusBarIconFill}"/><rect x="5" y="5" width="3" height="7" rx="0.5" fill="${statusBarIconFill}"/><rect x="10" y="2" width="3" height="10" rx="0.5" fill="${statusBarIconFill}"/><rect x="15" y="0" width="3" height="12" rx="0.5" fill="${statusBarIconFill}"/></svg><svg width="16" height="10" viewBox="0 0 25 12"><rect x="0" y="1" width="21" height="10" rx="2" stroke="${statusBarIconFill}" stroke-width="1.2" fill="none"/><rect x="2" y="3" width="17" height="6" rx="1" fill="${statusBarIconFill}"/><rect x="22" y="4" width="2" height="4" rx="1" fill="${statusBarIconFill}"/></svg></div>${device === 'ios' ? '<div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);width:76px;height:22px;background:#000;border-radius:11px;"></div>' : ''}</div>`
        : '';
      const topPadding = show ? '28px' : '0px';
      const profileSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;fill:#ffffff;"><circle cx="12" cy="8" r="4" fill="white"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="white"/></svg>`;
      return `<div style="width:330px;height:664px;background:${t.cashBg};position:relative;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Arial,sans-serif;color:${t.cashTextPrimary};padding-top:${topPadding};box-sizing:border-box;">${statusBarHTML}<section style="width:100%;height:611px;padding:16px;overflow:hidden;box-sizing:border-box;"><header style="height:39px;display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;"><div style="font-size:19px;line-height:24px;font-weight:700;letter-spacing:-0.35px;color:${t.cashTitleText};">Money</div><div style="width:39px;height:39px;border-radius:50%;border:2px solid ${theme === 'dark' ? '#475569' : '#d0cdd0'};box-shadow:inset 0 1px 3px rgba(0,0,0,0.18),0 1px 2px rgba(0,0,0,0.05);display:flex;align-items:center;justify-content:center;background-color:${PROFILE_NAVY};overflow:hidden;">${profileSvg}</div></header><section style="height:155px;width:100%;background:${t.cashCardBg};border-radius:13px;padding:15px 12px 11px;margin-bottom:12px;box-sizing:border-box;"><div style="height:17px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:17px;font-weight:650;color:${t.cashTextSecondary};">Cash balance</div><div style="display:flex;align-items:center;font-size:11px;line-height:17px;font-weight:500;color:${t.cashAccountText};">Account &amp; routing <span style="margin-left:3px;font-size:17px;line-height:15px;color:${t.cashAccountArrow};">›</span></div></div><div style="margin-top:9px;font-size:32px;line-height:37px;font-weight:700;letter-spacing:-1.2px;color:${t.cashTextPrimary};">${formatted}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:13px;"><div style="height:37px;border-radius:20px;background:${t.cashBtnBg};display:flex;align-items:center;justify-content:center;font-size:13px;line-height:16px;font-weight:650;color:${t.cashBtnText};">Add Cash</div><div style="height:37px;border-radius:20px;background:${t.cashBtnBg};display:flex;align-items:center;justify-content:center;font-size:13px;line-height:16px;font-weight:650;color:${t.cashBtnText};">Cash Out</div></div></section><section style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><article style="height:140px;position:relative;background:${t.cashCardBg};border-radius:13px;padding:12px;overflow:hidden;box-sizing:border-box;"><div style="height:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:18px;font-weight:650;color:${t.cashCardTitleText};">Savings</div><div style="font-size:18px;line-height:14px;font-weight:300;color:${t.cashCardArrow};">›</div></div><div style="width:39px;height:39px;margin-top:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;overflow:hidden;background:${theme === 'dark' ? '#1e293b' : '#fafafa'};border:1px solid ${theme === 'dark' ? '#334155' : '#eee'};color:#14a9ff;">${SAVINGS_ICON}</div><div style="position:absolute;left:12px;bottom:27px;font-size:18px;line-height:20px;font-weight:700;letter-spacing:-0.35px;color:${t.cashCardValue};">${savingsFormatted}</div><div style="position:absolute;left:12px;right:8px;bottom:10px;font-size:10.5px;line-height:14px;font-weight:400;color:${t.cashTextMuted};">Up to 4.5% interest</div></article><article style="height:140px;position:relative;background:${t.cashCardBg};border-radius:13px;padding:12px;overflow:hidden;box-sizing:border-box;"><div style="height:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:18px;font-weight:650;color:${t.cashCardTitleText};">Borrow</div><div style="font-size:18px;line-height:14px;font-weight:300;color:${t.cashCardArrow};">›</div></div><div style="width:39px;height:39px;margin-top:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:23px;line-height:1;overflow:hidden;background:#8fc7f3;color:#fff;">↗</div><div style="position:absolute;left:12px;bottom:27px;font-size:18px;line-height:20px;font-weight:700;letter-spacing:-0.35px;color:${t.cashCardValue};">$0.00</div><div style="position:absolute;left:12px;right:8px;bottom:10px;font-size:10.5px;line-height:14px;font-weight:400;color:${t.cashTextMuted};">Available</div></article><article style="height:140px;position:relative;background:${t.cashCardBg};border-radius:13px;padding:12px;overflow:hidden;box-sizing:border-box;"><div style="height:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:18px;font-weight:650;color:${t.cashCardTitleText};">Taxes</div><div style="font-size:18px;line-height:14px;font-weight:300;color:${t.cashCardArrow};">›</div></div><div style="width:39px;height:39px;margin-top:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;overflow:hidden;background:${theme === 'dark' ? '#1e293b' : '#fbf9ff'};border:1px solid ${theme === 'dark' ? '#334155' : '#f0ebf7'};color:#6800d8;"><span style="font-size:20px;font-weight:700;">♜</span></div><div style="position:absolute;left:12px;right:8px;bottom:13px;font-size:10.5px;line-height:14px;font-weight:400;color:${t.cashTextMuted};">Pay $0 to file</div></article><article style="height:140px;position:relative;background:${t.cashCardBg};border-radius:13px;padding:12px;overflow:hidden;box-sizing:border-box;"><div style="height:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:18px;font-weight:650;color:${t.cashCardTitleText};">Paychecks</div><div style="font-size:18px;line-height:14px;font-weight:300;color:${t.cashCardArrow};">›</div></div><div style="width:39px;height:39px;margin-top:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;overflow:hidden;background:#0ee85a;color:#fff;"><span style="font-size:22px;font-weight:500;">↓</span></div><div style="position:absolute;left:12px;right:8px;bottom:13px;font-size:10.5px;line-height:14px;font-weight:400;color:${t.cashTextMuted};">Get direct deposits<br>early</div></article><article style="height:140px;position:relative;background:${t.cashCardBg};border-radius:13px;padding:12px;overflow:hidden;box-sizing:border-box;"><div style="height:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:18px;font-weight:650;color:${t.cashCardTitleText};">Bitcoin</div><div style="font-size:18px;line-height:14px;font-weight:300;color:${t.cashCardArrow};">›</div></div><div style="width:39px;height:39px;margin-top:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1;overflow:hidden;background:#1fcbdc;color:#fff;font-weight:800;">₿</div></article><article style="height:140px;position:relative;background:${t.cashCardBg};border-radius:13px;padding:12px;overflow:hidden;box-sizing:border-box;"><div style="height:18px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;line-height:18px;font-weight:650;color:${t.cashCardTitleText};">Stocks</div><div style="font-size:18px;line-height:14px;font-weight:300;color:${t.cashCardArrow};">›</div></div><div style="width:39px;height:39px;margin-top:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;overflow:hidden;background:#8200df;color:#fff;"><span style="font-size:22px;font-weight:600;">⌁</span></div></article></section></section><nav style="width:100%;height:53px;position:absolute;left:0;bottom:0;background:${t.cashNavBg};border-top:1px solid ${t.cashNavBorder};display:grid;grid-template-columns:repeat(5,1fr);align-items:center;"><div style="height:53px;display:flex;align-items:center;justify-content:center;"><span style="font-size:16px;line-height:20px;font-weight:700;color:${t.cashNavMoneyText};">${shortFormatted}</span></div><div style="height:53px;display:flex;align-items:center;justify-content:center;color:${t.cashNavIconColor};"><span style="width:18px;height:13px;border:2px solid ${t.cashNavIconColor};border-radius:4px;position:relative;display:block;"></span></div><div style="height:53px;display:flex;align-items:center;justify-content:center;color:${t.cashNavIconColor};"><span style="font-size:22px;line-height:22px;font-weight:700;">$</span></div><div style="height:53px;display:flex;align-items:center;justify-content:center;color:${t.cashNavIconColor};"><span style="width:17px;height:17px;border:2px solid ${t.cashNavIconColor};border-radius:50%;position:relative;display:block;"></span></div><div style="height:53px;display:flex;align-items:center;justify-content:center;color:${t.cashNavIconColor};"><span style="width:18px;height:18px;border:2px solid ${t.cashNavIconColor};border-radius:50%;position:relative;display:block;"></span></div></nav></div>`;
    },
    [getScreenTheme, theme, device, time]
  );

  // ---- Scale helpers ----
  const applyScale = useCallback((panelId) => {
    const root = rootRef.current;
    if (!root) return;
    const inner = root.querySelector(`#${panelId}`);
    if (!inner) return;
    const frame = inner.closest('.screenshot-frame');
    const panel = inner.closest('.screenshot-panel');
    if (!frame || !panel) return;
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    if (frameW <= 0 || frameH <= 0) return;
    const deviceW = panel.dataset.deviceW ? parseFloat(panel.dataset.deviceW) : PAYMENT_WIDTH;
    const deviceH = panel.dataset.deviceH ? parseFloat(panel.dataset.deviceH) : PAYMENT_HEIGHT;
    const scale = Math.min(frameW / deviceW, frameH / deviceH);
    const scaledW = deviceW * scale;
    const scaledH = deviceH * scale;
    const offsetX = (frameW - scaledW) / 2;
    const offsetY = (frameH - scaledH) / 2;
    panel.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    panel.style.transformOrigin = 'top left';
  }, []);

  const applyAllScales = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.panel-content-inner').forEach((el) => applyScale(el.id));
  }, [applyScale]);

  // ---- Capture ----
  const captureScreenshot = useCallback(
    (panelId) => {
      return new Promise((resolve, reject) => {
        const root = rootRef.current;
        if (!root) return reject('no root');
        const el = root.querySelector(`#${panelId}`);
        if (!el) return reject('no el');
        const outer = el.closest('.screenshot-panel');
        const frame = el.closest('.screenshot-frame');
        if (!outer || !frame) return reject('missing container');
        const deviceW = outer.dataset.deviceW ? parseFloat(outer.dataset.deviceW) : PAYMENT_WIDTH;
        const deviceH = outer.dataset.deviceH ? parseFloat(outer.dataset.deviceH) : PAYMENT_HEIGHT;
        const prev = {
          transform: outer.style.transform,
          fw: frame.style.width,
          fh: frame.style.height,
          fo: frame.style.overflow,
          fa: frame.style.aspectRatio,
          fb: frame.style.border,
        };
        outer.style.transform = 'none';
        outer.style.width = deviceW + 'px';
        outer.style.height = deviceH + 'px';
        frame.style.width = deviceW + 'px';
        frame.style.height = deviceH + 'px';
        frame.style.overflow = 'visible';
        frame.style.aspectRatio = 'auto';
        frame.style.border = 'none';
        const restore = () => {
          outer.style.transform = prev.transform;
          outer.style.width = '';
          outer.style.height = '';
          frame.style.width = prev.fw;
          frame.style.height = prev.fh;
          frame.style.overflow = prev.fo;
          frame.style.aspectRatio = prev.fa;
          frame.style.border = prev.fb;
          requestAnimationFrame(() => applyScale(panelId));
        };
        const run = () => {
          window
            .html2canvas(el, {
              backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
              scale: EXPORT_SCALE,
              useCORS: true,
              logging: false,
              allowTaint: true,
              width: deviceW,
              height: deviceH,
              windowWidth: deviceW,
              windowHeight: deviceH,
              scrollX: 0,
              scrollY: 0,
              x: 0,
              y: 0,
              imageTimeout: 0,
              removeContainer: true,
            })
            .then((canvas) => {
              restore();
              resolve(canvas);
            })
            .catch((err) => {
              restore();
              reject(err);
            });
        };
        if (typeof window.html2canvas === 'undefined') {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = run;
          document.head.appendChild(s);
        } else run();
      });
    },
    [theme, applyScale]
  );

  const flashBtn = (btn, text) => {
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = text;
    setTimeout(() => {
      btn.innerHTML = orig;
    }, 1400);
  };

  const downloadPanel = useCallback(
    (panelId) => {
      captureScreenshot(panelId)
        .then((canvas) => {
          const link = document.createElement('a');
          link.download = `freshtop-${panelId}-${Date.now()}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        })
        .catch(() => {});
    },
    [captureScreenshot]
  );

  const copyPanel = useCallback(
    async (panelId, btn) => {
      try {
        const canvas = await captureScreenshot(panelId);
        if (navigator.clipboard && window.ClipboardItem) {
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          flashBtn(btn, '✅ Copied');
        } else {
          const dataUrl = canvas.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = dataUrl;
          const wrap = document.createElement('div');
          wrap.contentEditable = 'true';
          wrap.style.position = 'fixed';
          wrap.style.left = '-9999px';
          wrap.appendChild(img);
          document.body.appendChild(wrap);
          const range = document.createRange();
          range.selectNodeContents(wrap);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('copy');
          document.body.removeChild(wrap);
          flashBtn(btn, '✅ Copied');
        }
      } catch {
        flashBtn(btn, '❌ Failed');
      }
    },
    [captureScreenshot]
  );

  // ---- Re-render all panels on state change ----
  const renderAllPanels = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    panelsMeta.current.forEach(({ panelId, kind, session }) => {
      const inner = root.querySelector(`#${panelId}`);
      if (!inner) return;
      if (kind === 'money') inner.innerHTML = buildMoneyHTML(statusBar);
      else if (kind === 'tagSearch') inner.innerHTML = buildTagSearchHTML(session, statusBar);
      else if (kind === 'failed')
        inner.innerHTML =
          failedStyle === 'style1'
            ? buildPaymentFailedStyle1HTML(statusBar)
            : buildPaymentFailedStyle2HTML(statusBar);
      requestAnimationFrame(() => applyScale(panelId));
    });
  }, [
    statusBar,
    failedStyle,
    buildMoneyHTML,
    buildTagSearchHTML,
    buildPaymentFailedStyle1HTML,
    buildPaymentFailedStyle2HTML,
    applyScale,
  ]);

  useEffect(() => {
    renderAllPanels();
  }, [theme, device, statusBar, time, amount, tag, profile, failedStyle, renderAllPanels]);

  // ---- Build panels once ----
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const grid = root.querySelector('#panelsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    panelsMeta.current = [];

    const panelsCfg = [
      { kind: 'money', label: 'Cash Balance', w: MONEY_WIDTH, h: MONEY_HEIGHT },
      { kind: 'tagSearch', label: 'Tag Search', w: PAYMENT_WIDTH, h: PAYMENT_HEIGHT },
      { kind: 'failed', label: 'Payment Failed', w: PAYMENT_WIDTH, h: PAYMENT_HEIGHT },
    ];

    panelsCfg.forEach((cfg, idx) => {
      const panelId = `panel${idx + 1}`;
      const isMoney = cfg.kind === 'money';

      const column = document.createElement('div');
      column.className = 'panel-column';
      const label = document.createElement('div');
      label.className = 'column-label';
      label.innerHTML = `<span class="dot"></span> ${cfg.label}`;
      column.appendChild(label);

      const block = document.createElement('div');
      block.className = 'panel-block';
      const header = document.createElement('div');
      header.className = 'panel-header';
      if (cfg.kind === 'failed') {
        header.innerHTML = `<div class="header-actions"><button class="header-btn download" data-panel="${panelId}">📥 Download</button><button class="header-btn copy" data-panel="${panelId}">📋 Copy</button></div><div class="filter-actions"><button class="filter-btn active" data-filter="style1">🎨 Style 1</button><button class="filter-btn" data-filter="style2">🌙 Style 2</button></div>`;
      } else {
        header.innerHTML = `<div class="header-actions"><button class="header-btn download" data-panel="${panelId}">📥 Download</button><button class="header-btn copy" data-panel="${panelId}">📋 Copy</button></div>`;
      }

      const frame = document.createElement('div');
      frame.className = 'screenshot-frame' + (isMoney ? ' money-frame' : '');
      const panel = document.createElement('div');
      panel.className = 'screenshot-panel';
      panel.dataset.deviceW = cfg.w;
      panel.dataset.deviceH = cfg.h;
      if (isMoney) {
        panel.style.width = cfg.w + 'px';
        panel.style.height = cfg.h + 'px';
      }

      const content = document.createElement('div');
      content.className = 'panel-content';
      const inner = document.createElement('div');
      inner.className = 'panel-content-inner';
      inner.id = panelId;
      content.appendChild(inner);
      panel.appendChild(content);
      frame.appendChild(panel);
      block.appendChild(header);
      block.appendChild(frame);
      column.appendChild(block);
      grid.appendChild(column);

      const names = pickRandomNames(3);
      const session = {
        contacts: names,
        tagVariants: buildTagVariants(3),
        picPosition: Math.floor(Math.random() * 3),
      };
      panelsMeta.current.push({ panelId, kind: cfg.kind, session });

      header.querySelector('.download').addEventListener('click', () => downloadPanel(panelId));
      const copyBtn = header.querySelector('.copy');
      copyBtn.addEventListener('click', () => copyPanel(panelId, copyBtn));

      if (cfg.kind === 'failed') {
        const s1 = header.querySelector('[data-filter="style1"]');
        const s2 = header.querySelector('[data-filter="style2"]');
        s1.addEventListener('click', () => {
          setFailedStyle('style1');
          s1.classList.add('active');
          s2.classList.remove('active');
        });
        s2.addEventListener('click', () => {
          setFailedStyle('style2');
          s2.classList.add('active');
          s1.classList.remove('active');
        });
      }
    });

    if (!resizeObserverRef.current)
      resizeObserverRef.current = new ResizeObserver(() => applyAllScales());
    root.querySelectorAll('.screenshot-frame').forEach((f) => resizeObserverRef.current.observe(f));

    setTimeout(() => {
      renderAllPanels();
      applyAllScales();
    }, 50);
    window.addEventListener('resize', applyAllScales);

    return () => {
      window.removeEventListener('resize', applyAllScales);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      panelsMeta.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Protection ----
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ctx = (e) => e.preventDefault();
    const key = (e) => {
      if (e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
      }
      if (
        e.ctrlKey &&
        e.shiftKey &&
        ['I', 'i', 'J', 'j', 'C', 'c', 'E', 'e', 'K', 'k'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    node.addEventListener('contextmenu', ctx);
    node.addEventListener('keydown', key, true);
    return () => {
      node.removeEventListener('contextmenu', ctx);
      node.removeEventListener('keydown', key, true);
    };
  }, []);

  // ---- Toggle handlers ----
  const handleThemeClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 2;
    setTheme(isLeft ? 'light' : 'dark');
  };
  const handleDeviceClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 2;
    setDevice(isLeft ? 'ios' : 'android');
  };

  return (
    <div className="mt-payproof" data-theme={theme} data-device={device} ref={rootRef}>
      <style>{STYLE_CSS}</style>
      <div className="layout">
        {/* SIDEBAR — Settings (theme → device → status bar) → Inputs */}
        <div className="sidebar">
          <div className="side-card">
            <h3 className="side-title">⚙️ Settings</h3>
            <div className="toggle-block">
              <span className="toggle-label">🎨 Screen Theme</span>
              <div
                className="theme-seg"
                role="button"
                aria-label="Toggle screen theme"
                onClick={handleThemeClick}
              >
                <div className="theme-seg-thumb"></div>
                <div className="theme-seg-opt light-opt">☀️ Light</div>
                <div className="theme-seg-opt dark-opt">🌙 Dark</div>
              </div>
            </div>
            <div className="toggle-block">
              <span className="toggle-label">📱 Device</span>
              <div
                className="device-seg"
                role="button"
                aria-label="Toggle device"
                onClick={handleDeviceClick}
              >
                <div className="device-seg-thumb"></div>
                <div className="device-seg-opt ios-opt">🍎 iOS</div>
                <div className="device-seg-opt android-opt">🤖 Android</div>
              </div>
            </div>
            <div className="toggle-block">
              <span className="toggle-label">📱 Status Bar</span>
              <label className="global-switch">
                <input
                  type="checkbox"
                  checked={statusBar}
                  onChange={(e) => setStatusBar(e.target.checked)}
                />
                <span className="global-slider"></span>
              </label>
            </div>
            {statusBar && (
              <div className="field">
                <label>Status Bar Time</label>
                <input
                  type="text"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="9:41"
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <div className="side-card">
            <h3 className="side-title">📝 Inputs</h3>
            <div className="field">
              <label>Amount ($)</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 89.50"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>Cashtag / Name</label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. johnsmith"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>Profile / Display Name</label>
              <input
                type="text"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="e.g. John Smith"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* PANELS — 3 columns, no scroll */}
        <div className="panels-area" id="panelsGrid"></div>
      </div>
    </div>
  );
}
