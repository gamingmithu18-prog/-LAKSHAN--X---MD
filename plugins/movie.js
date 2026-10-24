/**
 * MOVIE / SUBTITLE COMMANDS - SASA TECH API
 * 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const { sasaApi, extractUrl, withFooter, truncate } = require('../lib/utils');

/* Normalizes different site result shapes into a common list.
   New SASA DEV API returns: { status, result: [ { title, url, ... } ] } */
function normalize(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x, i) => ({
    no: x.No || x.index || i + 1,
    title: x.title || x.Title || x.name || 'Unknown',
    link: x.link || x.Link || x.url || x.URL || '',
    image: x.image || x.Img || x.imageUrl || x.image_url || x.thumbnail || config.LOGO,
    year: x.year || x.Year || '',
    rating: x.rating || x.Rating || x.imdb_rating || '',
    quality: x.quality || x.Quality || '',
    type: x.type || x.Type || ''
  })).filter(x => x.title);
}

/* Extract the result array from new-API responses (result / videos / results) */
function pickList(res) {
  if (!res) return [];
  const r = res.result ?? res.videos ?? res.data ?? res;
  if (Array.isArray(r)) return normalize(r);
  if (r && Array.isArray(r.videos)) return normalize(r.videos);
  if (r && Array.isArray(r.results)) return normalize(r.results);
  return [];
}

function searchCommand({ pattern, alias, site, endpoint, react }) {
  cmd({ pattern, alias, desc: `Search movies on ${site}`, category: 'movie', use: '<title>', react },
  async ({ q, reply, send, prefix, command }) => {
    if (!q) return reply(`*${site.toUpperCase()} SEARCH*\n\nProvide a movie name or year.\n\nExample:\n${prefix}${command} deadpool`);
    await reply(`Searching ${site} for *${q}*...`);
    const res = await sasaApi(endpoint, endpoint.includes('?') ? {} : { q });
    if (res.status === false && !res.result) return reply(`Search failed.\n${res.err || res.error || 'Site may be temporarily down.'}`);
    const items = pickList(res);
    if (!items.length) return reply(`No results found on ${site} for *${q}*.`);

    let text = `*${site.toUpperCase()} SEARCH RESULTS*\nQuery: ${q}\nFound: ${items.length}\n\n`;
    items.slice(0, 15).forEach((it, i) => {
      text += `*${i + 1}.* ${truncate(it.title, 65)}\n`;
      if (it.year) text += `    Year: ${it.year}  `;
      if (it.rating) text += `Rating: ${it.rating}  `;
      if (it.quality) text += `Quality: ${it.quality}`;
      text += `\n    ${it.link}\n\n`;
    });
    text += `Use *${prefix}movieinfo <link>* or *${prefix}moviedl <link>* to get download links.`;

    await send({ image: { url: items[0].image }, caption: withFooter(text) });
  });
}

searchCommand({ pattern: 'sinhalasub', alias: ['ssub', 'sinhalasubsearch', 'movie'], site: 'SinhalaSub.lk', endpoint: '/api/movie/search?provider=sinhalasub', react: '🎬' });
searchCommand({ pattern: 'cinesubz', alias: ['csub', 'cine', 'cinesub'], site: 'CineSubz.net', endpoint: '/api/movie/search?provider=cinesubz', react: '🍿' });
searchCommand({ pattern: 'sublk', alias: ['subzlk', 'subsearch'], site: 'Sub.lk', endpoint: '/api/movie_v2/search?provider=subslk', react: '🎞️' });
searchCommand({ pattern: 'baiscope', alias: ['baiscopes', 'bsearch'], site: 'Baiscopes.lk', endpoint: '/api/movie/search?provider=baiscope', react: '📽️' });
searchCommand({ pattern: 'cartoon', alias: ['cartoons', 'cartoonsearch'], site: 'Cartoons.lk', endpoint: '/api/anime/search', react: '🐭' });
searchCommand({ pattern: 'moviesub', alias: ['moviesublk', 'msub'], site: 'MovieSubLK', endpoint: '/api/movie/search?provider=moviesub', react: '🎥' });

