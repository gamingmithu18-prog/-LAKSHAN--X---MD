/**
 * CONVERTER / MEDIA TOOLS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const { withFooter, getBuffer, formatBytes, sleep } = require('../lib/utils');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
// Heroku may not expose a system ffmpeg binary. Ship a compatible binary
// with the app and use its absolute path for every converter command.
const FFMPEG_BIN = JSON.stringify(require('@ffmpeg-installer/ffmpeg').path);
ffmpeg.setFfmpegPath(JSON.parse(FFMPEG_BIN));

const tmp = (ext) => path.join(os.tmpdir(), `ghost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);

function run(cmdStr) {
  return new Promise((resolve, reject) => {
    const command = cmdStr.replace(/\bffmpeg\b/g, FFMPEG_BIN);
    exec(command, { maxBuffer: 1024 * 1024 * 200, timeout: 180000 }, (err, so, se) => err ? reject(new Error(se || err.message)) : resolve(so));
  });
}

async function toFile(buf, ext) { const f = tmp(ext); fs.writeFileSync(f, buf); return f; }
function cleanup(...files) { files.forEach(f => { try { fs.existsSync(f) && fs.unlinkSync(f); } catch (_) {} }); }

/* ============ STICKERS ============ */
cmd({ pattern: 'sticker', alias: ['s', 'stiker', 'stickergif'], desc: 'Convert an image or short video into a sticker', category: 'converter', react: '🩹' },
async ({ m, reply, send }) => {
  const target = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
  if (!target) return reply('Reply to an image or a short video (under 10 seconds) to make a sticker.');
  await reply('Creating your sticker...');
  const buf = await target.download();
  const isVid = target.isVideo || target.type === 'videoMessage';
  const input = await toFile(buf, isVid ? 'mp4' : 'jpg');
  const out = tmp('webp');
  try {
    if (isVid) {
      await run(`ffmpeg -y -i "${input}" -vcodec libwebp -filter:v "fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse" -loop 0 -preset default -an -vsync 0 -t 8 "${out}"`);
    } else {
      await run(`ffmpeg -y -i "${input}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=#00000000" -vcodec libwebp -lossless 1 -qscale 75 -preset default -an "${out}"`);
    }
    await send({ sticker: fs.readFileSync(out) });
  } catch (e) {
    await reply('Sticker creation failed: ' + e.message.slice(0, 200));
  } finally { cleanup(input, out); }
});

