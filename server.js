const http = require('http');
const url = require('url');
const handler = require('./api/index');

const PORT = process.env.PORT || 7001;

const server = http.createServer((req, res) => {
  // Simule le comportement de Vercel rewrites :
  // Vercel fait /:path* → /api/index?path=:path*
  // Ici on met le path dans req.query.path pour que api/index.js fonctionne pareil
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  // Fusionner les query params existants avec path
  req.query = {
    ...parsed.query,
    path: pathname.replace(/^\//, ''),
  };

  handler(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║     🇮🇳 Einthusan Stremio Addon — v1.1.0          ║
╠═══════════════════════════════════════════════════╣
║  Configure : http://localhost:${PORT}/configure        ║
║  Fonctionne sur : Render / Railway / Koyeb       ║
╚═══════════════════════════════════════════════════╝
  `);
});
