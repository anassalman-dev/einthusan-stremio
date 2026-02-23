const { addonBuilder } = require('stremio-addon-sdk');
const { browseLatest, browsePopular, search, getMovieMeta, getStreamUrl } = require('./einthusan');

const LANGUAGES = [
  { id: 'tamil',     name: 'Tamil' },
  { id: 'hindi',     name: 'Hindi' },
  { id: 'telugu',    name: 'Telugu' },
  { id: 'malayalam', name: 'Malayalam' },
  { id: 'kannada',   name: 'Kannada' },
  { id: 'bengali',   name: 'Bengali' },
  { id: 'marathi',   name: 'Marathi' },
  { id: 'punjabi',   name: 'Punjabi' },
];

const TIME_FILTERS = [
  { id: 'tw', name: 'Cette semaine' },
  { id: 'td', name: "Aujourd'hui" },
  { id: 'tm', name: 'Ce mois-ci' },
];

function buildManifest(encoded) {
  const catalogs = [];

  LANGUAGES.forEach(lang => {
    // Catalog 1 : À la une (7 films, pas de pagination)
    catalogs.push({
      type: 'movie',
      id: `einthusan-top-${lang.id}`,
      name: `🔥 ${lang.name} — À la une`,
      extra: [],
    });

    // Catalog 2 : Populaires avec filtres + recherche
    catalogs.push({
      type: 'movie',
      id: `einthusan-popular-${lang.id}`,
      name: `📈 ${lang.name} — Populaires`,
      extra: [
        {
          name: 'genre',
          options: TIME_FILTERS.map(t => t.name),
          isRequired: false,
        },
        { name: 'skip', isRequired: false },
      ],
    });
  });

  return {
    id: `community.einthusan.${encoded}`,
    version: '1.0.0',
    name: 'Einthusan',
    description: 'Films indiens HD — Tamil, Hindi, Telugu, Malayalam et plus',
    logo: 'https://einthusan.tv/static/img/einthusan_logo.png',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie'],
    catalogs,
    idPrefixes: ['einthusan:'],
    behaviorHints: { configurable: true },
  };
}

function decodeCredentials(encoded) {
  try {
    // Ajoute le padding base64 si nécessaire (supprimé dans l'URL)
    const padded = encoded + '==='.slice((encoded.length + 3) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const [email, ...passParts] = decoded.split(':');
    const password = passParts.join(':');
    if (!email || !password) throw new Error('Invalid credentials');
    return { email, password };
  } catch (e) {
    throw new Error('Identifiants invalides');
  }
}

function getTimeParam(genreFilter) {
  if (!genreFilter) return 'tw';
  const found = TIME_FILTERS.find(t => t.name === genreFilter);
  return found ? found.id : 'tw';
}

function buildAddon(encoded) {
  const { email, password } = decodeCredentials(encoded);
  const manifest = buildManifest(encoded);
  const builder = new addonBuilder(manifest);

  // ── CATALOG ──────────────────────────────────────────────
  builder.defineCatalogHandler(async ({ type, id, extra }) => {
    if (type !== 'movie') return { metas: [] };

    try {
      // À la une
      const topMatch = id.match(/^einthusan-top-(\w+)$/);
      if (topMatch) {
        const lang = topMatch[1];
        console.log(`[Catalog] À la une — ${lang}`);
        const metas = await browseLatest(email, password, lang);
        return { metas };
      }

      // Populaires
      const popMatch = id.match(/^einthusan-popular-(\w+)$/);
      if (popMatch) {
        const lang = popMatch[1];
        const skip = parseInt(extra.skip) || 0;
        const page = Math.floor(skip / 20) + 1;

        // Recherche
        if (extra.search) {
          console.log(`[Catalog] Recherche "${extra.search}" — ${lang}`);
          const metas = await search(email, password, lang, extra.search);
          return { metas };
        }

        // Filtre popularité
        const tp = getTimeParam(extra.genre);
        console.log(`[Catalog] Populaires ${tp} — ${lang} p${page}`);
        const metas = await browsePopular(email, password, lang, tp, page);
        return { metas };
      }

      return { metas: [] };
    } catch (e) {
      console.error('[Catalog] Erreur:', e.message);
      return { metas: [] };
    }
  });

  // ── META ─────────────────────────────────────────────────
  builder.defineMetaHandler(async ({ type, id }) => {
    if (type !== 'movie' || !id.startsWith('einthusan:')) return { meta: null };

    try {
      const [, movieId, lang] = id.split(':');
      console.log(`[Meta] ${movieId} — ${lang}`);
      const data = await getMovieMeta(email, password, movieId, lang);

      return {
        meta: {
          id,
          type: 'movie',
          name: data.title,
          poster: data.poster,
          background: data.poster,
          description: data.description,
          ...(data.year && { year: data.year }),
          ...(data.cast.length > 0 && { cast: data.cast }),
        },
      };
    } catch (e) {
      console.error('[Meta] Erreur:', e.message);
      return { meta: null };
    }
  });

  // ── STREAM ───────────────────────────────────────────────
  builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== 'movie' || !id.startsWith('einthusan:')) return { streams: [] };

    try {
      const [, movieId, lang] = id.split(':');
      console.log(`[Stream] ${movieId} — ${lang}`);
      const streamUrl = await getStreamUrl(email, password, movieId, lang);

      if (!streamUrl) {
        return {
          streams: [{
            externalUrl: `https://einthusan.tv/premium/movie/watch/${movieId}/?lang=${lang}`,
            title: '🌐 Ouvrir dans le navigateur',
            name: 'Einthusan Web',
          }],
        };
      }

      return {
        streams: [{
          url: streamUrl,
          title: '▶ HD',
          name: 'Einthusan',
          behaviorHints: { notWebReady: false },
        }],
      };
    } catch (e) {
      console.error('[Stream] Erreur:', e.message);
      return { streams: [] };
    }
  });

  return builder.getInterface();
}

module.exports = { buildAddon, buildManifest, decodeCredentials };
