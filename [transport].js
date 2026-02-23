const { buildAddon, buildManifest, decodeCredentials } = require('../src/addon');
const { getInterface } = require('stremio-addon-sdk');

// Cache des addons instanciés par utilisateur
const addonCache = {};

function getAddon(encoded) {
  if (!addonCache[encoded]) {
    addonCache[encoded] = buildAddon(encoded);
  }
  return addonCache[encoded];
}

module.exports = async (req, res) => {
  // CORS — nécessaire pour Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = req.url;
  const parts = url.split('/').filter(Boolean);

  // ── Route: GET / → page d'accueil
  if (parts.length === 0 || url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<script>window.location.href='/configure'</script>`);
    return;
  }

  // ── Route: GET /configure → page de configuration
  if (parts[0] === 'configure') {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '../configure/index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
    return;
  }

  // ── Route: GET /{encoded}/manifest.json
  // ── Route: GET /{encoded}/catalog/...
  // ── Route: GET /{encoded}/meta/...
  // ── Route: GET /{encoded}/stream/...
  const encoded = parts[0];

  // Vérifie que c'est un base64 valide avec des credentials
  try {
    decodeCredentials(encoded);
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Identifiants invalides. Utilisez /configure pour générer votre URL.' }));
    return;
  }

  const addonPath = '/' + parts.slice(1).join('/');

  try {
    const addon = getAddon(encoded);

    // Simule une requête vers le SDK Stremio
    const mockReq = { url: addonPath, method: 'GET' };
    const mockRes = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(data) { res.end(data); },
    };

    // Laisse le SDK gérer la requête
    addon.middleware(mockReq, mockRes, () => {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Route non trouvée' }));
    });
  } catch (e) {
    console.error('[Handler] Erreur:', e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