/* ============ INFO / DOWNLOAD LINKS ============ */
function renderInfo(d, source) {
  if (!d) return null;
  const data = d.data || d;
  const title = data.title || data.Title || data.name || 'Unknown title';
  const img = data.image || data.Img || data.thumbnail || data.imageUrl || config.LOGO;

  let text = `*MOVIE INFORMATION*\nSource: ${source}\n\n`;
  text += `Title : ${truncate(title, 80)}\n`;
  const fields = ['date', 'Date', 'year', 'Year', 'country', 'Country', 'duration', 'Duration', 'imdb', 'IMDB', 'rating', 'Rating', 'category', 'Category', 'genres', 'Genres', 'director', 'Director'];
  for (const f of fields) {
    if (data[f] && typeof data[f] !== 'object') text += `${f.padEnd(8)}: ${truncate(String(data[f]), 70)}\n`;
  }
  if (data.description || data.desc || data.Desc) text += `\nPlot:\n${truncate(String(data.description || data.desc || data.Desc), 500)}\n`;

  const dlKeys = ['dl_links', 'download', 'downloads', 'links', 'dlLinks', 'download_links', 'ul'];
  let links = null;
  for (const k of dlKeys) if (Array.isArray(data[k])) { links = data[k]; break; }

  if (links?.length) {
    text += `\n*DOWNLOAD LINKS*\n`;
    links.slice(0, 12).forEach((l, i) => {
      const q = l.quality || l.Quality || l.name || l.title || `Link ${i + 1}`;
      const size = l.size || l.Size || '';
      const link = l.link || l.url || l.direct || l.download || '';
      text += `${i + 1}. ${q}${size ? ` (${size})` : ''}\n   ${link}\n`;
    });
  }
  if (Array.isArray(data.subtitle_links || data.subtitles)) {
    text += `\n*SUBTITLES*\n`;
    (data.subtitle_links || data.subtitles).slice(0, 5).forEach((s, i) => {
      text += `${i + 1}. ${s.link || s.url || s}\n`;
    });
  }
  return { text, img };
}

cmd({ pattern: 'movieinfo', alias: ['minfo', 'moviedetails'], desc: 'Get full movie info from a SinhalaSub / CineSubz link', category: 'movie', use: '<movie url>', react: 'ℹ️' },
async ({ q, reply, send, prefix }) => {
  const url = extractUrl(q);
  if (!url) return reply(`*MOVIE INFO*\n\nProvide a movie page link.\n\nExample:\n${prefix}movieinfo https://sinhalasub.lk/movies/red-sonja-2025/`);
  await reply('Fetching movie details...');
  const endpoint = '/api/movie/details';
  const res = await sasaApi(endpoint, { url });
  if (res.status === false && !res.result) return reply(`Failed to fetch info.\n${res.err || res.error || 'Link may be invalid.'}`);
  const out = renderInfo(res, /cinesubz/i.test(url) ? 'CineSubz.net' : 'SinhalaSub.lk');
  if (!out) return reply('No information returned for that link.');
  await send({ image: { url: out.img }, caption: withFooter(out.text.slice(0, 4000)) });
});

cmd({ pattern: 'moviedl', alias: ['mdl', 'downloadmovie', 'sinhalasubdl'], desc: 'Get direct download links for a movie page', category: 'movie', use: '<movie url>', react: '⬇️' },
async ({ q, reply, send, prefix }) => {
  const url = extractUrl(q);
  if (!url) return reply(`*MOVIE DOWNLOAD*\n\nProvide a movie page link.\n\nExample:\n${prefix}moviedl https://sinhalasub.lk/movies/red-sonja-2025/`);
  await reply('Resolving download links...');
  const endpoint = '/api/movie/details';
  const res = await sasaApi(endpoint, { url });
  if (res.status === false && !res.result) return reply(`Failed.\n${res.err || res.error || 'Try again later.'}`);
  const out = renderInfo(res, 'Movie DL');
  await send({ image: { url: out?.img || config.LOGO }, caption: withFooter((out?.text || 'No data').slice(0, 4000)) });
});

