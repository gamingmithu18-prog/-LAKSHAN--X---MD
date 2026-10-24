/**
 * OWNER / SETTINGS COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd, stats } = require('../lib/command');
const config = require('../config');
const db = require('../lib/database');
const { withFooter, jidToNum, numToJid, sleep, formatBytes, runtime } = require('../lib/utils');
const util = require('util');

cmd({ pattern: 'pair', alias: ['pairing', 'connect'], desc: 'Start a pairing code connection', category: 'owner', use: '<number>', react: '🔗' },
async ({ args, m, reply, send }) => {
  // With no argument, pair the number that sent the command. An explicit
  // number is still accepted for owner-controlled pairing.
  const number = String(args[0] || m.senderNum || '').replace(/[^0-9]/g, '');
  if (!number || number.length < 8 || number.length > 15)
    return reply('📱 Could not detect a valid WhatsApp number. Use: .pair 94741448572');
  try {
    const { createPairing, getPairing } = require('../lib/connection');
    const sid = await createPairing(number, 'code');
    await reply(`⏳ Pairing request started for +${number}. Please wait...`);
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const state = getPairing(sid);
      if (state.status === 'waiting' && state.code) {
        // WhatsApp phone-number pairing uses the displayed code. The QR is
        // a convenient visual copy of that code; it is not a replacement
        // for WhatsApp's own QR-login flow.
        const QRCode = require('qrcode');
        const qr = await QRCode.toBuffer(state.code.replace(/-/g, ''), { width: 420, margin: 2 });
        await send({ image: qr, caption: `🔐 *PAIRING CODE*\n\n📱 Number: +${number}\n🔗 Code: *${state.code}*\n\nThis QR contains the pairing code as a visual copy.` });
        return reply(`📲 Open WhatsApp → Linked devices → Link with phone number instead, then enter *${state.code}*.\n⏱️ Enter it before it expires.`);
      }
      if (state.status === 'error' || state.status === 'expired')
        return reply(`❌ Pairing failed: ${state.error || 'The code expired.'}`);
      if (state.status === 'connected') return reply('✅ This number is already connected.');
    }
    return reply('⌛ Pairing is still starting. Use the website or try .pair again shortly.');
  } catch (e) { return reply(`❌ Pairing failed: ${String(e.message || e).slice(0, 180)}`); }
});

cmd({ pattern: 'restart', alias: ['reboot'], desc: 'Restart the bot process', category: 'owner', ownerOnly: true, react: '🔄' },
async ({ reply }) => { await reply('Restarting now. The bot will be back in a few seconds.'); await sleep(1500); process.exit(0); });

cmd({ pattern: 'shutdown', alias: ['poweroff'], desc: 'Stop the bot completely', category: 'owner', ownerOnly: true, react: '🛑' },
async ({ reply }) => { await reply('Shutting down.'); await sleep(1200); process.exit(1); });

cmd({ pattern: 'follow', alias: ['followchannel', 'autofollow'], desc: 'Follow a channel from connected bot sessions', category: 'owner', ownerOnly: true, use: '<channel URL>, <quantity>', react: '📣' },
async ({ q, reply }) => {
  const parts = String(q || '').split(',').map(x => x.trim()).filter(Boolean);
  const link = parts[0];
  const quantity = Math.max(1, Math.min(500, Number(parts[1] || 1)) || 1);
  const invite = link?.match(/whatsapp\.com\/channel\/([^/]+)/i)?.[1];
  if (!invite) return reply('📣 Use: .follow https://whatsapp.com/channel/INVITE, 10');
  try {
    const { sessions } = require('../lib/connection');
    const db = require('../lib/database');
    const targets = [...sessions.values()].filter(s => s.status === 'connected').slice(0, quantity);
    let meta = null, followed = 0;
    for (const session of targets) {
      try {
        meta = meta || await session.sock.newsletterMetadata('invite', invite);
        const jid = meta?.id;
        if (!jid) continue;
        await session.sock.newsletterFollow(jid);
        followed++;
        require('../lib/diag').bump('channelFollows');
      } catch (_) {}
    }
    const current = (await db.getSetting('ownerPanel')) || { autoFollowChannels: [], autoreactChannels: [] };
    const list = new Set(current.autoFollowChannels || []);
    list.add(link);
    await db.setSetting('ownerPanel', { ...current, autoFollowChannels: [...list].slice(0, 100) });
    await db.flush(true).catch(() => {});
    return reply(`✅ Channel follow complete.\n📣 Followed: ${followed}/${targets.length}\n👥 Requested: ${quantity}\n💾 Saved for future connections.`);
  } catch (e) { return reply(`❌ Follow failed: ${String(e.message || e).slice(0, 180)}`); }
});

cmd({ pattern: 'broadcast', alias: ['bc', 'bcall'], desc: 'Broadcast a message to all chats', category: 'owner', ownerOnly: true, use: '<message>', react: '📡' },
async ({ sock, q, reply }) => {
  if (!q) return reply('Provide the broadcast text.');
  const chats = await sock.groupFetchAllParticipating().catch(() => ({}));
  const ids = Object.keys(chats);
  await reply(`Broadcasting to ${ids.length} group(s)...`);
  let ok = 0;
  for (const id of ids) {
    try { await sock.sendMessage(id, { image: { url: config.LOGO }, caption: withFooter(`*BROADCAST FROM OWNER*\n\n${q}`) }); ok++; } catch (_) {}
    await sleep(900);
  }
  await reply(`Broadcast completed. Delivered to ${ok}/${ids.length} groups.`);
});

cmd({ pattern: 'bcusers', alias: ['bcpm'], desc: 'Broadcast to every known user', category: 'owner', ownerOnly: true, use: '<message>', react: '📨' },
async ({ sock, q, reply }) => {
  if (!q) return reply('Provide the broadcast text.');
  const users = await db.User.find({ banned: false }).limit(400).lean();
  await reply(`Sending to ${users.length} user(s)...`);
  let ok = 0;
  for (const u of users) { try { await sock.sendMessage(u.jid, { text: withFooter(`*MESSAGE FROM OWNER*\n\n${q}`) }); ok++; } catch (_) {} await sleep(1200); }
  await reply(`Done. ${ok}/${users.length} delivered.`);
});

cmd({ pattern: 'ban', alias: ['banuser'], desc: 'Ban a user from using the bot', category: 'owner', ownerOnly: true, use: '@user', react: '🔨' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] && numToJid(args[0]));
  if (!t) return reply('Mention, reply to, or type the number of the user.');
  const u = await db.getUser(t); u.banned = true; await u.save();
  await reply(`@${jidToNum(t)} is now banned from using the bot.`, { mentions: [t] });
});

cmd({ pattern: 'unban', alias: ['unbanuser'], desc: 'Unban a user', category: 'owner', ownerOnly: true, use: '@user', react: '🕊️' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] && numToJid(args[0]));
  if (!t) return reply('Mention, reply to, or type the number of the user.');
  const u = await db.getUser(t); u.banned = false; await u.save();
  await reply(`@${jidToNum(t)} has been unbanned.`, { mentions: [t] });
});

cmd({ pattern: 'banlist', alias: ['bannedusers'], desc: 'List every banned user', category: 'owner', ownerOnly: true, react: '📃' },
async ({ reply }) => {
  const list = await db.User.find({ banned: true }).lean();
  if (!list.length) return reply('No banned users.');
  await reply(`*BANNED USERS (${list.length})*\n\n${list.map((u, i) => `${i + 1}. ${jidToNum(u.jid)}`).join('\n')}`);
});

cmd({ pattern: 'addsudo', alias: ['setsudo', 'sudoadd'], desc: 'Give a user sudo/admin access', category: 'owner', ownerOnly: true, use: '@user', react: '🛡️' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] && numToJid(args[0]));
  if (!t) return reply('Mention, reply to, or type the number of the user.');
  db.setAdmin(t, true);
  await db.flush(true).catch(() => {});
  await reply(`@${jidToNum(t)} is now a sudo user.`, { mentions: [t] });
});

cmd({ pattern: 'delaudo', alias: ['delsudo', 'removesudo', 'sudooff'], desc: 'Remove sudo/admin access', category: 'owner', ownerOnly: true, use: '@user', react: '🔓' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] && numToJid(args[0]));
  if (!t) return reply('Mention, reply to, or type the number of the user.');
  if (config.OWNER_NUMBERS.includes(jidToNum(t))) return reply('The primary owner cannot be removed.');
  db.setAdmin(t, false);
  await db.flush(true).catch(() => {});
  await reply(`Sudo access removed from @${jidToNum(t)}.`, { mentions: [t] });
});

cmd({ pattern: 'addpremium', alias: ['addprem'], desc: 'Give premium access to a user', category: 'owner', ownerOnly: true, use: '@user', react: '💎' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] && numToJid(args[0]));
  if (!t) return reply('Mention or reply to the user.');
  const u = await db.getUser(t); u.premium = true; await u.save();
  await reply(`@${jidToNum(t)} now has premium access.`, { mentions: [t] });
});

cmd({ pattern: 'delpremium', alias: ['delprem'], desc: 'Remove premium access', category: 'owner', ownerOnly: true, use: '@user', react: '🔻' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] && numToJid(args[0]));
  if (!t) return reply('Mention or reply to the user.');
  const u = await db.getUser(t); u.premium = false; await u.save();
  await reply(`Premium removed from @${jidToNum(t)}.`, { mentions: [t] });
});

cmd({ pattern: 'premlist', alias: ['premiumlist'], desc: 'List premium users', category: 'owner', ownerOnly: true, react: '👑' },
async ({ reply }) => {
  const list = await db.User.find({ premium: true }).lean();
  if (!list.length) return reply('No premium users yet.');
  await reply(`*PREMIUM USERS (${list.length})*\n\n${list.map((u, i) => `${i + 1}. ${jidToNum(u.jid)}`).join('\n')}`);
});

cmd({ pattern: 'block', desc: 'Block a WhatsApp contact', category: 'owner', ownerOnly: true, use: '@user', react: '⛔' },
async ({ sock, m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] ? numToJid(args[0]) : m.chat);
  await sock.updateBlockStatus(t, 'block');
  await reply(`Blocked ${jidToNum(t)}.`);
});

cmd({ pattern: 'unblock', desc: 'Unblock a WhatsApp contact', category: 'owner', ownerOnly: true, use: '<number>', react: '✅' },
async ({ sock, m, args, reply }) => {
  const t = m.mentions?.[0] || (args[0] ? numToJid(args[0]) : m.chat);
  await sock.updateBlockStatus(t, 'unblock');
  await reply(`Unblocked ${jidToNum(t)}.`);
});

cmd({ pattern: 'blocklist', desc: 'Show all blocked contacts', category: 'owner', ownerOnly: true, react: '📕' },
async ({ sock, reply }) => {
  const list = await sock.fetchBlocklist().catch(() => []);
  if (!list.length) return reply('Your block list is empty.');
  await reply(`*BLOCKED CONTACTS (${list.length})*\n\n${list.map((j, i) => `${i + 1}. ${jidToNum(j)}`).join('\n')}`);
});

cmd({ pattern: 'setbotname', alias: ['setname2'], desc: 'Change the bot WhatsApp display name', category: 'owner', ownerOnly: true, use: '<name>', react: '🏷️' },
async ({ sock, q, reply }) => { if (!q) return reply('Provide a new name.'); await sock.updateProfileName(q); await reply(`Bot display name changed to: ${q}`); });

cmd({ pattern: 'setbio', alias: ['setstatus'], desc: 'Change the bot about/bio text', category: 'owner', ownerOnly: true, use: '<text>', react: '💭' },
async ({ sock, q, reply }) => { if (!q) return reply('Provide the new bio text.'); await sock.updateProfileStatus(q); await reply('Bot bio updated.'); });

cmd({ pattern: 'setbotpp', alias: ['setpp'], desc: 'Change the bot profile picture (reply to image)', category: 'owner', ownerOnly: true, react: '🖼️' },
async ({ sock, m, reply }) => {
  if (!m.quoted?.isImage) return reply('Reply to an image.');
  const buf = await m.quoted.download();
  await sock.updateProfilePicture(sock.user.id, buf);
  await reply('Bot profile picture updated.');
});

cmd({ pattern: 'setprefix', desc: 'Change the command prefix for this session', category: 'owner', ownerOnly: true, use: '<symbol>', react: '🔣' },
async ({ args, session, reply }) => {
  if (!args[0]) return reply('Provide a new prefix, for example: .setprefix !');
  await db.Session.updateOne({ sessionId: session.sessionId }, { $set: { prefix: args[0] } });
  config.PREFIX = args[0];
  await reply(`Prefix changed to *${args[0]}*`);
});

cmd({ pattern: 'setmode', alias: ['mode'], desc: 'Switch between public and private mode', category: 'owner', ownerOnly: true, use: 'public|private|group|inbox', react: '🔐' },
async ({ args, session, reply }) => {
  const v = String(args[0] || '').toLowerCase();
  if (!['public', 'private', 'group', 'inbox'].includes(v)) return reply(`Current mode: ${session.mode || config.MODE}\n\nUse: public, private, group, inbox`);
  await db.Session.updateOne({ sessionId: session.sessionId }, { $set: { mode: v } });
  config.MODE = v;
  await reply(`Bot mode set to *${v}*.`);
});

/* runtime toggles */
function envToggle({ pattern, alias, key, label, react }) {
  cmd({ pattern, alias, desc: `Toggle ${label}`, category: 'settings', ownerOnly: true, use: 'on|off', react },
  async ({ args, reply }) => {
    const v = String(args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(v)) return reply(`*${label.toUpperCase()}*\nCurrent: ${config[key] ? 'on' : 'off'}\n\nUse: .${pattern} on | off`);
    config[key] = v === 'on';
    await db.setSetting(key, config[key]).catch(() => {});
    await reply(`${label} is now *${v}*.`);
  });
}

