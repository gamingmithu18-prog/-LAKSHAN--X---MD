/**
 * DEVELOPER & UTILITY KIT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * JSON, encoding, ids, colours, network helpers.
 * © POWERD BY LAKSHAN X MD </>
 */
const { cmd } = require('../lib/command');
const { axios, formatBytes } = require('../lib/utils');
const crypto = require('crypto');
const os = require('os');

const input = ({ q, m }) => (q && q.trim()) || m.quoted?.text || '';
const CAP = 3500;
const cut = (s) => (s.length > CAP ? s.slice(0, CAP) + '\n...(truncated)' : s);

/* ============ JSON & DATA ============ */

cmd({ pattern: 'jsonformat', alias: ['prettyjson', 'jsonpretty'], desc: 'Pretty print and validate JSON', category: 'dev', use: '<json>', react: '📋' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give me JSON, or reply to a message containing JSON.\nExample: .jsonformat {"a":1,"b":[2,3]}');
  try {
    const parsed = JSON.parse(t);
    const pretty = JSON.stringify(parsed, null, 2);
    const type = Array.isArray(parsed) ? `array of ${parsed.length}` : typeof parsed === 'object' && parsed ? `object with ${Object.keys(parsed).length} key(s)` : typeof parsed;
    await ctx.reply(`*VALID JSON* (${type})\n\n\`\`\`${cut(pretty)}\`\`\``);
  } catch (e) {
    await ctx.reply(`*INVALID JSON*\n\n${e.message}`);
  }
});

cmd({ pattern: 'jsonmin', alias: ['minifyjson'], desc: 'Minify JSON to a single line', category: 'dev', use: '<json>', react: '🗜️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give me JSON to minify.');
  try {
    const min = JSON.stringify(JSON.parse(t));
    await ctx.reply(`*MINIFIED JSON*\n\nBefore : ${t.length} chars\nAfter  : ${min.length} chars\nSaved  : ${t.length - min.length} chars\n\n\`\`\`${cut(min)}\`\`\``);
  } catch (e) { await ctx.reply('Invalid JSON: ' + e.message); }
});

cmd({ pattern: 'jsonkeys', alias: ['keys'], desc: 'List every key path inside a JSON object', category: 'dev', use: '<json>', react: '🗝️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give me JSON.');
  try {
    const obj = JSON.parse(t);
    const paths = [];
    const walk = (o, prefix = '') => {
      if (paths.length > 200) return;
      if (Array.isArray(o)) { if (o.length) walk(o[0], `${prefix}[0]`); return; }
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          const p = prefix ? `${prefix}.${k}` : k;
          paths.push(`${p}  (${Array.isArray(o[k]) ? 'array' : o[k] === null ? 'null' : typeof o[k]})`);
          walk(o[k], p);
        }
      }
    };
    walk(obj);
    if (!paths.length) return ctx.reply('That JSON has no keys (it is a plain value).');
    await ctx.reply(`*JSON KEY PATHS (${paths.length})*\n\n\`\`\`${cut(paths.join('\n'))}\`\`\``);
  } catch (e) { await ctx.reply('Invalid JSON: ' + e.message); }
});

cmd({ pattern: 'csvtojson', alias: ['csv2json'], desc: 'Convert CSV text into JSON', category: 'dev', use: '<csv>', react: '📑' },
async (ctx) => {
  const t = input(ctx);
  if (!t || !t.includes('\n')) return ctx.reply('Reply to CSV text with a header row.\nExample:\nname,age\nAnna,30\nBen,25');
  const [head, ...rows] = t.trim().split('\n');
  const cols = head.split(',').map(c => c.trim());
  const out = rows.filter(r => r.trim()).map(r => {
    const cells = r.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] || '').trim()]));
  });
  await ctx.reply(`*CSV -> JSON*\n\nRows : ${out.length}\nCols : ${cols.length}\n\n\`\`\`${cut(JSON.stringify(out, null, 2))}\`\`\``);
});