cmd({ pattern: 'cinesubzinfo', alias: ['cinfo'], desc: 'CineSubz movie information', category: 'movie', use: '<url>', react: '🎫' },
async ({ q, reply, send, prefix }) => {
  const url = extractUrl(q);
  if (!url) return reply(`Provide a CineSubz link.\nExample: ${prefix}cinesubzinfo https://cinesubz.net/movies/xxxx/`);
  const res = await sasaApi('/api/movie/details', { url });
  if (res.status === false && !res.result) return reply('Failed to fetch CineSubz info.');
  const out = renderInfo(res, 'CineSubz.net');
  await send({ image: { url: out?.img || config.LOGO }, caption: withFooter((out?.text || 'No data').slice(0, 4000)) });
});

cmd({ pattern: 'newmovies', alias: ['latestmovies', 'trending'], desc: 'Latest movies added this year', category: 'movie', react: '🆕' },
async ({ reply, send }) => {
  const year = new Date().getFullYear();
  await reply('Loading the latest releases...');
  const res = await sasaApi('/api/movie/search?provider=sinhalasub', { q: String(year) });
  const items = pickList(res);
  if (!items.length) return reply('Could not load the latest movies right now.');
  let t = `*LATEST MOVIES ${year}*\n\n`;
  items.slice(0, 15).forEach((it, i) => { t += `${i + 1}. ${truncate(it.title, 62)}\n   ${it.link}\n\n`; });
  await send({ image: { url: items[0].image }, caption: withFooter(t) });
});

cmd({ pattern: 'newcartoons', alias: ['latestcartoon'], desc: 'Newest cartoon uploads', category: 'movie', react: '🎈' },
async ({ reply, send }) => {
  const res = await sasaApi('/api/anime/search', { q: 'new' });
  const items = pickList(res);
  if (!items.length) return reply('No cartoon results right now.');
  let t = `*LATEST CARTOONS*\n\n`;
  items.slice(0, 15).forEach((it, i) => { t += `${i + 1}. ${truncate(it.title, 62)}\n   ${it.link}\n\n`; });
  await send({ image: { url: items[0].image }, caption: withFooter(t) });
});

cmd({ pattern: 'moviemenu', alias: ['mmenu'], desc: 'Show all movie commands', category: 'movie', react: '🎬' },
async ({ prefix, reply }) => {
  const { categories } = require('../lib/command');
  const list = (categories().movie || []).map(c => `${prefix}${c.pattern} — ${c.desc}`).join('\n');
  await reply(`*MOVIE MENU*\n\n${list}`);
});

cmd({ pattern: 'multisearch', alias: ['msearch', 'searchall'], desc: 'Search a movie across every supported site at once', category: 'movie', use: '<title>', react: '🌐' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a movie title.\nExample: .multisearch avatar');
  await reply(`Searching all sites for *${q}*...`);
  const sites = [
    ['SinhalaSub', '/api/movie/search?provider=sinhalasub'],
    ['CineSubz', '/api/movie/search?provider=cinesubz'],
    ['Sub.lk', '/api/movie_v2/search?provider=subslk'],
    ['Baiscopes', '/api/movie/search?provider=baiscope']
  ];
  const results = await Promise.all(sites.map(async ([name, ep]) => {
    const r = await sasaApi(ep, { q });
    return [name, pickList(r).slice(0, 4)];
  }));
  let t = `*MULTI-SITE SEARCH*\nQuery: ${q}\n\n`;
  for (const [name, items] of results) {
    t += `*${name}* (${items.length})\n`;
    if (!items.length) t += `   no results\n`;
    items.forEach(it => { t += `   • ${truncate(it.title, 55)}\n     ${it.link}\n`; });
    t += '\n';
  }
  await reply(t.slice(0, 4000));
});
