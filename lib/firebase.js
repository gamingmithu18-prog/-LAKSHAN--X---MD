/**
 * Firebase Realtime Database adapter.
 * 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *
 * Stores bot settings, users, groups and lists in the owner's Firebase
 * Realtime DB so they are never lost to GitHub rate limits or JSON files.
 *
 * Authentication: the service account JSON (FIREBASE_SA_JSON) is exchanged
 * for an OAuth2 access token via a signed JWT assertion, then every REST
 * call carries `auth=<token>`. No extra dependency is needed.
 */
const https = require('https');
const { URL } = require('url');

const RTDB_URL = String(process.env.FIREBASE_RTDB_URL ||
  'https://the-ghost-mini-db-default-rtdb.firebaseio.com').replace(/\/+$/, '');

const MINUTES = 60;
let token = null;              // { value, exp }
let tokenPromise = null;

/* ============ OAuth2 token from the service account JWT ============ */

function pemToComponents(pem) {
  const clean = String(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '\n').replace(/\s+/g, '');
  const buf = Buffer.from(clean, 'base64');
  if (buf[0] !== 0x30) throw new Error('bad pem');
  // Walk the outer SEQUENCE: skip its header (30 [len]), then walk past the
  // version INTEGER (02 01 00) and algorithm SEQUENCE (30 0d ...) to reach
  // the OCTET STRING holding the raw private key bytes. Note: Firebase
  // service-account keys are emitted as a PKCS#1-like envelope whose inner
  // OCTET STRING payload is the full RSAPrivateKey (version, n, e, d, ...)
  // rather than a PKCS#8 PrivateKeyInfo. So the extracted bytes are decoded
  // as pkcs1 below.
  let i = 1;
  const skipTlv = () => {
    i++;                                                        // skip tag
    const n = buf[i] & 0x80 ? buf[i] & 0x7f : 0;                // number of length bytes
    const len = n
      ? [...buf.slice(i + 1, i + 1 + n)].reduce((a, b) => (a << 8) + b, 0)
      : buf[i];                                                 // content length
    i += 1 + n + len;                                           // skip length + content
  };
  i += (buf[i] & 0x80) ? 1 + (buf[i] & 0x7f) : 1;               // skip outer header -> i = 4
  skipTlv();                                                    // skip version INTEGER -> i = 7
  skipTlv();                                                    // skip algorithm SEQUENCE -> i = 22
  if (buf[i] !== 0x04) throw new Error('expected octet string');
  i++;
  const n = buf[i] & 0x80 ? buf[i] & 0x7f : 0;
  const keyLen = n
    ? [...buf.slice(i + 1, i + 1 + n)].reduce((a, b) => (a << 8) + b, 0)
    : buf[i];                                                   // 04 82 04b6 -> 1206 key bytes
  i += 1 + n;
  return buf.slice(i, i + keyLen);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwt(privateKey, header, payload) {
  const crypto = require('crypto');
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const key = crypto.createPrivateKey({ key: pemToComponents(privateKey), format: 'der', type: 'pkcs1' });
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), key);
  return `${h}.${p}.${b64url(sig)}`;
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = String(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Firebase Realtime DB returns the literal text `undefined` for
          // paths that have no data. Treat that as an empty (null) value
          // instead of trying to JSON.parse it.
          try { resolve((txt === 'undefined' || txt === '') ? null : JSON.parse(txt)); } catch (_) { resolve(txt === 'undefined' ? null : txt); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${txt.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function request(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: u.search.includes('PATCH') ? 'PATCH' : (u.search.includes('DELETE') ? 'DELETE' : 'GET')
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Firebase Realtime DB returns the literal text `undefined` for
          // paths that have no data. Treat that as an empty (null) value
          // instead of trying to JSON.parse it.
          try { resolve((txt === 'undefined' || txt === '') ? null : JSON.parse(txt)); } catch (_) { resolve(txt === 'undefined' ? null : txt); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${txt.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function getAccessToken() {
  if (token && token.exp > Date.now() + 60000) return token.value;
  if (tokenPromise) return tokenPromise;

    const sa = JSON.parse(process.env.FIREBASE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt(String(sa.private_key).replace(/\\n/g, '\n'), { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database',
      aud: sa.token_uri, exp: now + MINUTES * MINUTES, iat: now }
  );
  tokenPromise = (async () => {
    try {
      const res = await postJson(sa.token_uri,
        'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt));
      token = { value: res.access_token, exp: now * 1000 + (res.expires_in || 3600) * 1000 };
      return token.value;
    } finally { tokenPromise = null; }
  })();
  return tokenPromise;
}

/* ============ REST helpers ============ */

function pathOf(key) {
  return `${RTDB_URL}/${encodeURIComponent(key)}.json`;
}

async function readJson(key) {
  const auth = await getAccessToken();
  const res = await request(`${pathOf(key)}?auth=${auth}`);
  return res == null ? null : res;
}

async function writeJson(key, value, method = 'PUT') {
  const auth = await getAccessToken();
  const payload = JSON.stringify(value);
  await new Promise((resolve, reject) => {
    const u = new URL(`${pathOf(key)}?auth=${auth}`);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`));
        });
      });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

/* ============ Module public API (mirrors gh's get/set/update shape) ============ */

const cache = new Map();
const dirty = new Set();
let flushTimer = null;
let debounceTimer = null;
let ready = false;
let lastError = null;

const KEYS = ['user', 'premium', 'banned', 'admin', 'groups', 'settings', 'sessions'];
const defaults = { user: {}, premium: [], banned: [], admin: [], groups: {}, settings: {}, sessions: {} };

function defaultFor(key) {
  return JSON.parse(JSON.stringify(defaults[key] || null));
}

function get(key) {
  if (!cache.has(key)) cache.set(key, defaultFor(key));
  return cache.get(key);
}

function set(key, value, immediate = false) {
  cache.set(key, value);
  dirty.add(key);
  if (immediate) return flush(true);
  schedule();
  return value;
}

function update(key, mutator, immediate = false) {
  const value = get(key);
  const result = mutator(value);
  dirty.add(key);
  if (immediate) return flush(true);
  schedule();
  return result;
}

function schedule() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    try { await flush(false); } catch (e) { console.error('[FIREBASE] debounce flush:', e.message); }
  }, 5000);
  debounceTimer.unref?.();
}

async function flush(force = false) {
  if (!ready || !dirty.size) return;
  const keys = [...dirty];
  dirty.clear();
  try {
    await Promise.all(keys.map(async (key) => writeJson(key, get(key))));
  } catch (e) {
    keys.forEach(k => dirty.add(k));
    lastError = { code: 'FIREBASE_WRITE_FAILED', human: e.message, fix: ['Check FIREBASE_SA_JSON and the RTDB URL.', 'Ensure the database rules allow admin writes.'] };
    if (force) throw e;
  }
}

async function init() {
  const sa = process.env.FIREBASE_SA_JSON;
  if (!sa) {
    lastError = { code: 'FIREBASE_NOT_CONFIGURED', human: 'FIREBASE_SA_JSON is not configured.',
      fix: ['Set FIREBASE_SA_JSON as a Heroku config var with the service account JSON.'] };
    throw new Error(lastError.code);
  }
  try {
    // Validate the token path once at boot.
    await getAccessToken();
    await readJson('settings');
    ready = true;
    lastError = null;
    console.log('[FIREBASE] Connected -> the-ghost-mini-db Realtime Database');
  } catch (e) {
    lastError = { code: 'FIREBASE_AUTH_FAILED', human: e.message, fix: ['Check FIREBASE_SA_JSON content and database URL.'] };
    throw e;
  }
  flushTimer = setInterval(() => flush(false).catch(() => {}), 5000);
  flushTimer.unref?.();
}

async function shutdown() {
  await flush(true).catch(() => {});
  if (flushTimer) clearInterval(flushTimer);
  ready = false;
}

const isReady = () => ready;
const getLastError = () => lastError;
const getStats = () => ({ ready, dirty: dirty.size, cached: cache.size, provider: 'firebase', database: 'the-ghost-mini-db' });

module.exports = {
  init, get, set, update, flush, shutdown, isReady, getLastError, getStats,
  KEYS, defaults,
  /* lower level, used for migration and settings split */
  readJson, writeJson, getAccessToken
};