cmd({ pattern: 'jsontocsv', alias: ['json2csv'], desc: 'Convert a JSON array into CSV', category: 'dev', use: '<json array>', react: '📄' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give me a JSON array of objects.');
  try {
    const arr = JSON.parse(t);
    if (!Array.isArray(arr) || !arr.length) return ctx.reply('That is not a non-empty JSON array.');
    const cols = [...new Set(arr.flatMap(o => Object.keys(o || {})))];
    const esc = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...arr.map(o => cols.map(c => esc(o?.[c])).join(','))].join('\n');
    await ctx.reply(`*JSON -> CSV*\n\nRows : ${arr.length}\nCols : ${cols.length}\n\n\`\`\`${cut(csv)}\`\`\``);
  } catch (e) { await ctx.reply('Invalid JSON: ' + e.message); }
});

/* ============ ENCODING ============ */

cmd({ pattern: 'urlencode', alias: ['encodeurl'], desc: 'Percent-encode text for a URL', category: 'dev', use: '<text>', react: '🔗' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give text to encode.\nExample: .urlencode hello world & more');
  await ctx.reply(`*URL ENCODED*\n\n${cut(encodeURIComponent(t))}`);
});

cmd({ pattern: 'urldecode', alias: ['decodeurl'], desc: 'Decode a percent-encoded URL', category: 'dev', use: '<text>', react: '🔓' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give an encoded string to decode.');
  try { await ctx.reply(`*URL DECODED*\n\n${cut(decodeURIComponent(t))}`); }
  catch { await ctx.reply('That is not a valid percent-encoded string.'); }
});

cmd({ pattern: 'hexencode', alias: ['tohex'], desc: 'Convert text to hexadecimal', category: 'dev', use: '<text>', react: '🔣' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give text to convert.');
  await ctx.reply(`*TEXT TO HEX*\n\n${cut(Buffer.from(t, 'utf8').toString('hex').match(/.{1,2}/g).join(' '))}`);
});

cmd({ pattern: 'hexdecode', alias: ['fromhex'], desc: 'Convert hexadecimal back to text', category: 'dev', use: '<hex>', react: '🔡' },
async (ctx) => {
  const t = input(ctx).replace(/[^0-9a-fA-F]/g, '');
  if (!t) return ctx.reply('Give hexadecimal digits.');
  try { await ctx.reply(`*HEX TO TEXT*\n\n${cut(Buffer.from(t, 'hex').toString('utf8'))}`); }
  catch { await ctx.reply('Invalid hexadecimal input.'); }
});

cmd({ pattern: 'unicode', alias: ['codepoints'], desc: 'Show the unicode code points of a text', category: 'dev', use: '<text>', react: '🔠' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give text to inspect.\nExample: .unicode ගොස්ට්');
  const rows = [...t].slice(0, 60).map(ch => `${ch}  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  (${ch.codePointAt(0)})`);
  await ctx.reply(`*UNICODE CODE POINTS*\n\n\`\`\`${rows.join('\n')}\`\`\``);
});

cmd({ pattern: 'escape', alias: ['jsonescape'], desc: 'Escape text for use inside a string literal', category: 'dev', use: '<text>', react: '⌨️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give text to escape.');
  await ctx.reply(`*ESCAPED*\n\n${cut(JSON.stringify(t))}`);
});

/* ============ IDS & HASHES ============ */

cmd({ pattern: 'uuid', alias: ['guid', 'genuuid'], desc: 'Generate random UUID v4 identifiers', category: 'dev', use: '[count]', react: '🆔' },
async ({ args, reply }) => {
  const n = Math.min(Math.max(parseInt(args[0]) || 1, 1), 20);
  const list = Array.from({ length: n }, () => crypto.randomUUID());
  await reply(`*UUID v4${n > 1 ? ` x${n}` : ''}*\n\n${list.join('\n')}`);
});

