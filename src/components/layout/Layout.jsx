import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { preloadPage } from '../../App';
import api from '../../services/api';

// ============================================================
// MEGA TOOLS — Layout v1.5 (CUSTOM-URLS LABEL)
// FIX-LAY1..8 (v1.1–v1.3): retained
// FIX-LAY9 (v1.4 — OWNER-ONLY):
//   "Add URLs" (/links-hub) is now OWNER-ONLY in the menu.
//   Admin/User will no longer see this menu entry.
//   Backend and route guards are locked to owner-only in
//   the corresponding files (App.jsx + routes/links.js).
// FIX-LAY10 (v1.5 — CUSTOM-URLS RENAME):
//   Sidebar label "Personal URLs" renamed to "Custom URLs".
//   Path left as /personal-links for compatibility (will be
//   renamed in App.jsx + page file in the same change-set).
// ============================================================

const Icons = {
  users:     'M7 8a3 3 0 100-6 3 3 0 000 6zm7.5 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z',
  link:     'M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z',
  folder:   'M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z',
  chevronDown:'M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z',
  verify:   'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
  userGroup:'M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z',
  settings: 'M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z',
  zap:      'M13 2L3 12h6l-2 6 10-10H11l2-6z',
  message:  'M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2.5 1a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm4 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm4 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  trash:    'M6 2a1 1 0 00-1 1v1H3a1 1 0 000 2h1v11a2 2 0 002 2h8a2 2 0 002-2V6h1a1 1 0 100-2h-2V3a1 1 0 00-1-1H6zm2 5a1 1 0 112 0v7a1 1 0 11-2 0V7zm3 0a1 1 0 112 0v7a1 1 0 11-2 0V7z',
  code:    'M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z',
  tools:    'M7 3a1 1 0 000 2v2a1 1 0 000 2h6a1 1 0 100-2V5a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zm2 3a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm-2 3a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z',
  package:  'M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm3 2v2h2V6H6zm0 4v4h2v-4H6zm4-4v8h2V6h-2zm4-2v10h2V4h-2z',
  embed:    'M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2v2h2V6H6zm0 4v4h2v-4H6zm4-4v8h2V6h-2zm4-2v10h2V4h-2z',
  payproof: 'M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6zm2 2a2 2 0 100 4 2 2 0 000-4zm8 3a1 1 0 100 2 1 1 0 000-2z',
  meeting:  'M3 5a2 2 0 00-2 2v6a2 2 0 002 2h9a2 2 0 002-2v-1.586l3.293 3.293A1 1 0 0019 14V6a1 1 0 00-1.707-.707L14 8.586V7a2 2 0 00-2-2H3z',
  facetime: 'M2 6a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm13 .586 2.293-2.293A1 1 0 0119 5v10a1 1 0 01-1.707.707L15 13.414V6.586z',
};

const SidebarIcon = React.memo(({ name, size = 18, color = '#94A3B8' }) => {
  const icon = Icons[name]; if (!icon) return null;
  return (<svg width={size} height={size} viewBox="0 0 20 20" fill={color} style={{ flexShrink: 0 }}><path fillRule="evenodd" d={icon} clipRule="evenodd" /></svg>);
});

