/**
 * 18+ VIDEO DOWNLOADERS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Powered by CHAMA MOVIE API (https://chama-movie-api.koyeb.app)
 * All commands are NSFW-gated (handler blocks in groups where NSFW is disabled).
 */
const { cmd } = require('../lib/command');
const { extractUrl, withFooter, truncate, axios } = require('../lib/utils');

const ADULT_BASE = 'https://sasa-dev-api.xyz/api';
const { sasaApi } = require('../lib/utils');
const config = require('../config');
const adultFetch = async (path, params = {}) => {
  try {
    const res = await require('axios').get(`${ADULT_BASE}${path}`, {
      params: { ...params },
      headers: { 'X-API-Key': config.API_KEY, 'x-api-key': config.API_KEY, 'User-Agent': 'LakshanXMD/1.0' },
      timeout: 90000,
      validateStatus: () => true
    });
    return res.data || {};
  } catch (_) {
    return { status: false, error: 'network error' };
  }
};

const askQ = (name, prefix, c) =>
  `*${name} SEARCH*\n\nWhat should I search for?\n\nExample:\n${prefix}${c} <query>`;

/* ============ HANIME.TV ============ */
/* Hanime.tv has no equivalent on the new API; keep the original Chama endpoint */
const HANIME_BASE = 'https://chama-movie-api.koyeb.app/api/adult/hanime';
const HANIME_KEY = 'chama_api_9826e11e5a0fe69aecbfa19090f9b386';
async function hanimeSearch({ q, reply, send, prefix, wantDl }) {
  if (!q) return reply(askQ('HANIME.TV', prefix, wantDl ? 'hanimetvdl' : 'hanimetv'));
  await reply('Searching Hanime... please wait 🕐');
  try {
    const r = await axios.get(`${HANIME_BASE}/search?q=${encodeURIComponent(q)}&page=1&api_key=${HANIME_KEY}`, { timeout: 60000, validateStatus: () => true });
    const d = r.data || {};
    if (!d.status && !d.success) return reply(`*HANIME SEARCH*\n\nFailed: ${d.error || d.message || 'unknown error'}`);
    const items = d.data || d.results || [];
    if (!items.length) return reply('*HANIME SEARCH*\n\nNo results found. Try another query.');
    const pick = items[0];
    if (wantDl) {
      const info = `*HANIME DOWNLOADER*\n\nTitle    : ${truncate(String(pick.title), 90)}\nType     : ${pick.type || '-'}\nQuality  : ${pick.quality || '-'}\nRating   : ${pick.rating || '-'}\nLink     : ${pick.link || '-'}`;
      return await send({ image: { url: pick.image }, caption: withFooter(info) });
    }
    let t = `*HANIME SEARCH* — "${q}"\n\n`;
    items.slice(0, 10).forEach((x, i) => {
      t += `${i + 1}. ${truncate(String(x.title), 70)}\n   Quality: ${x.quality || '-'} | Rating: ${x.rating || '-'}\n   ${x.link || '-'}\n\n`;
    });
    return await send({ image: { url: pick.image }, caption: withFooter(t) });
  } catch (e) {
    await reply(`Hanime search failed: ${e.message || 'server error'}`);
  }
}
cmd({ pattern: 'hanimetv', alias: ['hanime'], desc: 'Search videos on Hanime.tv', category: 'adult', use: '<query>', react: '🎌', nsfw: true }, async (ctx) => hanimeSearch(ctx, false));
cmd({ pattern: 'hanimetvdl', alias: ['hanimedl'], desc: 'Get downloadable video info from Hanime.tv', category: 'adult', use: '<url>', react: '📥', nsfw: true }, async (ctx) => hanimeSearch(ctx, true));

/* ============ ADULT NUMBERED-REPLY CHOICES ============ */
/* Searching lists videos numbered 1..10. Replying to the search card with a
   number downloads that exact video directly (stored 5 min, deduped). */
