/**
 * MISC / EXTRA COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const db = require('../lib/database');
const { withFooter, jidToNum, numToJid, axios, getBuffer, truncate, pickRandom, sleep } = require('../lib/utils');

/* ============ VIEW ONCE MANUAL SAVE ============ */
cmd({ pattern: 'vv', alias: ['viewonce', 'reveal', 'retrieve'], desc: 'Save a replied view-once photo or video', category: 'misc', react: '👁️' },
async ({ m, reply, send }) => {
  if (!m.quoted) return reply('👁️ Reply to a view-once photo or video with .vv');
  try {
    const buf = await m.quoted.download();
    if (!buf) return reply('❌ Could not download that view-once media.');
    const caption = withFooter('👁️ *VIEW-ONCE MEDIA SAVED*');
    if (m.quoted.isImage) return send({ image: buf, caption });
    if (m.quoted.isVideo) return send({ video: buf, caption });
    if (m.quoted.isAudio) return send({ audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true });
    return send({ document: buf, fileName: 'view-once-media', caption });
  } catch (e) { await reply(`❌ View-once save failed: ${String(e.message || e).slice(0, 160)}`); }
});

cmd({ pattern: 'save', alias: ['keep', 'store2'], desc: 'Save any replied media to your inbox', category: 'misc', react: '💾' },
async ({ sock, m, reply }) => {
  if (!m.quoted?.isMedia) return reply('Reply to any media message.');
  const buf = await m.quoted.download();
  const key = m.quoted.isImage ? 'image' : m.quoted.isVideo ? 'video' : m.quoted.isAudio ? 'audio' : 'document';
  await sock.sendMessage(m.sender, { [key]: buf, mimetype: m.quoted.isAudio ? 'audio/mpeg' : undefined, fileName: 'saved-media', caption: key === 'document' ? undefined : withFooter('*SAVED MEDIA*') });
  await reply('Media saved to your inbox.');
});

cmd({ pattern: 'forward', alias: ['fwd'], desc: 'Forward a replied message to a number', category: 'misc', ownerOnly: true, use: '<number>', react: '↪️' },
async ({ sock, m, args, reply }) => {
  if (!m.quoted) return reply('Reply to the message you want to forward.');
  if (!args[0]) return reply('Provide the destination number.\nExample: .forward 94771234567');
  await sock.sendMessage(numToJid(args[0]), { forward: { key: m.quoted.key, message: m.quoted.message } });
  await reply(`Forwarded to ${args[0]}.`);
});

cmd({ pattern: 'quoted', alias: ['q'], desc: 'Show details of the replied message', category: 'misc', react: '🔎' },
async ({ m, reply }) => {
  if (!m.quoted) return reply('Reply to any message.');
  await reply(`*QUOTED MESSAGE INFO*\n\nType   : ${m.quoted.type}\nSender : ${m.quoted.senderNum}\nMedia  : ${m.quoted.isMedia ? 'yes' : 'no'}\nID     : ${m.quoted.key.id}\n\nText:\n${truncate(m.quoted.text || 'none', 500)}`);
});

