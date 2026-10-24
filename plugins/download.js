/**
 * DOWNLOADER COMMANDS - powered by SASA DEV API
 * 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const { sasaApi, extractUrl, isUrl, withFooter, formatBytes, truncate, getBuffer } = require('../lib/utils');

/* ============ INTERACTIVE CHOICES (reply 1/2 system) ============ */
/* Song choices: songChoices.set(messageId, { title, url, ... }) keyed by reply id */
const songChoices = new Map();
const ttChoices = new Map();
const adultChoices = new Map();
const CHOICE_TTL = 10 * 60 * 1000;  // Increased to 10 minutes for slow downloads
setInterval(() => {
  const cut = Date.now() - CHOICE_TTL;
  for (const [k, v] of songChoices) if (v.ts && v.ts < cut) songChoices.delete(k);
  for (const [k, v] of ttChoices) if (v.ts && v.ts < cut) ttChoices.delete(k);
  for (const [k, v] of adultChoices) if (v.ts && v.ts < cut) adultChoices.delete(k);
}, 60000);

/* Called from handler.js when a user replies with a number to a bot message */
function handleDownloadChoice(qid, body, reply, send) {
  const t = String(body || '').trim();
  // Try exact match first
  if (songChoices.has(qid)) {
    const song = songChoices.get(qid);
    songChoices.delete(qid);
    if (t === '1') { song.mp3(true); return true; }
    if (t === '2') { song.mp3(false); return true; }
    return true;
  }
  if (ttChoices.has(qid)) {
    const tt = ttChoices.get(qid);
    ttChoices.delete(qid);
    if (t === '1') { tt.pick('sd'); return true; }
    if (t === '2') { tt.pick('hd'); return true; }
    return true;
  }
  if (adultChoices.has(qid)) {
    const ad = adultChoices.get(qid);
    adultChoices.delete(qid);
    if (t === '1') { ad.pick('sd'); return true; }
    if (t === '2') { ad.pick('hd'); return true; }
    return true;
  }
  // Fallback: try partial match (in case ID was truncated or modified)
  for (const [k, v] of songChoices) {
    if (k.includes(qid) || qid.includes(k)) {
      const song = songChoices.get(k);
      songChoices.delete(k);
      if (t === '1') { song.mp3(true); return true; }
      if (t === '2') { song.mp3(false); return true; }
      return true;
    }
  }
  for (const [k, v] of ttChoices) {
    if (k.includes(qid) || qid.includes(k)) {
      const tt = ttChoices.get(k);
      ttChoices.delete(k);
      if (t === '1') { tt.pick('sd'); return true; }
      if (t === '2') { tt.pick('hd'); return true; }
      return true;
    }
  }
  return false;
}

/* Expose the maps so handler.js can check them (idempotent safe require) */
if (!global.__dlChoiceHooked) {
  global.__dlChoiceHooked = true;
  global.__songChoices = songChoices;
  global.__ttChoices = ttChoices;
  global.__adultChoices = adultChoices;
  global.__handleDownloadChoice = handleDownloadChoice;
}

const askUrl = (name, prefix, cmdName, example) =>
  `*${name} DOWNLOADER*\n\nPlease provide a valid link.\n\nExample:\n${prefix}${cmdName} ${example}`;

/* ============ LOCAL yt-dlp FALLBACK (YouTube) ============ */
/* The SASA DEV API's yt-dlp-based downloaders are blocked by YouTube's
   bot-check ("Sign in to confirm you're not a bot"). The VPS runs its own
   yt-dlp binary at /usr/local/bin/yt-dlp which fetches direct URLs
   reliably for every video, including blocked ones. */