cmd({ pattern: 'randomstring', alias: ['randstr', 'token'], desc: 'Generate a random string or API token', category: 'dev', use: '[length]', react: '🎲' },
async ({ args, reply }) => {
  const len = Math.min(Math.max(parseInt(args[0]) || 32, 4), 256);
  await reply(`*RANDOM STRINGS (${len} chars)*\n\nHex     : ${crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len)}\nBase64  : ${crypto.randomBytes(len).toString('base64url').slice(0, len)}\nAlnum   : ${Array.from({ length: len }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[crypto.randomInt(62)]).join('')}`);
});

cmd({ pattern: 'sha512', alias: ['sha1', 'checksum'], desc: 'Extended hash set of a text', category: 'dev', use: '<text>', react: '#️⃣' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return ctx.reply('Give text to hash.');
  const h = (alg) => crypto.createHash(alg).update(t).digest('hex');
  await ctx.reply(`*HASHES*\n\nMD5\n${h('md5')}\n\nSHA1\n${h('sha1')}\n\nSHA256\n${h('sha256')}\n\nSHA512\n${h('sha512')}`);
});

cmd({ pattern: 'hmac', desc: 'HMAC-SHA256 signature of a text', category: 'dev', use: '<key>|<text>', react: '🔏' },
async ({ q, reply }) => {
  const [key, ...rest] = String(q || '').split('|');
  const text = rest.join('|');
  if (!key || !text) return reply('Format: .hmac mysecret|the message to sign');
  await reply(`*HMAC-SHA256*\n\nKey    : ${key.slice(0, 4)}${'*'.repeat(Math.max(0, key.length - 4))}\nDigest :\n${crypto.createHmac('sha256', key).update(text).digest('hex')}`);
});

