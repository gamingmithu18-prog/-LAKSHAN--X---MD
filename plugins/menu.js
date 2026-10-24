/**
 * MENU / INFO COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const os = require('os');
const { cmd, commands, categories, stats } = require('../lib/command');
const config = require('../config');
const { runtime, formatBytes, greeting, now, toSmallCaps, withFooter, fontify, dateOnly, timeOnly } = require('../lib/utils');
const db = require('../lib/database');
const menuState = require('../lib/menuState');

const CAT_ICONS = {
  download: 'DOWNLOAD', movie: 'MOVIE', group: 'GROUP', owner: 'OWNER',
  converter: 'CONVERTER', fun: 'FUN', tools: 'TOOLS', economy: 'ECONOMY',
  ai: 'AI', search: 'SEARCH', settings: 'SETTINGS', main: 'MAIN',
  anime: 'ANIME', islamic: 'RELIGION', misc: 'MISC', logo: 'LOGO', sticker: 'STICKER',
  text: 'TEXT', math: 'MATH', games: 'GAMES', dev: 'DEVELOPER', utility: 'UTILITY',
  adult: '18+ ᴠɪᴅᴇᴏꜱ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ'
};

// Explicit ordering: categories listed here first (in order), then the rest alphabetically.
const CAT_ORDER = ['main', 'download', 'adult'];

function header(sock, prefix) {
  const s = stats();
  return `╭━━━〔 *${config.BOT_NAME}* 〕━━━┈⊷
┃ *Owner*    : ${config.OWNER_NAME}
┃ *User*     : %USER%
┃ *Prefix*   : ${prefix}
┃ *Mode*     : ${config.MODE}
┃ *Commands* : ${s.total}
┃ *Plugins*  : ${s.categories}
┃ *Platform* : ${os.platform()}
┃ *RAM*      : ${formatBytes(os.totalmem() - os.freemem())} / ${formatBytes(os.totalmem())}
┃ *Uptime*   : ${runtime(process.uptime())}
┃ *Time*     : ${timeOnly()}
┃ *Date*     : ${dateOnly()}
╰━━━━━━━━━━━━━━━┈⊷`;
}

cmd({ pattern: 'menu', alias: ['allmenu', 'commands', 'cmd', 'help1'], desc: 'Show numbered command categories', category: 'main', react: '📜' },
async ({ m, args, prefix, send, config: cfg }) => {
  const cats = categories();
  const keys = Object.keys(cats).sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  const selected = Number(args?.[0]);
  const categoryTexts = {};
  let text = header(null, prefix).replace('%USER%', m.pushName) + `\n\n*${greeting()}, ${m.pushName}*\n`;

  if (Number.isInteger(selected) && selected >= 1 && selected <= keys.length) {
    const key = keys[selected - 1];
    const label = CAT_ICONS[key] || key.toUpperCase();
    text += `╭━━━〔 *${selected}. ${label} MENU* 〕━━━┈⊷\n`;
    cats[key].filter(c => !c.hidden).sort((a, b) => a.pattern.localeCompare(b.pattern))
      .forEach((c, i) => { text += `┃ ${String(i + 1).padStart(2, '0')}. ${prefix}${c.pattern}${c.use ? ` ${c.use}` : ''}\n`; });
    text += `╰━━━━━━━━━━━━━━━┈⊷\n\n↩️ Use *${prefix}menu* to return to categories.`;
  } else {
    text += `*📚 COMMAND CATEGORIES*\n\n`;
    keys.forEach((key, i) => {
      const label = CAT_ICONS[key] || key.toUpperCase();
      const visible = cats[key].filter(c => !c.hidden).sort((a,b) => a.pattern.localeCompare(b.pattern));
      const readable = `${label} MENU`;
      categoryTexts[i + 1] = `╭━━〔 *${readable}* 〕━━╮\n${visible.map((c,n) => `│ ${String(n + 1).padStart(2,'0')}. ${prefix}${c.pattern}${c.use ? ` ${c.use}` : ''}`).join('\n')}\n╰━━━━━━━━━━━━━━╯`;
      text += `*${String(i + 1).padStart(2, '0')}.* *${readable}*\n`;
    });
    text += `\n📌 Reply to this menu with only a number, for example: *10*\nOr use *${prefix}menu 10*.\n\nSupport: ${cfg.SUPPORT_CHANNEL}`;
  }

  // Plain text menu only — no interactive buttons.
  // Users pick a category by replying with a number (e.g. 10) or
  // typing `.menu 10`. The reply-number path is handled in handler.js.
  const sent = await send({ image: { url: 'https://i.ibb.co/67Drpkb6/186608.png' }, caption: withFooter(text) });
  if (!Number.isInteger(selected) || selected < 1 || selected > keys.length) {
    menuState.remember(sent?.key?.id, categoryTexts, prefix);
  }
  return sent;
});

cmd({ pattern: 'list', alias: ['listcmd', 'cmdlist'], desc: 'Compact list of every command', category: 'main', react: '📋' },
async ({ prefix, reply }) => {
  const all = commands.filter(c => !c.hidden).map(c => c.pattern).sort();
  const chunk = [];
  for (let i = 0; i < all.length; i += 4) chunk.push(all.slice(i, i + 4).map(x => prefix + x).join('  '));
  await reply(`*ALL COMMANDS (${all.length})*\n\n${chunk.join('\n')}`);
});

cmd({ pattern: 'help', alias: ['h', 'info'], desc: 'Detailed help for a specific command', category: 'main', use: '<command>', react: '❓' },
async ({ args, reply, prefix }) => {
  if (!args[0]) {
    const cats = categories();
    let t = '*HELP CENTER*\n\nAvailable categories:\n';
    Object.keys(cats).sort().forEach(k => {     t += `• ${(CAT_ICONS[k] || k.toUpperCase())} (${cats[k].length})\n`; });
    t += `\nUse *${prefix}help <command>* or *${prefix}menu*`;
    return reply(t);
  }
  const { findCommand } = require('../lib/command');
  const c = findCommand(args[0].replace(prefix, ''));
  if (!c) return reply(`Command *${args[0]}* was not found.`);
  await reply(
`*COMMAND DETAILS*

Name      : ${prefix}${c.pattern}
Aliases   : ${c.alias.length ? c.alias.join(', ') : 'none'}
Category  : ${c.category}
Usage     : ${prefix}${c.pattern} ${c.use || ''}
Group only: ${c.onlyGroup ? 'yes' : 'no'}
Admin only: ${c.adminOnly ? 'yes' : 'no'}
Owner only: ${c.ownerOnly ? 'yes' : 'no'}

Description:
${c.desc}`);
});

cmd({ pattern: 'alive', alias: ['bot', 'online', 'status'], desc: 'Live status card of the bot', category: 'main', react: '💫' },
async ({ send, prefix, m }) => {
  const s = stats();
  const caption =
`╭━━━〔 *${config.BOT_NAME}* 〕━━━┈⊷
┃ I am alive and running perfectly
┃
┃ *Hello*     : ${m.pushName}
┃ *Greeting*  : ${greeting()}
┃ *Uptime*    : ${runtime(process.uptime())}
┃ *Commands*  : ${s.total}
┃ *Node*      : ${process.version}
┃ *RAM Used*  : ${formatBytes(process.memoryUsage().heapUsed)}
┃ *CPU*       : ${os.cpus()[0]?.model?.slice(0, 22) || 'n/a'}
┃ *Owner*     : ${config.OWNER_NAME}
┃ *Prefix*    : ${prefix}
╰━━━━━━━━━━━━━━━┈⊷

Support Channel:
${config.SUPPORT_CHANNEL}`;
  await send({ image: { url: config.MENU_LOGO || config.LOGO }, caption: withFooter(caption) });
});

cmd({ pattern: 'ping', alias: ['pong', 'p'], desc: 'Check bot response speed', category: 'main', react: '⚡' },
async ({ reply }) => {
  const t = Date.now();
  const sent = await reply('Measuring response speed...');
  const ms = Date.now() - t;
  const rating = ms < 300 ? 'ULTRA FAST' : ms < 800 ? 'FAST' : ms < 2000 ? 'NORMAL' : 'SLOW';
  await reply(`*PING RESULT*\n\nSpeed  : ${ms} ms\nRating : ${rating}\nUptime : ${runtime(process.uptime())}`);
});

cmd({ pattern: 'speed', alias: ['speedtest'], desc: 'Detailed latency test', category: 'main', react: '🚀' },
async ({ reply }) => {
  const results = [];
  for (let i = 0; i < 3; i++) { const t = process.hrtime.bigint(); await new Promise(r => setImmediate(r)); results.push(Number(process.hrtime.bigint() - t) / 1e6); }
  const avg = (results.reduce((a, b) => a + b, 0) / results.length).toFixed(3);
  await reply(`*SPEED TEST*\n\nEvent loop 1 : ${results[0].toFixed(3)} ms\nEvent loop 2 : ${results[1].toFixed(3)} ms\nEvent loop 3 : ${results[2].toFixed(3)} ms\nAverage      : ${avg} ms`);
});

cmd({ pattern: 'runtime', alias: ['uptime'], desc: 'How long the bot has been online', category: 'main', react: '⏱️' },
async ({ reply }) => reply(`*BOT RUNTIME*\n\n${runtime(process.uptime())}\nStarted: ${new Date(Date.now() - process.uptime() * 1000).toLocaleString('en-GB', { timeZone: config.TIMEZONE })}`));

cmd({ pattern: 'owner', alias: ['creator', 'dev'], desc: 'Owner contact details', category: 'main', react: '👑' },
async ({ send }) => {
  const contacts = config.OWNER_NUMBERS.map(n => ({
    displayName: config.OWNER_NAME,
    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nORG:${config.BOT_NAME};\nTEL;type=CELL;type=VOICE;waid=${n}:+${n}\nEND:VCARD`
  }));
  await send({ contacts: { displayName: config.OWNER_NAME, contacts } });
  const ch = config.SUPPORT_CHANNEL.includes('@newsletter') ? `${config.CHANNEL_NAME} (search in WhatsApp)` : config.SUPPORT_CHANNEL;
  await send({ text: withFooter(`*BOT OWNER*\n\nName    : ${config.OWNER_NAME}\nNumbers : ${config.OWNER_NUMBERS.map(n => '+' + n).join(', ')}\nChannel : ${ch}`) });
});

/* Renamed from 'support' to 'channel': .support is now the AI support
   assistant (plugins/support.js). Every old alias still works, plus
   'supportchannel', so nobody loses the shortcut they were using. */
