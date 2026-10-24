/**
 * ==========================================================
 *  WHATSAPP WEB VERSION RESOLVER - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *  © POWERD BY LAKSHAN X MD </>
 * ==========================================================
 *
 *  WHY THIS FILE EXISTS
 *  --------------------
 *  WhatsApp refuses to complete a device link when the client
 *  announces an old WhatsApp Web build. The phone then shows:
 *
 *      "Couldn't link device - Something went wrong."
 *
 *  The pairing code is still produced, the socket still connects,
 *  but the server silently drops the pairing (pair-success never
 *  arrives), so the link always fails.
 *
 *  Baileys ships a HARD CODED version inside the package
 *  (lib/Defaults/baileys-version.json) and fetchLatestBaileysVersion()
 *  only reads that same file from GitHub - which is usually weeks or
 *  months behind. Using it is exactly what breaks pairing.
 *
 *  This resolver asks WhatsApp itself for the live web build and only
 *  falls back to weaker sources if that fails. The highest revision
 *  wins, the result is cached, refreshed in the background and
 *  remembered in the database so a restart never starts from a stale
 *  number.
 */
const axios = require('axios');
const config = require('../config');

/* Anything older than this is considered unusable for a fresh link. */
const MIN_ACCEPTABLE_REVISION = 1023223821;

/* Last-resort value if literally every source is unreachable. */
const EMERGENCY = [2, 3000, 1027934701];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;      // re-check every 6 hours
const REQ_TIMEOUT = 10000;

let cached = null;            // { version:[2,3000,n], source, at }
let inFlight = null;

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-fetch-site': 'none',
  'sec-fetch-mode': 'no-cors',
  'sec-fetch-dest': 'script',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

const revisionOf = (v) => (Array.isArray(v) ? Number(v[2]) || 0 : 0);
const fmt = (v) => (Array.isArray(v) ? v.join('.') : String(v));

function parseVersion(raw) {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length === 3) {
    const v = raw.map(Number);
    return v.every(n => Number.isFinite(n)) ? v : null;
  }
  const m = String(raw).match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/* ---------------- sources ---------------- */

/** The real thing: WhatsApp Web's own service worker carries the build id. */
async function fromServiceWorker() {
  const { data } = await axios.get('https://web.whatsapp.com/sw.js', {
    timeout: REQ_TIMEOUT,
    responseType: 'text',
    transformResponse: [(d) => d],
    headers: BROWSER_HEADERS,
    validateStatus: (s) => s === 200
  });
  const text = String(data || '');
  const m = text.match(/\\?"client_revision\\?":\s*(\d+)/);
  if (!m) throw new Error('client_revision not found in sw.js');
  return [2, 3000, Number(m[1])];
}

/** WhatsApp's own update endpoint - works even when sw.js is cached/blocked. */
async function fromCheckUpdate() {
  const { data } = await axios.get('https://web.whatsapp.com/check-update', {
    params: { version: '2.3000.0', platform: 'web' },
    timeout: REQ_TIMEOUT,
    headers: BROWSER_HEADERS,
    validateStatus: (s) => s === 200
  });
  const v = parseVersion(data?.currentVersion || data?.version);
  if (!v) throw new Error('no currentVersion in check-update');
  return v;
}

/** Community mirror that tracks the live web build. */
async function fromWaWebVersionMirror() {
  const { data } = await axios.get('https://wppconnect.io/whatsapp-versions/', {
    timeout: REQ_TIMEOUT,
    responseType: 'text',
    transformResponse: [(d) => d],
    headers: { 'User-Agent': UA },
    validateStatus: (s) => s === 200
  });
  const all = String(data || '').match(/2\.3000\.\d{9,}/g);
  if (!all?.length) throw new Error('no version found on mirror');
  const best = all.map(s => parseVersion(s)).sort((a, b) => revisionOf(b) - revisionOf(a))[0];
  return best;
}

/** Baileys' own pinned file - weakest source, usually behind. */
async function fromBaileysRepo() {
  const { data } = await axios.get(
    'https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json',
    { timeout: REQ_TIMEOUT, headers: { 'User-Agent': UA }, validateStatus: (s) => s === 200 }
  );
  const v = parseVersion(data?.version);
  if (!v) throw new Error('bad baileys-version.json');
  return v;
}

