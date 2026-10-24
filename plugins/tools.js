/**
 * TOOLS / UTILITY COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const db = require('../lib/database');
const { withFooter, getBuffer, axios, jidToNum, numToJid, truncate, isUrl, extractUrl, formatBytes, now } = require('../lib/utils');
const crypto = require('crypto');

/* ============ TEXT TOOLS ============ */
cmd({ pattern: 'tts', alias: ['say', 'speak', 'voice'], desc: 'Convert text into speech', category: 'tools', use: '<text>', react: '🗣️' },
async ({ q, m, reply, send }) => {
  const text = q || m.quoted?.text;
  if (!text) return reply('Provide text to speak.\nExample: .tts Hello world');
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 190))}&tl=en&client=tw-ob`;
    const buf = await getBuffer(url);
    await send({ audio: buf, mimetype: 'audio/mpeg', ptt: true });
  } catch (e) { await reply('Text to speech failed: ' + e.message.slice(0, 120)); }
});

cmd({ pattern: 'translate', alias: ['tr', 'trans'], desc: 'Translate text to another language', category: 'tools', use: '<lang> <text>', react: '🌍' },
async ({ args, m, reply }) => {
  let lang = args[0], text = args.slice(1).join(' ') || m.quoted?.text;
  if (!lang) return reply('Format: .translate si Hello how are you\nCommon codes: en si ta hi ar ja ko zh es fr de ru');
  if (!text) { text = args.join(' '); lang = 'en'; }
  if (!text) return reply('Provide text or reply to a message.');
  try {
    const r = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: text }, timeout: 30000
    });
    const out = (r.data?.[0] || []).map(x => x[0]).join('');
    await reply(`*TRANSLATION*\n\nTo   : ${lang}\nFrom : ${r.data?.[2] || 'auto'}\n\n${out}`);
  } catch (e) { await reply('Translation failed. Check the language code.'); }
});

cmd({ pattern: 'weather', alias: ['climate', 'wx'], desc: 'Current weather for any city', category: 'tools', use: '<city>', react: '🌤️' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a city name.\nExample: .weather Colombo');
  try {
    const r = await axios.get(`https://wttr.in/${encodeURIComponent(q)}?format=j1`, { timeout: 30000 });
    const c = r.data.current_condition[0], a = r.data.nearest_area[0];
    await reply(
`*WEATHER REPORT*

Location   : ${a.areaName[0].value}, ${a.country[0].value}
Condition  : ${c.weatherDesc[0].value}
Temperature: ${c.temp_C}C (feels like ${c.FeelsLikeC}C)
Humidity   : ${c.humidity}%
Wind       : ${c.windspeedKmph} km/h ${c.winddir16Point}
Pressure   : ${c.pressure} mb
Visibility : ${c.visibility} km
UV Index   : ${c.uvIndex}
Updated    : ${c.localObsDateTime}`);
  } catch (e) { await reply('Could not fetch the weather for that location.'); }
});

cmd({ pattern: 'forecast', desc: '3-day weather forecast', category: 'tools', use: '<city>', react: '📅' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a city name.\nExample: .forecast Kandy');
  try {
    const r = await axios.get(`https://wttr.in/${encodeURIComponent(q)}?format=j1`, { timeout: 30000 });
    let t = `*3-DAY FORECAST*\n${r.data.nearest_area[0].areaName[0].value}\n\n`;
    r.data.weather.slice(0, 3).forEach(d => {
      t += `${d.date}\n  Max ${d.maxtempC}C / Min ${d.mintempC}C\n  ${d.hourly[4]?.weatherDesc[0].value || ''}\n  Sunrise ${d.astronomy[0].sunrise} | Sunset ${d.astronomy[0].sunset}\n\n`;
    });
    await reply(t);
  } catch (e) { await reply('Forecast unavailable for that location.'); }
});