const NodeCache = require('node-cache');
const adultChoices = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 2000 });
global.__adultChoices = adultChoices;
/* Hook consumed by lib/handler.js (download choice routing). */
global.__handleDownloadChoice = async (msgid, text, reply, send) => {
  const entry = adultChoices.get(msgid);
  if (!entry) return false;
  const num = parseInt(String(text).trim(), 10);
  if (isNaN(num) || num < 1 || num > entry.items.length) return false;
  const pick = entry.items[num - 1];
  if (!pick?.url) return await reply(`Item ${num} has no downloadable link.`);
  /* Fetch the direct video url via the matching endpoint */
  try {
    const d = await adultFetch(pick.ep, { url: pick.url });
    const dl = d?.result ?? d?.data ?? d;
    let videoUrl = '';
    if (typeof dl === 'string') videoUrl = dl;
    else if (dl?.high) videoUrl = dl.high;
    else if (dl?.low) videoUrl = dl.low;
    else if (dl?.hls) videoUrl = dl.hls;
    else videoUrl = (dl?.download_url || dl?.direct_link || dl?.raw_link || dl?.url || dl?.link || '');
    if (!videoUrl) return await reply(`*DIRECT DL*\n\nItem ${num} extraction failed. Try another number.`);
    const info = `*ADULT DIRECT DL* — #${num}\n\nTitle: ${truncate(String(pick.title || 'video'), 90)}\nSource: ${pick.url}`;
    await send({ video: { url: videoUrl }, mimetype: 'video/mp4', caption: withFooter(info) });
    return true;
  } catch (e) {
    return await reply(`Direct download failed: ${e.message || 'server error'}`);
  }
};
function storeAdultChoices(msg, site, items) {
  const msgid = msg?.key?.id;
  if (!msgid) return;
  const epMap = { xnxx: '/adult/xnxx/download', xham: '/media/xh/download', beeg: '/media/beeg/download' };
  const list = items.map(x => ({ title: x.title, url: x.url || x.link, ep: epMap[site] || '/adult/xnxx/download' }));
  adultChoices.set(msgid, { ts: Date.now(), items: list, site });
}

/* ============ XNXX ============ */
/* Normalize the new-API flexible response into a list */
function adultItems(d) {
  const r = d?.result ?? d?.results ?? d?.data ?? d?.videos;
  return Array.isArray(r) ? r : [];
}
function adultFail(d) {
  return d?.status === false && !d?.result && !d?.results && !d?.data;
}
async function xnxxSearch({ q, reply, send, prefix }) {
  if (!q) return reply(askQ('XNXX', prefix, 'xnxx'));
  await reply('Searching XNXX... please wait 🕐');
  try {
    const d = await adultFetch('/adult/xnxx/search', { q, page: 1 });
    if (adultFail(d)) return reply(`*XNXX SEARCH*\n\nFailed: ${d.error || d.message || 'unknown error'}`);
    const items = adultItems(d);
    if (!items.length) return reply('*XNXX SEARCH*\n\nNo results found. Try another query.');
    let t = `*XNXX SEARCH* — "${q}"\n\n`;
    const shown = items.slice(0, 10);
    shown.forEach((x, i) => {
      t += `${i + 1}. ${truncate(String(x.title), 70)}\n   Duration: ${x.duration || '-'}\n   ${x.url || x.link || '-'}\n\n`;
    });
    t += `💬 *REPLY WITH THE NUMBER (1-${shown.length}) TO DOWNLOAD DIRECTLY.*\n⏳ Choices expire in 5 minutes.`;
    const thumb = items[0].thumbnail || items[0].thumb || items[0].image || null;
    const opt = thumb ? { image: { url: thumb }, caption: withFooter(t) } : { text: withFooter(t) };
    const sent = await send(opt);
    storeAdultChoices(sent?.key ? { key: sent.key } : undefined, 'xnxx', shown);
    return sent;
  } catch (e) {
    await reply(`XNXX search failed: ${e.message || 'server error'}`);
  }
}
async function xnxxDl({ q, m, reply, send, prefix }) {
  const url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  if (!url || !/xnxx\.com/i.test(url)) return reply(`Provide a valid *XNXX* video URL.\n\nExample:\n${prefix}xnxxdl https://www.xnxx.com/video-xxxx/example`);
  await reply('Fetching XNXX video... please wait 🕐');
  try {
    const d = await adultFetch('/adult/xnxx/download', { url });
    if (adultFail(d)) return reply(`*XNXX DOWNLOADER*\n\nExtraction failed.\nMessage: ${d.error || d.message || 'Try another video link.'}`);
    const dl = d.result ?? d.data ?? d;
    /* New API returns { low, high, hls } quality keys — deliver REAL VIDEO
       files (the high quality one, falling back to low then hls). */
    let videoUrl = '';
    if (typeof dl === 'string') videoUrl = dl;
    else if (dl?.high) videoUrl = dl.high;
    else if (dl?.low) videoUrl = dl.low;
    else if (dl?.hls) videoUrl = dl.hls;
    else videoUrl = (dl.download_url || dl.direct_link || dl.raw_link || dl.url || dl.link || '');
    if (!videoUrl) return reply(`*XNXX DOWNLOADER*\n\nNo video link returned. Response: ${truncate(JSON.stringify(d), 200)}`);
    const info = `*XNXX DOWNLOADER*\n\nOriginal : ${truncate(url, 90)}${dl?.low && dl?.high ? '\nQualities: 240p / 360p (high sent)' : ''}`;
    await send({ video: { url: videoUrl }, mimetype: 'video/mp4', caption: withFooter(info) });
  } catch (e) {
    await reply(`XNXX download failed: ${e.message || 'server error'}\nTry again later.`);
  }
}
cmd({ pattern: 'xnxx', alias: ['xnxxsearch'], desc: 'Search videos on XNXX', category: 'adult', use: '<query>', react: '🔞', nsfw: true }, xnxxSearch);
cmd({ pattern: 'xnxxdl', alias: ['xnxxvideo'], desc: 'Download a video from XNXX', category: 'adult', use: '<url>', react: '📥', nsfw: true }, xnxxDl);