const SOURCES = [
  { name: 'web.whatsapp.com/sw.js', fn: fromServiceWorker, trusted: true },
  { name: 'web.whatsapp.com/check-update', fn: fromCheckUpdate, trusted: true },
  { name: 'wppconnect mirror', fn: fromWaWebVersionMirror, trusted: true },
  { name: 'baileys repo', fn: fromBaileysRepo, trusted: false }
];

/* ---------------- persistence ---------------- */

/* The remembered web build is a setting - settings now live in Firebase
   (lib/firebase.js), so persistence moved from the GitHub-backed mongo
   bucket to the settings bucket. getSetting resolves from there. */
async function dbGet(key, def) {
  try {
    const database = require('./database');
    return database.isConnected() ? (await database.getSetting(key, def)) : def;
  } catch (_) { return def; }
}
function remembered() {
  try {
    const v = parseVersion(global.__waWebVersionSaved ?? null);
    return v && revisionOf(v) >= MIN_ACCEPTABLE_REVISION ? v : null;
  } catch (_) { return null; }
}
/* Boot-time load of the remembered build (kept async-free for the sync
   remember() helper used from getWAVersion's cached resolve()). */
async function loadRemembered() {
  const v = await dbGet('waWebVersion', null);
  const parsed = parseVersion(v);
  global.__waWebVersionSaved = v;
  return parsed;
}
function remember(version) {
  try {
    if (global.__waWebVersionSaved === fmt(version)) return;          // no pointless commit
    global.__waWebVersionSaved = fmt(version);
    dbGet('waWebVersion', fmt(version)).catch(() => {});             // fire-and-forget persist
  } catch (_) {}
}

/* ---------------- resolver ---------------- */

async function resolve() {
  /* Manual override always wins - lets the owner react instantly if
     WhatsApp changes something before this code is updated. */
  const forced = parseVersion(process.env.WA_VERSION || config.WA_VERSION);
  if (forced) {
    console.log(`[WA-VER] Using pinned WA_VERSION ${fmt(forced)}`);
    return { version: forced, source: 'WA_VERSION env', at: Date.now() };
  }

  let best = null;
  let bestSource = null;

  for (const src of SOURCES) {
    try {
      const v = await src.fn();
      if (!v) continue;
      if (revisionOf(v) > revisionOf(best)) { best = v; bestSource = src.name; }
      /* A trusted live source is authoritative - stop asking around. */
      if (src.trusted && revisionOf(v) >= MIN_ACCEPTABLE_REVISION) break;
    } catch (e) {
      console.warn(`[WA-VER] ${src.name} unavailable: ${String(e.message).slice(0, 90)}`);
    }
  }

  const saved = await loadRemembered();
  if (revisionOf(saved) > revisionOf(best)) { best = saved; bestSource = 'last known good'; }

  if (!best || revisionOf(best) < MIN_ACCEPTABLE_REVISION) {
    best = revisionOf(best) > revisionOf(EMERGENCY) ? best : EMERGENCY;
    bestSource = bestSource || 'built-in fallback';
    console.warn(`[WA-VER] Could not confirm a live WhatsApp Web build - using ${fmt(best)} (${bestSource}).`);
    console.warn('[WA-VER] If linking keeps failing, set WA_VERSION to the current web build, e.g. WA_VERSION=2.3000.1042466098');
  } else {
    console.log(`[WA-VER] WhatsApp Web build ${fmt(best)} (from ${bestSource})`);
    remember(best);
  }

  return { version: best, source: bestSource, at: Date.now() };
}

/**
 * Current WhatsApp Web version.
 * @param {boolean} force ignore the cache and re-detect now
 */
async function getWAVersion(force = false) {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.version;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      cached = await resolve();
      return cached.version;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Drop the cache so the next call re-detects (used after a failed link). */
function invalidate() { cached = null; }

function info() {
  return cached
    ? { version: fmt(cached.version), source: cached.source, ageMs: Date.now() - cached.at }
    : { version: null, source: null, ageMs: null };
}

module.exports = { getWAVersion, invalidate, info, fmt, MIN_ACCEPTABLE_REVISION, loadRemembered };