cmd({ pattern: 'calc', alias: ['calculate', 'math'], desc: 'Calculate a math expression', category: 'tools', use: '<expression>', react: '🧮' },
async ({ q, reply }) => {
  if (!q) return reply('Provide an expression.\nExample: .calc (25*4)+18/2');
  const clean = q.replace(/[^0-9+\-*/().%\s^]/g, '').replace(/\^/g, '**');
  if (!clean) return reply('That expression contains unsupported characters.');
  try {
    const result = Function(`"use strict"; return (${clean})`)();
    if (result === undefined || Number.isNaN(result)) throw new Error('bad');
    await reply(`*CALCULATOR*\n\nExpression : ${q}\nResult     : ${result}`);
  } catch { await reply('Invalid mathematical expression.'); }
});

cmd({ pattern: 'qr', alias: ['qrcode', 'makeqr'], desc: 'Generate a QR code from text', category: 'tools', use: '<text>', react: '🔳' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide text or a link.\nExample: .qr https://google.com');
  const QRCode = require('qrcode');
  const buf = await QRCode.toBuffer(q, { width: 640, margin: 2 });
  await send({ image: buf, caption: withFooter(`*QR CODE GENERATED*\n\nContent: ${truncate(q, 90)}`) });
});

cmd({ pattern: 'readqr', alias: ['scanqr'], desc: 'Read a QR code from an image', category: 'tools', react: '📷' },
async ({ m, reply }) => {
  const t = m.quoted?.isImage ? m.quoted : (m.isImage ? m : null);
  if (!t) return reply('Reply to an image containing a QR code.');
  try {
    const FormData = require('form-data');
    const buf = await t.download();
    const form = new FormData();
    form.append('file', buf, 'qr.jpg');
    const r = await axios.post('https://api.qrserver.com/v1/read-qr-code/', form, { headers: form.getHeaders(), timeout: 60000 });
    const val = r.data?.[0]?.symbol?.[0]?.data;
    await reply(val ? `*QR CONTENT*\n\n${val}` : 'No QR code was detected in that image.');
  } catch (e) { await reply('QR reading failed.'); }
});

cmd({ pattern: 'shorten', alias: ['short', 'tinyurl'], desc: 'Shorten a long URL', category: 'tools', use: '<url>', react: '🔗' },
async ({ q, reply }) => {
  const url = extractUrl(q);
  if (!url) return reply('Provide a valid URL.\nExample: .shorten https://example.com/very/long/path');
  try {
    const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 30000 });
    await reply(`*URL SHORTENED*\n\nOriginal : ${truncate(url, 80)}\nShort    : ${r.data}`);
  } catch { await reply('URL shortening failed.'); }
});

cmd({ pattern: 'expand', alias: ['unshorten'], desc: 'Expand a shortened URL', category: 'tools', use: '<short url>', react: '🔎' },
async ({ q, reply }) => {
  const url = extractUrl(q);
  if (!url) return reply('Provide a short URL.');
  try {
    const r = await axios.get(url, { maxRedirects: 10, timeout: 30000, validateStatus: () => true });
    await reply(`*EXPANDED URL*\n\nShort : ${url}\nFinal : ${r.request?.res?.responseUrl || 'unknown'}`);
  } catch (e) { await reply('Could not expand that URL.'); }
});

cmd({ pattern: 'define', alias: ['dictionary', 'dict', 'meaning'], desc: 'Dictionary definition of a word', category: 'tools', use: '<word>', react: '📖' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a word.\nExample: .define ephemeral');
  try {
    const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.split(' ')[0])}`, { timeout: 30000 });
    const d = r.data[0];
    let t = `*DICTIONARY*\n\nWord        : ${d.word}\nPhonetic    : ${d.phonetic || '-'}\n\n`;
    d.meanings.slice(0, 3).forEach(mn => {
      t += `*${mn.partOfSpeech}*\n`;
      mn.definitions.slice(0, 2).forEach((df, i) => {
        t += `${i + 1}. ${df.definition}\n`;
        if (df.example) t += `   Example: ${df.example}\n`;
      });
      t += '\n';
    });
    await reply(t);
  } catch { await reply('No definition found for that word.'); }
});

cmd({ pattern: 'wiki', alias: ['wikipedia'], desc: 'Search Wikipedia', category: 'tools', use: '<topic>', react: '📚' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide a topic.\nExample: .wiki Sri Lanka');
  try {
    const r = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`, { timeout: 30000 });
    const d = r.data;
    const text = `*WIKIPEDIA*\n\nTitle : ${d.title}\n\n${d.extract}\n\nRead more:\n${d.content_urls?.desktop?.page || ''}`;
    if (d.thumbnail?.source) return send({ image: { url: d.thumbnail.source }, caption: withFooter(text) });
    await reply(text);
  } catch { await reply('No Wikipedia article found for that topic.'); }
});