/* ============ XHAMSTER ============ */
async function xhamSearch({ q, reply, send, prefix }) {
  if (!q) return reply(askQ('XHAMSTER', prefix, 'xham'));
  await reply('Searching Xhamster... please wait 🕐');
  try {
    const d = await adultFetch('/media/xh/search', { q, page: 1 });
    if (adultFail(d)) return reply(`*XHAMSTER SEARCH*\n\nFailed: ${d.error || d.message || 'unknown error'}`);
    const items = adultItems(d);
    if (!items.length) return reply('*XHAMSTER SEARCH*\n\nNo results found. Try another query.');
    let t = `*XHAMSTER SEARCH* — "${q}"\n\n`;
    const shown = items.slice(0, 10);
    shown.forEach((x, i) => {
      t += `${i + 1}. ${truncate(String(x.title), 70)}\n   Duration: ${x.duration || '-'}\n   ${x.url || x.link || '-'}\n\n`;
    });
    t += `💬 *REPLY WITH THE NUMBER (1-${shown.length}) TO DOWNLOAD DIRECTLY.*\n⏳ Choices expire in 5 minutes.`;
    const thumb = items[0].thumbnail || items[0].thumb || items[0].image || null;
    const opt = thumb ? { image: { url: thumb }, caption: withFooter(t) } : { text: withFooter(t) };
    const sent = await send(opt);
    storeAdultChoices(sent?.key ? { key: sent.key } : undefined, 'xham', shown);
    return sent;
  } catch (e) {
    await reply(`Xhamster search failed: ${e.message || 'server error'}`);
  }
}
async function xhamDl({ q, m, reply, send, prefix }) {
  const url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  if (!url || !/xhamster\.com/i.test(url)) return reply(`Provide a valid *Xhamster* video URL.\n\nExample:\n${prefix}xhamdl https://xhamster.com/videos/example-xxxx`);
  await reply('Fetching Xhamster video... please wait 🕐');
  try {
    const d = await adultFetch('/media/xh/download', { url });
    if (adultFail(d)) return reply(`*XHAMSTER DOWNLOADER*\n\nExtraction failed.\nMessage: ${d.error || d.message || 'Try another video link or report this to the API owner.'}`);
    const dl = d.result ?? d.data ?? d;
    let videoUrl = '';
    if (typeof dl === 'string') videoUrl = dl;
    else if (dl?.high) videoUrl = dl.high;
    else if (dl?.low) videoUrl = dl.low;
    else if (dl?.hls) videoUrl = dl.hls;
    else videoUrl = (dl.download_url || dl.direct_link || dl.raw_link || dl.url || dl.link || '');
    if (!videoUrl) return reply(`*XHAMSTER DOWNLOADER*\n\nNo video link returned. Response: ${truncate(JSON.stringify(d), 200)}`);
    const info = `*XHAMSTER DOWNLOADER*\n\nOriginal : ${truncate(url, 90)}`;
    await send({ video: { url: videoUrl }, mimetype: 'video/mp4', caption: withFooter(info) });
  } catch (e) {
    await reply(`Xhamster download failed: ${e.message || 'server error'}\nTry again later.`);
  }
}
cmd({ pattern: 'xham', alias: ['xhamster'], desc: 'Search videos on Xhamster', category: 'adult', use: '<query>', react: '🔞', nsfw: true }, xhamSearch);
cmd({ pattern: 'xhamdl', alias: ['xhamsterdl'], desc: 'Download a video from Xhamster', category: 'adult', use: '<url>', react: '📥', nsfw: true }, xhamDl);

