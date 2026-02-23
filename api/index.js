const path = require('path');
const fs = require('fs');
const { buildAddon, decodeCredentials } = require('../src/addon');

// Cache des addons par utilisateur
const addonCache = {};

function getAddon(encoded) {
  if (!addonCache[encoded]) {
    addonCache[encoded] = buildAddon(encoded);
  }
  return addonCache[encoded];
}

module.exports = async (req, res) => {
  // CORS obligatoire pour Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const url = req.url || '/';
  const parts = url.split('/').filter(Boolean);

  console.log(`[Request] ${req.method} ${url}`);

  // ── Route: / → redirect configure
  if (parts.length === 0) {
    res.setHeader('Location', '/configure');
    res.statusCode = 302;
    res.end();
    return;
  }

  // ── Route: /configure → page HTML de configuration
  if (parts[0] === 'configure') {
    try {
      const htmlPath = path.join(__dirname, '../configure/index.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(html);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Erreur: ' + e.message);
    }
    return;
  }

  // ── Route: /{encoded}/manifest.json et autres routes addon
  const encoded = parts[0];

  // Vérifie credentials
  let credentials;
  try {
    credentials = decodeCredentials(encoded);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Identifiants invalides.',
      help: 'Allez sur /configure pour générer votre URL personnalisée.'
    }));
    return;
  }

  // Reconstruit le chemin sans le prefix encoded
  const addonPath = '/' + parts.slice(1).join('/');
  console.log(`[Addon] user=${credentials.email} path=${addonPath}`);

  try {
    const addon = getAddon(encoded);

    // Passe la requête au middleware Stremio SDK
    const fakeReq = Object.assign({}, req, { url: addonPath });

    addon.middleware(fakeReq, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Route non trouvée', path: addonPath }));
    });
  } catch (e) {
    console.error('[Handler] Erreur:', e.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e.message }));
  }
};