envToggle({ pattern: 'autoread', key: 'AUTO_READ_MESSAGES', label: 'Auto read messages', react: '👁️' });
envToggle({ pattern: 'autoreadstatus', alias: ['autostatusread'], key: 'AUTO_READ_STATUS', label: 'Auto view status', react: '👀' });
envToggle({ pattern: 'autolikestatus', alias: ['autostatuslike'], key: 'AUTO_LIKE_STATUS', label: 'Auto like status', react: '💚' });
envToggle({ pattern: 'autotyping', key: 'AUTO_TYPING', label: 'Auto typing indicator', react: '⌨️' });
envToggle({ pattern: 'autorecording', key: 'AUTO_RECORDING', label: 'Auto recording indicator', react: '🎙️' });
envToggle({ pattern: 'alwaysonline', key: 'ALWAYS_ONLINE', label: 'Always online presence', react: '🟢' });
envToggle({ pattern: 'antidelete', key: 'ANTI_DELETE', label: 'Anti-delete recovery', react: '🕵️' });
envToggle({ pattern: 'anticall', key: 'ANTI_CALL', label: 'Auto call rejection', react: '📵' });
envToggle({ pattern: 'anticallblock', key: 'ANTI_CALL_BLOCK', label: 'Block callers automatically', react: '🚫' });
envToggle({ pattern: 'cmdreact', alias: ['autoreact'], key: 'REACT_ON_CMD', label: 'React on commands', react: '⚡' });
envToggle({ pattern: 'newsletter', alias: ['channelforward'], key: 'NEWSLETTER_FORWARD', label: 'Channel forward branding', react: '📣' });
envToggle({ pattern: 'menulogo', key: 'SEND_LOGO_ON_MENU', label: 'Logo on menu', react: '🖼️' });
envToggle({ pattern: 'autofollow', key: 'AUTO_FOLLOW_CHANNEL', label: 'Auto follow support channel', react: '➕' });