cmd({ pattern: 'channel', alias: ['supportchannel', 'group', 'sc', 'joinchannel'], desc: 'Official support channel link', category: 'main', react: '📣' },
async ({ send }) => {
  const ch = config.SUPPORT_CHANNEL.includes('@newsletter') ? `${config.CHANNEL_NAME} (search "${config.CHANNEL_NAME}" in WhatsApp)` : config.SUPPORT_CHANNEL;
  await send({ image: { url: config.LOGO }, caption: withFooter(`*OFFICIAL SUPPORT*\n\nChannel:\n${ch}\n\nFollow the channel for updates, new features and downtime notices.`) });
});

cmd({ pattern: 'repo', alias: ['script', 'sourcecode', 'source'], desc: 'Bot script information', category: 'main', react: '📦' },
async ({ send }) => send({ image: { url: config.LOGO }, caption: withFooter(`*${config.BOT_NAME} SCRIPT*\n\nDeveloper : ${config.OWNER_NAME}\nLanguage  : Node.js (Baileys MD)\nDatabase  : GitHub Repo\nHosting   : VPS (24/7)\nCommands  : ${stats().total}\n\nChannel: ${config.SUPPORT_CHANNEL.includes('@newsletter') ? config.CHANNEL_NAME : config.SUPPORT_CHANNEL}`) }));

