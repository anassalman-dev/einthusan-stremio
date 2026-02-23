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

  let poster = $('meta[property="og:image"]').attr('content') || '';
  if (poster.startsWith('//')) poster = 'https:' + poster;

  const description = $('meta[property="og:description"]').attr('content') ||
                      $('p.synopsis').first().text().trim() || '';

  // Année — essaye plusieurs emplacements
  let year = null;
  const yearCandidates = [
    $('div.info p').first().text(),
    $('div.block2 div.info').text(),
    $('p.info').first().text(),
    $('[itemprop="dateCreated"]').text(),
    html.match(/<p>\s*((?:19|20)\d{2})\s*<span/)?.[1] || '',
  ];
  for (const txt of yearCandidates) {
    const m = txt.match(/\b(19|20)\d{2}\b/);
    if (m) { year = parseInt(m[0]); break; }
  }

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
// Stratégie en cascade :
//   1. AJAX POST /ajax/premium/movie/watch/{id}/ (avec CSRF)
//   2. Cherche m3u8 dans le HTML/JS de la page premium
//   3. Essaye les liens /raw/ (Chromecast)
//   4. Cherche dans la page film normale
//   5. Fallback → null (le caller retournera un lien externe)
// ─────────────────────────────────────────────────────────────

// Helper : extraire une URL m3u8/mp4 signée depuis n'importe quel texte
function extractM3u8(text) {
  if (!text) return null;
  const str = typeof text === 'object' ? JSON.stringify(text) : String(text);

  const patterns = [
    /(https?:\/\/cdn\d*\.einthusan\.io\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i,
    /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i,
    /(https?:\/\/cdn\d*\.einthusan\.io\/[^\s"'<>\\]+\.mp4\?[^\s"'<>\\]*e=\d[^\s"'<>\\]*)/i,
  ];

  for (const pat of patterns) {
    const m = str.match(pat);
    if (m) {
      let url = m[1].replace(/&amp;/g, '&').replace(/['">}\]]+$/, '');
      return fixStreamUrl(url);
    }
  }
  return null;
}

// Helper : convertir IP directe → cdn1.einthusan.io + ajouter &p=priority
function fixStreamUrl(url) {
  if (!url) return url;
  // Remplacer les IPs directes par cdn1.einthusan.io
  url = url.replace(/https?:\/\/\d+\.\d+\.\d+\.\d+\//, 'https://cdn1.einthusan.io/');
  // S'assurer que le domaine est bien en https
  if (url.startsWith('http://cdn')) {
    url = url.replace('http://', 'https://');
  }
  // Ajouter &p=priority si absent
  if (!url.includes('p=priority')) {
    url += (url.includes('?') ? '&' : '?') + 'p=priority';
  }
  return url;
}

async function getStreamUrl(email, password, movieId, lang) {
  const cookies = await login(email, password);
  const cookieStr = cookiesToString(cookies);

  // ── Étape préliminaire : charger la page premium → rafraîchir CSRF ──
  const watchUrl = `${BASE_URL}/premium/movie/watch/${movieId}/?lang=${lang}`;
  console.log(`[Stream] Chargement page premium: ${watchUrl}`);

  let premiumHtml = '';
  let freshCookies = [...cookies]; // copie pour ne pas polluer le cache

  try {
    const pageRes = await axios.get(watchUrl, {
      headers: {
        ...DEFAULT_HEADERS,
        'Cookie': cookieStr,
        'Referer': `${BASE_URL}/movie/watch/${movieId}/?lang=${lang}`,
      },
      maxRedirects: 5,
      validateStatus: s => s < 500,
    });

    premiumHtml = pageRes.data || '';
    console.log(`[Stream] Page premium: status=${pageRes.status}, length=${premiumHtml.length}`);

    // Met à jour les cookies (le _gorilla_csrf peut être rafraîchi à chaque page)
    const newCookies = parseCookies(pageRes.headers['set-cookie']);
    for (const nc of newCookies) {
      const idx = freshCookies.findIndex(c => c.name === nc.name);
      if (idx >= 0) freshCookies[idx] = nc;
      else freshCookies.push(nc);
    }
  } catch (err) {
    console.error(`[Stream] Erreur page premium: ${err.message}`);
  }

  const freshCookieStr = cookiesToString(freshCookies);

  // ── Méthode 1 : AJAX POST avec CSRF token ──────────────────────────
  const csrfCookie = freshCookies.find(c => c.name === '_gorilla_csrf');

  if (csrfCookie) {
    // Collecte les tokens CSRF candidats (cookie brut, décodé, HTML)
    const csrfCandidates = [csrfCookie.value];

    try {
      const decoded = decodeURIComponent(csrfCookie.value);
      if (decoded !== csrfCookie.value) csrfCandidates.push(decoded);
    } catch (e) { /* ignore */ }

    if (premiumHtml) {
      const $p = cheerio.load(premiumHtml);
      const metaCsrf = $p('meta[name="csrf-token"]').attr('content')
        || $p('input[name="csrfmiddlewaretoken"]').val();
      if (metaCsrf) csrfCandidates.push(metaCsrf);

      const jsMatch = premiumHtml.match(/csrf[_-]?token['":\s]+['"]([^'"]+)/i);
      if (jsMatch) csrfCandidates.push(jsMatch[1]);
    }

    const uniqueTokens = [...new Set(csrfCandidates)];
    console.log(`[Stream] CSRF candidats: ${uniqueTokens.length} token(s)`);

    for (const token of uniqueTokens) {
      try {
        console.log(`[Stream] → AJAX POST avec CSRF: ${token.substring(0, 30)}...`);

        const ajaxRes = await axios.post(
          `${BASE_URL}/ajax/premium/movie/watch/${movieId}/?lang=${lang}`,
          '', // body vide
          {
            headers: {
              ...DEFAULT_HEADERS,
              'X-Requested-With': 'XMLHttpRequest',
              'X-CSRFToken': token,
              'Cookie': freshCookieStr,
              'Referer': watchUrl,
              'Origin': BASE_URL,
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
            maxRedirects: 0,
            validateStatus: s => s < 500,
            timeout: 15000,
          }
        );

        console.log(`[Stream] AJAX réponse: status=${ajaxRes.status}, length=${String(ajaxRes.data).length}`);

        if (ajaxRes.status === 403) {
          console.log(`[Stream] 403 avec ce token, essai suivant…`);
          continue;
        }

        const url = extractM3u8(ajaxRes.data);
        if (url) {
          console.log(`[Stream] ✅ m3u8 via AJAX: ${url.substring(0, 80)}…`);
          return url;
        }

        // Debug : afficher un extrait de la réponse
        const snippet = typeof ajaxRes.data === 'string'
          ? ajaxRes.data.substring(0, 300)
          : JSON.stringify(ajaxRes.data).substring(0, 300);
        console.log(`[Stream] AJAX réponse (extrait): ${snippet}`);

      } catch (err) {
        console.error(`[Stream] AJAX erreur: ${err.message}`);
      }
    }
  } else {
    console.warn(`[Stream] ⚠️ Pas de cookie _gorilla_csrf`);
  }

  // ── Méthode 2 : m3u8 dans le HTML de la page premium ──────────────
  if (premiumHtml) {
    const urlFromHtml = extractM3u8(premiumHtml);
    if (urlFromHtml) {
      console.log(`[Stream] ✅ m3u8 dans HTML premium: ${urlFromHtml.substring(0, 80)}…`);
      return urlFromHtml;
    }
  }

  // ── Méthode 3 : liens /raw/ (Chromecast) ──────────────────────────
  if (premiumHtml) {
    const $ = cheerio.load(premiumHtml);

    let rawUrl = null;

    // 3a : liens <a> vers /raw/
    $('a[href*="/raw/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) { rawUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`; return false; }
    });

    // 3b : /raw/ dans les scripts inline
    if (!rawUrl) {
      const rawMatch = premiumHtml.match(/['"]([^'"]*\/raw\/\?l=[^'"]+)['"]/);
      if (rawMatch) rawUrl = rawMatch[1].startsWith('http') ? rawMatch[1] : `${BASE_URL}${rawMatch[1]}`;
    }

    // 3c : /raw/ n'importe où dans le HTML
    if (!rawUrl) {
      const rawBrut = premiumHtml.match(/https?:\/\/[^\s"']*\/raw\/\?l=[^\s"']+/);
      if (rawBrut) rawUrl = rawBrut[0];
    }

    if (rawUrl) {
      console.log(`[Stream] Trouvé /raw/ URL: ${rawUrl.substring(0, 80)}…`);
      try {
        const lParam = new URL(rawUrl).searchParams.get('l');
        if (lParam) {
          const decoded = decodeURIComponent(lParam);
          console.log(`[Stream] ✅ m3u8 via /raw/: ${decoded.substring(0, 80)}…`);
          return decoded;
        }
      } catch (e) {
        const lSplit = rawUrl.split('?l=')[1];
        if (lSplit) return decodeURIComponent(lSplit);
      }
    }
  }

  // ── Méthode 4 : page film normale (/movie/watch/) ─────────────────
  try {
    const normalUrl = `${BASE_URL}/movie/watch/${movieId}/?lang=${lang}`;
    const normalHtml = await fetchPage(normalUrl, freshCookies);
    const urlFromNormal = extractM3u8(normalHtml);
    if (urlFromNormal) {
      console.log(`[Stream] ✅ m3u8 via page normale: ${urlFromNormal.substring(0, 80)}…`);
      return urlFromNormal;
    }
  } catch (err) {
    console.error(`[Stream] Erreur page normale: ${err.message}`);
  }

  // ── Échec total ────────────────────────────────────────────────────
  const cdnIdx = premiumHtml.indexOf('einthusan.io');
  console.warn(`[Stream] ⚠️ Toutes les méthodes ont échoué pour ${movieId} — cdn dans HTML: ${cdnIdx >= 0 ? 'oui' : 'non'}`);
  return null;
}

module.exports = { login, cookiesToString, browseLatest, browsePopular, search, getMovieMeta, getStreamUrl };
