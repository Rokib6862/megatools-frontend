import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Layout - Always loaded
import Layout from './components/layout/Layout';

// Pages - Lazy loaded
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LiveInboxPage = lazy(() => import('./pages/LiveInboxPage'));
const QuickLinksPage = lazy(() => import('./pages/QuickLinksPage'));
const MessageLinksPage = lazy(() => import('./pages/MessageLinksPage'));
const LinksHubPage = lazy(() => import('./pages/LinksHubPage'));
const DeploymentPage = lazy(() => import('./pages/DeploymentPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const TrashPage = lazy(() => import('./pages/TrashPage'));
// FIX-APP2 (v1.4 — CUSTOM-URLS RENAME): PersonalLinksPage → CustomLinksPage
const CustomLinksPage = lazy(() => import('./pages/CustomLinksPage'));

// NEW ISOLATED SERVICES
const PayProofPage = lazy(() => import('./pages/PayProofPage'));
const MeetingProofPage = lazy(() => import('./pages/MeetingProofPage'));
const FaceTimeProofPage = lazy(() => import('./pages/FaceTimeProofPage'));

// ============================================================
// PRELOAD STRATEGY — Hover-এ chunk download করে রাখে
// ============================================================

const pageImportMap = {
  '/live-inbox': () => import('./pages/LiveInboxPage'),
  '/quick-links': () => import('./pages/QuickLinksPage'),
  '/message-links': () => import('./pages/MessageLinksPage'),
  '/links-hub': () => import('./pages/LinksHubPage'),
  '/deployment': () => import('./pages/DeploymentPage'),
  '/settings': () => import('./pages/SettingsPage'),
  '/users': () => import('./pages/UserManagementPage'),
  '/trash': () => import('./pages/TrashPage'),
  // FIX-APP2: /personal-links → /custom-urls
  '/custom-urls': () => import('./pages/CustomLinksPage'),
  '/payproof': () => import('./pages/PayProofPage'),
  '/meeting-proof': () => import('./pages/MeetingProofPage'),
  '/facetime-proof': () => import('./pages/FaceTimeProofPage'),
};

export function preloadPage(path) {
  const loader = pageImportMap[path];
  if (loader) {
    loader().catch(() => {});
  }
}

// ============================================================
// COMPACT INLINE LOADER
// ============================================================

const InlineLoader = React.memo(() => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 }}>
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>M</div>
    <div style={{ color: '#58a6ff', fontSize: 13, fontWeight: 600 }}>Loading...</div>
  </div>
));

// ============================================================
// ROUTE GUARDS
// ============================================================

const ProtectedRoute = React.memo(({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <InlineLoader />;
  return user ? children : <Navigate to="/login" replace />;
});

const OwnerRoute = React.memo(({ children }) => {
  const { user } = useAuth();
  return user?.role === 'owner' ? children : <Navigate to="/live-inbox" replace />;
});

// FIX-APP1 (v1.3 — 3-TIER): owner OR admin route guard
const AdminOrOwnerRoute = React.memo(({ children }) => {
  const { user } = useAuth();
  return (user?.role === 'owner' || user?.role === 'admin')
    ? children
    : <Navigate to="/live-inbox" replace />;
});

const Lazy = React.memo(({ children }) => <Suspense fallback={<InlineLoader />}>{children}</Suspense>);

const NotFoundPage = React.memo(() => (
  <div style={{ textAlign: 'center', padding: 80, color: '#8b949e' }}>
    <h1 style={{ fontSize: 60, color: '#58a6ff', marginBottom: 10 }}>404</h1>
    <p style={{ fontSize: 16, marginBottom: 20 }}>Page not found</p>
    <a href="/" style={{ color: '#58a6ff', textDecoration: 'none', fontSize: 14 }}>Back to Dashboard</a>
  </div>
));

// ============================================================
// STABLE ROUTE ELEMENTS
// FIX-APP1: 3-tier guards — /links-hub, /quick-links, /message-links, /users → AdminOrOwner
// FIX-APP2: CustomUrlsElement replaces PersonalLinksElement
// ============================================================

const LoginElement = <Lazy><LoginPage /></Lazy>;
const LiveInboxElement = <Lazy><LiveInboxPage /></Lazy>;
const TrashElement = <Lazy><TrashPage /></Lazy>;
const LinksHubElement = <Lazy><AdminOrOwnerRoute><LinksHubPage /></AdminOrOwnerRoute></Lazy>;
const CustomUrlsElement = <Lazy><CustomLinksPage /></Lazy>;
const QuickLinksElement = <Lazy><AdminOrOwnerRoute><QuickLinksPage /></AdminOrOwnerRoute></Lazy>;
const MessageLinksElement = <Lazy><AdminOrOwnerRoute><MessageLinksPage /></AdminOrOwnerRoute></Lazy>;
const DeploymentElement = <Lazy><DeploymentPage /></Lazy>;
const SettingsElement = <Lazy><SettingsPage /></Lazy>;
const UsersElement = <Lazy><AdminOrOwnerRoute><UserManagementPage /></AdminOrOwnerRoute></Lazy>;

// NEW ISOLATED SERVICE ELEMENTS
const PayProofElement = <Lazy><PayProofPage /></Lazy>;
const MeetingProofElement = <Lazy><MeetingProofPage /></Lazy>;
const FaceTimeProofElement = <Lazy><FaceTimeProofPage /></Lazy>;

const NotFoundElement = <NotFoundPage />;
const ProtectedLayout = <ProtectedRoute><Layout /></ProtectedRoute>;

// ============================================================
// APP ROUTES
// ============================================================

export default function App() {
  return (
    <Routes>
      <Route path="/login/:username" element={LoginElement} />
      <Route path="/login" element={LoginElement} />

      <Route path="/" element={ProtectedLayout}>
        <Route index element={LiveInboxElement} />
        <Route path="live-inbox" element={LiveInboxElement} />
        <Route path="trash" element={TrashElement} />
        <Route path="links-hub" element={LinksHubElement} />
        {/* FIX-APP2: personal-links → custom-urls */}
        <Route path="custom-urls" element={CustomUrlsElement} />
        <Route path="quick-links" element={QuickLinksElement} />
        <Route path="message-links" element={MessageLinksElement} />
        <Route path="deployment" element={DeploymentElement} />
        <Route path="settings" element={SettingsElement} />
        <Route path="users" element={UsersElement} />

        {/* ISOLATED SERVICES — no connection to any other module */}
        <Route path="payproof" element={PayProofElement} />
        <Route path="meeting-proof" element={MeetingProofElement} />
        <Route path="facetime-proof" element={FaceTimeProofElement} />

        <Route path="*" element={NotFoundElement} />
      </Route>
    </Routes>
  );
}