cmd({ pattern: 'botinfo', alias: ['system', 'server', 'infobot'], desc: 'Server and system information', category: 'main', react: '🖥️' },
async ({ reply }) => {
  const s = stats();
  await reply(
`*SYSTEM INFORMATION*

Bot Name   : ${config.BOT_NAME}
Version    : 1.0.0
Node       : ${process.version}
Platform   : ${os.platform()} ${os.arch()}
Hostname   : ${os.hostname()}
CPU Model  : ${os.cpus()[0]?.model || 'unknown'}
CPU Cores  : ${os.cpus().length}
Total RAM  : ${formatBytes(os.totalmem())}
Free RAM   : ${formatBytes(os.freemem())}
Heap Used  : ${formatBytes(process.memoryUsage().heapUsed)}
Uptime OS  : ${runtime(os.uptime())}
Uptime Bot : ${runtime(process.uptime())}
Commands   : ${s.total}
Categories : ${s.categories}
Database   : ${db.isConnected() ? 'Connected' : 'Offline'}
Timezone   : ${config.TIMEZONE}`);
});

cmd({ pattern: 'stats', alias: ['statistics', 'usage'], desc: 'Most used commands', category: 'main', react: '📊' },
async ({ reply }) => {
  const top = await db.Stat.find().sort({ count: -1 }).limit(15).lean();
  const users = await db.User.countDocuments();
  const sessionsCount = await db.Session.countDocuments({ status: 'connected' });
  let t = `*BOT STATISTICS*\n\nRegistered users : ${users}\nActive sessions  : ${sessionsCount}\nTotal commands   : ${stats().total}\n\n*TOP COMMANDS*\n`;
  top.forEach((s, i) => { t += `${i + 1}. ${s.command} — ${s.count}\n`; });
  await reply(t || 'No statistics yet.');
});