cmd({ pattern: 'ss', alias: ['screenshot', 'webshot'], desc: 'Take a screenshot of a website', category: 'tools', use: '<url>', react: '🖥️' },
async ({ q, reply, send }) => {
  const url = extractUrl(q) || (q ? 'https://' + q.trim() : null);
  if (!url) return reply('Provide a website URL.\nExample: .ss https://google.com');
  await reply('Capturing screenshot...');
  try {
    const buf = await getBuffer(`https://image.thum.io/get/width/1280/crop/900/noanimate/${url}`);
    await send({ image: buf, caption: withFooter(`*WEBSITE SCREENSHOT*\n\n${url}`) });
  } catch { await reply('Screenshot failed for that URL.'); }
});

cmd({ pattern: 'ipinfo', alias: ['ip', 'iplookup'], desc: 'Look up information about an IP address', category: 'tools', use: '<ip>', react: '🌐' },
async ({ q, reply }) => {
  if (!q) return reply('Provide an IP address.\nExample: .ipinfo 8.8.8.8');
  try {
    const r = await axios.get(`http://ip-api.com/json/${encodeURIComponent(q.trim())}`, { timeout: 30000 });
    const d = r.data;
    if (d.status !== 'success') return reply('Invalid IP address.');
    await reply(`*IP INFORMATION*\n\nIP       : ${d.query}\nCountry  : ${d.country} (${d.countryCode})\nRegion   : ${d.regionName}\nCity     : ${d.city}\nZIP      : ${d.zip}\nISP      : ${d.isp}\nOrg      : ${d.org}\nTimezone : ${d.timezone}\nLat/Lon  : ${d.lat}, ${d.lon}`);
  } catch { await reply('IP lookup failed.'); }
});

cmd({ pattern: 'whois', alias: ['domaininfo'], desc: 'Domain information lookup', category: 'tools', use: '<domain>', react: '🔍' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a domain.\nExample: .whois google.com');
  try {
    const d = q.replace(/https?:\/\//, '').split('/')[0];
    const r = await axios.get(`https://dns.google/resolve?name=${encodeURIComponent(d)}&type=A`, { timeout: 30000 });
    const ips = (r.data?.Answer || []).filter(a => a.type === 1).map(a => a.data);
    await reply(`*DOMAIN LOOKUP*\n\nDomain : ${d}\nStatus : ${r.data?.Status === 0 ? 'resolved' : 'not found'}\nIPs    : ${ips.join(', ') || 'none'}`);
  } catch { await reply('Domain lookup failed.'); }
});

cmd({ pattern: 'currency', alias: ['exchange', 'convert2'], desc: 'Convert between currencies', category: 'tools', use: '<amount> <from> <to>', react: '💱' },
async ({ args, reply }) => {
  if (args.length < 3) return reply('Format: .currency 100 USD LKR');
  const [amount, from, to] = [parseFloat(args[0]), args[1].toUpperCase(), args[2].toUpperCase()];
  if (Number.isNaN(amount)) return reply('The amount must be a number.');
  try {
    const r = await axios.get(`https://open.er-api.com/v6/latest/${from}`, { timeout: 30000 });
    const rate = r.data?.rates?.[to];
    if (!rate) return reply(`Currency code *${to}* was not recognised.`);
    await reply(`*CURRENCY CONVERTER*\n\n${amount} ${from} = ${(amount * rate).toFixed(2)} ${to}\n\nRate    : 1 ${from} = ${rate} ${to}\nUpdated : ${r.data.time_last_update_utc}`);
  } catch { await reply('Currency conversion failed.'); }
});

cmd({ pattern: 'crypto', alias: ['coin', 'btc'], desc: 'Live cryptocurrency price', category: 'tools', use: '<coin>', react: '₿' },
async ({ q, reply }) => {
  const coin = (q || 'bitcoin').toLowerCase().trim();
  try {
    const r = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, { params: { ids: coin, vs_currencies: 'usd,lkr', include_24hr_change: true, include_market_cap: true }, timeout: 30000 });
    const d = r.data[coin];
    if (!d) return reply(`Coin *${coin}* not found. Try: bitcoin, ethereum, solana, dogecoin`);
    await reply(`*CRYPTO PRICE*\n\nCoin      : ${coin.toUpperCase()}\nUSD       : $${d.usd?.toLocaleString()}\nLKR       : ${d.lkr?.toLocaleString()}\n24h change: ${d.usd_24h_change?.toFixed(2)}%\nMarket cap: $${Math.round(d.usd_market_cap || 0).toLocaleString()}`);
  } catch { await reply('Crypto price lookup failed.'); }
});

