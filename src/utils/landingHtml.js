// ============================================================
// MEGA TOOLS — LANDING PAGE HTML GENERATOR (Shared) v3.0
// - Dynamic API URL (no hardcoded localhost)
// - FingerprintJS + sessionStorage for visitor ID
// ============================================================

// Resolve API base from environment / window origin
function resolveApiBase() {
  // 1. Vite env (primary for production)
  try {
    const envUrl = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL;
    if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '');
  } catch {}

  if (typeof window === 'undefined') return '';

  const host = window.location.origin || '';
  const hostname = window.location.hostname || '';
  const port = window.location.port || '';

  // 2. Local dev — dev server on 5173/5174/3000 → backend on 5000
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return 'http://localhost:5000';
  }

  // 3. Same host, custom dev port
  if (port && port !== '80' && port !== '443') {
    return host.replace(':' + port, ':5000');
  }

  // 4. Production fallback — same origin (backend behind reverse proxy)
  return host;
}

export function generateLandingHtml(link, userTrackingCode, mode = 'loading') {
  const name = link.name || 'Landing Page';
  const baseUrl = (link.baseUrl || '').replace(/\/$/, '');
  const slug = link.baseCode || link.slug || '';
  const tk = userTrackingCode;
  const mainLink = baseUrl + '/' + tk + '_' + slug;
  const apiBase = resolveApiBase();

  if (mode === 'iframe') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${name}</title>
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; background: #0F172A; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe src="${mainLink}" allow="clipboard-write"></iframe>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${name}</title>
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
    .spinner { width: 48px; height: 48px; border: 3px solid rgba(0,0,0,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js"></script>
</head>
<body>
  <div class="spinner"></div>
  <script>
    (function() {
      var API = ${JSON.stringify(apiBase)};
      var TK = ${JSON.stringify(tk + '_' + slug)};
      var TARGET = ${JSON.stringify(mainLink)};

      var sessionID = sessionStorage.getItem('_vid');

      function startApp(VID) {
        sessionStorage.setItem('_vid', VID);

        function forceNavigate(url) {
          if (!url) return;
          var sep = url.indexOf('?') === -1 ? '?' : '&';
          window.location.href = url + sep + '_fc=' + Date.now();
        }

        var s = document.createElement('script');
        s.src = API + '/socket.io/socket.io.js';
        s.onload = function() {
          var socket = io(API, { transports: ['websocket', 'polling'] });
          var lastSeq = 0;

          socket.on('connect', function() {
            socket.emit('session_init', { visitorId: VID, trackingCode: TK });
            socket.emit('joinRoom', TK);
          });

          socket.on('session_command', function(cmd) {
            if (!cmd) return;
            if (cmd.visitorId && cmd.visitorId !== VID) return;
            if (cmd.seq && cmd.seq <= lastSeq) return;
            if (cmd.seq) lastSeq = cmd.seq;
            if (cmd.url && (cmd.action === 'navigate' || cmd.action === 'navigate+message')) {
              forceNavigate(cmd.url);
            }
          });

          socket.on('nav_update', function(d) { if (d && d.targetUrl) forceNavigate(d.targetUrl); });
          socket.on('redirect', function(d) { if (d && d.url) forceNavigate(d.url); });
          socket.on('msg_push', function(d) { if (d && d.targetUrl) forceNavigate(d.targetUrl); });
          socket.on('connect_error', function() { window.location.href = TARGET; });

          fetch(API + '/api/webhook/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trackingCode: TK, visitorId: VID, source: 'landing_page',
              metadata: { browser: navigator.userAgent, device: /Mobi/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop', screen: screen.width + 'x' + screen.height, url: window.location.href, referrer: document.referrer || 'direct', timestamp: new Date().toISOString() }
            })
          }).catch(function() {});

          setInterval(function() {
            fetch(API + '/api/data/heartbeat', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ visitorId: VID, trackingCode: TK, status: 'Active' })
            }).catch(function() {});
          }, 10000);

          window.addEventListener('beforeunload', function() {
            try {
              fetch(API + '/api/data/heartbeat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitorId: VID, trackingCode: TK, status: 'Offline' })
              });
            } catch (e) {}
          });

          setTimeout(function() { window.location.href = TARGET; }, 2000);
        };
        s.onerror = function() { window.location.href = TARGET; };
        document.head.appendChild(s);
      }

      if (sessionID) {
        startApp(sessionID);
      } else {
        if (typeof FingerprintJS === 'undefined') {
          var fallbackID = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          return startApp(fallbackID);
        }
        FingerprintJS.load().then(function(fp) {
          return fp.get();
        }).then(function(result) {
          var fpID = 'fp_' + result.visitorId.substring(0, 16);
          startApp(fpID);
        }).catch(function() {
          var fallbackID = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          startApp(fallbackID);
        });
      }
    })();
  </script>
</body>
</html>`;
}