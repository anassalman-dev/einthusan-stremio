// Serveur local pour tester avant de déployer sur Vercel
const { buildAddon } = require('./src/addon');
const { serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7001;

// Page de configuration
app.get('/configure', (req, res) => {
  res.sendFile(path.join(__dirname, 'configure/index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/configure');
});

// Routes addon /{encoded}/...
app.use('/:encoded', (req, res, next) => {
  const { encoded } = req.params;

  // Ignore les routes spéciales
  if (encoded === 'configure' || encoded === 'favicon.ico') return next();

  try {
    const { decodeCredentials } = require('./src/addon');
    decodeCredentials(encoded);
  } catch (e) {
    return res.status(400).json({ error: 'Identifiants invalides. Allez sur /configure' });
  }

  const addon = buildAddon(encoded);
  req.url = req.url.replace(`/${encoded}`, '') || '/';
  addon.middleware(req, res, next);
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║        Einthusan Stremio Addon — v1.0.0           ║
╠═══════════════════════════════════════════════════╣
║  Page de config : http://localhost:${PORT}/configure  ║
║  (Entrez vos identifiants pour générer votre URL) ║
╚═══════════════════════════════════════════════════╝
  `);
});