/* ============ TEXT PRO STYLE LOGOS ============ */
function logoCommand({ pattern, alias, style, label, react }) {
  cmd({ pattern, alias, desc: `Create a ${label} text logo`, category: 'logo', use: '<text>', react },
  async ({ q, reply, send }) => {
    if (!q) return reply(`Provide the text.\nExample: .${pattern} GHOST`);
    await reply('Rendering your logo...');
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${style}, the text "${q}" as a professional logo, centered, high resolution, no watermark`)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
      const buf = await getBuffer(url, { timeout: 180000 });
      await send({ image: buf, caption: withFooter(`*${label.toUpperCase()} LOGO*\n\nText : ${q}`) });
    } catch { await reply('Logo generation failed. Try again in a moment.'); }
  });
}

logoCommand({ pattern: 'neonlogo', alias: ['neon'], style: 'glowing neon sign on a dark brick wall', label: 'Neon', react: '💡' });
logoCommand({ pattern: 'firelogo', alias: ['fire'], style: 'burning fire letters, embers, dark background', label: 'Fire', react: '🔥' });
logoCommand({ pattern: 'goldlogo', alias: ['gold'], style: 'luxury gold 3d metallic letters with reflections', label: 'Gold', react: '🥇' });
logoCommand({ pattern: 'glitchlogo', alias: ['glitch'], style: 'cyberpunk glitch text effect with chromatic aberration', label: 'Glitch', react: '📺' });
logoCommand({ pattern: 'watercolorlogo', alias: ['watercolor'], style: 'artistic watercolor painted lettering on paper', label: 'Watercolor', react: '🎨' });
logoCommand({ pattern: 'graffitilogo', alias: ['graffiti'], style: 'street graffiti spray paint on a concrete wall', label: 'Graffiti', react: '🧱' });
logoCommand({ pattern: 'shadowlogo', alias: ['shadow'], style: 'dark cinematic 3d text with dramatic shadows and fog', label: 'Shadow', react: '🌑' });
logoCommand({ pattern: 'glasslogo', alias: ['glass'], style: 'transparent frosted glass morphism 3d text', label: 'Glass', react: '🧊' });
logoCommand({ pattern: 'steellogo', alias: ['steel', 'metal'], style: 'brushed steel industrial metal letters', label: 'Steel', react: '⚙️' });
logoCommand({ pattern: 'galaxylogo', alias: ['galaxy', 'space'], style: 'galaxy nebula filled letters with stars', label: 'Galaxy', react: '🌌' });
logoCommand({ pattern: 'ghostlogo', style: 'ghostly glowing translucent spooky letters in dark mist', label: 'Ghost', react: '👻' });
logoCommand({ pattern: 'anaglyphlogo', alias: ['3dlogo'], style: 'bold 3d extruded text with depth and perspective', label: '3D', react: '🧿' });

/* ============ TEXTMAKER SIMPLE ============ */
cmd({ pattern: 'attp', desc: 'Turn text into an animated sticker', category: 'logo', use: '<text>', react: '✨' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide short text.\nExample: .attp GHOST');
  try {
    const buf = await getBuffer(`https://api.dreaded.site/api/attp?text=${encodeURIComponent(q.slice(0, 30))}`);
    await send({ sticker: buf });
  } catch { await reply('ATTP service is unavailable. Try .ttp instead.'); }
});

cmd({ pattern: 'ttp', desc: 'Turn text into a plain sticker', category: 'logo', use: '<text>', react: '🔤' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide short text.\nExample: .ttp HELLO');
  try {
    const buf = await getBuffer(`https://api.dreaded.site/api/ttp?text=${encodeURIComponent(q.slice(0, 30))}`);
    await send({ sticker: buf });
  } catch {
    try {
      const QRish = await getBuffer(`https://dummyimage.com/512x512/000/fff.png&text=${encodeURIComponent(q.slice(0, 20))}`);
      await send({ image: QRish, caption: withFooter('*TEXT IMAGE*') });
    } catch { await reply('Text sticker service is unavailable right now.'); }
  }
});

/* ============ NUMBER / PHONE ============ */
cmd({ pattern: 'checknumber', alias: ['onwa', 'checkwa'], desc: 'Check if a number is on WhatsApp', category: 'misc', use: '<number>', react: '📱' },
async ({ sock, args, reply }) => {
  if (!args[0]) return reply('Provide a number.\nExample: .checknumber 94771234567');
  const num = args[0].replace(/[^0-9]/g, '');
  try {
    const [res] = await sock.onWhatsApp(num + '@s.whatsapp.net');
    if (!res?.exists) return reply(`*NUMBER CHECK*\n\nNumber : +${num}\nStatus : not registered on WhatsApp`);
    await reply(`*NUMBER CHECK*\n\nNumber : +${num}\nStatus : registered on WhatsApp\nJID    : ${res.jid}`);
  } catch { await reply('Number check failed.'); }
});