const VerifiedBadge = React.memo(({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="#38BDF8" style={{ flexShrink: 0, filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.5))' }}><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
));

const isVerified = (user) => { if (!user) return false; if (user.status !== 'active') return false; if (!user.referralToken) return false; return true; };
const BREAKPOINT = 900;
const sectionHeader = { display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, padding: '16px 12px 8px 12px' };

// FIX-LAY9: "Add URLs" is now OWNER-ONLY.
const ALL_MENU_ITEMS = [
  { label: 'My Live Inbox', path: '/live-inbox', roles: ['owner', 'admin', 'user'], icon: 'users' },
  { label: 'My Trash', path: '/trash', roles: ['owner', 'admin', 'user'], icon: 'trash' },
];
const CAMPAIGN_ITEMS = [
  { label: 'Ready URLs', path: '/deployment', roles: ['owner', 'admin', 'user'], icon: 'package' },
  // FIX-LAY10: "Personal URLs" → "Custom URLs" (path renamed in App.jsx)
  { label: 'Custom URLs', path: '/custom-urls', roles: ['owner', 'admin', 'user'], icon: 'link' },
  { label: 'Add URLs', path: '/links-hub', roles: ['owner'], icon: 'zap' },  // ✅ OWNER-ONLY
];

const TOOLS_ITEMS = [
  { label: 'PayProof', path: '/payproof', roles: ['owner', 'admin', 'user'], icon: 'payproof' },
  { label: 'Meeting Proof', path: '/meeting-proof', roles: ['owner', 'admin', 'user'], icon: 'meeting' },
  { label: 'FaceTime Proof', path: '/facetime-proof', roles: ['owner', 'admin', 'user'], icon: 'facetime' },
];

export default function Layout() {
  const { user, logout, linksVersion, isConnected } = useAuth();
  const navigate = useNavigate(); const location = useLocation();
  const [menuItems, setMenuItems] = useState([]); const [showDropdown, setShowDropdown] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth); const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > BREAKPOINT);
  const [openGroups, setOpenGroups] = useState({}); const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const particlesLoadedRef = useRef(false);
  const wasMobileRef = useRef(window.innerWidth < BREAKPOINT);
  const isMobile = windowWidth < BREAKPOINT; const isCompact = windowWidth < 1100 && windowWidth >= BREAKPOINT;
  const sidebarW = !isMobile ? (sidebarOpen ? Math.min(240, Math.floor(windowWidth * 0.18)) : 60) : 0; const verified = isVerified(user);
  const isOwner = user?.role === 'owner';
  const isAdmin = user?.role === 'admin';
  const userTrackingCode = user?.trackingCode || '';

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const nowMobile = w < BREAKPOINT;
      setWindowWidth(w);
      if (wasMobileRef.current && !nowMobile) setSidebarOpen(true);
      wasMobileRef.current = nowMobile;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { const handleClick = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); }; document.addEventListener('mousedown', handleClick); return () => document.removeEventListener('mousedown', handleClick); }, []);

  useEffect(() => {
    if (particlesLoadedRef.current) return;
    particlesLoadedRef.current = true;
    const initParticles = () => {
      if (window.particlesJS && document.getElementById('particles-js')) {
        try {
          window.particlesJS("particles-js", { particles: { number: { value: 50 }, color: { value: "#38BDF8" }, shape: { type: "circle" }, opacity: { value: 0.7 }, size: { value: 3 }, line_linked: { enable: true, distance: 150, color: "#38BDF8", opacity: 0.3, width: 1 }, move: { enable: true, speed: 0.5 } }, interactivity: { detect_on: "canvas", events: { onhover: { enable: false }, onclick: { enable: false }, resize: true } }, retina_detect: false });
        } catch (_) {}
      }
    };
    if (window.particlesJS) { initParticles(); return; }
    const existing = document.querySelector('script[data-particles-js]');
    if (existing) { existing.addEventListener('load', initParticles, { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js";
    script.async = true;
    script.setAttribute('data-particles-js', '1');
    script.onload = initParticles;
    document.body.appendChild(script);
  }, []);

  const handleLogout = useCallback(() => {
    setShowDropdown(false);
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleNavClick = useCallback((item) => {
    startTransition(() => { navigate(item.path); });
    setMobileMenuOpen(false);
  }, [navigate]);

  const handleNavHover = useCallback((item) => {
    try { if (typeof preloadPage === 'function') preloadPage(item.path); } catch (_) {}
  }, []);

  const isActive = useCallback((path) => location.pathname === path, [location.pathname]);

  const groupedItems = useMemo(() => { const g = {}; menuItems.forEach(item => { if (item.groupId && item.buttonName !== '_group_') { if (!g[item.groupId]) g[item.groupId] = { groupName: item.groupName || item.groupId, buttons: [] }; g[item.groupId].buttons.push(item); } }); return g; }, [menuItems]);
  const groupKeys = useMemo(() => Object.keys(groupedItems), [groupedItems]);
  const toggleGroup = useCallback((groupId) => setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] })), []);

  const filteredMenuItems = useMemo(() => ALL_MENU_ITEMS.filter(n => n.roles.includes(user?.role)), [user?.role]);
  const filteredCampaignItems = useMemo(() => CAMPAIGN_ITEMS.filter(n => n.roles.includes(user?.role)), [user?.role]);
  const filteredToolsItems = useMemo(() => TOOLS_ITEMS.filter(n => n.roles.includes(user?.role)), [user?.role]);

  // FIX-LAY8: Users Hub visible to owner + admin
  const profileDropdownItems = useMemo(() => [
    { label: 'Users Hub', path: '/users', icon: 'userGroup', roles: ['owner', 'admin'] },
  ].filter(n => n.roles.includes(user?.role)), [user?.role]);

  // FIX-LAY8: 3-tier role badge
  const getRoleBadge = () => {
    if (user?.role === 'owner') return { label: 'Owner', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    if (user?.role === 'admin') return { label: 'Admin', bg: 'rgba(168,85,247,0.15)', color: '#a855f7' };
    return { label: 'User', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
  };
  const roleBadge = useMemo(() => getRoleBadge(), [user?.role]);

  const renderMenuItem = useCallback((item) => {
    const active = isActive(item.path);
    return (
      <div key={item.path} onClick={() => handleNavClick(item)} onMouseEnter={() => handleNavHover(item)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', margin: '2px 0', borderRadius: 8, cursor: 'pointer', background: active ? 'rgba(99,102,241,0.15)' : 'transparent', color: active ? '#fff' : '#CBD5E1', fontSize: 13, fontWeight: active ? 600 : 400, transition: 'all 0.2s ease' }}>
        <SidebarIcon name={item.icon} size={18} color={active ? '#fff' : '#94A3B8'} /><span>{item.label}</span>
      </div>
    );
  }, [isActive, handleNavClick, handleNavHover]);

  const handleGroupButtonClick = useCallback((button) => {
    setMobileMenuOpen(false);
    startTransition(() => { navigate('/links-hub'); });
  }, [navigate]);

  const sidebarContent = useMemo(() => (
    <div style={{ minWidth: 240, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, boxShadow: '0 4px 12px rgba(99,102,241,0.3)', flexShrink: 0 }}>M</div>
        <div><div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Mega Tools</div><div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginTop: 1 }}>Visitor Management System</div></div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        <div style={sectionHeader}>Main</div>
        {filteredMenuItems.map(item => renderMenuItem(item))}
        <div style={sectionHeader}>Campaign URL</div>
        {filteredCampaignItems.map(item => renderMenuItem(item))}
        <div style={sectionHeader}>Tools</div>
        {filteredToolsItems.map(item => renderMenuItem(item))}
        {groupKeys.length > 0 && groupKeys.map(gk => (
          <div key={gk} style={{ marginTop: 2 }}>
            <div onClick={() => toggleGroup(gk)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '2px 0', borderRadius: 8, cursor: 'pointer', color: '#CBD5E1', fontSize: 13, fontWeight: 500 }}>
              <SidebarIcon name="folder" size={16} color="#94A3B8" /><span>{groupedItems[gk].groupName}</span>
              <span style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: openGroups[gk] ? 'rotate(180deg)' : 'rotate(0deg)' }}><SidebarIcon name="chevronDown" size={14} color="#64748B" /></span>
            </div>
            {openGroups[gk] && (
              <div style={{ paddingLeft: 18 }}>
                {groupedItems[gk].buttons.filter(b => b.buttonName).map(b => (
                  <div key={b._id} onClick={() => handleGroupButtonClick(b)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '1px 0', borderRadius: 6, cursor: 'pointer', color: '#94A3B8', fontSize: 12 }}>↳ {b.buttonName}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  ), [filteredMenuItems, filteredCampaignItems, filteredToolsItems, groupedItems, groupKeys, openGroups, toggleGroup, renderMenuItem, handleGroupButtonClick]);

  const iconSidebarContent = useMemo(() => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', paddingTop: 56 }}>
      {filteredMenuItems.map(item => (
        <div key={item.path} onClick={() => handleNavClick(item)} onMouseEnter={() => handleNavHover(item)} title={item.label} style={{ padding: '11px 0', cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'center', opacity: isActive(item.path) ? 1 : 0.6 }}>
          <SidebarIcon name={item.icon} size={20} color={isActive(item.path) ? '#818cf8' : '#94A3B8'} />
        </div>
      ))}
    </div>
  ), [filteredMenuItems, handleNavClick, handleNavHover, isActive]);

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      <div id="particles-js" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.35 }} />
      {!isMobile && (
        <div style={{ width: sidebarW, background: '#1E293B', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'fixed', top: 0, left: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', transition: 'width 0.3s ease', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
          {sidebarOpen ? sidebarContent : iconSidebarContent}
        </div>
      )}
      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex' }}>
          <div style={{ width: 280, background: '#1E293B', overflowY: 'auto', height: '100vh' }}>{sidebarContent}</div>
          <div onClick={() => setMobileMenuOpen(false)} style={{ flex: 1 }} />
        </div>
      )}
      {!isMobile && (
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ position: 'fixed', top: 18, left: sidebarOpen ? (sidebarW - 14) : 46, zIndex: 110, background: '#334155', border: '1px solid #475569', color: '#CBD5E1', borderRadius: '50%', cursor: 'pointer', fontSize: 11, transition: 'left 0.3s ease, all 0.2s ease', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <span style={{ transform: sidebarOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s ease', lineHeight: 1 }}>◀</span>
        </button>
      )}
      <div style={{ marginLeft: isMobile ? 0 : sidebarW, flex: 1, display: 'flex', flexDirection: 'column', height: '100%', transition: 'margin-left 0.3s ease', minWidth: 0, background: 'transparent', position: 'relative', zIndex: 1 }}>
        <header style={{ background: 'var(--bg-secondary)', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 50, height: 64, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {isMobile && <button onClick={() => setMobileMenuOpen(true)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: '4px 8px' }}>☰</button>}
            <span style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC' }}>Dashboard</span>
            <span style={{ padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: roleBadge.bg, color: roleBadge.color }}>{roleBadge.label}</span>
            {verified && <VerifiedBadge size={20} />}
            <span title={isConnected ? 'Connected' : 'Disconnected'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: isConnected ? '#22c55e' : '#ef4444' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444', boxShadow: `0 0 6px ${isConnected ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'}` }} />
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <div onClick={() => setShowDropdown(!showDropdown)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 14px', borderRadius: 10, background: '#1E293B', border: '1px solid #334155', transition: 'all 0.2s ease' }}>
                {user?.profilePic ? (
                  <img src={user.profilePic} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155', flexShrink: 0, boxShadow: '0 2px 8px rgba(99,102,241,0.4)' }} onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0, boxShadow: '0 2px 8px rgba(99,102,241,0.4)' }}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</div>
                )}
                {!isMobile && !isCompact && <span style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600 }}>{user?.name || 'User'}</span>}
                <SidebarIcon name="chevronDown" size={14} color="#94A3B8" />
              </div>
              {showDropdown && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: '#1E293B', border: '1px solid #334155', borderRadius: 10, padding: 6, minWidth: 200, zIndex: 200, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px 6px', fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {user?.profilePic ? <img src={user.profilePic} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</div>}
                    <div><div style={{ fontSize: 12, color: '#F8FAFC', fontWeight: 600 }}>{user?.name || 'User'}</div><div style={{ fontSize: 10, opacity: 0.7 }}>{user?.email || 'Signed In'}</div></div>
                  </div>
                  <div style={{ height: 1, background: '#334155', margin: '4px 8px' }} />
                  {profileDropdownItems.map((item) => (
                    <div key={item.path} onClick={() => { navigate(item.path); setShowDropdown(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderRadius: 6, color: '#F8FAFC', fontSize: 13 }}>
                      <SidebarIcon name={item.icon} size={16} color="#94A3B8" /><span>{item.label}</span>
                    </div>
                  ))}
                  <div style={{ height: 1, background: '#334155', margin: '4px 8px' }} />
                  <div onClick={() => { navigate('/settings'); setShowDropdown(false); }} style={{ padding: '10px 14px', cursor: 'pointer', borderRadius: 6, color: '#F8FAFC', fontSize: 13 }}>My Account</div>
                  <div style={{ height: 1, background: '#334155', margin: '4px 8px' }} />
                  <div onClick={handleLogout} style={{ padding: '10px 14px', cursor: 'pointer', borderRadius: 6, color: '#ef4444', fontSize: 13, fontWeight: 600 }}>Sign Out</div>
                </div>
              )}
            </div>
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}