cmd({ pattern: 'settings', alias: ['config', 'setting'], desc: 'Show every current bot setting', category: 'settings', ownerOnly: true, react: '⚙️' },
async ({ reply, session }) => {
  const on = (v) => (v ? 'on ' : 'off');
  await reply(
`*BOT SETTINGS*

Prefix           : ${session.prefix || config.PREFIX}
Mode             : ${session.mode || config.MODE}
Auto read msg    : ${on(config.AUTO_READ_MESSAGES)}
Auto view status : ${on(config.AUTO_READ_STATUS)}
Auto like status : ${on(config.AUTO_LIKE_STATUS)}
Auto typing      : ${on(config.AUTO_TYPING)}
Auto recording   : ${on(config.AUTO_RECORDING)}
Always online    : ${on(config.ALWAYS_ONLINE)}
Anti delete      : ${on(config.ANTI_DELETE)}
Anti call        : ${on(config.ANTI_CALL)}
Block callers    : ${on(config.ANTI_CALL_BLOCK)}
Command react    : ${on(config.REACT_ON_CMD)}
Channel forward  : ${on(config.NEWSLETTER_FORWARD)}
Menu logo        : ${on(config.SEND_LOGO_ON_MENU)}
Auto follow      : ${on(config.AUTO_FOLLOW_CHANNEL)}
Timezone         : ${config.TIMEZONE}`);
});