/* ============ BOT INTERACTION ============ */
cmd({ pattern: 'report', alias: ['bug', 'feedback'], desc: 'Report a bug to the owner', category: 'misc', use: '<message>', react: '🐞' },
async ({ sock, m, q, reply }) => {
  if (!q) return reply('Describe the issue.\nExample: .report the song command times out');
  const text = `*BUG REPORT*\n\nFrom  : ${m.pushName} (${m.senderNum})\nChat  : ${m.isGroup ? 'group' : 'private'}\nTime  : ${new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE })}\n\nMessage:\n${q}`;
  for (const o of config.OWNER_NUMBERS) {
    await sock.sendMessage(numToJid(o), { text: withFooter(text) }).catch(() => {});
  }
  await reply('Your report has been sent to the owner. Thank you for the feedback.');
});

cmd({ pattern: 'request', alias: ['suggest'], desc: 'Request a new feature', category: 'misc', use: '<idea>', react: '💡' },
async ({ sock, m, q, reply }) => {
  if (!q) return reply('Describe the feature you want.');
  for (const o of config.OWNER_NUMBERS) {
    await sock.sendMessage(numToJid(o), { text: withFooter(`*FEATURE REQUEST*\n\nFrom : ${m.pushName} (${m.senderNum})\n\n${q}`) }).catch(() => {});
  }
  await reply('Your request has been sent to the developer.');
});

cmd({ pattern: 'ping2', alias: ['test'], desc: 'Simple connectivity test', category: 'misc', react: '📶' },
async ({ reply }) => reply(`*CONNECTIVITY TEST*\n\nBot        : online\nDatabase   : ${db.isConnected() ? 'connected' : 'offline'}\nTimestamp  : ${Date.now()}`));

cmd({ pattern: 'apistatus', alias: ['checkapi'], desc: 'Check the health of all API services', category: 'misc', react: '🩺' },
async ({ reply }) => {
  const { sasaApi } = require('../lib/utils');
  await reply('Running health checks, please wait...');
  const checks = [
    ['YouTube', '/api/ytmp3', { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }],
    ['TikTok', '/api/tiktokv2', { url: 'https://www.tiktok.com/' }],
    ['Movies', '/api/movie/search?provider=sinhalasub', { q: '2024' }],
    ['XNXX', '/api/adult/xnxx/search', { q: 'test' }]
  ];
  let t = `*API HEALTH CHECK*\n\n`;
  for (const [name, ep, params] of checks) {
    const start = Date.now();
    const r = await sasaApi(ep, params);
    t += `${name.padEnd(12)} ${r.status ? 'OK  ' : 'FAIL'}  ${Date.now() - start} ms\n`;
  }
  await reply(t);
});

/* ============ QUICK REPLIES ============ */
const quickReplies = [
  ['hi', 'GREETING', () => `Hello there. I am ${config.BOT_NAME}. Type .menu to see everything I can do.`],
  ['thanks', 'THANK YOU', () => 'You are welcome. Happy to help any time.'],
  ['rules', 'BOT RULES', () => 'Rules:\n\n1. Do not spam commands.\n2. Respect other members.\n3. Report bugs with .report\n4. Follow the support channel for updates.'],
  ['tos', 'TERMS OF SERVICE', () => `By using ${config.BOT_NAME} you agree not to abuse the service, not to use it for illegal content, and to accept that the bot is provided as is with no warranty.`],
  ['privacy', 'PRIVACY POLICY', () => `${config.BOT_NAME} stores only your WhatsApp ID, display name, and command usage counters in a private GitHub repository. Message content is not stored except temporarily for anti-delete recovery, which auto-expires after 24 hours.`],
  ['faq', 'FREQUENTLY ASKED', () => 'Q: How do I get my own bot?\nA: Visit the pairing website and enter your number.\n\nQ: Is it free?\nA: Yes.\n\nQ: Why did my session disconnect?\nA: Logging out from linked devices removes the session. Just pair again.']
];

