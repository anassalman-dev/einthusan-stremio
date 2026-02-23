const path = require('path');
const fs = require('fs');
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
    const htmlPath = path.join(__dirname, '../configure/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
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
      if (!id.startsWith('einthusan:')) {
        res.statusCode = 200;
        res.end(JSON.stringify({ meta: null }));
        return;
      }
      const [, movieId, lang] = id.split(':');
      const data = await getMovieMeta(email, password, movieId, lang);
      res.statusCode = 200;
      res.end(JSON.stringify({
        meta: {
          id, type: 'movie',
          name: data.title,
          poster: data.poster,
          background: data.poster,
          description: data.description,
          ...(data.year && { year: data.year }),
          ...(data.cast && data.cast.length > 0 && { cast: data.cast }),
        }
      }));
      return;
    }

    // stream
    const streamMatch = addonPath.match(/^\/stream\/movie\/([^/]+)\.json$/);
    if (streamMatch) {
      const id = streamMatch[1];
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

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Route non trouvée', path: addonPath }));

  } catch (e) {
    console.error('[Handler] Erreur:', e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