cmd({ pattern: 'sessions', alias: ['sessionlist'], desc: 'List all connected bot sessions', category: 'owner', ownerOnly: true, react: '🔗' },
async ({ reply }) => {
  const list = await db.Session.find().sort({ connectedAt: -1 }).limit(30).lean();
  if (!list.length) return reply('No sessions stored.');
  let t = `*SESSIONS (${list.length})*\n\n`;
  list.forEach((s, i) => { t += `${i + 1}. ${s.number || 'pending'} — ${s.status}\n   id: ${s.sessionId}\n`; });
  await reply(t.slice(0, 3800));
});

cmd({ pattern: 'delsession', alias: ['removesession'], desc: 'Delete a stored session', category: 'owner', ownerOnly: true, use: '<sessionId>', react: '🗑️' },
async ({ args, reply }) => {
  if (!args[0]) return reply('Provide the session id. Use .sessions to list them.');
  const { logoutSession } = require('../lib/connection');
  await logoutSession(args[0]);
  await reply(`Session ${args[0]} deleted.`);
});

cmd({ pattern: 'dbstats', alias: ['database'], desc: 'Database statistics', category: 'owner', ownerOnly: true, react: '🗄️' },
async ({ reply }) => {
  const [users, groups, sessions, antidelete] = await Promise.all([
    db.User.countDocuments(), db.Group.countDocuments(),
    db.Session.countDocuments(), db.AntiDelete.countDocuments()
  ]);
  const st = db.getStats();
  await reply(
`*DATABASE STATS*

Status      : ${db.isConnected() ? '✅ connected' : '❌ offline'}

*STORAGE ENGINES*
MongoDB     : ${st.mongo?.ready ? '✅ connected' : '❌ offline'}
             └ sessions, creds
Firebase    : ${st.firebase?.ready ? '✅ connected' : '❌ offline'}
             └ users, groups, settings

*RECORDS*
Users       : ${users}
Groups      : ${groups}
Sessions    : ${sessions}
Premium     : ${db.premiumList().length}
Banned      : ${db.bannedList().length}
Admins      : ${db.adminList().length}
Anti-delete : ${antidelete} (memory)`);
});


