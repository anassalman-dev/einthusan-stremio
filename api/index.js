const { buildManifest, decodeCredentials } = require('../src/addon');
const { login, cookiesToString, browseLatest, browsePopular, search, getMovieMeta, getStreamUrl } = require('../src/einthusan');
const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Vercel passe le path dans req.query.path ou req.url
  let url;
  if (req.query && req.query.path) {
    url = "/" + req.query.path;
  } else {
    url = (req.url || "/").split("?")[0];
  }
  // Décoder les caractères URL-encodés (%3A → :, %2F → /, etc.)
  try { url = decodeURIComponent(url); } catch (e) { /* ignore */ }
  const parts = url.split('/').filter(Boolean);
  console.log(`[Request] ${req.method} ${url}`);

  if (parts.length === 0) {
    res.setHeader('Location', '/configure');
    res.statusCode = 302;
    res.end();
    return;
  }

  // /configure OU /{encoded}/configure
  if (parts[0] === 'configure' || parts[1] === 'configure') {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Einthusan — Stremio Addon</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f13;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .card {
      background: #1a1a24;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 480px;
      border: 1px solid #2a2a3a;
    }

    .logo {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo h1 {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
    }

    .logo p {
      color: #888;
      font-size: 14px;
      margin-top: 6px;
    }

    .flag { font-size: 32px; margin-bottom: 8px; }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #aaa;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    input {
      width: 100%;
      padding: 14px 16px;
      background: #0f0f13;
      border: 1px solid #2a2a3a;
      border-radius: 10px;
      color: #fff;
      font-size: 16px;
      margin-bottom: 20px;
      outline: none;
      transition: border-color 0.2s;
    }

    input:focus { border-color: #6c5ce7; }

    button {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #6c5ce7, #a29bfe);
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    button:hover { opacity: 0.9; }

    .result {
      display: none;
      margin-top: 28px;
      padding: 20px;
      background: #0f0f13;
      border-radius: 10px;
      border: 1px solid #2a2a3a;
    }

    .result h3 {
      font-size: 14px;
      color: #aaa;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .url-box {
      background: #1a1a24;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 12px;
      color: #a29bfe;
      word-break: break-all;
      margin-bottom: 12px;
      font-family: monospace;
    }

    .btn-install {
      display: block;
      text-align: center;
      padding: 14px;
      background: #00b894;
      border-radius: 10px;
      color: #fff;
      font-weight: 700;
      text-decoration: none;
      font-size: 15px;
      margin-bottom: 10px;
      transition: opacity 0.2s;
    }

    .btn-install:hover { opacity: 0.9; }

    .btn-copy {
      width: 100%;
      padding: 12px;
      background: #2a2a3a;
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-copy:hover { background: #3a3a4a; }

    .error {
      color: #ff7675;
      font-size: 13px;
      margin-top: -12px;
      margin-bottom: 16px;
      display: none;
    }

    .info {
      font-size: 12px;
      color: #666;
      text-align: center;
      margin-top: 20px;
      line-height: 1.6;
    }

    .info a { color: #a29bfe; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="flag">🇮🇳</div>
      <h1>Einthusan</h1>
      <p>Addon Stremio — Films indiens HD</p>
    </div>

    <div>
      <label>Email Einthusan</label>
      <input type="email" id="email" placeholder="votre@email.com" autocomplete="email">

      <label>Mot de passe</label>
      <input type="password" id="password" placeholder="••••••••" autocomplete="current-password">

      <p class="error" id="error">Veuillez remplir les deux champs.</p>

      <button onclick="generate()">🎬 Générer mon URL d'installation</button>
    </div>

    <div class="result" id="result">
      <h3>✅ Ton URL d'installation</h3>
      <div class="url-box" id="manifestUrl"></div>
      <a href="#" class="btn-install" id="installLink">
        📺 Installer dans Stremio
      </a>
      <button class="btn-copy" onclick="copyUrl()">📋 Copier l'URL</button>
    </div>

    <p class="info">
      Ton mot de passe n'est jamais stocké sur nos serveurs.<br>
      Il est encodé uniquement dans ton URL personnelle.<br>
      <a href="https://einthusan.tv" target="_blank">Créer un compte Einthusan →</a>
    </p>
  </div>

  <script>
    function generate() {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const error = document.getElementById('error');

      if (!email || !password) {
        error.style.display = 'block';
        return;
      }
      error.style.display = 'none';

      const encoded = btoa(\`\${email}:\${password}\`).replace(/=/g, '');
      const base = window.location.origin;
      const manifestUrl = \`\${base}/\${encoded}/manifest.json\`;
      const installUrl = \`stremio://\${base.replace(/^https?:\\/\\//, '')}/\${encoded}/manifest.json\`;

      document.getElementById('manifestUrl').textContent = manifestUrl;
      document.getElementById('installLink').href = installUrl;
      document.getElementById('result').style.display = 'block';
    }

    function copyUrl() {
      const url = document.getElementById('manifestUrl').textContent;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.btn-copy');
        btn.textContent = '✅ Copié !';
        setTimeout(() => btn.textContent = '📋 Copier l\\'URL', 2000);
      });
    }

    // Permettre la génération avec Entrée
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') generate();
    });
  </script>
</body>
</html>
`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 200;
    res.end(html);
    return;
  }

  const encoded = parts[0];
  let credentials;
  try {
    credentials = decodeCredentials(encoded);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Identifiants invalides. Allez sur /configure' }));
    return;
  }

  const { email, password } = credentials;
  const addonPath = '/' + parts.slice(1).join('/');

  // ── PROXY STREAM ─────────────────────────────────────────
  // Route: /{encoded}/proxy?url=ENCODED_STREAM_URL
  // Stremio appelle cette URL → on fetch le vrai stream avec les cookies Einthusan
  if (addonPath === '/proxy' || addonPath.startsWith('/proxy/')) {
    try {
      // Récupère l'URL du stream — Vercel la met dans req.query.url
      let urlParam = (req.query && req.query.url) ? req.query.url : null;
      
      if (!urlParam) {
        // Fallback: extraire depuis req.url
        const fullUrl = req.url || '';
        try {
          urlParam = new URL(`http://localhost${fullUrl}`).searchParams.get('url');
        } catch (e) { /* ignore */ }
      }
      
      if (!urlParam) {
        console.log(`[Proxy] ❌ Pas de param url. query keys: ${Object.keys(req.query || {})}`);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Missing url parameter');
        return;
      }

      const streamUrl = urlParam;
      console.log(`[Proxy] 📡 URL: ${streamUrl.substring(0, 100)}`);
      console.log(`[Proxy] 📡 Range header: ${req.headers.range || 'none'}`);

      // Login pour obtenir les cookies
      const cookies = await login(email, password);
      const cookieStr = cookiesToString(cookies);
      console.log(`[Proxy] 🔐 Cookies: sid=${cookies.some(c => c.name === 'sid') ? 'yes' : 'no'}`);

      const isM3u8 = streamUrl.includes('.m3u8');

      const proxyHeaders = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://einthusan.tv/',
        'Origin': 'https://einthusan.tv',
        'Cookie': cookieStr,
      };

      if (req.headers.range) {
        proxyHeaders['Range'] = req.headers.range;
      }

      console.log(`[Proxy] ⏳ Fetching from CDN...`);
      const proxyRes = await axios.get(streamUrl, {
        headers: proxyHeaders,
        responseType: isM3u8 ? 'text' : 'stream',
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: s => s < 500,
      });

      console.log(`[Proxy] ✅ CDN response: status=${proxyRes.status}, content-type=${proxyRes.headers['content-type'] || '?'}, content-length=${proxyRes.headers['content-length'] || '?'}`);

      // Headers de réponse
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

      const contentType = proxyRes.headers['content-type'];
      if (contentType) res.setHeader('Content-Type', contentType);
      const contentLength = proxyRes.headers['content-length'];
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = proxyRes.headers['content-range'];
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const acceptRanges = proxyRes.headers['accept-ranges'];
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      res.statusCode = proxyRes.status;

      if (isM3u8) {
        // m3u8 est du texte — réécrire les URLs des segments
        let m3u8Content = typeof proxyRes.data === 'string' ? proxyRes.data : String(proxyRes.data);
        
        console.log(`[Proxy] 📄 m3u8 content (${m3u8Content.length} chars): ${m3u8Content.substring(0, 200)}`);

        const baseStreamUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
        const proxyBase = `https://${req.headers.host}/${encoded}/proxy?url=`;

        // Réécrire les URLs absolues
        m3u8Content = m3u8Content.replace(/^(https?:\/\/[^\s]+)/gm, (match) => {
          if (match.startsWith('#')) return match;
          return proxyBase + encodeURIComponent(match);
        });
        // Réécrire les URLs relatives (.ts, .m3u8)
        m3u8Content = m3u8Content.replace(/^(?!#|https?:\/\/)([^\s]+\.(ts|m3u8)[^\s]*)/gm, (match) => {
          const fullSegUrl = match.startsWith('/') 
            ? new URL(match, streamUrl).href 
            : baseStreamUrl + match;
          return proxyBase + encodeURIComponent(fullSegUrl);
        });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.end(m3u8Content);
        console.log(`[Proxy] ✅ m3u8 envoyé (${m3u8Content.length} chars)`);
      } else {
        // Stream binaire — pipe directement
        proxyRes.data.pipe(res);
        proxyRes.data.on('end', () => console.log(`[Proxy] ✅ Stream pipe terminé`));
        proxyRes.data.on('error', (e) => console.error(`[Proxy] ❌ Pipe error: ${e.message}`));
      }

    } catch (err) {
      console.error(`[Proxy] ❌ Erreur: ${err.message}`);
      if (err.code) console.error(`[Proxy] Code: ${err.code}`);
      if (err.response) console.error(`[Proxy] Response status: ${err.response.status}`);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.end(`Proxy error: ${err.message}`);
    }
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    // manifest.json
    if (addonPath === '/manifest.json') {
      const manifest = buildManifest(encoded);
      res.statusCode = 200;
      res.end(JSON.stringify(manifest));
      return;
    }

    // catalog
    const catalogMatch = addonPath.match(/^\/catalog\/movie\/([^/]+?)(?:\/skip=(\d+))?\.json$/);
    if (catalogMatch) {
      const catalogId = catalogMatch[1];
      const skip = parseInt(catalogMatch[2] || '0');
      const page = Math.floor(skip / 20) + 1;
      const urlObj = new URL(`http://localhost${url}`);
      const searchQuery = urlObj.searchParams.get('search') || '';
      const genre = urlObj.searchParams.get('genre') || '';
      let metas = [];

      const topMatch = catalogId.match(/^einthusan-top-(\w+)$/);
      const popMatch = catalogId.match(/^einthusan-popular-(\w+)$/);

      if (topMatch) {
        metas = await browseLatest(email, password, topMatch[1]);
      } else if (popMatch) {
        const lang = popMatch[1];
        if (searchQuery) {
          metas = await search(email, password, lang, searchQuery);
        } else {
          const tpMap = { "Aujourd'hui": 'td', 'Cette semaine': 'tw', 'Ce mois-ci': 'tm' };
          const tp = tpMap[genre] || 'tw';
          metas = await browsePopular(email, password, lang, tp, page);
        }
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ metas }));
      return;
    }

    // meta
    const metaMatch = addonPath.match(/^\/meta\/movie\/([^/]+)\.json$/);
    if (metaMatch) {
      const id = metaMatch[1];
      console.log(`[Meta] Requête pour ID: ${id}`);
      if (!id.startsWith('einthusan:')) {
        res.statusCode = 200;
        res.end(JSON.stringify({ meta: null }));
        return;
      }
      const [, movieId, lang] = id.split(':');
      const data = await getMovieMeta(email, password, movieId, lang);
      const meta = {
        id,
        type: 'movie',
        name: data.title,
        poster: data.poster,
        background: data.poster,
        description: data.description,
      };
      if (data.year) {
        meta.year = data.year;
        meta.releaseInfo = String(data.year);
      }
      if (data.cast && data.cast.length > 0) {
        meta.cast = data.cast;
      }
      console.log(`[Meta] Réponse: ${data.title} (${data.year || '?'})`);
      res.statusCode = 200;
      res.end(JSON.stringify({ meta }));
      return;
    }

    // stream
    const streamMatch = addonPath.match(/^\/stream\/movie\/([^/]+)\.json$/);
    if (streamMatch) {
      const id = streamMatch[1];
      console.log(`[Stream] Requête pour ID: ${id}`);
      if (!id.startsWith('einthusan:')) {
        res.statusCode = 200;
        res.end(JSON.stringify({ streams: [] }));
        return;
      }
      const [, movieId, lang] = id.split(':');
      const streamUrl = await getStreamUrl(email, password, movieId, lang);
      res.statusCode = 200;
      if (streamUrl) {
        // Construire l'URL proxy pour que Stremio passe par notre serveur
        const host = req.headers.host || 'einthusan-stremio.vercel.app';
        const proxyUrl = `https://${host}/${encoded}/proxy?url=${encodeURIComponent(streamUrl)}`;

        const streams = [];

        // Stream via proxy (m3u8 avec cookies authentifiés)
        streams.push({
          url: proxyUrl,
          title: '▶ HD',
          name: 'Einthusan',
          behaviorHints: {
            notWebReady: false,
            bingeGroup: `einthusan-${lang}`,
          },
        });

        // Aussi le MP4 via proxy
        if (streamUrl.includes('.m3u8')) {
          const mp4Url = streamUrl.replace('.m3u8', '');
          const mp4ProxyUrl = `https://${host}/${encoded}/proxy?url=${encodeURIComponent(mp4Url)}`;
          streams.push({
            url: mp4ProxyUrl,
            title: '▶ HD (MP4)',
            name: 'Einthusan MP4',
            behaviorHints: {
              notWebReady: false,
              bingeGroup: `einthusan-${lang}`,
            },
          });
        }

        // Fallback navigateur
        streams.push({
          externalUrl: `https://einthusan.tv/premium/movie/watch/${movieId}/?lang=${lang}`,
          title: '🌐 Navigateur',
          name: 'Einthusan Web',
        });

        console.log(`[Stream] Retourne ${streams.length} stream(s) pour ${movieId}`);
        res.end(JSON.stringify({ streams }));
      } else {
        res.end(JSON.stringify({
          streams: [{
            externalUrl: `https://einthusan.tv/premium/movie/watch/${movieId}/?lang=${lang}`,
            title: '🌐 Ouvrir dans le navigateur',
            name: 'Einthusan Web',
          }]
        }));
      }
      return;
    }

    console.log(`[404] Route non trouvée: ${addonPath}`);
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Route non trouvée', path: addonPath }));

  } catch (e) {
    console.error('[Handler] Erreur:', e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