cmd({ pattern: 'jwtdecode', alias: ['jwt'], desc: 'Decode a JWT token (no verification)', category: 'dev', use: '<token>', react: '🎫' },
async (ctx) => {
  const t = input(ctx).trim();
  const parts = t.split('.');
  if (parts.length < 2) return ctx.reply('Give a JWT token (header.payload.signature).');
  try {
    const dec = (s) => JSON.stringify(JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')), null, 2);
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const expNote = payload.exp ? `\nExpires : ${new Date(payload.exp * 1000).toUTCString()} (${payload.exp * 1000 < Date.now() ? 'EXPIRED' : 'valid'})` : '';
    await ctx.reply(`*JWT DECODED*\n\nHeader\n\`\`\`${dec(parts[0])}\`\`\`\nPayload\n\`\`\`${cut(dec(parts[1]))}\`\`\`${expNote}\n\nSignature is NOT verified.`);
  } catch (e) { await ctx.reply('Could not decode that token: ' + e.message); }
});

/* ============ COLOUR ============ */

cmd({ pattern: 'randomcolor', alias: ['randcolor'], desc: 'Generate a random colour with its codes', category: 'dev', react: '🎨' },
async ({ send, reply }) => {
  const r = crypto.randomInt(256), g = crypto.randomInt(256), b = crypto.randomInt(256);
  const hex = [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  try {
    await send({ image: { url: `https://singlecolorimage.com/get/${hex}/500x300` }, caption: `*RANDOM COLOUR*\n\nHEX : #${hex.toUpperCase()}\nRGB : rgb(${r}, ${g}, ${b})\nInt : ${parseInt(hex, 16)}` });
  } catch {
    await reply(`*RANDOM COLOUR*\n\nHEX : #${hex.toUpperCase()}\nRGB : rgb(${r}, ${g}, ${b})`);
  }
});

cmd({ pattern: 'hextorgb', alias: ['rgb'], desc: 'Convert a hex colour to RGB, HSL and CMYK', category: 'dev', use: '<hex>', react: '🌈' },
async ({ q, reply }) => {
  const hex = String(q || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return reply('Give a 6-digit hex colour.\nExample: .hextorgb #1e90ff');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h *= 60;
  }
  const k = 1 - max;
  const cy = k === 1 ? 0 : (1 - rn - k) / (1 - k), mg = k === 1 ? 0 : (1 - gn - k) / (1 - k), yl = k === 1 ? 0 : (1 - bn - k) / (1 - k);
  const lum = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
  await reply(`*COLOUR CONVERSION*\n\nHEX  : #${hex.toUpperCase()}\nRGB  : rgb(${r}, ${g}, ${b})\nHSL  : hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)\nCMYK : ${Math.round(cy * 100)}, ${Math.round(mg * 100)}, ${Math.round(yl * 100)}, ${Math.round(k * 100)}\n\nBrightness : ${Math.round(lum * 100)}%\nBest text  : ${lum > 0.5 ? 'black' : 'white'}\nInverted   : #${[255 - r, 255 - g, 255 - b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`);
});

cmd({ pattern: 'palette', alias: ['colorscheme'], desc: 'Generate a colour palette from a base colour', category: 'dev', use: '<hex>', react: '🖌️' },
async ({ q, reply }) => {
  let hex = String(q || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) hex = crypto.randomBytes(3).toString('hex');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const mix = (v, t, amt) => Math.round(v + (t - v) * amt);
  const toHex = (a, bb, c) => '#' + [a, bb, c].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const shades = [0.75, 0.5, 0.25].map(a => toHex(mix(r, 0, a), mix(g, 0, a), mix(b, 0, a)));
  const tints = [0.25, 0.5, 0.75].map(a => toHex(mix(r, 255, a), mix(g, 255, a), mix(b, 255, a)));
  await reply(`*COLOUR PALETTE*\n\nBase        : #${hex.toUpperCase()}\nComplement  : ${toHex(255 - r, 255 - g, 255 - b)}\n\nShades (darker)\n${shades.join('\n')}\n\nTints (lighter)\n${tints.join('\n')}`);
});

/* ============ NETWORK & SYSTEM ============ */

cmd({ pattern: 'urlinfo', alias: ['parseurl', 'analyzeurl'], desc: 'Break a URL into its parts', category: 'dev', use: '<url>', react: '🌐' },
async ({ q, reply }) => {
  let raw = String(q || '').trim();
  if (!raw) return reply('Give a URL.\nExample: .urlinfo https://example.com/a/b?x=1#top');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  try {
    const u = new URL(raw);
    const params = [...u.searchParams.entries()];
    await reply(`*URL BREAKDOWN*\n\nProtocol : ${u.protocol.replace(':', '')}\nHost     : ${u.hostname}\nPort     : ${u.port || '(default)'}\nPath     : ${u.pathname}\nHash     : ${u.hash || '(none)'}\n\nQuery parameters (${params.length}):\n${params.length ? params.map(([k, v]) => `  ${k} = ${v}`).join('\n') : '  (none)'}\n\nDomain parts : ${u.hostname.split('.').join(' | ')}`);
  } catch { await reply('That is not a valid URL.'); }
});

cmd({ pattern: 'httpstatus', alias: ['statuscode'], desc: 'Explain an HTTP status code', category: 'dev', use: '<code>', react: '📡' },
async ({ q, reply }) => {
  const CODES = {
    200: 'OK - the request succeeded.', 201: 'Created - a new resource was made.', 204: 'No Content - success with an empty body.',
    301: 'Moved Permanently - the resource lives at a new URL.', 302: 'Found - temporary redirect.', 304: 'Not Modified - use your cached copy.',
    400: 'Bad Request - the server could not understand the request.', 401: 'Unauthorized - you must authenticate.',
    403: 'Forbidden - authenticated but not allowed.', 404: 'Not Found - no such resource.',
    405: 'Method Not Allowed - wrong HTTP verb.', 408: 'Request Timeout - the client took too long.',
    409: 'Conflict - the request clashes with the current state.', 413: 'Payload Too Large.',
    418: "I'm a teapot - an April Fools joke that stayed in the standard.", 422: 'Unprocessable Entity - validation failed.',
    429: 'Too Many Requests - you are being rate limited.', 500: 'Internal Server Error - the server crashed.',
    501: 'Not Implemented.', 502: 'Bad Gateway - an upstream server replied badly.',
    503: 'Service Unavailable - the server is overloaded or down.', 504: 'Gateway Timeout - an upstream server was too slow.'
  };
  const c = parseInt(q);
  if (!c) return reply(`Give a status code.\nExample: .httpstatus 404\n\nKnown: ${Object.keys(CODES).join(', ')}`);
  const cls = c < 200 ? 'Informational' : c < 300 ? 'Success' : c < 400 ? 'Redirection' : c < 500 ? 'Client error' : 'Server error';
  await reply(`*HTTP ${c}*\n\nClass   : ${cls} (${Math.floor(c / 100)}xx)\nMeaning : ${CODES[c] || 'Not a commonly used code.'}`);
});

cmd({ pattern: 'headers', alias: ['httpheaders', 'checkurl'], desc: 'Fetch the HTTP headers of a URL', category: 'dev', use: '<url>', react: '📨' },
async ({ q, reply }) => {
  let url = String(q || '').trim();
  if (!url) return reply('Give a URL.\nExample: .headers https://example.com');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const t0 = Date.now();
    const r = await axios.get(url, {
      timeout: 20000, maxRedirects: 5, validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 GhostMiniOFC' }, responseType: 'text',
      transformResponse: [(d) => String(d).slice(0, 200)]
    });
    const ms = Date.now() - t0;
    const wanted = ['content-type', 'content-length', 'server', 'date', 'cache-control', 'location', 'x-powered-by', 'strict-transport-security'];
    const shown = wanted.filter(k => r.headers[k]).map(k => `${k}: ${r.headers[k]}`);
    await reply(`*HTTP RESPONSE*\n\nURL      : ${url}\nStatus   : ${r.status} ${r.statusText || ''}\nTime     : ${ms} ms\n\n${shown.join('\n') || '(no common headers returned)'}`);
  } catch (e) { await reply(`Request failed: ${String(e.message).slice(0, 140)}`); }
});

cmd({ pattern: 'dnslookup', alias: ['dns', 'resolve'], desc: 'Resolve the DNS records of a domain', category: 'dev', use: '<domain>', react: '🔍' },
async ({ q, reply }) => {
  const domain = String(q || '').trim().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain) return reply('Give a domain.\nExample: .dnslookup google.com');
  try {
    const types = ['A', 'AAAA', 'MX', 'TXT', 'NS'];
    const out = [];
    for (const t of types) {
      const r = await axios.get('https://dns.google/resolve', { params: { name: domain, type: t }, timeout: 15000, validateStatus: () => true });
      const ans = (r.data?.Answer || []).map(a => a.data).slice(0, 4);
      if (ans.length) out.push(`${t}\n${ans.map(a => '  ' + String(a).slice(0, 100)).join('\n')}`);
    }
    if (!out.length) return reply(`No DNS records found for ${domain}.`);
    await reply(`*DNS RECORDS - ${domain}*\n\n${out.join('\n\n')}`);
  } catch (e) { await reply('DNS lookup failed: ' + String(e.message).slice(0, 120)); }
});