/* ============ BEEG ============ */
async function beegSearch({ q, reply, send, prefix }) {
  if (!q) return reply(askQ('BEEG', prefix, 'beeg'));
  await reply('Searching Beeg... please wait 🕐');
  try {
    const d = await adultFetch('/media/beeg/search', { q, page: 1 });
    if (adultFail(d)) return reply(`*BEEG SEARCH*\n\nFailed: ${d.error || d.message || 'unknown error'}`);
    const items = adultItems(d);
    if (!items.length) return reply('*BEEG SEARCH*\n\nNo results found. Try another query.');
    let t = `*BEEG SEARCH* — "${q}"\n\n`;
    const shown = items.slice(0, 10);
    shown.forEach((x, i) => {
      t += `${i + 1}. ${truncate(String(x.title), 70)}\n   Duration: ${x.duration || '-'}\n   ${x.url || x.link || '-'}\n\n`;
    });
    t += `💬 *REPLY WITH THE NUMBER (1-${shown.length}) TO DOWNLOAD DIRECTLY.*\n⏳ Choices expire in 5 minutes.`;
    const thumb = items[0].thumbnail || items[0].thumb || items[0].image || null;
    const opt = thumb ? { image: { url: thumb }, caption: withFooter(t) } : { text: withFooter(t) };
    const sent = await send(opt);
    storeAdultChoices(sent?.key ? { key: sent.key } : undefined, 'beeg', shown);
    return sent;
  } catch (e) {
    await reply(`Beeg search failed: ${e.message || 'server error'}`);
  }
}
async function beegDl({ q, m, reply, send, prefix }) {
  const url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  if (!url || !/beeg\.com/i.test(url)) return reply(`Provide a valid *Beeg* video URL.\n\nExample:\n${prefix}beegdl https://beeg.com/12345678`);
  await reply('Fetching Beeg video... please wait 🕐');
  try {
    const d = await adultFetch('/media/beeg/download', { url });
    if (adultFail(d)) return reply(`*BEEG DOWNLOADER*\n\nExtraction failed.\nMessage: ${d.error || d.message || 'Try another video link.'}`);
    const dl = d.result ?? d.data ?? d;
    let videoUrl = '';
    if (typeof dl === 'string') videoUrl = dl;
    else if (dl?.high) videoUrl = dl.high;
    else if (dl?.low) videoUrl = dl.low;
    else if (dl?.hls) videoUrl = dl.hls;
    else videoUrl = (dl.download_url || dl.direct_link || dl.raw_link || dl.url || dl.link || '');
    if (!videoUrl) return reply(`*BEEG DOWNLOADER*\n\nNo video link returned. Response: ${truncate(JSON.stringify(d), 200)}`);
    const info = `*BEEG DOWNLOADER*\n\nOriginal : ${truncate(url, 90)}`;
    await send({ video: { url: videoUrl }, mimetype: 'video/mp4', caption: withFooter(info) });
  } catch (e) {
    await reply(`Beeg download failed: ${e.message || 'server error'}\nTry again later.`);
  }
}
cmd({ pattern: 'beeg', alias: ['beegsearch'], desc: 'Search videos on Beeg', category: 'adult', use: '<query>', react: '🔞', nsfw: true }, beegSearch);
cmd({ pattern: 'beegdl', alias: ['beegvideo'], desc: 'Download a video from Beeg', category: 'adult', use: '<url>', react: '📥', nsfw: true }, beegDl);