const { execFile } = require('child_process');
const YTDLP = '/usr/local/bin/yt-dlp';
function runYtdlp(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.split('\n').pop()?.trim() || err.message));
      resolve(String(stdout).trim());
    });
  });
}
async function ytLocalMeta(url) {
  const raw = await runYtdlp(['--dump-json', '--no-warnings', '--no-check-certificates', url]);
  const j = JSON.parse(raw);
  return {
    title: j.title || 'Unknown',
    channel: j.uploader || j.channel || '-',
    duration: j.duration_string || (j.duration ? `${Math.floor(j.duration / 60)}:${String(j.duration % 60).padStart(2, '0')}` : '-'),
    views: j.view_count || '-',
    thumbnail: j.thumbnail || ''
  };
}
async function ytLocalUrl(url, kind) {
  /* kind: 'mp3' | 'sd' | '720' | '480' | '1080' — return direct URL(s) */
  const fmt = kind === 'mp3' ? 'bestaudio[ext=m4a]/bestaudio/best' : null;
  const map = { sd: 480, 720: 720, 480: 480, 1080: 1080 };
  if (kind === 'mp3') {
    const out = await runYtdlp(['-f', fmt, '-g', '--no-warnings', '--no-check-certificates', url]);
    return out.split('\n').filter(Boolean);
  }
  const h = map[kind] || 720;
  const fmtV = `bestvideo[ext=mp4][height<=${h}]+bestaudio[ext=m4a]/best[height<=${h}]/best`;
  const out = await runYtdlp(['-f', fmtV, '-g', '--no-warnings', '--no-check-certificates', url]);
  return out.split('\n').filter(Boolean);
}
async function apiOrLocal(path, params, url, kind) {
  /* Try the API first; if the API's yt-dlp is blocked, fall back to the
     VPS's local yt-dlp which bypasses the API server's limitations. */
  try {
    const res = await sasaApi(path, params);
    const r = res.result ?? res.data;
    if (res.status && mediaUrl(r)) return { source: 'api', url: mediaUrl(r), meta: null };
  } catch (_) {}
  try {
    const urls = await ytLocalUrl(url, kind);
    if (!urls?.length) throw new Error('no url');
    let meta = null;
    try { meta = await ytLocalMeta(url); } catch (_) {}
    return { source: 'local', url: urls, meta };
  } catch (e) {
    throw new Error(`Download nodes failed: ${(e?.message || e).toString().slice(0, 200)}`);
  }
}

/* Pull a direct media url out of any response shape */
function mediaUrl(d) {
  if (!d) return null;
  if (typeof d === 'string') return d;
  if (typeof d.download_url === 'string') return d.download_url;
  if (Array.isArray(d.download_url)) {
    const clean = d.download_url.filter(u => typeof u === 'string' && /^https?:/.test(u));
    return clean[0] || null;
  }
  const hit = d.dl_link || d.url || d.download || d.link || d.hd || d.sd || d.video || d.music;
  if (typeof hit === 'string') return hit;
  return null;
}