cmd({ pattern: 'cleardb', desc: 'Clear cached anti-delete records', category: 'owner', ownerOnly: true, react: '🧹' },
async ({ reply }) => { const r = await db.AntiDelete.deleteMany({}); await reply(`Cleared ${r.deletedCount} cached record(s).`); });

cmd({ pattern: 'eval', alias: ['ev', '>'], desc: 'Evaluate JavaScript code', category: 'owner', ownerOnly: true, use: '<code>', react: '🧪', dontAddCommandList: true },
async (ctx) => {
  const { q, reply } = ctx;
  if (!q) return reply('Provide code to evaluate.');
  try {
    let res = await eval(`(async () => { ${q.includes('return') ? q : 'return ' + q} })()`);
    await reply('```' + util.inspect(res, { depth: 1 }).slice(0, 3000) + '```');
  } catch (e) { await reply('```' + String(e).slice(0, 2000) + '```'); }
});

cmd({ pattern: 'shell', alias: ['exec', '$'], desc: 'Run a shell command', category: 'owner', ownerOnly: true, use: '<command>', react: '💻', dontAddCommandList: true },
async ({ q, reply }) => {
  if (!q) return reply('Provide a shell command.');
  require('child_process').exec(q, { timeout: 30000 }, (err, stdout, stderr) => {
    reply('```' + String(err ? err.message : stdout || stderr || 'no output').slice(0, 3000) + '```');
  });
});

cmd({ pattern: 'reload', alias: ['reloadplugins'], desc: 'Reload all plugin files', category: 'owner', ownerOnly: true, react: '♻️' },
async ({ reply }) => {
  const { loadPlugins, commands } = require('../lib/command');
  commands.length = 0;
  const n = loadPlugins();
  await reply(`Reloaded ${n} plugin file(s).\nTotal commands: ${stats().total}`);
});

cmd({ pattern: 'leaveall', desc: 'Leave every group', category: 'owner', ownerOnly: true, react: '🚪' },
async ({ sock, reply }) => {
  const chats = await sock.groupFetchAllParticipating().catch(() => ({}));
  const ids = Object.keys(chats);
  await reply(`Leaving ${ids.length} group(s)...`);
  for (const id of ids) { await sock.groupLeave(id).catch(() => {}); await sleep(800); }
  await reply('Left all groups.');
});

cmd({ pattern: 'listgroups', alias: ['gclist'], desc: 'List all groups the bot is in', category: 'owner', ownerOnly: true, react: '📋' },
async ({ sock, reply }) => {
  const chats = await sock.groupFetchAllParticipating().catch(() => ({}));
  const arr = Object.values(chats);
  if (!arr.length) return reply('The bot is not in any group.');
  let t = `*GROUP LIST (${arr.length})*\n\n`;
  arr.slice(0, 50).forEach((g, i) => { t += `${i + 1}. ${g.subject} — ${g.participants?.length || 0} members\n`; });
  await reply(t.slice(0, 3800));
});

