import axios from 'axios';

// ============================================================
// API CLIENT — Enterprise v2.5
// - Cross-origin cookies (production-safe)
// - Retry for network errors / 5xx / 429 (rate-limit) with backoff
// - 401 silent reject (AuthContext handles user state)
// - Clean unified interceptor (no dead code)
// FIX-API1..API10: retained from v2.4
// FIX-API11 (v2.5 — 429 EXPONENTIAL BACKOFF):
//   - On HTTP 429, retry up to 3 times with exponential delay
//     (300ms → 600ms → 1200ms), respecting `Retry-After` when
//     the server supplies it. Prevents the browser from hammering
//     a rate-limited endpoint and cascading into logout.
// FIX-API12 (v2.5 — RETRY-AFTER SUPPORT):
//   - Reads Retry-After (seconds or HTTP date) and waits that
//     duration, capped at 10s, before the next attempt.
// FIX-API13 (v2.5 — JITTER):
//   - Adds 0–300ms random jitter to every retry delay to avoid
//     thundering-herd when many tabs recover simultaneously.
// FIX-API14 (v2.5 — RATE-LIMIT FLAG):
//   - Sets `error.__rateLimited = true` on 429 so AuthContext /
//     UI can show a user-facing "please wait" message instead of
//     logging out.
// FIX-API15 (v2.5 — 5xx JITTER):
//   - Existing 5xx retry now also applies jitter (was immediate).
// ============================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const PUBLIC_URL_PREFIXES = ['/data', '/webhook', '/redirect', '/health', '/inbox-health'];

function isPublicUrl(url) {
  if (!url) return false;
  const path = String(url).startsWith('http') ? new URL(url).pathname : String(url);
  return PUBLIC_URL_PREFIXES.some((p) => path.startsWith(p) || path.startsWith('/api' + p));
}

// FIX-API8: debug header is OPT-IN, disabled by default
function isDebugHeadersEnabled() {
  try {
    return localStorage.getItem('megatools_debug_headers') === '1';
  } catch (_) {
    return false;
  }
}

// FIX-API11..13: helpers for retry/backoff
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_5XX_RETRIES = 1;
const MAX_DELAY_MS = 10000;

function jitter(ms) {
  return Math.max(0, ms + Math.floor(Math.random() * 300));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, MAX_DELAY_MS);
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const diff = date - Date.now();
    if (diff > 0) return Math.min(diff, MAX_DELAY_MS);
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true, // default; per-request override below
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
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
          config.headers['X-Request-Id'] =
            'rq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
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
// RESPONSE INTERCEPTOR (v2.5 — with rate-limit backoff)
// ============================================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const status = error.response?.status || 0;

    // 401 → silent reject — AuthContext handles user state.
    if (status === 401) {
      try {
        error.__silent401 = true;
      } catch (_) {}
      return Promise.reject(error);
    }

    // If the caller aborted, do NOT retry
    if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
      return Promise.reject(error);
    }

    // ============================================================
    // FIX-API11/12/13/14: 429 — exponential backoff + Retry-After
    // ============================================================
    if (status === 429) {
      try {
        error.__rateLimited = true;
      } catch (_) {}
      const attempt = config._rateRetry || 0;

      if (attempt >= MAX_RATE_LIMIT_RETRIES) {
        return Promise.reject(error);
      }

      const retryAfterHeader =
        error.response?.headers?.['retry-after'] || error.response?.headers?.['Retry-After'];
      const serverDelay = parseRetryAfter(retryAfterHeader);
      const backoff = serverDelay ?? Math.min(300 * Math.pow(2, attempt), MAX_DELAY_MS);
      const delay = jitter(backoff);

      try {
        if (typeof window !== 'undefined' && window.console) {
          console.warn(
            `[api] 429 rate-limited → retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES} in ${delay}ms`,
            config.url || ''
          );
        }
      } catch (_) {}

      await sleep(delay);
      config._rateRetry = attempt + 1;
      config._retry = true;
      try {
        return await api(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    // Already retried (non-429 retry) → reject
    if (config._retry) {
      return Promise.reject(error);
    }

    // FIX-API1 + FIX-API6: retry on network errors OR 5xx
    const isNetworkError =
      !error.response &&
      (error.code === 'ERR_NETWORK' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === undefined) &&
      error.code !== 'ECONNABORTED';
    const isServerError = status >= 500 && status < 600;
    if (isNetworkError || isServerError) {
      config._retry = true;
      if (error.__signal) config.signal = error.__signal;

      // FIX-API15: small jitter on 5xx retry too
      await sleep(jitter(200));

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