cmd({ pattern: 'profile', alias: ['me', 'myinfo'], desc: 'Your profile inside the bot', category: 'main', react: '🪪' },
async ({ m, user, reply }) => {
  const u = user || await db.getUser(m.sender, m.pushName);
  await reply(
`*YOUR PROFILE*

Name     : ${m.pushName}
Number   : ${m.senderNum}
Commands : ${u.commandCount}
Last cmd : ${u.lastCommand || 'none'}
Premium  : ${u.premium ? 'yes' : 'no'}
Banned   : ${u.banned ? 'yes' : 'no'}
Balance  : ${u.economy?.balance ?? 0} coins
Bank     : ${u.economy?.bank ?? 0} coins
Level    : ${u.economy?.level ?? 1} (XP ${u.economy?.xp ?? 0})
Joined   : ${new Date(u.firstSeen).toLocaleDateString('en-GB')}`);
});

cmd({ pattern: 'time', alias: ['clock', 'date', 'today'], desc: 'Current server date and time', category: 'main', react: '🕒' },
async ({ reply }) => reply(`*DATE & TIME*\n\nTime : ${timeOnly()}\nDate : ${dateOnly()}\nZone : ${config.TIMEZONE}\nFull : ${now()}`));

cmd({ pattern: 'prefix', desc: 'Show the active prefixes', category: 'main', react: '🔣' },
async ({ reply }) => reply(`*ACTIVE PREFIXES*\n\nMain     : ${config.PREFIX}\nMulti    : ${config.MULTI_PREFIX ? 'enabled' : 'disabled'}\nAccepted : ${config.PREFIX_LIST.join(' ')}`));

cmd({ pattern: 'ghost', alias: ['aboutbot'], desc: 'About 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃', category: 'main', react: '👻' },
async ({ send }) => send({ image: { url: config.LOGO }, caption: withFooter(`*${config.BOT_NAME}*\n\nAn ultra fast, modern, multi-device WhatsApp assistant built on Baileys with GitHub based session storage and a full web pairing dashboard.\n\nDeveloper : ${config.OWNER_NAME}\nCommands  : ${stats().total}\nAPI       : SASA TECH API\n\n${config.SUPPORT_CHANNEL}`) }));

cmd({ pattern: 'menutext', alias: ['tmenu'], desc: 'Menu without image (fast mode)', category: 'main', react: '⚡' },
async ({ prefix, replyRaw }) => {
  const cats = categories();
  let t = `*${config.BOT_NAME} — QUICK MENU*\n`;
  Object.keys(cats).sort().forEach(k => {
    t += `\n*${CAT_ICONS[k] || k.toUpperCase()}*\n${cats[k].map(c => prefix + c.pattern).join(', ')}\n`;
  });
  await replyRaw(t + `\n\n${config.FOOTER}`);
});

cmd({ pattern: 'category', alias: ['cats'], desc: 'List commands of one category', category: 'main', use: '<name>', react: '🗂️' },
async ({ args, reply, prefix }) => {
  const cats = categories();
  if (!args[0]) return reply(`Available categories:\n\n${Object.keys(cats).sort().map(k => `• ${(CAT_ICONS[k] || k.toUpperCase())} (${cats[k].length})`).join('\n')}\n\nUse ${prefix}category <name>`);
  const key = args[0].toLowerCase();
  if (!cats[key]) return reply(`Category *${key}* not found.`);
  const label = CAT_ICONS[key] || key.toUpperCase();
  await reply(`*${label} COMMANDS (${cats[key].length})*\n\n${cats[key].map(c => `${prefix}${c.pattern} — ${c.desc}`).join('\n')}`);
});

cmd({ pattern: 'donate', alias: ['support2'], desc: 'Support the developer', category: 'main', react: '💝' },
async ({ reply }) => reply(`*SUPPORT THE DEVELOPER*\n\nIf ${config.BOT_NAME} helps you, support ${config.OWNER_NAME} by:\n\n1. Following the support channel\n2. Sharing the bot with friends\n3. Reporting bugs so they get fixed fast\n\nChannel: ${config.SUPPORT_CHANNEL}`));