cmd({ pattern: 'myip', alias: ['serverip', 'hostip'], desc: 'Public IP and location of the bot server', category: 'dev', react: '📍' },
async ({ reply }) => {
  try {
    const r = await axios.get('https://ipapi.co/json/', { timeout: 15000 });
    const d = r.data || {};
    await reply(`*SERVER LOCATION*\n\nIP       : ${d.ip || 'unknown'}\nCity     : ${d.city || '-'}\nRegion   : ${d.region || '-'}\nCountry  : ${d.country_name || '-'} (${d.country_code || '-'})\nISP      : ${d.org || '-'}\nTimezone : ${d.timezone || '-'}`);
  } catch { await reply('Could not determine the server IP right now.'); }
});

cmd({ pattern: 'sysinfo', alias: ['hostinfo', 'machine'], desc: 'Hardware and runtime information', category: 'dev', react: '🖥️' },
async ({ reply }) => {
  const cpus = os.cpus();
  const mem = process.memoryUsage();
  const up = os.uptime();
  await reply(`*SYSTEM INFORMATION*\n\nPlatform   : ${os.platform()} ${os.arch()}\nRelease    : ${os.release()}\nHostname   : ${os.hostname()}\nCPU        : ${cpus[0]?.model?.trim() || 'unknown'}\nCores      : ${cpus.length}\nLoad avg   : ${os.loadavg().map(x => x.toFixed(2)).join(', ')}\n\nTotal RAM  : ${formatBytes(os.totalmem())}\nFree RAM   : ${formatBytes(os.freemem())}\nUsed RAM   : ${formatBytes(os.totalmem() - os.freemem())}\n\nNode       : ${process.version}\nHeap used  : ${formatBytes(mem.heapUsed)}\nRSS        : ${formatBytes(mem.rss)}\nProcess up : ${Math.floor(process.uptime() / 60)} min\nHost up    : ${Math.floor(up / 3600)} h ${Math.floor((up % 3600) / 60)} m`);
});