cmd({ pattern: 'toimg', alias: ['toimage', 'stickertoimg'], desc: 'Convert a sticker back to an image', category: 'converter', react: '🖼️' },
async ({ m, reply, send }) => {
  if (!m.quoted?.isSticker) return reply('Reply to a sticker.');
  const buf = await m.quoted.download();
  const input = await toFile(buf, 'webp');
  const out = tmp('png');
  try { await run(`ffmpeg -y -i "${input}" "${out}"`); await send({ image: fs.readFileSync(out), caption: withFooter('*STICKER TO IMAGE*') }); }
  catch (e) { await reply('Conversion failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'tovideo', alias: ['tomp4', 'stickertovideo'], desc: 'Convert an animated sticker to video', category: 'converter', react: '🎞️' },
async ({ m, reply, send }) => {
  if (!m.quoted?.isSticker) return reply('Reply to an animated sticker.');
  const buf = await m.quoted.download();
  const input = await toFile(buf, 'webp');
  const out = tmp('mp4');
  try { await run(`ffmpeg -y -i "${input}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${out}"`); await send({ video: fs.readFileSync(out), caption: withFooter('*STICKER TO VIDEO*') }); }
  catch (e) { await reply('Conversion failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'tomp3', alias: ['toaudio'], desc: 'Extract audio from a video', category: 'converter', react: '🎧' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isVideo ? m.quoted : (m.isVideo ? m : null);
  if (!t) return reply('Reply to a video to extract its audio.');
  await reply('Extracting audio...');
  const buf = await t.download();
  const input = await toFile(buf, 'mp4');
  const out = tmp('mp3');
  try { await run(`ffmpeg -y -i "${input}" -vn -ab 128k -ar 44100 "${out}"`); await send({ audio: fs.readFileSync(out), mimetype: 'audio/mpeg', fileName: 'ghost-audio.mp3' }); }
  catch (e) { await reply('Extraction failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'toptt', alias: ['tovn', 'tovoice'], desc: 'Convert audio into a voice note', category: 'converter', react: '🎙️' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
  if (!t) return reply('Reply to an audio or video message.');
  const buf = await t.download();
  const input = await toFile(buf, 'mp3');
  const out = tmp('opus');
  try { await run(`ffmpeg -y -i "${input}" -c:a libopus -b:a 128k -vbr on -compression_level 10 "${out}"`); await send({ audio: fs.readFileSync(out), mimetype: 'audio/ogg; codecs=opus', ptt: true }); }
  catch (e) { await reply('Conversion failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'togif', desc: 'Convert a video or sticker into a GIF', category: 'converter', react: '🎬' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
  if (!t) return reply('Reply to a short video or animated sticker.');
  const buf = await t.download();
  const input = await toFile(buf, t.isSticker ? 'webp' : 'mp4');
  const out = tmp('mp4');
  try { await run(`ffmpeg -y -i "${input}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${out}"`); await send({ video: fs.readFileSync(out), gifPlayback: true, caption: withFooter('*GIF CONVERSION*') }); }
  catch (e) { await reply('Conversion failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

/* ============ AUDIO EFFECTS ============ */
function audioEffect({ pattern, alias, filter, label, react }) {
  cmd({ pattern, alias, desc: `Apply the ${label} audio effect`, category: 'converter', react },
  async ({ m, reply, send }) => {
    const t = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
    if (!t) return reply(`Reply to an audio or video message to apply the ${label} effect.`);
    await reply(`Applying ${label} effect...`);
    const buf = await t.download();
    const input = await toFile(buf, 'mp3');
    const out = tmp('mp3');
    try { await run(`ffmpeg -y -i "${input}" -filter:a "${filter}" "${out}"`); await send({ audio: fs.readFileSync(out), mimetype: 'audio/mpeg', fileName: `${pattern}.mp3` }); }
    catch (e) { await reply('Effect failed: ' + e.message.slice(0, 150)); }
    finally { cleanup(input, out); }
  });
}

audioEffect({ pattern: 'bass', filter: 'bass=g=20,dynaudnorm=f=200', label: 'bass boost', react: '🔊' });
audioEffect({ pattern: 'deep', filter: 'atempo=4/4,asetrate=44500*2/3', label: 'deep voice', react: '🕳️' });
audioEffect({ pattern: 'nightcore', alias: ['fast'], filter: 'atempo=1.06,asetrate=44100*1.25', label: 'nightcore', react: '🌙' });
audioEffect({ pattern: 'slow', alias: ['slowmo'], filter: 'atempo=0.7', label: 'slow', react: '🐢' });
audioEffect({ pattern: 'robot', filter: 'afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75', label: 'robot', react: '🤖' });
audioEffect({ pattern: 'reverse', alias: ['revaudio'], filter: 'areverse', label: 'reverse', react: '🔁' });
audioEffect({ pattern: 'earrape', filter: 'volume=12', label: 'earrape', react: '📢' });
audioEffect({ pattern: 'chipmunk', alias: ['squirrel'], filter: 'atempo=0.5,asetrate=65100', label: 'chipmunk', react: '🐿️' });
audioEffect({ pattern: 'blown', filter: 'acrusher=.1:1:64:0:log', label: 'blown speaker', react: '💥' });
audioEffect({ pattern: 'tupai', filter: 'atempo=0.5,asetrate=65100', label: 'high pitch', react: '🎵' });

/* ============ VIDEO / IMAGE TOOLS ============ */
cmd({ pattern: 'compress', alias: ['compressvideo'], desc: 'Compress a video to a smaller size', category: 'converter', react: '🗜️' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isVideo ? m.quoted : (m.isVideo ? m : null);
  if (!t) return reply('Reply to a video.');
  await reply('Compressing, this can take a while...');
  const buf = await t.download();
  const input = await toFile(buf, 'mp4');
  const out = tmp('mp4');
  try {
    await run(`ffmpeg -y -i "${input}" -vcodec libx264 -crf 32 -preset veryfast -acodec aac -b:a 96k "${out}"`);
    const before = buf.length, after = fs.statSync(out).size;
    await send({ video: fs.readFileSync(out), caption: withFooter(`*VIDEO COMPRESSED*\n\nBefore : ${formatBytes(before)}\nAfter  : ${formatBytes(after)}\nSaved  : ${Math.round((1 - after / before) * 100)}%`) });
  } catch (e) { await reply('Compression failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'mute2', alias: ['mutevideo', 'removeaudio'], desc: 'Remove audio from a video', category: 'converter', react: '🔇' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isVideo ? m.quoted : (m.isVideo ? m : null);
  if (!t) return reply('Reply to a video.');
  const buf = await t.download();
  const input = await toFile(buf, 'mp4');
  const out = tmp('mp4');
  try { await run(`ffmpeg -y -i "${input}" -an -vcodec copy "${out}"`); await send({ video: fs.readFileSync(out), caption: withFooter('*AUDIO REMOVED*') }); }
  catch (e) { await reply('Failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'thumbnail', alias: ['thumb', 'screenshot2'], desc: 'Grab a thumbnail frame from a video', category: 'converter', react: '📸' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isVideo ? m.quoted : (m.isVideo ? m : null);
  if (!t) return reply('Reply to a video.');
  const buf = await t.download();
  const input = await toFile(buf, 'mp4');
  const out = tmp('jpg');
  try { await run(`ffmpeg -y -i "${input}" -ss 00:00:01 -vframes 1 "${out}"`); await send({ image: fs.readFileSync(out), caption: withFooter('*VIDEO THUMBNAIL*') }); }
  catch (e) { await reply('Failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'trim', alias: ['cut'], desc: 'Trim a video or audio clip', category: 'converter', use: '<start> <end>  e.g. 00:00:05 00:00:20', react: '✂️' },
async ({ m, args, reply, send }) => {
  const t = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
  if (!t) return reply('Reply to a video or audio file.\nExample: .trim 00:00:05 00:00:20');
  if (args.length < 2) return reply('Provide start and end times.\nExample: .trim 00:00:05 00:00:20');
  const buf = await t.download();
  const ext = t.isVideo ? 'mp4' : 'mp3';
  const input = await toFile(buf, ext);
  const out = tmp(ext);
  try {
    await run(`ffmpeg -y -i "${input}" -ss ${args[0]} -to ${args[1]} -c copy "${out}"`);
    const data = fs.readFileSync(out);
    await send(t.isVideo ? { video: data, caption: withFooter('*TRIMMED*') } : { audio: data, mimetype: 'audio/mpeg' });
  } catch (e) { await reply('Trim failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'toblack', alias: ['grayscale', 'bw'], desc: 'Convert an image to black and white', category: 'converter', react: '⚫' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isImage ? m.quoted : (m.isImage ? m : null);
  if (!t) return reply('Reply to an image.');
  const buf = await t.download();
  const input = await toFile(buf, 'jpg');
  const out = tmp('jpg');
  try { await run(`ffmpeg -y -i "${input}" -vf format=gray "${out}"`); await send({ image: fs.readFileSync(out), caption: withFooter('*BLACK & WHITE*') }); }
  catch (e) { await reply('Failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'blur', desc: 'Blur an image', category: 'converter', react: '🌫️' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isImage ? m.quoted : (m.isImage ? m : null);
  if (!t) return reply('Reply to an image.');
  const buf = await t.download();
  const input = await toFile(buf, 'jpg');
  const out = tmp('jpg');
  try { await run(`ffmpeg -y -i "${input}" -vf "boxblur=10:2" "${out}"`); await send({ image: fs.readFileSync(out), caption: withFooter('*BLURRED IMAGE*') }); }
  catch (e) { await reply('Failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'flip', alias: ['mirror'], desc: 'Flip an image horizontally', category: 'converter', react: '🔃' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isImage ? m.quoted : (m.isImage ? m : null);
  if (!t) return reply('Reply to an image.');
  const buf = await t.download();
  const input = await toFile(buf, 'jpg');
  const out = tmp('jpg');
  try { await run(`ffmpeg -y -i "${input}" -vf hflip "${out}"`); await send({ image: fs.readFileSync(out), caption: withFooter('*FLIPPED IMAGE*') }); }
  catch (e) { await reply('Failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'resize', desc: 'Resize an image', category: 'converter', use: '<width> <height>', react: '📐' },
async ({ m, args, reply, send }) => {
  const t = m.quoted?.isImage ? m.quoted : (m.isImage ? m : null);
  if (!t) return reply('Reply to an image.\nExample: .resize 720 720');
  const w = parseInt(args[0]) || 720, h = parseInt(args[1]) || w;
  const buf = await t.download();
  const input = await toFile(buf, 'jpg');
  const out = tmp('jpg');
  try { await run(`ffmpeg -y -i "${input}" -vf scale=${w}:${h} "${out}"`); await send({ image: fs.readFileSync(out), caption: withFooter(`*RESIZED TO ${w}x${h}*`) }); }
  catch (e) { await reply('Failed: ' + e.message.slice(0, 150)); }
  finally { cleanup(input, out); }
});

cmd({ pattern: 'todoc', alias: ['todocument', 'tofile'], desc: 'Resend media as a document file', category: 'converter', react: '📎' },
async ({ m, reply, send }) => {
  const t = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
  if (!t) return reply('Reply to any media file.');
  const buf = await t.download();
  const ext = t.isVideo ? 'mp4' : t.isImage ? 'jpg' : t.isAudio ? 'mp3' : 'bin';
  await send({ document: buf, fileName: `ghost-file.${ext}`, mimetype: t.isVideo ? 'video/mp4' : t.isImage ? 'image/jpeg' : 'audio/mpeg', caption: withFooter('*CONVERTED TO DOCUMENT*') });
});

cmd({ pattern: 'url', alias: ['tourl', 'upload', 'imgurl'], desc: 'Upload media and get a public link', category: 'converter', react: '🔗' },
async ({ m, reply }) => {
  const t = m.quoted?.isMedia ? m.quoted : (m.isMedia ? m : null);
  if (!t) return reply('Reply to a media file to upload it.');
  await reply('Uploading...');
  try {
    const FormData = require('form-data');
    const { axios } = require('../lib/utils');
    const buf = await t.download();
    const filename = `ghost.${t.isImage ? 'jpg' : t.isVideo ? 'mp4' : t.isAudio ? 'mp3' : 'bin'}`;
    const makeForm = (temporary = false) => {
      const form = new FormData();
      // Catbox expects these exact multipart field names.
      form.append('reqtype', 'fileupload');
      if (temporary) form.append('time', '72h');
      form.append('fileToUpload', buf, { filename });
      return form;
    };
    const request = (endpoint, form) => axios.post(endpoint, form, {
      headers: { ...form.getHeaders(), 'User-Agent': 'GhostMiniOFC/1.0', Accept: 'text/plain' },
      timeout: 120000, maxContentLength: 100 * 1024 * 1024,
      maxBodyLength: 100 * 1024 * 1024, responseType: 'text', validateStatus: () => true
    });

    let r = await request('https://catbox.moe/user/api.php', makeForm());
    let link = String(r.data || '').trim();
    let hosting = 'Catbox';
    // Some Heroku/shared hosting IPs are temporarily rejected by Catbox
    // with HTTP 412. Retry through Catbox's official temporary endpoint so
    // the command still returns a usable link instead of an error.
    if (r.status === 412 || !/^https?:\/\/files\.catbox\.moe\//i.test(link)) {
      r = await request('https://litterbox.catbox.moe/resources/internals/api.php', makeForm(true));
      link = String(r.data || '').trim();
      hosting = 'Catbox Litterbox (72h fallback)';
    }
    if (!/^https?:\/\/(?:files\.catbox\.moe|litter\.catbox\.moe)\//i.test(link)) {
      // Final compatibility fallback for hosts where Catbox/Litterbox are
      // blocked by the dyno network or return an HTML 500 page.
      const tmp = new FormData();
      tmp.append('file', buf, { filename });
      const backup = await axios.post('https://tmpfiles.org/api/v1/upload', tmp, {
        headers: { ...tmp.getHeaders(), 'User-Agent': 'GhostMiniOFC/1.0' }, timeout: 120000,
        validateStatus: () => true
      });
      link = backup.data?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/') || '';
      hosting = 'Temporary fallback';
    }
    if (!/^https?:\/\//i.test(link)) throw new Error(link.slice(0, 180) || `Upload service returned HTTP ${r.status}`);
    await reply(`*UPLOAD COMPLETE*\n\nSize : ${formatBytes(buf.length)}\nLink : ${link}\n\n☁️ Hosted by ${hosting}.`);
  } catch (e) { await reply('Upload failed: ' + e.message.slice(0, 150)); }
});
