// ============================================================
// MEGA TOOLS — CLIENT UTILITY HELPERS (v1.1)
// FIX-H1 (v1.1): timeAgo — null-safe on invalid date strings.
// FIX-H2 (v1.1): copyToClipboard — fallback to execCommand for
//                non-HTTPS/localhost contexts (WhatsApp-style embeds).
// FIX-H3 (v1.1): loadFromStorage — safe when JSON.parse throws
//                (corrupt localStorage from older versions).
// FIX-H4 (v1.1): getVisitorUrl — properly encodes tracking code so
//                special characters do not break URLs.
// ============================================================

// ---- Date ----
export function timeAgo(date) {
  if (!date) return '—';
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return '—'; // FIX-H1
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 0) return 'Just now';
  if (diff < 10) return 'Just now';
  if (diff < 60) return diff + 's ago';
  const m = Math.floor(diff / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  const w = Math.floor(d / 7);
  if (w < 4) return w + 'w ago';
  return Math.floor(d / 30) + 'mo ago';
}

export function formatDate(date) {
  if (!date) return '—';
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date) {
  if (!date) return '—';
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return '—';
  return new Date(date).toLocaleString();
}

// ---- URL ----
export function cleanUrl(url) {
  if (!url) return '';
  return url.split('#')[0].split('?')[0].replace(/\/$/, '');
}

export function getVisitorUrl(baseUrl, trackingCode, baseCode) {
  const base = cleanUrl(baseUrl);
  const tc = trackingCode ? encodeURIComponent(String(trackingCode)) : ''; // FIX-H4
  const code = baseCode ? '_' + encodeURIComponent(String(baseCode)) : '';
  if (!tc && !code) return base;
  return base + '/' + tc + code;
}

// ---- Storage ----
export function loadFromStorage(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null && stored !== 'undefined') {
      try { return JSON.parse(stored); } catch (_) { return defaultValue; } // FIX-H3
    }
  } catch (e) {
    // Ignore
  }
  return defaultValue;
}

export function saveToStorage(key, value) {
  try {
    if (value !== undefined && value !== null) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    // Ignore
  }
}

// ---- Copy ----
// FIX-H2: fallback for insecure contexts
export async function copyToClipboard(text) {
  const str = String(text ?? '');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (e) {}
  // Fallback: hidden textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    return ok === true;
  } catch (e) {
    return false;
  }
}

// ---- ID ----
export function generateId(prefix = '') {
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// ---- Object ----
export function pickFields(obj, fields) {
  const result = {};
  fields.forEach(f => {
    if (obj && obj[f] !== undefined) result[f] = obj[f];
  });
  return result;
}

// ---- Validation ----
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

export function isValidBDPhone(phone) {
  return /^01[0-9]{9}$/.test(phone || '');
}

// ---- Color ----
const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export function getInitials(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

// ---- Device Detection ----
export function getOSIcon(browser) {
  const ua = (browser || '').toLowerCase();
  if (ua.includes('win')) return 'ic_win_sys';
  if (ua.includes('linux') || ua.includes('x11')) return 'ic_lin_sys';
  if (ua.includes('android')) return 'ic_and_mob';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('mac')) return 'ic_apl_mob';
  return 'ic_all_sys';
}

export function getBrowserIcon(browser) {
  const ua = (browser || '').toLowerCase();
  if (ua.includes('edg')) return 'ic_edg_web';
  if (ua.includes('chrome') && !ua.includes('edg')) return 'ic_chr_web';
  if (ua.includes('firefox')) return 'ic_fox_web';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'ic_saf_web';
  return 'ic_all_web';
}

export function getEmailIcon(email) {
  if (!email) return null;
  const m = email.toLowerCase();
  if (m.includes('@gmail')) return 'ic_gml_mail';
  if (m.includes('@yahoo')) return 'ic_yah_mail';
  if (m.includes('@outlook') || m.includes('@hotmail') || m.includes('@live')) return 'ic_out_mail';
  if (m.includes('@proton')) return 'ic_pro_mail';
  if (m.includes('@icloud') || m.includes('@me.com') || m.includes('@mac.com')) return 'ic_icl_mail';
  return 'ic_all_mail';
}