/* ================= TIKTOK ================= */
/* Redesigned: fetch info first, then Reply 1 = SD QUALITY DL, 2 = HD QUALITY DL */
async function tiktokFlow({ q, m, reply, send, prefix, command }, wantAudio = false) {
  const url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  if (!url) return reply(askUrl('TIKTOK', prefix, command, 'https://vt.tiktok.com/xxxxx/'));
  await reply('Fetching TikTok media, please wait...');

  const tryEndpoint = async (ep) => {
    const res = await sasaApi(ep, { url });
    const ok = res.status === true && res.result;
    if (!ok) return null;
    const r = res.result.data ?? res.result.video ?? res.result;
    const title = r.title ?? r.desc ?? res.result.title ?? 'TikTok video';
    const author = r.author?.nickname ?? res.result.author ?? r.authorName ?? 'unknown';
    const views = r.stats?.playCount ?? r.views ?? res.result.views ?? '-';
    const likes = r.stats?.diggCount ?? r.likes ?? '-';
    const sd = r.sd ?? r.play ?? r.dl_link ?? null;
    const hd = r.hd ?? r.no_watermark ?? r.nwm ?? null;
    const music = r.music ?? r.audio ?? null;
    return { title, author, views, likes, sd, hd, music, raw: res.result };
  };

  /* SASA DEV API tiktok extractors are often down - fall back to the free
     public tikwm.com API (works for full @user/video/ID URLs). */
  const tryTikwm = async () => {
    try {
      const { axios } = require('../lib/utils');
      const get = async (hd) => axios.get('https://www.tikwm.com/api/', { params: { url, ...(hd ? { hd: 1 } : {}) }, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, validateStatus: () => true });
      const r = await get(false).catch(() => get(true).catch((e) => e));
      const d = r.data?.data;
      if (!d) {
        const msg = (r.data?.msg || r.data?.message || r.data?.error || '').toString();
        if (/not (exist|found)|removed|not available/i.test(msg) || r.status === 404) {
          throw Object.assign(new Error('DELETED'), { deleted: true, msg });
        }
        return null;
      }
      if (!d?.play && !d?.hdplay) {
        const r2 = await get(true).catch(() => null);
        const d2 = r2?.data?.data;
        if (!d2) return null;
        if (d2.play || d2.hdplay) return buildFrom(d2);
        return null;
      }
      return buildFrom(d);
    } catch (e) {
      if (e && e.deleted) throw e;
      return null;
    }
  };
  const buildFrom = (d) => ({
    title: d.title || 'TikTok video',
    author: d.author?.nickname || d.author?.unique_id || 'unknown',
    views: d.play_count || '-',
    likes: d.digg_count || '-',
    sd: d.hdplay || d.play || null,
    hd: d.hdplay || d.play || null,
    music: d.music || null,
    raw: { cover: d.origin_cover || d.cover, avatar: d.author?.avatar }
  });
  /* Local yt-dlp is a very reliable TikTok extractor — use its metadata as
     the final fallback even when API endpoints return video URLs, because
     it can also fetch the direct play URL with full quality info. */
  const tryLocal = async () => {
    try {
      const j = JSON.parse(await runYtdlp(['--dump-json', '--no-warnings', '--no-check-certificates', url]));
      /* tiktok: prefer h264 mp4, then best */
      const best = (j.formats || []).find(f => f.ext === 'mp4' && !f.audio_channels && !f.audio_samplerate)
        || (j.formats || []).find(f => f.ext === 'mp4') || null;
      const music = (j.formats || []).find(f => f.ext === 'm4a' || (f.audio_channels && f.ext === 'mp4'));
      if (!best) return null;
      const metaUrl = await runYtdlp(['-f', best.format_id || 'best', '-g', '--no-warnings', '--no-check-certificates', url]);
      const musicUrl = music ? await runYtdlp(['-f', music.format_id || 'bestaudio', '-g', '--no-warnings', '--no-check-certificates', url]).catch(() => null) : null;
      const views = j.view_count || '-';
      const likes = j.like_count || '-';
      return {
        title: j.title || 'TikTok video',
        author: j.uploader || j.channel || j.creator || 'unknown',
        views, likes,
        sd: metaUrl || null,
        hd: metaUrl || null,
        music: musicUrl || null,
        raw: { cover: j.thumbnail || '', avatar: '' }
      };
    } catch (_) { return null; }
  };
  let info = null, deletedErr = null;
  for (const fn of [tryEndpoint('/api/tiktokv2'), tryEndpoint('/api/tiktok'), tryTikwm(), tryLocal()]) {
    try { info = await fn; } catch (e) {
      if (e?.deleted) { deletedErr = e; break; }
    }
    if (info) break;
  }
  if (!info) return reply(deletedErr ? 'Download failed.\nThis TikTok video was deleted or is not available anymore.' : 'Download failed.\nTikTok provider unavailable. Try another link (use full @user/video/ID URL).');
  const infoText = `*TIKTOK DOWNLOADER*\n\nTitle  : ${truncate(info.title, 90)}\nAuthor : ${info.author}\nViews  : ${info.views}\nLikes  : ${info.likes}`;

  if (wantAudio) {
    if (!info.music) return reply('No audio track available for this TikTok.');
    return send({ audio: { url: info.music }, mimetype: 'audio/mpeg', fileName: `${truncate(info.title, 40)}.mp3`, caption: withFooter(infoText) });
  }

  const sdUrl = info.sd || info.hd;
  const hdUrl = info.hd || info.sd;
  if (!sdUrl) return reply('No downloadable video URL was returned.');

  const menu = `${infoText}\n\n*REPLY WITH THE NUMBER:*\n1. SD QUALITY DL\n2. HD QUALITY DL\n\n⏳ Choices expire in 5 minutes.`;
  const sent = await send({ image: { url: info.raw.cover || info.raw.avatar || null }, caption: withFooter(menu) }).catch(() => null)
    || await send({ text: withFooter(menu) });
  const keyId = sent?.key?.id;
  if (keyId) ttChoices.set(keyId, { ts: Date.now(), pick: (mode) => {
    const videoUrl = mode === 'hd' ? (hdUrl || sdUrl) : (sdUrl || hdUrl);
    if (!videoUrl) return reply('That quality is not available for this video. Trying the other one...').then(async () => {
      const alt = mode === 'hd' ? sdUrl : hdUrl;
      if (alt) return send({ video: { url: alt }, caption: withFooter(infoText + `\nQuality: ${mode === 'hd' ? 'HD' : 'SD'}`), mimetype: 'video/mp4' });
      return reply('Neither quality is available right now. Try another link.');
    });
    return send({ video: { url: videoUrl }, caption: withFooter(infoText + `\nQuality: ${mode === 'hd' ? 'HD' : 'SD'}`), mimetype: 'video/mp4' });
  } });
}

