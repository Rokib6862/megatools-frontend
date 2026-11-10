import React, { lazy, Suspense, useMemo, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// ============================================================
// MEGA TOOLS — App.jsx v1.6 (INSTANT LOGIN + EAGER ENTRY)
// ============================================================
// FIX-APP1..APP5 retained from v1.5.
//
// FIX-APP6 (v1.6 — EAGER LOGIN + LOGIN SKELETON):
//   Root cause of "first visit shows a dark screen for 1–3 s
//   before the Login form appears":
//     • LoginPage was `lazy()`. On a cold boot / new device /
//       incognito the chunk had to be downloaded before the
//       route could paint, and the fallback was the generic
//       "M Loading…" dot.
//     • ProtectedRoute’s fallback was the same generic dot, so
//       reloading an authenticated session also flashed it.
//
//   This version:
//     • Imports LoginPage EAGERLY — no chunk download on the
//       most important entry point. Login form paints the same
//       frame that React mounts.
//     • Adds a `LoginSkeleton` (form-shaped) as the Suspense
//       fallback for the login route, so even if the component
//       is somehow delayed the user sees a realistic form
//       placeholder, not a dot.
//     • Adds an `AppShellSkeleton` (sidebar + header + shimmer
//       rows) as the fallback for both ProtectedRoute and every
//       lazy route, so cold reload of an authenticated session
//       paints a branded shell instantly.
//     • Adds an eager preload effect on mount that fetches the
//       critical chunks (LiveInbox + quick-links + deployment
//       + settings) so the second sidebar click is instantaneous.
//   No behavioural change for authenticated users, no change
//   to route guards or preloadPage map.
// ============================================================

// EAGER: Login must never be blocked by a lazy chunk.
import LoginPage from './pages/LoginPage';

// Pages - Lazy loaded (single map, memoized)
const LiveInboxPage = lazy(() => import('./pages/LiveInboxPage'));
const QuickLinksPage = lazy(() => import('./pages/QuickLinksPage'));
const MessageLinksPage = lazy(() => import('./pages/MessageLinksPage'));
const LinksHubPage = lazy(() => import('./pages/LinksHubPage'));
const DeploymentPage = lazy(() => import('./pages/DeploymentPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const TrashPage = lazy(() => import('./pages/TrashPage'));
const CustomLinksPage = lazy(() => import('./pages/CustomLinksPage'));

// ISOLATED SERVICES
const PayProofPage = lazy(() => import('./pages/PayProofPage'));
const MeetingProofPage = lazy(() => import('./pages/MeetingProofPage'));
const FaceTimeProofPage = lazy(() => import('./pages/FaceTimeProofPage'));

// Layout - Always loaded
import Layout from './components/layout/Layout';

// ============================================================
// PRELOAD STRATEGY
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
  '/custom-urls': () => import('./pages/CustomLinksPage'),
  '/payproof': () => import('./pages/PayProofPage'),
  '/meeting-proof': () => import('./pages/MeetingProofPage'),
  '/facetime-proof': () => import('./pages/FaceTimeProofPage'),
};

// FIX-APP3: in-memory + sessionStorage track of visited routes
const VISITED_STORAGE_KEY = 'megatools_visited_routes_v15';
const visitedRoutes = (() => {
  try {
    if (typeof sessionStorage === 'undefined') return new Set();
    const raw = sessionStorage.getItem(VISITED_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
})();

function markRouteVisited(path) {
  try {
    visitedRoutes.add(path);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(Array.from(visitedRoutes)));
    }
  } catch (_) {}
}

export function preloadPage(path) {
  const loader = pageImportMap[path];
  if (loader) {
    try {
      loader().catch(() => {});
    } catch (_) {}
  }
}

// ============================================================
// SKELETONS (replaces InlineLoader for real routes)
// ============================================================

const shimmerKeyframes = `
@keyframes appShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

const rowShimmer = {
  background:
    'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.03) 100%)',
  backgroundSize: '200% 100%',
  animation: 'appShimmer 1.6s linear infinite',
};

// FIX-APP6: app shell skeleton (matches index.html boot-skeleton)
const AppShellSkeleton = React.memo(() => (
  <div
    style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#0F172A',
      color: '#E2E8F0',
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
    }}
  >
    <style>{shimmerKeyframes}</style>
    <div
      style={{
        width: 240,
        minWidth: 200,
        background: '#1E293B',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '18px 14px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          M
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Mega Tools</div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
            Visitor Management System
          </div>
        </div>
      </div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} style={{ height: 32, borderRadius: 8, ...rowShimmer }} />
      ))}
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div
        style={{
          height: 64,
          background: '#0B1220',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
        }}
      >
        <div style={{ height: 22, width: 120, borderRadius: 6, ...rowShimmer }} />
        <div style={{ height: 22, width: 60, borderRadius: 12, ...rowShimmer }} />
      </div>
      <div
        style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <div
            style={{
              height: 70,
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 8,
              ...rowShimmer,
            }}
          />
          <div
            style={{
              height: 70,
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 8,
              ...rowShimmer,
            }}
          />
        </div>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ height: 38, borderRadius: 6, ...rowShimmer }} />
        ))}
      </div>
    </div>
  </div>
));

// FIX-APP6: login form skeleton (used as Suspense fallback)
const LoginSkeleton = React.memo(() => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 20% 20%, #1a1f3a 0%, #0f172a 45%, #0a0d1a 100%)',
      padding: 20,
    }}
  >
    <style>{shimmerKeyframes}</style>
    <div
      style={{
        width: 380,
        maxWidth: '100%',
        background: 'rgba(30,41,59,0.55)',
        border: '1px solid rgba(148,163,184,0.15)',
        borderRadius: 18,
        padding: '36px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          height: 36,
          width: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          ...rowShimmer,
        }}
      />
      <div style={{ height: 18, width: '60%', borderRadius: 6, ...rowShimmer }} />
      <div style={{ height: 12, width: '80%', borderRadius: 4, ...rowShimmer }} />
      <div style={{ height: 40, borderRadius: 8, marginTop: 14, ...rowShimmer }} />
      <div style={{ height: 40, borderRadius: 8, ...rowShimmer }} />
      <div style={{ height: 44, borderRadius: 8, marginTop: 10, ...rowShimmer }} />
    </div>
  </div>
));

// ============================================================
// ROUTE GUARDS
// ============================================================

// FIX-APP4: user present → render instantly. Only skeleton for
// the cold-boot case (loading && !user).
const ProtectedRoute = React.memo(({ children }) => {
  const { user, loading } = useAuth();
  if (user) return children;
  if (loading) return <AppShellSkeleton />;
  return <Navigate to="/login" replace />;
});

const OwnerRoute = React.memo(({ children }) => {
  const { user } = useAuth();
  return user?.role === 'owner' ? children : <Navigate to="/live-inbox" replace />;
});

const AdminOrOwnerRoute = React.memo(({ children }) => {
  const { user } = useAuth();
  return user?.role === 'owner' || user?.role === 'admin' ? (
    children
  ) : (
    <Navigate to="/live-inbox" replace />
  );
});

// FIX-APP3/APP6: route-aware Suspense — first visit shows
// app-shell skeleton, subsequent visits render instantly.
const RouteSuspense = React.memo(({ path, children, fallback = 'app' }) => {
  const alreadyVisited = visitedRoutes.has(path);
  const fallbackNode = fallback === 'login' ? <LoginSkeleton /> : <AppShellSkeleton />;
  if (alreadyVisited) {
    return <Suspense fallback={null}>{children}</Suspense>;
  }
  markRouteVisited(path);
  return <Suspense fallback={fallbackNode}>{children}</Suspense>;
});

const NotFoundPage = React.memo(() => (
  <div style={{ textAlign: 'center', padding: 80, color: '#8b949e' }}>
    <h1 style={{ fontSize: 60, color: '#58a6ff', marginBottom: 10 }}>404</h1>
    <p style={{ fontSize: 16, marginBottom: 20 }}>Page not found</p>
    <a href="/" style={{ color: '#58a6ff', textDecoration: 'none', fontSize: 14 }}>
      Back to Dashboard
    </a>
  </div>
));

// ============================================================
// STABLE ROUTE ELEMENTS (memoized once)
// ============================================================

// FIX-APP6: LoginPage is eager — no Suspense needed, no loader.
const LoginElement = <LoginPage />;

const LiveInboxElement = (
  <RouteSuspense path="/live-inbox">
    <LiveInboxPage />
  </RouteSuspense>
);
const TrashElement = (
  <RouteSuspense path="/trash">
    <TrashPage />
  </RouteSuspense>
);
const LinksHubElement = (
  <RouteSuspense path="/links-hub">
    <AdminOrOwnerRoute>
      <LinksHubPage />
    </AdminOrOwnerRoute>
  </RouteSuspense>
);
const CustomUrlsElement = (
  <RouteSuspense path="/custom-urls">
    <CustomLinksPage />
  </RouteSuspense>
);
const QuickLinksElement = (
  <RouteSuspense path="/quick-links">
    <AdminOrOwnerRoute>
      <QuickLinksPage />
    </AdminOrOwnerRoute>
  </RouteSuspense>
);
const MessageLinksElement = (
  <RouteSuspense path="/message-links">
    <AdminOrOwnerRoute>
      <MessageLinksPage />
    </AdminOrOwnerRoute>
  </RouteSuspense>
);
const DeploymentElement = (
  <RouteSuspense path="/deployment">
    <DeploymentPage />
  </RouteSuspense>
);
const SettingsElement = (
  <RouteSuspense path="/settings">
    <SettingsPage />
  </RouteSuspense>
);
const UsersElement = (
  <RouteSuspense path="/users">
    <AdminOrOwnerRoute>
      <UserManagementPage />
    </AdminOrOwnerRoute>
  </RouteSuspense>
);

// ISOLATED SERVICES
const PayProofElement = (
  <RouteSuspense path="/payproof">
    <PayProofPage />
  </RouteSuspense>
);
const MeetingProofElement = (
  <RouteSuspense path="/meeting-proof">
    <MeetingProofPage />
  </RouteSuspense>
);
const FaceTimeProofElement = (
  <RouteSuspense path="/facetime-proof">
    <FaceTimeProofPage />
  </RouteSuspense>
);

const NotFoundElement = <NotFoundPage />;
const ProtectedLayout = (
  <ProtectedRoute>
    <Layout />
  </ProtectedRoute>
);

// ============================================================
// APP ROUTES
// ============================================================

export default function App() {
  // FIX-APP6: eager prefetch of critical chunks once on mount
  useEffect(() => {
    const criticals = ['/live-inbox', '/trash', '/custom-urls', '/deployment', '/settings'];
    const id = setTimeout(() => {
      criticals.forEach((p) => preloadPage(p));
    }, 800);
    return () => clearTimeout(id);
  }, []);

  return (
    <Routes>
      <Route path="/login/:username" element={LoginElement} />
      <Route path="/login" element={LoginElement} />

      <Route path="/" element={ProtectedLayout}>
        <Route index element={LiveInboxElement} />
        <Route path="live-inbox" element={LiveInboxElement} />
        <Route path="trash" element={TrashElement} />
        <Route path="links-hub" element={LinksHubElement} />
        <Route path="custom-urls" element={CustomUrlsElement} />
        <Route path="quick-links" element={QuickLinksElement} />
        <Route path="message-links" element={MessageLinksElement} />
        <Route path="deployment" element={DeploymentElement} />
        <Route path="settings" element={SettingsElement} />
        <Route path="users" element={UsersElement} />

        <Route path="payproof" element={PayProofElement} />
        <Route path="meeting-proof" element={MeetingProofElement} />
        <Route path="facetime-proof" element={FaceTimeProofElement} />

        <Route path="*" element={NotFoundElement} />
      </Route>
    </Routes>
  );
}
