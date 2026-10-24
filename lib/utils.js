/**
 * Shared utilities - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const FOOTER = config.FOOTER;

/* ---------- text ---------- */
const withFooter = (text = '') => `${fontify(text)}\n\n${FOOTER}`;

const box = (title, body) =>
  `╭━━━〔 *${title}* 〕━━━┈⊷\n` +
  body.split('\n').map(l => `┃ ${l}`).join('\n') +
  `\n╰━━━━━━━━━━━━━━━┈⊷`;

const monospace = (t) => '```' + t + '```';

const runtime = (seconds) => {
  seconds = Number(seconds);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
};

const formatBytes = (bytes, dec = 2) => {
  if (!+bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dec))} ${sizes[i]}`;
};

const now = () => new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE });
const timeOnly = () => new Date().toLocaleTimeString('en-GB', { timeZone: config.TIMEZONE });
const dateOnly = () => new Date().toLocaleDateString('en-GB', { timeZone: config.TIMEZONE });

const greeting = () => {
  const h = Number(new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE, hour: '2-digit', hour12: false }));
  if (h < 5) return 'Good Night';
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  if (h < 21) return 'Good Evening';
  return 'Good Night';
};

const randomId = (n = 10) => crypto.randomBytes(n).toString('hex').slice(0, n);
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const capitalize = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

const toSmallCaps = (str) => {
  const map = { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'q',r:'ʀ',s:'ѕ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' };
  return String(str).toLowerCase().split('').map(c => map[c] || c).join('');
};

/* ---------- unicode font (ᴀʙᴄᴅ smallcaps) for every bot message ---------- */
/*
 * WhatsApp shows this bot's replies in the owner's custom small-caps
 * "font" (ᴀʙᴄᴅ...). Instead of editing every plugin by hand, every text
 * reply passes through fontify() below: Latin letters are converted to
 * their small-caps Unicode code points while everything else - numbers,
 * emojis, WhatsApp markdown (* _ ~ `), URLs, JIDs and Sinhala/Tamil text
 * - is left untouched so links stay tappable and bold still works.
 *
 * Toggle it off anytime with the Heroku config var FONT_SMALLCAPS=false.
 */
const SMALLCAPS_MAP = {
  'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ',
  'J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'Q','R':'ʀ',
  'S':'ѕ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'X','Y':'ʏ','Z':'ᴢ',
  'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ',
  'j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'q','r':'ʀ',
  's':'ѕ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'
};

/* True when the character is a Latin letter that should be converted. */
const isLetter = (c) => /[A-Za-z]/.test(c);

/* Runs of URLs, JIDs and @-mentions must stay plain-text or they break. */
const URL_RE = /https?:\/\/[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\d{5,20}@s\.whatsapp\.net|@\d{10,15}/g;

function fontify(str) {
  if (!str) return str;
  if (!config.FONT_SMALLCAPS) return str;
  const text = String(str);
  // Split the string around URLs/JIDs/mentions; convert only the gaps.
  const parts = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push({ t: text.slice(last, match.index), convert: true });
    parts.push({ t: match[0], convert: false });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), convert: true });
  return parts.map(p => p.convert
    ? p.t.split('').map(c => (isLetter(c) ? SMALLCAPS_MAP[c] : c)).join('')
    : p.t).join('');
}

/* ---------- validation ---------- */
const isUrl = (t) => /https?:\/\/[^\s]+/i.test(String(t || ''));
const extractUrl = (t) => { const m = String(t || '').match(/https?:\/\/[^\s]+/i); return m ? m[0] : null; };
const isNumeric = (t) => /^[0-9]+$/.test(String(t || ''));

/* ---------- SASA DEV API ---------- */
const api = axios.create({
  baseURL: config.API_BASE,
  timeout: 90000,
  headers: { 'X-API-Key': config.API_KEY, 'x-api-key': config.API_KEY, 'User-Agent': 'LakshanXMD/1.0' },
  validateStatus: () => true
});

/* New SASA DEV API response shape:
   { creator, thanks, status: true|200|false, result, error, status?:200 } */
async function sasaApi(path, params = {}) {
  try {
    const res = await api.get(path, { params: { apikey: config.API_KEY, ...params } });
    if (typeof res.data === 'string') {
      return { status: false, err: 'Endpoint not available' };
    }
    const d = res.data || { status: false, err: 'Empty response' };
    /* Normalize the new API's mixed status values */
    const ok = d.status === true || d.success === true || d.status === 200;
    if (!ok && !d.result && !d.error) return { status: false, err: 'Unknown response' };
    d.status = ok ? true : (d.status === false ? false : d.status);
    return d;
  } catch (e) {
    return { status: false, err: e.message };
  }
}

async function getBuffer(url, opts = {}) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: config.MAX_UPLOAD_MB * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    ...opts
  });
  return Buffer.from(res.data);
}

async function getJson(url, opts = {}) {
  const res = await axios.get(url, { timeout: 60000, ...opts });
  return res.data;
}

/* ---------- jid ---------- */
const decodeJid = (jid) => {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const d = jid.split('@');
    return `${d[0].split(':')[0]}@${d[1]}`;
  }
  return jid;
};

const numToJid = (num) => `${String(num).replace(/[^0-9]/g, '')}@s.whatsapp.net`;
const jidToNum = (jid) => String(jid || '').split('@')[0].split(':')[0];

/* ---------- misc ---------- */
const progressBar = (percent, len = 12) => {
  const filled = Math.round((percent / 100) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled) + ` ${percent}%`;
};

const truncate = (s, n = 60) => (String(s).length > n ? String(s).slice(0, n - 3) + '...' : String(s));

module.exports = {
  FOOTER, withFooter, box, monospace, runtime, formatBytes,
  now, timeOnly, dateOnly, greeting, randomId, pickRandom, sleep, capitalize,
  toSmallCaps, fontify, isUrl, extractUrl, isNumeric, sasaApi, getBuffer, getJson,
  decodeJid, numToJid, jidToNum, progressBar, truncate, axios
};