cmd({ pattern: 'tiktok', alias: ['tt', 'ttdl', 'tiktokdl'], desc: 'Download TikTok video (choose SD/HD)', category: 'download', use: '<url>', react: '🎵' },
async (ctx) => tiktokFlow(ctx, false));

cmd({ pattern: 'tiktokaudio', alias: ['ttmp3', 'ttaudio', 'tiktokmp3'], desc: 'Extract audio from a TikTok video', category: 'download', use: '<url>', react: '🎧' },
async (ctx) => tiktokFlow(ctx, true));

cmd({ pattern: 'tiktoknowm', alias: ['ttnowm', 'ttnw'], desc: 'TikTok no-watermark direct video', category: 'download', use: '<url>', react: '🎬' },
async (ctx) => tiktokFlow(ctx, false));

/* ================= YOUTUBE ================= */
async function ytFlow(ctx, format) {
  const { q, m, reply, send, prefix, command } = ctx;
  let url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  if (!url) {
    if (!q) return reply(askUrl('YOUTUBE', prefix, command, 'https://youtube.com/watch?v=xxxx'));
    try {
      const yts = require('yt-search');
      const s = await yts(q);
      url = s.videos?.[0]?.url;
    } catch (_) {}
    if (!url) return reply('No YouTube result found for that query.');
  }
  await reply(`Processing YouTube ${format === 'mp3' ? 'audio' : 'video'}...`);
  let media, file = `${truncate('ghost', 30)}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
  if (format === 'mp3') {
    try { media = await apiOrLocal('/api/ytmp3', { url }, url, 'mp3'); } catch (e) { return reply(`Download failed.\n${e.message || 'Try again later.'}`); }
    file = `${truncate((media.meta?.title || 'song').replace(/[\\/:*?"<>|]/g, ' '), 30)}.mp3`;
  } else {
    try { media = await apiOrLocal('/api/mp4_v2', { url }, url, format); } catch (e) { return reply(`Download failed.\n${e.message || 'Try again later.'}`); }
    file = `${truncate((media.meta?.title || 'video').replace(/[\\/:*?"<>|]/g, ' '), 30)}.mp4`;
  }
  /* Local yt-dlp may return separate video+audio URLs (e.g. itag 398 + 140);
     Baileys handles a single URL — use the video URL; audio-only for mp3. */
  const direct = Array.isArray(media.url) ? media.url[0] : media.url;
  const info = `*YOUTUBE DOWNLOADER*\n\nFile   : ${truncate(file, 80)}\nFormat : ${format}\nEngine : ${media.source === 'local' ? 'DIRECT (LIVE)' : 'CLOUD'}\nSource : ${url}`;
  if (format === 'mp3') {
    return send({ audio: { url: direct }, mimetype: 'audio/mpeg', fileName: file, caption: withFooter(info) });
  }
  await send({ video: { url: direct }, mimetype: 'video/mp4', fileName: file, caption: withFooter(info) });
}

/* ============ REDESIGNED .song (Reply 1 = MP3, 2 = Document) ============ */
cmd({ pattern: 'song', alias: ['ytmp3', 'ytaudio', 'play', 'music', 'mp3'], desc: 'Download a song from YouTube', category: 'download', use: '<song name|url>', react: '🎶' },
async ({ q, m, reply, send, prefix }) => {
  let url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  let meta = null;
  if (!url) {
    if (!q) return reply(`*SONG DOWNLOADER*\n\nSearch a song or send a YouTube link.\n\nExample:\n${prefix}song lelena\n\n🔎 This will show song details — reply 1 for MP3, 2 for Document.`);
    try {
      const r = await sasaApi('/api/youtube/search', { q });
      const list = (r.result?.videos || r.videos || []).filter(v => v.id);
      if (!list.length) return reply('No YouTube result found for that query.');
      const v = list[0];
      url = v.url || `https://www.youtube.com/watch?v=${v.id}`;
      meta = {
        title: v.title,
        channel: v.channel?.name || v.author || v.channelName || '-',
        duration: v.duration || v.durationLabel || v.timestamp || '-',
        views: v.views || v.viewCount || '-',
        published: v.published || v.uploadedAt || '',
        thumbnail: v.thumbnail || v.image || ''
      };
    } catch (_) { return reply('YouTube search failed. Send a direct YouTube link instead.'); }
  } else {
    try {
      const r = await sasaApi('/api/youtube/search', { q: url.split('v=')[1] || url });
      const list = (r.result?.videos || r.videos || []).filter(v => v.id);
      if (list.length) {
        const v = list[0];
        meta = {
          title: v.title,
          channel: v.channel?.name || v.author || '-',
          duration: v.duration || v.timestamp || '-',
          views: v.views || '-',
          published: v.published || '',
          thumbnail: v.thumbnail || v.image || ''
        };
      }
    } catch (_) {}
  }

  await reply('Preparing song details... 🕐');
  let mp3Url = null, mp3Meta = null, songSource = 'api';
  try {
    const dl = await apiOrLocal('/api/ytmp3', { url }, url, 'mp3');
    mp3Url = Array.isArray(dl.url) ? dl.url[0] : dl.url;
    mp3Meta = dl.meta;
    songSource = dl.source;
  } catch (e) {
    return reply(`📥 ꜱᴏɴɢ ʟᴏᴏᴋᴜᴘ ꜰᴀɪʟᴇᴅ.\n${e.message || 'Try another song.'}`);
  }
  if (!mp3Url) return reply('📥 ꜱᴏɴɢ ʟᴏᴏᴋᴜᴘ ꜰᴀɪʟᴇᴅ.\nTry another song.');

  const title = meta?.title || mp3Meta?.title || 'Unknown song';
  const thumb = meta?.thumbnail || mp3Meta?.thumbnail || '';
  const card = `*🎶 SONG DOWNLOADER*\n\n*Title*   : ${truncate(title, 80)}\n*Channel* : ${meta?.channel || mp3Meta?.channel || '-'}\n*Duration*: ${meta?.duration || mp3Meta?.duration || '-'}\n*Views*   : ${meta?.views || mp3Meta?.views || '-'}${meta?.published ? `\n*Uploaded*: ${meta.published}` : ''}\n*Engine*  : ${songSource === 'local' ? 'DIRECT (LIVE)' : 'CLOUD'}\n\n*REPLY WITH THE NUMBER:*\n1. MP3 AUDIO FILE\n2. DOCUMENT FILE`;

  const cardSent = thumb
    ? await send({ image: { url: thumb }, caption: withFooter(card) }).catch(() => null)
    : null;
  const sent = cardSent || await send({ text: withFooter(card) });
  const keyId = sent?.key?.id;
  if (keyId) songChoices.set(keyId, { ts: Date.now(), url, info: card, mp3: (asAudio) => {
    const infoTxt = asAudio
      ? `*MP3 AUDIO*\n\nTitle    : ${truncate(title, 80)}\nChannel  : ${meta?.channel || mp3Meta?.channel || '-'}\nDuration : ${meta?.duration || mp3Meta?.duration || '-'}\nEngine   : ${songSource === 'local' ? 'DIRECT (LIVE)' : 'CLOUD'}\nSource   : ${url}`
      : `*DOCUMENT FILE*\n\nTitle    : ${truncate(title, 80)}\nChannel  : ${meta?.channel || mp3Meta?.channel || '-'}\nDuration : ${meta?.duration || mp3Meta?.duration || '-'}\nSource   : ${url}`;
    if (asAudio) {
      return send({ audio: { url: mp3Url }, mimetype: 'audio/mpeg', fileName: `${truncate(title, 40)}.mp3`, caption: withFooter(infoTxt) });
    }
    return send({ document: { url: mp3Url }, mimetype: 'audio/mpeg', fileName: `${truncate(title, 40)}.mp3`, caption: withFooter(infoTxt) });
  } });
});

cmd({ pattern: 'video720', alias: ['yt720', 'hdvideo'], desc: 'Download YouTube video in 720p', category: 'download', use: '<url>', react: '🎥' },
async (ctx) => ytFlow(ctx, '360'));

cmd({ pattern: 'video480', alias: ['yt480'], desc: 'Download YouTube video in 480p', category: 'download', use: '<url>', react: '📽️' },
async (ctx) => ytFlow(ctx, '480'));

cmd({ pattern: 'video1080', alias: ['yt1080', 'fullhd'], desc: 'Download YouTube video in 1080p', category: 'download', use: '<url>', react: '🍿' },
async (ctx) => ytFlow(ctx, '1080'));

cmd({ pattern: 'ytdoc', alias: ['ytfile'], desc: 'Send YouTube video as a document file', category: 'download', use: '<url>', react: '📄' },
async ({ q, reply, send, prefix }) => {
  const url = extractUrl(q);
  if (!url) return reply(askUrl('YOUTUBE DOCUMENT', prefix, 'ytdoc', 'https://youtube.com/watch?v=xxxx'));
  await reply('Preparing document...');
  let direct, title = 'video.mp4';
  try {
    const media = await apiOrLocal('/api/mp4_v2', { url }, url, '720');
    direct = Array.isArray(media.url) ? media.url[0] : media.url;
    title = `${(media.meta?.title || 'video').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 50)}.mp4`;
  } catch (e) {
    return reply(`Download failed.\n${e.message || 'Try again later.'}`);
  }
  if (!direct) return reply('Download failed.');
  await send({ document: { url: direct }, mimetype: 'video/mp4', fileName: title, caption: withFooter('*YOUTUBE DOCUMENT*') });
});

/* ================= SIMPLE GENERIC DOWNLOADERS ================= */
function simpleDownloader({ pattern, alias, name, endpoint, example, react, mediaHint }) {
  cmd({ pattern, alias, desc: `Download media from ${name}`, category: 'download', use: '<url>', react },
  async ({ q, m, reply, send, prefix, command }) => {
    const url = extractUrl(q) || extractUrl(m.quoted?.text || '');
    if (!url) return reply(askUrl(name.toUpperCase(), prefix, command, example));
    await reply(`Fetching from ${name}...`);
    const res = await sasaApi(endpoint, { url });
    const r = res.result ?? res.data ?? res;
    if (res.status === false && !res.result && !res.data) return reply(`Download failed.\n${res.err || res.error || 'Link may be private or unsupported.'}`);
    if (!r) return reply(`${name} returned no downloadable data for that link.`);

    const found = [];
    const walk = (obj, depth = 0) => {
      if (!obj || depth > 4) return;
      if (typeof obj === 'string' && /^https?:\/\//.test(obj) && /\.(mp4|mp3|jpg|jpeg|png|webp|m4a|zip|pdf|apk|mkv)(\?|$)/i.test(obj)) found.push(obj);
      else if (Array.isArray(obj)) obj.forEach(o => walk(o, depth + 1));
      else if (typeof obj === 'object') Object.values(obj).forEach(o => walk(o, depth + 1));
    };
    walk(r);

    const direct = mediaUrl(r) || found[0];
    const title = r.fileName || r.title || r.filename || name;
    const meta = `*${name.toUpperCase()} DOWNLOADER*\n\nName : ${truncate(title, 80)}\n${r.size ? `Size : ${r.size}\n` : ''}${r.fileType ? `Type : ${r.fileType}\n` : ''}Source: ${url}`;

    if (!direct) return reply(`${meta}\n\nCould not resolve a direct download link.`);

    const lower = String(direct).toLowerCase();
    try {
      if (/\.(mp4|mkv|mov)(\?|$)/.test(lower) || mediaHint === 'video') {
        return send({ video: { url: direct }, caption: withFooter(meta), mimetype: 'video/mp4' });
      }
      if (/\.(mp3|m4a|opus|wav)(\?|$)/.test(lower) || mediaHint === 'audio') {
        return send({ audio: { url: direct }, mimetype: 'audio/mpeg', fileName: `${truncate(title, 40)}.mp3` });
      }
      if (/\.(jpg|jpeg|png|webp)(\?|$)/.test(lower) || mediaHint === 'image') {
        return send({ image: { url: direct }, caption: withFooter(meta) });
      }
      return send({ document: { url: direct }, fileName: String(title).slice(0, 60), mimetype: r.fileType || 'application/octet-stream', caption: withFooter(meta) });
    } catch (e) {
      return reply(`${meta}\n\nDirect link:\n${direct}`);
    }
  });
}

simpleDownloader({ pattern: 'facebook', alias: ['fb', 'fbdl', 'fbvideo'], name: 'Facebook', endpoint: '/api/facebook2', example: 'https://facebook.com/watch?v=xxxx', react: '📘', mediaHint: 'video' });
simpleDownloader({ pattern: 'instagram', alias: ['ig', 'igdl', 'insta', 'reel'], name: 'Instagram', endpoint: '/api/instagram', example: 'https://instagram.com/reel/xxxx', react: '📸', mediaHint: 'video' });
simpleDownloader({ pattern: 'twitter', alias: ['x', 'twdl', 'xdl', 'twitterdl'], name: 'Twitter/X', endpoint: '/api/twitter', example: 'https://twitter.com/user/status/xxxx', react: '🐦', mediaHint: 'video' });
simpleDownloader({ pattern: 'mediafire', alias: ['mf', 'mfire', 'mfdl'], name: 'MediaFire', endpoint: '/api/mediafire', example: 'https://mediafire.com/file/xxxx', react: '🔥' });
simpleDownloader({ pattern: 'gdrive', alias: ['drive', 'googledrive', 'gd'], name: 'Google Drive', endpoint: '/api/download/gdrive', example: 'https://drive.google.com/file/d/xxxx/view', react: '💽' });
simpleDownloader({ pattern: 'terabox', alias: ['tb', 'tbdl'], name: 'Terabox', endpoint: '/api/terabox', example: 'https://1024terabox.com/s/xxxx', react: '📦' });
simpleDownloader({ pattern: 'mega', alias: ['meganz', 'megadl'], name: 'Mega.nz', endpoint: '/api/mega', example: 'https://mega.nz/file/xxxx', react: '☁️' });

/* ================= INFO-ONLY VARIANTS ================= */
function infoCommand({ pattern, alias, name, endpoint, react }) {
  cmd({ pattern, alias, desc: `Show raw file info from ${name} without downloading`, category: 'download', use: '<url>', react },
  async ({ q, reply, prefix, command }) => {
    const url = extractUrl(q);
    if (!url) return reply(askUrl(name.toUpperCase() + ' INFO', prefix, command, 'https://...'));
    const res = await sasaApi(endpoint, { url });
    const r = res.result ?? res.data ?? res;
    if (res.status === false && !res.result && !res.data) return reply(`Failed: ${res.err || res.error || 'unknown error'}`);
    if (!r) return reply(`Failed: no data returned.`);
    const lines = Object.entries(r)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .slice(0, 15)
      .map(([k, v]) => `${k} : ${truncate(String(v), 70)}`);
    await reply(`*${name.toUpperCase()} INFO*\n\n${lines.join('\n') || 'No simple fields returned.'}`);
  });
}

infoCommand({ pattern: 'mfinfo', alias: ['mediafireinfo'], name: 'MediaFire', endpoint: '/api/mediafire', react: 'ℹ️' });
infoCommand({ pattern: 'gdinfo', alias: ['driveinfo'], name: 'Google Drive', endpoint: '/api/download/gdrive', react: 'ℹ️' });
infoCommand({ pattern: 'tbinfo', alias: ['teraboxinfo'], name: 'Terabox', endpoint: '/api/terabox', react: 'ℹ️' });
infoCommand({ pattern: 'ttinfo', alias: ['tiktokinfo'], name: 'TikTok', endpoint: '/api/tiktokv2', react: 'ℹ️' });
infoCommand({ pattern: 'ytinfo', alias: ['youtubeinfo'], name: 'YouTube', endpoint: '/api/ytmp3', react: 'ℹ️' });

/* ================= YT SEARCH ================= */
cmd({ pattern: 'ytsearch', alias: ['yts', 'searchyt'], desc: 'Search YouTube videos', category: 'download', use: '<query>', react: '🔎' },
async ({ q, reply, send }) => {
  if (!q) return reply('Please provide a search query.\nExample: .ytsearch alan walker faded');
  try {
    const r = await sasaApi('/api/youtube/search', { q });
    const vids = (r.result?.videos || r.videos || []).slice(0, 10);
    if (!vids.length) return reply('No results found.');
    let t = `*YOUTUBE SEARCH*\nQuery: ${q}\n\n`;
    vids.forEach((v, i) => {
      t += `${i + 1}. ${truncate(v.title, 60)}\n   Duration: ${v.duration || '-'} | Views: ${v.views || v.viewCount || '-'}\n   ${v.url || `https://www.youtube.com/watch?v=${v.id}`}\n\n`;
    });
    await send({ image: { url: vids[0].thumbnail || vids[0].image || '' }, caption: withFooter(t) });
  } catch (e) {
    await reply('YouTube search failed: ' + e.message);
  }
});

cmd({ pattern: 'lyrics', alias: ['lyric', 'getlyrics'], desc: 'Find song lyrics', category: 'download', use: '<song name>', react: '📝' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a song name.\nExample: .lyrics faded alan walker');
  try {
    const parts = q.split('-').map(s => s.trim());
    const artist = parts.length > 1 ? parts[0] : '';
    const title = parts.length > 1 ? parts[1] : q;
    const { axios } = require('../lib/utils');
    const r = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist || title)}/${encodeURIComponent(title)}`, { timeout: 30000, validateStatus: () => true });
    if (!r.data?.lyrics) return reply(`No lyrics found for *${q}*.\nTry the format: .lyrics artist - song`);
    await reply(`*LYRICS*\n${q}\n\n${String(r.data.lyrics).slice(0, 3500)}`);
  } catch (e) {
    await reply('Lyrics lookup failed. Try format: .lyrics artist - song');
  }
});

cmd({ pattern: 'dlmenu', alias: ['downloadmenu'], desc: 'Show all downloader commands', category: 'download', react: '📥' },
async ({ prefix, reply }) => {
  const { categories } = require('../lib/command');
  const list = (categories().download || []).map(c => `${prefix}${c.pattern} — ${c.desc}`).join('\n');
  await reply(`*DOWNLOAD MENU*\n\n${list}`);
});

/* ================= XVIDEO (SASA DEV API) ================= */
const XNSFW_SITES = /pornhub|phncdn|xvideos|xv-|redtube|youporn|beeg/i;
cmd({ pattern: 'xvideo', alias: ['xdl', 'xvideodl', 'pdl', 'pordl'], desc: 'Download adult video from supported sites', category: 'adult', use: '<url>', react: '🔞', nsfw: true },
async ({ q, m, reply, send, prefix }) => {
  const url = extractUrl(q) || extractUrl(m.quoted?.text || '');
  if (!url) return reply(askUrl('XVIDEO', prefix, 'xvideo', 'https://www.pornhub.com/view_video.php?viewkey=xxxxx'));
  if (!XNSFW_SITES.test(url)) {
    return reply(`Unsupported source. Provide a *Pornhub* (or similar) video URL.\n\nExample:\n${prefix}xvideo https://www.pornhub.com/view_video.php?viewkey=xxxxx`);
  }
  await reply('Fetching XVideo... please wait 🕐');
  try {
    const r = await require('../lib/utils').axios.get('https://sasa-dev-api.xyz/api/media/ph/download', {
      params: { url },
      headers: { 'X-API-Key': config.API_KEY, 'x-api-key': config.API_KEY, 'User-Agent': 'LakshanXMD/1.0' },
      timeout: 120000,
      validateStatus: () => true
    });
    const d = r.data || {};
    if (d.status === false && !d.result && !d.data) {
      return reply(`*XVIDEO DOWNLOADER*\n\nExtraction failed.\nMessage: ${d.error || d.message || 'Try another video link.'}`);
    }
    const dl = d.result ?? d.data ?? d;
    /* Handle { low, high, hls } quality keys like other adult endpoints */
    const videoUrl = (typeof dl === 'string' ? dl : (dl.high || dl.low || dl.hls || mediaUrl(dl)));
    if (!videoUrl) {
      return reply(`*XVIDEO DOWNLOADER*\n\nNo downloadable video URL was returned.\nResponse: ${truncate(JSON.stringify(d), 200)}`);
    }
    const title = dl.title || d.title || 'video';
    const info = `*XVIDEO DOWNLOADER*\n\nTitle    : ${truncate(String(title), 90)}\nDuration : ${dl.duration || d.duration || '-'}\nQuality  : ${dl.quality || d.quality || '720p'}\nSource   : ${url}`;
    await send({ video: { url: videoUrl }, mimetype: 'video/mp4', caption: withFooter(info) });
  } catch (e) {
    await reply(`XVideo download failed: ${e.message || 'server error'}\nTry again later.`);
  }
});

/* Export the hook so plugin loader can register it; handler uses globals. */
module.exports.__dlChoiceHooked = true;
module.exports.handleDownloadChoice = handleDownloadChoice;