cmd({ pattern: 'regextest', alias: ['regex', 'testregex'], desc: 'Test a regular expression against a text', category: 'dev', use: '<pattern>|<text>', react: '🧪' },
async ({ q, reply }) => {
  const idx = String(q || '').indexOf('|');
  if (idx < 1) return reply('Format: .regextest \\d+|order 123 and 456');
  const pattern = q.slice(0, idx).trim();
  const text = q.slice(idx + 1);
  try {
    const re = new RegExp(pattern, 'g');
    const matches = [...text.matchAll(re)].slice(0, 30);
    if (!matches.length) return reply(`*REGEX TEST*\n\nPattern : /${pattern}/g\nResult  : no matches`);
    await reply(`*REGEX TEST*\n\nPattern : /${pattern}/g\nMatches : ${matches.length}\n\n${matches.map((m, i) => `${i + 1}. "${m[0]}" at index ${m.index}${m.length > 1 ? `\n   groups: ${m.slice(1).join(' | ')}` : ''}`).join('\n')}`);
  } catch (e) { await reply('Invalid regular expression: ' + e.message); }
});

cmd({ pattern: 'cron', alias: ['crontab', 'explaincron'], desc: 'Explain a cron expression in plain English', category: 'dev', use: '<expression>', react: '⏰' },
async ({ q, reply }) => {
  const parts = String(q || '').trim().split(/\s+/);
  if (parts.length < 5) return reply('Give a 5-field cron expression.\nExample: .cron 0 9 * * 1-5');
  const [min, hr, dom, mon, dow] = parts;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const f = (v, name, map) => {
    if (v === '*') return `every ${name}`;
    if (v.startsWith('*/')) return `every ${v.slice(2)} ${name}s`;
    if (v.includes('-')) { const [a, b] = v.split('-'); return `${name} ${map ? map[+a] : a} to ${map ? map[+b] : b}`; }
    if (v.includes(',')) return `${name} ${v.split(',').map(x => (map ? map[+x] : x)).join(', ')}`;
    return `${name} ${map ? map[+v] : v}`;
  };
  await reply(`*CRON EXPLAINED*\n\nExpression : ${parts.slice(0, 5).join(' ')}\n\nMinute       : ${f(min, 'minute')}\nHour         : ${f(hr, 'hour')}\nDay of month : ${f(dom, 'day')}\nMonth        : ${f(mon, 'month', MONTHS)}\nDay of week  : ${f(dow, 'day', DAYS)}\n\nReads as: run ${min === '*' ? 'every minute' : `at minute ${min}`}${hr !== '*' ? ` of hour ${hr}` : ''}${dow !== '*' ? `, on ${f(dow, '', DAYS).trim()}` : ''}.`);
});