cmd({ pattern: 'encode', alias: ['base64', 'b64'], desc: 'Encode text to base64', category: 'tools', use: '<text>', react: '🔐' },
async ({ q, m, reply }) => {
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide text to encode.');
  await reply(`*BASE64 ENCODE*\n\n${Buffer.from(t).toString('base64')}`);
});

cmd({ pattern: 'decode', alias: ['unbase64', 'debase64'], desc: 'Decode base64 text', category: 'tools', use: '<base64>', react: '🔓' },
async ({ q, m, reply }) => {
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide base64 text to decode.');
  try { await reply(`*BASE64 DECODE*\n\n${Buffer.from(t, 'base64').toString('utf8')}`); }
  catch { await reply('That is not valid base64.'); }
});

cmd({ pattern: 'hash', alias: ['md5', 'sha256'], desc: 'Generate hashes of text', category: 'tools', use: '<text>', react: '#️⃣' },
async ({ q, m, reply }) => {
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide text to hash.');
  await reply(`*HASH RESULTS*\n\nMD5    : ${crypto.createHash('md5').update(t).digest('hex')}\nSHA1   : ${crypto.createHash('sha1').update(t).digest('hex')}\nSHA256 : ${crypto.createHash('sha256').update(t).digest('hex')}`);
});

cmd({ pattern: 'password', alias: ['genpass', 'pwd'], desc: 'Generate a strong random password', category: 'tools', use: '<length>', react: '🔑' },
async ({ args, reply }) => {
  const len = Math.min(Math.max(parseInt(args[0]) || 16, 6), 64);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
  let p = '';
  for (let i = 0; i < len; i++) p += chars[crypto.randomInt(chars.length)];
  await reply(`*PASSWORD GENERATED*\n\nLength   : ${len}\nPassword : ${p}\n\nStore it somewhere safe.`);
});

cmd({ pattern: 'binary', alias: ['tobinary'], desc: 'Convert text to binary', category: 'tools', use: '<text>', react: '💾' },
async ({ q, reply }) => {
  if (!q) return reply('Provide text.');
  await reply(`*TEXT TO BINARY*\n\n${q.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ')}`);
});

cmd({ pattern: 'unbinary', alias: ['frombinary'], desc: 'Convert binary back to text', category: 'tools', use: '<binary>', react: '🔤' },
async ({ q, reply }) => {
  if (!q) return reply('Provide binary digits separated by spaces.');
  try { await reply(`*BINARY TO TEXT*\n\n${q.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('')}`); }
  catch { await reply('Invalid binary input.'); }
});

cmd({ pattern: 'morse', desc: 'Convert text to morse code', category: 'tools', use: '<text>', react: '📡' },
async ({ q, reply }) => {
  if (!q) return reply('Provide text.');
  const M = { a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',y:'-.--',z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',' ':'/' };
  await reply(`*MORSE CODE*\n\n${q.toLowerCase().split('').map(c => M[c] || c).join(' ')}`);
});

