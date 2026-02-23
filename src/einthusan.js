const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://einthusan.tv';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// ─────────────────────────────────────────────────────────────
// SESSION CACHE (en mémoire, partagé entre les requêtes Vercel)
// ─────────────────────────────────────────────────────────────
const sessionCache = {};

function getCacheKey(email) {
  return `session_${email}`;
}

function getSession(email) {
  const key = getCacheKey(email);
  const session = sessionCache[key];
  if (!session) return null;
  // Expire après 2h30 pour être safe
  const AGE_LIMIT = 2.5 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt > AGE_LIMIT) {
    delete sessionCache[key];
    return null;
  }
  return session;
}

function saveSession(email, cookies) {
  sessionCache[getCacheKey(email)] = {
    cookies,
    createdAt: Date.now(),
  };
}

function cookiesToString(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return [];
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers.map(header => {
    const parts = header.split(';')[0].split('=');
    return { name: parts[0].trim(), value: parts.slice(1).join('=').trim() };
  }).filter(c => c.name && c.value);
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
async function login(email, password) {
  // Vérifie si session encore valide
  const existing = getSession(email);
  if (existing) return existing.cookies;

  console.log(`[Einthusan] Login pour ${email}...`);

  try {
    // Étape 1 : récupérer le token CSRF
    const initRes = await axios.get(`${BASE_URL}/account/login/?lang=tamil`, {
      headers: DEFAULT_HEADERS,
      maxRedirects: 5,
    });

    const initCookies = parseCookies(initRes.headers['set-cookie']);
    const $ = cheerio.load(initRes.data);
    const csrfToken = $('input[name="csrfmiddlewaretoken"]').val() ||
                      $('input[name="_token"]').val() || '';

    const cookieStr = cookiesToString(initCookies);

    // Étape 2 : POST login
    const loginRes = await axios.post(
      `${BASE_URL}/account/login/?lang=tamil`,
      new URLSearchParams({
        csrfmiddlewaretoken: csrfToken,
        email: email,
        password: password,
        next: '/',
      }).toString(),
      {
        headers: {
          ...DEFAULT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${BASE_URL}/account/login/?lang=tamil`,
          'Cookie': cookieStr,
        },
        maxRedirects: 5,
        validateStatus: s => s < 500,
      }
    );

    const loginCookies = [
      ...initCookies,
      ...parseCookies(loginRes.headers['set-cookie']),
    ];

    // Vérifie qu'on est bien connecté (cookie sid présent)
    const hasSid = loginCookies.some(c => c.name === 'sid');
    if (!hasSid) {
      throw new Error('Login échoué — vérifiez email/password');
    }

    saveSession(email, loginCookies);
    console.log(`[Einthusan] ✅ Connecté : ${email}`);
    return loginCookies;

  } catch (err) {
    console.error('[Einthusan] ❌ Erreur login:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────
async function fetchPage(url, cookies) {
  const res = await axios.get(url, {
    headers: {
      ...DEFAULT_HEADERS,
      'Cookie': cookiesToString(cookies),
      'Referer': BASE_URL,
    },
    timeout: 15000,
    maxRedirects: 5,
  });
  return res.data;
}

// ─────────────────────────────────────────────────────────────
// PARSER — liste de films
// ─────────────────────────────────────────────────────────────
function parseMovieList(html, defaultLang) {
  const $ = cheerio.load(html);
  const movies = [];

  $('li').each((i, el) => {
    try {
      const $li = $(el);

      const href = $li.find('div.block1 a[href*="/movie/watch/"], div.block1 a[href*="/premium/movie/watch/"]').attr('href') || '';
      const idMatch = href.match(/\/movie\/watch\/(\w+)/);
      if (!idMatch) return;
      const movieId = idMatch[1];

      const langMatch = href.match(/[?&]lang=([^&]+)/);
      const lang = langMatch ? langMatch[1] : defaultLang;

      let poster = $li.find('div.block1 img').attr('src') || '';
      if (poster.startsWith('//')) poster = 'https:' + poster;

      const title = $li.find('div.block2 a.title h3').text().trim() ||
                    $li.find('div.block2 h3').text().trim() ||
                    $li.find('h3').first().text().trim();

      if (!title || !movieId) return;

      movies.push({
        id: `einthusan:${movieId}:${lang}`,
        type: 'movie',
        name: title,
        poster,
      });
    } catch (e) { /* ignore */ }
  });

  return movies;
}

// ─────────────────────────────────────────────────────────────
// BROWSE — À la une (7 films)
// ─────────────────────────────────────────────────────────────
async function browseLatest(email, password, lang) {
  const cookies = await login(email, password);
  // /movie/browse/ charge en JS, on utilise /results/ à la place
  const url = `${BASE_URL}/movie/results/?find=Popularity&lang=${lang}&ptype=view&tp=td`;
  const html = await fetchPage(url, cookies);
  return parseMovieList(html, lang);
}

// ─────────────────────────────────────────────────────────────
// POPULAR — grand catalogue avec filtre temps
// tp = td (today) | tw (this week) | tm (this month)
// ─────────────────────────────────────────────────────────────
async function browsePopular(email, password, lang, tp = 'tw', page = 1) {
  const cookies = await login(email, password);
  const url = `${BASE_URL}/movie/results/?find=Popularity&lang=${lang}&ptype=view&tp=${tp}&page=${page}`;
  const html = await fetchPage(url, cookies);
  return parseMovieList(html, lang);
}

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────
async function search(email, password, lang, query) {
  const cookies = await login(email, password);
  const url = `${BASE_URL}/movie/results/?find=Search&lang=${lang}&query=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, cookies);
  return parseMovieList(html, lang);
}

// ─────────────────────────────────────────────────────────────
// META — détails d'un film
// ─────────────────────────────────────────────────────────────
async function getMovieMeta(email, password, movieId, lang) {
  const cookies = await login(email, password);
  const url = `${BASE_URL}/movie/watch/${movieId}/?lang=${lang}`;
  const html = await fetchPage(url, cookies);
  const $ = cheerio.load(html);

  const title       = $('h3[itemprop="name"]').text().trim() ||
                      $('div.block2 a.title h3').text().trim() ||
                      $('h1').first().text().trim() || movieId;
  const poster      = $('meta[property="og:image"]').attr('content') || '';
  const description = $('meta[property="og:description"]').attr('content') ||
                      $('p.synopsis').first().text().trim() || '';
  const yearText    = $('div.info p').first().text();
  const yearMatch   = yearText.match(/\b(19|20)\d{2}\b/);
  const year        = yearMatch ? parseInt(yearMatch[0]) : null;

  // Acteurs
  const cast = [];
  $('div.professionals .prof p').each((i, el) => {
    const name = $(el).text().trim();
    if (name) cast.push(name);
  });

  return { title, poster, description, year, cast };
}

// ─────────────────────────────────────────────────────────────
// STREAM — récupère l'URL m3u8
// ─────────────────────────────────────────────────────────────
async function getStreamUrl(email, password, movieId, lang) {
  const cookies = await login(email, password);

  // Charge la page premium
  const watchUrl = `${BASE_URL}/premium/movie/watch/${movieId}/?lang=${lang}`;
  const html = await fetchPage(watchUrl, cookies);
  const $ = cheerio.load(html);

  // Méthode 1 : cherche l'URL /raw/?l= dans les liens
  let rawUrl = null;
  $('a[href*="/raw/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('/raw/')) {
      rawUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      return false;
    }
  });

  // Méthode 2 : cherche dans les scripts
  if (!rawUrl) {
    $('script').each((i, el) => {
      const content = $(el).html() || '';
      const match = content.match(/['"](https?:\/\/[^'"]*\/raw\/\?l=[^'"]+)['"]/);
      if (match) { rawUrl = match[1]; return false; }
      // Cherche directement l'URL m3u8
      const m3u8Match = content.match(/['"](https?:\/\/cdn\d*\.einthusan\.io\/[^'"]+\.m3u8[^'"]*)['"]/);
      if (m3u8Match) { rawUrl = m3u8Match[1]; return false; }
    });
  }

  // Méthode 3 : cherche l'URL m3u8 directement dans le HTML (avec &amp;)
  if (!rawUrl) {
    // Pattern avec &amp; (HTML encodé)
    const m3u8Amp = html.match(/https?:\/\/cdn\d*\.einthusan\.io\/[^"'<\s]+\.m3u8[^"'<\s]*/);
    if (m3u8Amp) {
      rawUrl = m3u8Amp[0].replace(/&amp;/g, "&");
    }
  }
  
  // Méthode 4 : cherche dans le HTML brut pour /raw/
  if (!rawUrl) {
    const rawMatch = html.match(/https?:\/\/[^"'\s]*\/raw\/\?l=[^"'\s]+/);
    if (rawMatch) rawUrl = rawMatch[0];
  }

  if (!rawUrl) {
    // Log pour debug — affiche un extrait du HTML reçu
    const cdnIdx = html.indexOf('einthusan.io');
    console.warn(`[Einthusan] ⚠️ Pas d'URL stream pour ${movieId} — HTML length: ${html.length}, cdn found at: ${cdnIdx}`);
    if (cdnIdx > 0) console.warn('[Einthusan] Extrait HTML:', html.substring(cdnIdx - 20, cdnIdx + 200));
    return null;
  }

  // Si c'est une URL /raw/, on suit la redirection pour obtenir le vrai m3u8
  if (rawUrl.includes('/raw/')) {
    try {
      const redirectRes = await axios.get(rawUrl, {
        headers: { ...DEFAULT_HEADERS, 'Cookie': cookiesToString(cookies) },
        maxRedirects: 0,
        validateStatus: s => s < 400,
      });
      // La vraie URL est dans le paramètre ?l=
      const lParam = new URL(rawUrl).searchParams.get('l');
      if (lParam) return decodeURIComponent(lParam);
    } catch (e) {
      // Extrait le paramètre l= directement
      const lParam = rawUrl.split('?l=')[1];
      if (lParam) return decodeURIComponent(lParam);
    }
  }

  return rawUrl;
}

module.exports = { login, browseLatest, browsePopular, search, getMovieMeta, getStreamUrl };