quickReplies.forEach(([pattern, title, fn]) => {
  cmd({ pattern, desc: `Show ${title.toLowerCase()}`, category: 'misc', react: '💬' },
  async ({ reply }) => reply(`*${title}*\n\n${fn()}`));
});

cmd({ pattern: 'website', alias: ['site', 'pair', 'connect'], desc: 'Get the bot pairing website link', category: 'misc', react: '🌐' },
async ({ send }) => send({ image: { url: config.LOGO }, caption: withFooter(`*CONNECT YOUR OWN BOT*\n\nVisit the pairing website, enter your WhatsApp number, and receive an 8 digit pairing code or scan a QR code.\n\nSupport channel:\n${config.SUPPORT_CHANNEL}\n\nOwner: ${config.OWNER_NAME}`) }));

cmd({ pattern: 'uptime2', alias: ['live'], desc: 'Detailed uptime and health report', category: 'misc', react: '📡' },
async ({ reply }) => {
  const { runtime, formatBytes } = require('../lib/utils');
  const { sessions } = require('../lib/connection');
  await reply(`*LIVE HEALTH REPORT*\n\nUptime    : ${runtime(process.uptime())}\nSessions  : ${sessions.size}\nHeap used : ${formatBytes(process.memoryUsage().heapUsed)}\nDatabase  : ${db.isConnected() ? 'connected' : 'offline'}\nNode      : ${process.version}`);
});

cmd({ pattern: 'clearcache', desc: 'Clear internal caches', category: 'misc', ownerOnly: true, react: '🧹' },
async ({ reply }) => {
  const { groupMeta } = require('../lib/handler');
  groupMeta.flushAll();
  if (global.gc) global.gc();
  await reply('Internal caches cleared.');
});

cmd({ pattern: 'listusers', alias: ['users'], desc: 'Show recently active users', category: 'misc', ownerOnly: true, react: '👥' },
async ({ reply }) => {
  const list = await db.User.find().sort({ lastSeen: -1 }).limit(20).lean();
  let t = `*RECENT USERS (${list.length})*\n\n`;
  list.forEach((u, i) => { t += `${i + 1}. ${jidToNum(u.jid)} — ${u.commandCount} cmds\n`; });
  await reply(t);
});

cmd({ pattern: 'joke2', alias: ['dadjoke'], desc: 'Random dad joke from the internet', category: 'misc', react: '😄' },
async ({ reply }) => {
  try { const r = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' }, timeout: 30000 }); await reply(`*DAD JOKE*\n\n${r.data.joke}`); }
  catch { await reply('Joke service unavailable.'); }
});

cmd({ pattern: 'quote2', alias: ['inspire2'], desc: 'Random quote from an online API', category: 'misc', react: '📜' },
async ({ reply }) => {
  try { const r = await axios.get('https://api.quotable.io/random', { timeout: 30000 }); await reply(`*QUOTE*\n\n"${r.data.content}"\n\n— ${r.data.author}`); }
  catch { await reply('Quote service unavailable.'); }
});

cmd({ pattern: 'activity', alias: ['myactivity'], desc: 'Your command usage history', category: 'misc', react: '📈' },
async ({ m, reply }) => {
  const u = await db.getUser(m.sender, m.pushName);
  await reply(`*YOUR ACTIVITY*\n\nCommands used : ${u.commandCount}\nLast command  : ${u.lastCommand || 'none'}\nFirst seen    : ${new Date(u.firstSeen).toLocaleString('en-GB')}\nLast seen     : ${new Date(u.lastSeen).toLocaleString('en-GB')}\nWarns         : ${u.warns || 0}`);
});