cmd({ pattern: 'reversetext', alias: ['revtext'], desc: 'Reverse any text', category: 'tools', use: '<text>', react: '🔄' },
async ({ q, m, reply }) => {
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide text.');
  await reply(`*REVERSED*\n\n${t.split('').reverse().join('')}`);
});

cmd({ pattern: 'upper', alias: ['uppercase'], desc: 'Convert text to uppercase', category: 'tools', use: '<text>', react: '🔠' },
async ({ q, m, reply }) => reply(`*UPPERCASE*\n\n${String(q || m.quoted?.text || '').toUpperCase() || 'Provide text.'}`));

cmd({ pattern: 'lower', alias: ['lowercase'], desc: 'Convert text to lowercase', category: 'tools', use: '<text>', react: '🔡' },
async ({ q, m, reply }) => reply(`*LOWERCASE*\n\n${String(q || m.quoted?.text || '').toLowerCase() || 'Provide text.'}`));

cmd({ pattern: 'smallcaps', alias: ['fancytext', 'stylish'], desc: 'Convert text to small caps style', category: 'tools', use: '<text>', react: '✒️' },
async ({ q, m, reply }) => {
  const { toSmallCaps } = require('../lib/utils');
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide text.');
  await reply(`*SMALL CAPS*\n\n${toSmallCaps(t)}`);
});

cmd({ pattern: 'count', alias: ['wordcount', 'charcount'], desc: 'Count words and characters', category: 'tools', use: '<text>', react: '🔢' },
async ({ q, m, reply }) => {
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide text or reply to a message.');
  await reply(`*TEXT STATISTICS*\n\nCharacters       : ${t.length}\nWithout spaces   : ${t.replace(/\s/g, '').length}\nWords            : ${t.trim().split(/\s+/).length}\nLines            : ${t.split('\n').length}\nSentences        : ${t.split(/[.!?]+/).filter(Boolean).length}`);
});

