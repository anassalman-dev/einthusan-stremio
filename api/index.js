const { buildManifest, decodeCredentials } = require('../src/addon');
const { browseLatest, browsePopular, search, getMovieMeta, getStreamUrl } = require('../src/einthusan');

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
        res.end(JSON.stringify({ streams: [{ url: streamUrl, title: '▶ HD', name: 'Einthusan' }] }));
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
