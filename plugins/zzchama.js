/** Pinterest / movie convenience commands powered by SASA DEV API. */
const { cmd } = require('../lib/command');
const { getBuffer, withFooter, truncate, axios } = require('../lib/utils');
const config = require('../config');

function items(data) {
  if (!data) return [];
  const r = data.result ?? data.videos ?? data.data ?? data;
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.videos)) return r.videos;
  return [];
}

async function sasaRequest(path, params = {}) {
  const res = await axios.get(`https://sasa-dev-api.xyz/api${path}`, {
    params: { ...params },
    headers: { 'X-API-Key': config.API_KEY, 'x-api-key': config.API_KEY, 'User-Agent': 'LakshanXMD/1.0' },
    timeout: 90000,
    validateStatus: () => true
  });
  const d = res.data || {};
  if (d.status === false && !d.result && !d.data) throw new Error(d.error || d.message || `API HTTP ${res.status}`);
  return d;
}

/* Pinterest on SASA DEV API: /api/pinterest?url=<link> returns the media.
   Use it for both search-and-save (reply with a pin link) and download. */
cmd({ pattern: 'pinsearch', alias: ['pinterestsearch', 'pinfind'], desc: 'Fetch Pinterest media via SASA DEV API', category: 'download', use: '<pin url>', react: '📌' },
async ({ q, reply, send }) => {
  if (!q) return reply('📌 Use: .pinsearch https://pin.it/<code>');
  try {
    const data = await sasaRequest('/pinterest', { url: q });
    const r = data.result ?? data.data ?? data;
    const link = (typeof r === 'string' ? r : (r.url || r.link || r.download_url || r.href || r.image || r.src || (r.media && r.media[0]) || ''));
    const title = r.title || r.name || r.caption || 'Pinterest';
    if (!link) return reply('No media found for that pin.');
    await reply('📥 Downloading Pinterest media...');
    const buf = await getBuffer(link);
    await send({ image: buf, caption: withFooter(`*PINTEREST*\n\n${truncate(title, 120)}`) });
  } catch (e) { await reply(`❌ Pinterest failed: ${e.message}`); }
});

cmd({ pattern: 'pindl', alias: ['pinterestdl', 'pinterestdownload'], desc: 'Download a Pinterest pin on SASA DEV API', category: 'download', use: '<pin url>', react: '📥' },
async ({ q, reply, send }) => {
  if (!q) return reply('📌 Use: .pindl https://pin.it/<code>');
  try {
    const data = await sasaRequest('/pinterest', { url: q });
    const r = data.result ?? data.data ?? data;
    const link = (typeof r === 'string' ? r : (r.url || r.link || r.download_url || r.href || r.image || r.src || (r.media && r.media[0]) || ''));
    if (!link) return reply('The API returned no downloadable media.');
    await reply('📥 Downloading Pinterest media...');
    const buf = await getBuffer(link);
    await send({ image: buf, caption: withFooter('*PINTEREST DOWNLOAD*') });
  } catch (e) { await reply(`❌ Pinterest download failed: ${e.message}`); }
});

cmd({ pattern: 'movie', alias: ['moviesearch'], desc: 'Search movies on SASA DEV API', category: 'movie', use: '<title>', react: '🎬' },
async ({ q, reply }) => {
  if (!q) return reply('🎬 Use: .movie <movie name>');
  try {
    const data = await sasaRequest('/movie/search?provider=sinhalasub', { q });
    const rows = items(data).slice(0, 15);
    if (!rows.length) return reply('No movies found.');
    await reply(`🎬 *MOVIE SEARCH*\n\n${rows.map((x, i) => `${i + 1}. ${x.title || x.name || 'Movie'}\n${x.url || x.link || ''}`).join('\n\n')}`);
  } catch (e) { await reply(`❌ Movie search failed: ${e.message}`); }
});

cmd({ pattern: 'moviedl', alias: ['downloadmoviechama'], desc: 'Resolve direct movie links on SASA DEV API', category: 'movie', use: '<movie url>', react: '⬇️' },
async ({ q, reply }) => {
  if (!q) return reply('🎬 Use: .moviedl <movie page URL>');
  try {
    const data = await sasaRequest('/movie/details', { url: q });
    const links = [];
    const walk = (o, depth = 0) => {
      if (!o || depth > 4) return;
      if (typeof o === 'string' && /^https?:\/\//.test(o) && /\.(mp4|mkv|avi|webm|zip)(\?|$)/i.test(o)) links.push(o);
      else if (Array.isArray(o)) o.forEach(x => walk(x, depth + 1));
      else if (typeof o === 'object') Object.values(o).forEach(x => walk(x, depth + 1));
    };
    walk(data);
    if (!links.length) return reply('No direct download links returned by the API.');
    await reply(`⬇️ *DOWNLOAD LINKS*\n\n${[...new Set(links)].slice(0, 20).map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
  } catch (e) { await reply(`❌ Movie download failed: ${e.message}`); }
});