cmd({ pattern: 'vcard', alias: ['contact', 'savecontact'], desc: 'Create a contact card', category: 'tools', use: '<number> <name>', react: '📇' },
async ({ args, send, reply }) => {
  if (args.length < 2) return reply('Format: .vcard 94771234567 John Doe');
  const num = args[0].replace(/[^0-9]/g, '');
  const name = args.slice(1).join(' ');
  await send({ contacts: { displayName: name, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD` }] } });
});

cmd({ pattern: 'getpp', alias: ['getdp', 'profilepic', 'pp'], desc: 'Get someone\'s profile picture', category: 'tools', use: '@user', react: '🖼️' },
async ({ sock, m, args, reply, send }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] ? numToJid(args[0]) : m.sender);
  try {
    const url = await sock.profilePictureUrl(t, 'image');
    await send({ image: { url }, caption: withFooter(`*PROFILE PICTURE*\n\nUser: @${jidToNum(t)}`), mentions: [t] });
  } catch { await reply('That user has no profile picture or it is private.'); }
});

const REACTION_PACKS = {
  sad: ['😔','😞','😢','😭','🥺','💔','😟','🙁'],
  happy: ['😀','😃','😄','😁','😂','🤣','😊','🥰','😍','🎉','✨'],
  funny: ['😂','🤣','😹','😜','😝','🤪','🤡','💀','😭'],
  tech: ['🤖','💻','🧠','⚙️','🛠️','🚀','💡','🔧','📡'],
  random: ['😀','😂','🥰','😎','😮','😢','😡','🤔','🔥','❤️','💯','👏','✨','🎉','👍','👎'],
  love: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💖','💘'],
  angry: ['😠','😡','🤬','💢','🔥','😤','👿'],
  wow: ['😮','😲','🤯','😳','😍','🤩','👏','🔥'],
  cool: ['😎','🤩','💯','🔥','⚡','🚀','🆒'],
  applause: ['👏','🙌','🎉','💯','🥳','✨']
};

cmd({ pattern: 'chreacts', alias: ['chreact', 'channelreact'], desc: 'React to a channel post with packs or custom emojis', category: 'tools', use: '<post URL>, <pack|emoji list>', react: '💟' },
async ({ q, reply }) => {
  const parts = String(q || '').split(',').map(x => x.trim()).filter(Boolean);
  const postUrl = parts.shift();
  const requested = parts.map(x => x.toLowerCase());
  const match = postUrl?.match(/whatsapp\.com\/channel\/([^/]+)\/(\d+)/i);
  if (!match || !requested.length) return reply('Use: .chreacts URL, sad OR .chreacts URL, 😑, 🤍, 😹');
  const emojis = [...new Set(requested.flatMap(x => REACTION_PACKS[x] || [x]).filter(x => x.length <= 8 && !/^[a-z]+$/i.test(x)))];
  if (!emojis.length) return reply('Choose a valid reaction pack or enter custom emojis.');
  try {
    const { sessions } = require('../lib/connection');
    const targets = [...sessions.values()].filter(s => s.status === 'connected' && s.sock);
    if (!targets.length) return reply('No connected bot users are available for this reaction.');
    let ok = 0, attempted = 0;
    for (const session of targets) {
      const meta = await session.sock.newsletterMetadata('invite', match[1]).catch(() => null);
      const jid = meta?.id;
      if (!jid) continue;
      // Each connected bot user reacts once, choosing a random emoji from
      // the requested pack/list. This distributes all supplied emojis.
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      attempted++;
      try { await session.sock.newsletterReactMessage(jid, match[2], emoji); ok++; require('../lib/diag').bump('channelReactions'); } catch (_) {}
    }
    await reply(`💟 Channel reactions sent: ${ok}/${attempted} bot user(s).\n🎲 Emoji pool: ${emojis.join(' ')}`);
  } catch (e) { await reply(`❌ Channel reaction failed: ${String(e.message || e).slice(0, 180)}`); }
});

cmd({ pattern: 'getbio', alias: ['about', 'bio'], desc: 'Get someone\'s WhatsApp about text', category: 'tools', use: '@user', react: '💭' },
async ({ sock, m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] ? numToJid(args[0]) : m.sender);
  try {
    const s = await sock.fetchStatus(t);
    const st = Array.isArray(s) ? s[0]?.status : s;
    await reply(`*USER BIO*\n\nUser : ${jidToNum(t)}\nBio  : ${st?.status || 'hidden'}\nSet  : ${st?.setAt ? new Date(st.setAt).toLocaleString('en-GB') : 'unknown'}`);
  } catch { await reply('Could not read that user\'s bio (privacy settings).'); }
});

cmd({ pattern: 'afk', desc: 'Set yourself as away from keyboard', category: 'tools', use: '<reason>', react: '😴' },
async ({ m, q, reply }) => {
  const u = await db.getUser(m.sender, m.pushName);
  u.afk = { active: true, reason: q || 'no reason given', since: new Date() };
  await u.save();
  await reply(`*AFK MODE ENABLED*\n\nUser   : ${m.pushName}\nReason : ${q || 'no reason given'}\n\nAnyone who mentions you will be told you are away.`);
});

cmd({ pattern: 'jid', alias: ['chatid', 'getjid'], desc: 'Show the JID of this chat or a user', category: 'tools', react: '🆔' },
async ({ m, reply }) => reply(`*JID INFORMATION*\n\nChat   : ${m.chat}\nSender : ${m.sender}\nType   : ${m.isGroup ? 'group' : 'private'}`));

cmd({ pattern: 'remind', alias: ['reminder'], desc: 'Set a reminder', category: 'tools', use: '<minutes> <text>', react: '⏰' },
async ({ args, m, sock, reply }) => {
  const mins = parseFloat(args[0]);
  const text = args.slice(1).join(' ');
  if (!mins || !text) return reply('Format: .remind 10 Take a break');
  if (mins > 1440) return reply('Maximum reminder time is 1440 minutes (24 hours).');
  await reply(`*REMINDER SET*\n\nIn   : ${mins} minute(s)\nText : ${text}`);
  setTimeout(() => {
    sock.sendMessage(m.chat, { text: withFooter(`*REMINDER*\n\n@${m.senderNum}\n${text}\n\nSet ${mins} minute(s) ago.`), mentions: [m.sender] }).catch(() => {});
  }, mins * 60000);
});

cmd({ pattern: 'poll2', alias: ['quickpoll'], desc: 'Quick yes/no poll', category: 'tools', use: '<question>', react: '🗳️' },
async ({ sock, m, q, reply }) => {
  if (!q) return reply('Provide a question.\nExample: .poll2 Should we meet tomorrow?');
  await sock.sendMessage(m.chat, { poll: { name: q, values: ['Yes', 'No', 'Maybe'], selectableCount: 1 } });
});

cmd({ pattern: 'colorinfo', alias: ['color', 'hex'], desc: 'Information about a hex colour', category: 'tools', use: '<hex>', react: '🎨' },
async ({ q, reply, send }) => {
  const hex = String(q || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return reply('Provide a 6-digit hex colour.\nExample: .color #1e90ff');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  await send({ image: { url: `https://singlecolorimage.com/get/${hex}/400x400` }, caption: withFooter(`*COLOUR INFORMATION*\n\nHEX : #${hex.toUpperCase()}\nRGB : ${r}, ${g}, ${b}\nHSL : computed from RGB\nInt : ${parseInt(hex, 16)}`) });
});

cmd({ pattern: 'timezone', alias: ['worldtime', 'tz'], desc: 'Current time in another timezone', category: 'tools', use: '<zone>', react: '🌏' },
async ({ q, reply }) => {
  const zone = q || config.TIMEZONE;
  try {
    const t = new Date().toLocaleString('en-GB', { timeZone: zone, dateStyle: 'full', timeStyle: 'long' });
    await reply(`*WORLD TIME*\n\nZone : ${zone}\nTime : ${t}`);
  } catch { await reply('Invalid timezone.\nExamples: Asia/Colombo, Europe/London, America/New_York'); }
});

cmd({ pattern: 'age', alias: ['agecalc'], desc: 'Calculate age from a birth date', category: 'tools', use: '<YYYY-MM-DD>', react: '🎂' },
async ({ q, reply }) => {
  const d = new Date(q);
  if (!q || Number.isNaN(d.getTime())) return reply('Provide a date.\nExample: .age 1998-06-15');
  const ms = Date.now() - d.getTime();
  const years = Math.floor(ms / 31557600000);
  const days = Math.floor(ms / 86400000);
  await reply(`*AGE CALCULATOR*\n\nBirth date : ${d.toDateString()}\nAge        : ${years} years\nTotal days : ${days.toLocaleString()}\nTotal hours: ${Math.floor(ms / 3600000).toLocaleString()}`);
});

cmd({ pattern: 'news', alias: ['headlines'], desc: 'Latest world news headlines', category: 'tools', react: '📰' },
async ({ reply }) => {
  try {
    const r = await axios.get('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feeds.bbci.co.uk/news/rss.xml'), { timeout: 40000 });
    const items = [...String(r.data).matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>/g)].slice(0, 10);
    if (!items.length) return reply('Could not load news right now.');
    let t = `*WORLD NEWS HEADLINES*\n\n`;
    items.forEach((m2, i) => { t += `${i + 1}. ${m2[1]}\n   ${m2[2]}\n\n`; });
    await reply(t);
  } catch { await reply('News service is temporarily unavailable.'); }
});

cmd({ pattern: 'pastebin', alias: ['paste'], desc: 'Upload text and get a shareable link', category: 'tools', use: '<text>', react: '📋' },
async ({ q, m, reply }) => {
  const t = q || m.quoted?.text;
  if (!t) return reply('Provide text or reply to a message.');
  try {
    const r = await axios.post('https://api.dpaste.com/', new URLSearchParams({ content: t, syntax: 'text', expiry_days: '30' }), { timeout: 40000 });
    await reply(`*TEXT UPLOADED*\n\nLink   : ${String(r.data).trim()}\nExpiry : 30 days`);
  } catch { await reply('Upload failed.'); }
});
