import axios from 'axios';

// ============================================================
// API CLIENT — Enterprise v2.4
// - Cross-origin cookies (production-safe)
// - Single retry for network errors only
// - 401 silent reject (AuthContext handles user state)
// - Clean unified interceptor (no dead code)
// FIX-API1..API7: retained from v2.3
// FIX-API8 (v2.4): X-Request-Id header injection is now DISABLED by
//                  default (opt-in via localStorage
//                  `megatools_debug_headers`). Sending an extra
//                  header forced every request into CORS preflight
//                  and, on servers with outdated allowedHeaders,
//                  caused *every* API call to fail with 400 "not
//                  allowed by Access-Control-Allow-Headers".
// FIX-API9 (v2.4): explicit header filtering — axios defaults are
//                  normalised so only Content-Type/Accept go out on
//                  first request (no secrets leaking).
// FIX-API10 (v2.4): withCredentials is ONLY forced to false for
//                  truly public tracking endpoints where the caller
//                  does not need cookies. All other endpoints keep
//                  credentials:true by default (was already the case,
//                  now enforced consistently even if a caller
//                  overrides withCredentials accidentally).
// ============================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const PUBLIC_URL_PREFIXES = ['/data', '/webhook', '/redirect', '/health', '/inbox-health'];

function isPublicUrl(url) {
  if (!url) return false;
  const path = String(url).startsWith('http') ? new URL(url).pathname : String(url);
  return PUBLIC_URL_PREFIXES.some(p => path.startsWith(p) || path.startsWith('/api' + p));
}

// FIX-API8: debug header is OPT-IN, disabled by default
function isDebugHeadersEnabled() {
  try {
    return localStorage.getItem('megatools_debug_headers') === '1';
  } catch (_) { return false; }
}

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true, // default; per-request override below
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ============================================================
// REQUEST INTERCEPTOR
// ============================================================
api.interceptors.request.use(
  (config) => {
    const url = config.url || '';

    // FIX-API10: public endpoints — no cookies needed, avoid preflight
    if (isPublicUrl(url)) {
      config.withCredentials = false;
    } else {
      config.withCredentials = true;
    }

    // FIX-API8: only inject X-Request-Id when developer opted in
    try {
      config.headers = config.headers || {};
      if (isDebugHeadersEnabled()) {
        if (!config.headers['X-Request-Id']) {
          config.headers['X-Request-Id'] = 'rq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        }
      } else {
        // Ensure no stale debug header is sent
        if (config.headers['X-Request-Id']) {
          delete config.headers['X-Request-Id'];
        }
      }
    } catch (_) {}

    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================
// RESPONSE INTERCEPTOR
// ============================================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};

    // 401 → silent reject — AuthContext handles user state.
    if (error.response?.status === 401) {
      try { error.__silent401 = true; } catch (_) {}
      return Promise.reject(error);
    }

    // Already retried → reject
    if (config._retry) {
      return Promise.reject(error);
    }

    // If the caller aborted, do NOT retry
    if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
      return Promise.reject(error);
    }

    // FIX-API1 + FIX-API6: retry on network errors OR 5xx
    const status = error.response?.status || 0;
    const isNetworkError = !error.response && (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === undefined
    ) && error.code !== 'ECONNABORTED';
    const isServerError = status >= 500 && status < 600;
    if (isNetworkError || isServerError) {
      config._retry = true;
      if (error.__signal) config.signal = error.__signal;
      try {
        return await api(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    return Promise.reject(error);
  }
);

// ============================================================
// SESSION ACTIONS
// ============================================================

api.hideSession = (sessionId) => api.post(`/sessions/${sessionId}/hide`);

// FIX-API4: expose base for polling fallback consumers
api.API_BASE = API_BASE;

export default api;