cmd({ pattern: 'timestamp', alias: ['unixtime', 'epoch'], desc: 'Convert between unix timestamps and dates', category: 'dev', use: '[timestamp or date]', react: '🕐' },
async ({ q, reply, config }) => {
  const raw = String(q || '').trim();
  let d;
  if (!raw) d = new Date();
  else if (/^\d{10}$/.test(raw)) d = new Date(parseInt(raw) * 1000);
  else if (/^\d{13}$/.test(raw)) d = new Date(parseInt(raw));
  else d = new Date(raw);
  if (Number.isNaN(d.getTime())) return reply('Give a unix timestamp or a date.\nExamples:\n.timestamp 1769472000\n.timestamp 2026-07-27');
  await reply(`*TIMESTAMP*\n\nSeconds : ${Math.floor(d.getTime() / 1000)}\nMillis  : ${d.getTime()}\n\nISO     : ${d.toISOString()}\nUTC     : ${d.toUTCString()}\nLocal   : ${d.toLocaleString('en-GB', { timeZone: config.TIMEZONE })}\n\nRelative: ${(() => {
    const diff = d.getTime() - Date.now();
    const a = Math.abs(diff), s = diff < 0 ? 'ago' : 'from now';
    if (a < 60000) return `${Math.round(a / 1000)} seconds ${s}`;
    if (a < 3600000) return `${Math.round(a / 60000)} minutes ${s}`;
    if (a < 86400000) return `${Math.round(a / 3600000)} hours ${s}`;
    return `${Math.round(a / 86400000)} days ${s}`;
  })()}`);
});

cmd({ pattern: 'wordlist', alias: ['charmap', 'asciitable'], desc: 'ASCII table reference', category: 'dev', use: '[start]', react: '📇' },
async ({ args, reply }) => {
  const start = Math.min(Math.max(parseInt(args[0]) || 32, 0), 100);
  const rows = [];
  for (let i = start; i < start + 32 && i < 127; i++) {
    rows.push(`${String(i).padStart(3)}  0x${i.toString(16).padStart(2, '0')}  ${i < 33 ? '(ctrl)' : String.fromCharCode(i)}`);
  }
  await reply(`*ASCII TABLE (${start} - ${Math.min(start + 31, 126)})*\n\n\`\`\`${rows.join('\n')}\`\`\`\n\nNext page: .asciitable ${start + 32}`);
});

cmd({ pattern: 'ipcalc', alias: ['subnet', 'cidr'], desc: 'Calculate a subnet from CIDR notation', category: 'dev', use: '<ip/prefix>', react: '🖧' },
async ({ q, reply }) => {
  const mm = String(q || '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!mm) return reply('Format: .ipcalc 192.168.1.10/24');
  const octets = mm[1].split('.').map(Number);
  const prefix = parseInt(mm[2]);
  if (octets.some(o => o > 255) || prefix > 32) return reply('That is not a valid IPv4 address or prefix.');
  const ipInt = octets.reduce((a, o) => (a << 8 >>> 0) + o, 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const net = (ipInt & mask) >>> 0;
  const bcast = (net | (~mask >>> 0)) >>> 0;
  const toIp = (n) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
  const hosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : bcast - net - 1;
  await reply(`*SUBNET CALCULATOR*\n\nAddress   : ${mm[1]}/${prefix}\nNetmask   : ${toIp(mask)}\nWildcard  : ${toIp(~mask >>> 0)}\n\nNetwork   : ${toIp(net)}\nBroadcast : ${toIp(bcast)}\nFirst host: ${toIp(prefix >= 31 ? net : net + 1)}\nLast host : ${toIp(prefix >= 31 ? bcast : bcast - 1)}\n\nUsable hosts : ${hosts.toLocaleString()}\nTotal addrs  : ${(bcast - net + 1).toLocaleString()}\nPrivate      : ${/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(mm[1]) ? 'yes' : 'no'}`);
});