cmd({ pattern: 'sendto', alias: ['msgto'], desc: 'Send a message to a specific number', category: 'owner', ownerOnly: true, use: '<number> <text>', react: '✉️' },
async ({ sock, args, reply }) => {
  if (args.length < 2) return reply('Format: .sendto 94771234567 Hello there');
  const jid = numToJid(args[0]);
  await sock.sendMessage(jid, { text: withFooter(args.slice(1).join(' ')) });
  await reply(`Message sent to ${args[0]}.`);
});

cmd({ pattern: 'clearchats', alias: ['clearall'], desc: 'Clear all bot chats', category: 'owner', ownerOnly: true, react: '🧽' },
async ({ sock, reply }) => {
  const chats = await sock.groupFetchAllParticipating().catch(() => ({}));
  await reply(`Chat cleanup requested for ${Object.keys(chats).length} chat(s).`);
});

cmd({ pattern: 'memory', alias: ['ram'], desc: 'Detailed memory usage', category: 'owner', ownerOnly: true, react: '📉' },
async ({ reply }) => {
  const mu = process.memoryUsage();
  await reply(`*MEMORY USAGE*\n\nRSS         : ${formatBytes(mu.rss)}\nHeap total  : ${formatBytes(mu.heapTotal)}\nHeap used   : ${formatBytes(mu.heapUsed)}\nExternal    : ${formatBytes(mu.external)}\nArrayBuffer : ${formatBytes(mu.arrayBuffers || 0)}\nUptime      : ${runtime(process.uptime())}`);
});

cmd({ pattern: 'apikey', desc: 'Show the SASA API configuration', category: 'owner', ownerOnly: true, react: '🔑' },
async ({ reply }) => reply(`*API CONFIGURATION*\n\nBase : ${config.API_BASE}\nKey  : ${config.API_KEY.slice(0, 8)}...${config.API_KEY.slice(-4)}`));

cmd({ pattern: 'apitest', desc: 'Test connection to SASA DEV API', category: 'owner', ownerOnly: true, react: '🧷' },
async ({ reply }) => {
  const { sasaApi } = require('../lib/utils');
  const t = Date.now();
  const r = await sasaApi('/api/ytmp3', { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' });
  const res = r.result ?? r.data;
  const count = Array.isArray(res) ? res.length : 0;
  await reply(`*API TEST*\n\nBase     : ${config.API_BASE}\nEndpoint : /api/ytmp3\nStatus   : ${r.status === true ? 'working' : 'failed'}\nLatency  : ${Date.now() - t} ms\nData     : ${count > 0 ? 'returned' : 'none'}\n${r.remainingCoins !== undefined ? `Coins    : ${r.remainingCoins}` : ''}`);
});

/* ============ SETTINGS PANEL ============ */
cmd({ pattern: 'newpassword', alias: ['newpass', 'resetpassword', 'panelpass'], desc: 'Generate a new settings panel password', category: 'settings', ownerOnly: true, react: '🔑' },
async ({ session, reply, send, m }) => {
  const st = require('../lib/settings');
  const sid = session.sessionId;
  if (!sid) return reply('This session is not registered yet. Please reconnect the bot.');
  const plain = await st.issuePassword(sid, session.number || m.senderNum);
  await db.flush(true).catch(() => {});
  const url = config.PUBLIC_URL ? `${config.PUBLIC_URL.replace(/\/+$/, '')}/setting`
            : 'https://lakshan-md.sasatech.online/setting';
  await send({
    image: { url: config.LOGO },
    caption: withFooter(
`*SETTINGS PANEL ACCESS*

Link   : ${url}
Number : ${session.number || m.senderNum}

*Your Setting Change Panel Login Password* :
${plain}

The previous password no longer works.
Keep this private.`)
  });
});

cmd({ pattern: 'panel', alias: ['settingspanel', 'dashboard'], desc: 'Show your settings panel link', category: 'settings', ownerOnly: true, react: '🖥️' },
async ({ session, reply, m }) => {
  const url = config.PUBLIC_URL ? `${config.PUBLIC_URL.replace(/\/+$/, '')}/setting`
            : 'https://lakshan-md.sasatech.online/setting';
  await reply(
`*SETTINGS PANEL*

Link   : ${url}
Number : ${session.number || m.senderNum}

Sign in with your number and the panel password that
was sent when your bot connected.

Lost it? Use *${session.prefix || config.PREFIX}newpassword*`);
});
