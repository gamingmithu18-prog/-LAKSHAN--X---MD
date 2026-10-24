/**
 * Central message handler - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const config = require('../config');
const { jidNormalizedUser } = require('baileys');
const { serialize } = require('./serialize');
const { findCommand } = require('./command');
const db = require('./database');
const { withFooter, fontify, sleep, jidToNum, isUrl } = require('./utils');
const NodeCache = require('node-cache');
const diag = require('./diag');
const groq = require('./groq');
const menuState = require('./menuState');

const cooldown = new NodeCache({ stdTTL: 10, checkperiod: 20 });
/* Cache resolved per-session settings briefly (panel changes apply within 5s). */
const settingsCache = new NodeCache({ stdTTL: 5, checkperiod: 3, maxKeys: 256 });
const groupMeta = new NodeCache({ stdTTL: 300, checkperiod: 120 });

/** Shared by connection.js so group updates invalidate the handler cache
    (stale metadata is the classic cause of wrong admin checks). */
function clearGroupMeta(jid) { groupMeta.del(jid); }

const CATEGORY_EMOJIS = {
  main: '✨', owner: '🛡️', settings: '⚙️', tools: '🧰', utility: '🧩',
  converter: '🛠️', ai: '🤖', download: '📥', fun: '🎭', games: '🎮',
  group: '👥', economy: '💰', movie: '🎬', math: '🧮', text: '✍️',
  support: '💬', dev: '👨‍💻', misc: '📌'
};
const commandEmoji = (category) => CATEGORY_EMOJIS[category] || '✅';
// WhatsApp can replay queued events after a reconnect. A message id is
// immutable, so this prevents one command from producing multiple replies.
const seenMessages = new NodeCache({ stdTTL: 86400, checkperiod: 300, maxKeys: 10000 });

const newsletterCtx = () => ({
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: config.CHANNEL_JID,
    newsletterName: config.CHANNEL_NAME,
    serverMessageId: 999
  },
  externalAdReply: {
    title: config.BOT_NAME,
    body: config.FOOTER,
    thumbnailUrl: config.LOGO,
    sourceUrl: `${config.PUBLIC_URL.replace(/\/+$/, '')}/setting`,
    mediaType: 1,
    renderLargerThumbnail: false
  }
});

async function getGroupMetadata(sock, jid) {
  let meta = groupMeta.get(jid);
  if (!meta) {
    try { meta = await sock.groupMetadata(jid); groupMeta.set(jid, meta); } catch { return null; }
  }
  return meta;
}

function isOwner(num, sessionOwner) {
  const n = String(num).replace(/[^0-9]/g, '');
  // Owner-only commands are restricted to the configured primary owner
  // numbers. A connected session number must never grant owner privileges
  // to whoever happens to be using that session.
  return config.OWNER_NUMBERS.includes(n) || n === config.OWNER_NUMBER;
}

async function handleMessage(sock, m, session = {}) {
  try {
    if (!m.message) return;
    const messageId = m.key?.id;
    const dedupeKey = messageId ? `${session.sessionId || 'session'}:${m.key?.remoteJid || ''}:${messageId}` : null;
    if (dedupeKey && seenMessages.has(dedupeKey)) return;
    if (dedupeKey) seenMessages.set(dedupeKey, true);
    diag.bump('messagesSeen');
    const msg = await serialize(sock, m);
    if (!msg || !msg.chat) {
      if (config.DEBUG_DROPS) console.log(`[DROP] serialize returned null/empty chat=${m.key?.remoteJid} type=${m.message ? Object.keys(m.message)[0] : 'none'}`);
      return;
    }
    if (msg.isChannel) return;

    /* Per-session settings. The session document is re-read on every
       message, so a change made in the web panel applies immediately
       without restarting the bot. */
    const settingsKey = `sess:${session.sessionId || 'default'}`;
    let S = settingsCache.get(settingsKey);
    if (!S) { S = require('./settings').resolve(session.settings); settingsCache.set(settingsKey, S); }
    const prefix = S.prefix || config.PREFIX;
    const mode = S.mode || config.MODE;
    const settings = S;
    const botNum = jidToNum(sock.user?.id);
    const credsMe = sock.authState?.creds?.me || sock.user || {};
    const botNums = [sock.user?.id, credsMe.id, credsMe.lid, sock.user?.lid]
      .filter(Boolean).map(jidToNum);

    /* ===== STATUS HANDLING ===== */
    if (msg.isStatus) {
      if (S.autoReadStatus) {
        try { await sock.readMessages([msg.key]); }
        catch (e) { console.log('[STATUS] read failed:', e?.message || e); }
      }
      const rawOwner = msg.key.participant || msg.participant || msg.sender;
      const statusOwner = rawOwner ? jidNormalizedUser(rawOwner) : null;
      console.log(`[STATUS] viewed=${S.autoReadStatus} like=${S.autoLikeStatus} owner=${statusOwner}`);
      if (S.autoLikeStatus && statusOwner) {
        const pool = String(S.statusEmojis || S.statusEmoji || config.STATUS_EMOJI)
          .split(',').map(x => x.trim()).filter(Boolean);
        const emoji = pool[Math.floor(Math.random() * pool.length)] || config.STATUS_EMOJI;
        const reactionKey = { remoteJid: 'status@broadcast', id: msg.key.id, participant: statusOwner, fromMe: false };
        try {
          await sock.sendMessage('status@broadcast', { react: { text: emoji, key: reactionKey } }, { statusJidList: [statusOwner] });
          console.log(`[STATUS] liked with ${emoji}`);
        } catch (e) {
          console.log('[STATUS] like failed:', e?.message || e);
          diag.recordError('status-reaction', e, statusOwner);
        }
      }
      return;
    }

    /* ===== PRESENCE ===== */
    // WhatsApp does not expose a true timestamp-freeze API. Suppressing
    // presence updates is the supported approximation and keeps the last
    // server-visible timestamp from being refreshed after enabling it.
    if (S.freezeLastSeen) sock.sendPresenceUpdate('unavailable', msg.chat).catch(() => {});
    else if (S.alwaysOnline) sock.sendPresenceUpdate('available', msg.chat).catch(() => {});
    if (S.autoReadMessages) sock.readMessages([msg.key]).catch(() => {});

    /* ===== USER RECORD ===== */
    let user = null;
    try { user = await db.getUser(msg.sender, msg.pushName); } catch (_) {}
    if (user?.banned && !isOwner(msg.senderNum, session.number)) return;

    /* ===== AFK RETURN ===== */
    if (user?.afk?.active && !msg.fromMe) {
      const mins = Math.floor((Date.now() - new Date(user.afk.since).getTime()) / 60000);
      user.afk = { active: false, reason: '', since: null };
      await user.save().catch(() => {});
      await msg.reply(withFooter(`Welcome back @${msg.senderNum}\nYou were AFK for ${mins} minute(s).`), { mentions: [msg.sender] });
    }

    /* ===== AFK MENTIONS ===== */
    if (msg.mentions?.length) {
      for (const j of msg.mentions.slice(0, 3)) {
        try {
          const mu = await db.User.findOne({ jid: j });
          if (mu?.afk?.active) {
            await msg.reply(withFooter(`@${jidToNum(j)} is currently AFK\nReason: ${mu.afk.reason || 'none'}`), { mentions: [j] });
          }
        } catch (_) {}
      }
    }

    /* ===== GROUP CONTEXT ===== */
    let metadata = null, participants = [], isAdmin = false, isBotAdmin = false, groupDoc = null;
    if (msg.isGroup) {
      metadata = await getGroupMetadata(sock, msg.chat);
      participants = metadata?.participants || [];
      const p = participants.find(x => jidToNum(x.id) === msg.senderNum);
      // The bot may identify as its real number or its LID; accept either.
      const b = participants.find(x => botNums.includes(jidToNum(x.id)));
      isAdmin = !!(p?.admin);
      isBotAdmin = !!(b?.admin);
      try { groupDoc = await db.getGroup(msg.chat, metadata?.subject); } catch (_) {}
    }

    const owner = isOwner(msg.senderNum, session.number) || msg.fromMe;

    /* ===== ANTI LINK ===== */
    if (msg.isGroup && groupDoc?.antilink && !isAdmin && !owner && isBotAdmin) {
      if (/chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i.test(msg.body)) {
        await sock.sendMessage(msg.chat, { delete: msg.key }).catch(() => {});
        if (groupDoc.antilinkAction === 'kick') {
          await sock.groupParticipantsUpdate(msg.chat, [msg.sender], 'remove').catch(() => {});
        }
        await sock.sendMessage(msg.chat, { text: withFooter(`Anti-Link triggered\n@${msg.senderNum} group links are not allowed here.`), mentions: [msg.sender] });
        return;
      }
    }

    /* ===== GROUP MUTE ===== */
    if (msg.isGroup && groupDoc?.mute && !isAdmin && !owner) return;

    /* ===== COMMAND PARSING ===== */
    const body = (msg.body || '').trim();
    if (!body) {
      if (config.DEBUG_DROPS) console.log(`[DROP] empty body type=${msg.type} chat=${msg.chat} fromMe=${!!msg.fromMe}`);
      return;
    }

    // A plain number sent as a reply to a menu opens that category. This
    // keeps the user flow `.menu` -> reply `10` without requiring `.menu 10`.
    const menu = msg.quoted?.key?.id ? menuState.get(msg.quoted.key.id) : null;
    /* Interactive downloader choices (download.js): reply 1/2 to a .song or
       .tiktok card to pick MP3/Document or SD/HD quality. */
    if (/^\d+$/.test(body) && msg.quoted?.key?.id && !menu) {
      const handleDownloadChoice = global.__handleDownloadChoice;
      const sc = global.__songChoices;
      const tc = global.__ttChoices;
      const ac = global.__adultChoices;
      if (sc?.has?.(msg.quoted.key.id) || tc?.has?.(msg.quoted.key.id) || ac?.has?.(msg.quoted.key.id)) {
        const qid = msg.quoted.key.id;
        const handled = handleDownloadChoice
          ? await handleDownloadChoice(qid, body, (t, o) => msg.reply(t, o), (content, o = {}) => sock.sendMessage(msg.chat, content, { quoted: m, ...o }))
          : false;
        if (handled) return;
      }
    }
    if (/^\d+$/.test(body) && (menu || /COMMAND CATEGORIES/i.test(msg.quoted?.text || ''))) {
      if (menu) {
        const category = menu.categories[Number(body)];
        if (category) return msg.reply(withFooter(category));
        return msg.reply(withFooter(`📚 Choose a category number between 1 and ${Object.keys(menu.categories).length}.`));
      }
      const cats = require('./command').categories();
      const keys = Object.keys(cats).sort();
      const key = keys[Number(body) - 1];
      if (!key) return msg.reply(withFooter(`📚 Choose a category number between 1 and ${keys.length}.`));
      const list = cats[key].filter(c => !c.hidden).sort((a,b) => a.pattern.localeCompare(b.pattern));
      return msg.reply(withFooter(`╭━━〔 *${key.toUpperCase()} MENU* 〕━━╮\n${list.map((c,i)=>`│ ${String(i+1).padStart(2,'0')}. ${config.PREFIX}${c.pattern}${c.use ? ` ${c.use}` : ''}`).join('\\n')}\n╰━━━━━━━━━━━━━━╯`));
    }

    let usedPrefix = null;
    if (config.MULTI_PREFIX) {
      usedPrefix = config.PREFIX_LIST.find(p => p && body.startsWith(p)) || null;
    }
    if (!usedPrefix && body.startsWith(prefix)) usedPrefix = prefix;
    if (!usedPrefix) {
      if (config.DEBUG_DROPS) console.log(`[DROP] no prefix body=${body.slice(0,40)} chat=${msg.chat}`);
      if (S.autoAiReply && !msg.fromMe && body.length > 0 && S.groqApiKey) {
        try {
          const language = S.aiLanguage === 'si' ? 'Sinhala' : S.aiLanguage === 'en' ? 'English' : 'the same language as the user';
          const result = await groq.chat([
            { role: 'system', content: `You are a warm, emotionally intelligent WhatsApp AI assistant. Reply in ${language}. Match the user's tone and language naturally. You may show appropriate empathy, humor, surprise, or mild frustration, but never insult, threaten, manipulate, or claim real-world experiences. Do not use generic greetings unless the user greets first. Keep it concise. Never claim to be human; if asked, clearly say you are an AI assistant.` },
            { role: 'user', content: body.slice(0, 4000) }
          ], { apiKey: S.groqApiKey, temperature: 0.75, maxTokens: 500 });
          if (!result.ok) throw new Error(result.error || groq.explain(result.code));
          await msg.reply(withFooter(`🤖 AI assistant: ${result.text}`));
        } catch (e) {
          diag.recordError('auto-ai-reply', e, session.sessionId);
        }
      }
      return;
    }

    const withoutPrefix = body.slice(usedPrefix.length).trim();
    if (!withoutPrefix) return;
    const cmdName = withoutPrefix.split(/\s+/)[0].toLowerCase();
    const command = findCommand(cmdName);
    if (!command) {
      if (config.DEBUG_DROPS) console.log(`[DROP] unknown command '${cmdName}' full=${withoutPrefix.slice(0,40)} chat=${msg.chat}`);
      /* Provide feedback for unknown commands instead of silently dropping.
         This helps users know the bot is alive even when they type a wrong command. */
      if (!msg.fromMe) {
        const { stats } = require('./command');
        const s = stats();
        if (s.total > 0) {
          await msg.reply(withFooter(`❓ Command *${usedPrefix}${cmdName}* not found.\n\nType *${usedPrefix}menu* to see available commands.\nTotal commands: ${s.total}`)).catch(() => {});
        }
      }
      return;
    }

    /* ===== MODE GATES ===== */
    // Pairing is an onboarding command, so it must remain available to a
    // user even when the connected bot is currently in private/group mode.
    const onboardingCommand = ['pair', 'pairing', 'connect'].includes(cmdName);
    if (!onboardingCommand && mode === 'private' && !owner) {
      console.log(`[MODE] session ${session.sessionId || '?'} mode=private blocked sender ${msg.senderNum} chat ${msg.chat}`);
      return msg.reply(withFooter('🔒 This bot is currently in private mode. The owner can change Bot Mode to Public in the Settings Panel.'));
    }
    if (!onboardingCommand && mode === 'group' && !msg.isGroup && !owner) {
      console.log(`[MODE] session ${session.sessionId || '?'} mode=group blocked sender ${msg.senderNum} chat ${msg.chat}`);
      return msg.reply(withFooter('👥 This bot currently accepts commands in groups only.'));
    }
    if (!onboardingCommand && mode === 'inbox' && msg.isGroup && !owner) {
      console.log(`[MODE] session ${session.sessionId || '?'} mode=inbox blocked sender ${msg.senderNum} chat ${msg.chat}`);
      return msg.reply(withFooter('📥 This bot currently accepts commands in private chats only.'));
    }
    console.log(`[MODE] session ${session.sessionId || '?'} mode=${mode} accepted ${msg.senderNum} chat ${msg.chat}`);

    /* ===== COOLDOWN ===== */
    const cdKey = `${msg.sender}:${cmdName}`;
    if (!owner && cooldown.get(cdKey)) return;
    cooldown.set(cdKey, 1, Math.ceil(config.COOLDOWN_MS / 1000) || 1);

    /* ===== PERMISSION GATES ===== */
    if (command.ownerOnly && !owner)
      return msg.reply(withFooter('This command is reserved for the bot owner.'));
    if (command.onlyGroup && !msg.isGroup)
      return msg.reply(withFooter('This command works only inside groups.'));
    if (command.onlyPrivate && msg.isGroup)
      return msg.reply(withFooter('This command works only in private chat.'));
    if (command.adminOnly && msg.isGroup && !isAdmin && !owner) {
      // Stale cached metadata can say "not an admin" right after a
      // promotion. Refetch once before rejecting.
      let fresh = null;
      try { fresh = await sock.groupMetadata(msg.chat); groupMeta.set(msg.chat, fresh); } catch (_) {}
      const p2 = (fresh?.participants || []).find(x => jidToNum(x.id) === msg.senderNum);
      if (p2?.admin) isAdmin = true;
      if (!isAdmin)
        return msg.reply(withFooter('Only group admins can use this command.'));
    }
    if (command.botAdmin && msg.isGroup && !isBotAdmin) {
      // If the group cache was stale we might misjudge; refetch once and
      // re-check before giving the (annoying) admin error back.
      let fresh = null;
      try { fresh = await sock.groupMetadata(msg.chat); groupMeta.set(msg.chat, fresh); } catch (_) {}
      const p2 = (fresh?.participants || []).find(x => jidToNum(x.id) === msg.senderNum);
      const b2 = (fresh?.participants || []).find(x => botNums.includes(jidToNum(x.id)));
      if (p2?.admin) isAdmin = true;
      if (b2?.admin) isBotAdmin = true;
      if (!isBotAdmin)
        return msg.reply(withFooter('I need to be a group admin to run this command.'));
    }
    if (command.premium && !user?.premium && !owner)
      return msg.reply(withFooter('This is a premium command. Contact the owner to unlock it.'));
    if (command.nsfw && msg.isGroup && !groupDoc?.nsfw)
      return msg.reply(withFooter('NSFW is disabled in this group. Admins can enable it with .nsfw on'));

    /* ===== FEEDBACK ===== */
    if (config.READ_CMD) sock.readMessages([msg.key]).catch(() => {});
    if (S.reactOnCmd !== false && config.REACT_ON_CMD !== false) {
      msg.react(command.react || S.cmdReaction || S.commandReaction || config.CMD_REACTION);
    }
    if (S.autoTyping) sock.sendPresenceUpdate('composing', msg.chat).catch(() => {});
    if (S.autoRecording) sock.sendPresenceUpdate('recording', msg.chat).catch(() => {});

    const args = withoutPrefix.split(/\s+/).slice(1);
    const q = args.join(' ');

    const ctx = {
      sock, m: msg, args, q, text: q, prefix: usedPrefix, command: cmdName,
      isOwner: owner, isAdmin, isBotAdmin, isGroup: msg.isGroup,
      metadata, participants, groupDoc, user, session, botNum,
      db, config,
      reply: async (t, o = {}) => {
        const text = withFooter(`${commandEmoji(command.category)} ${t}`);
        return sock.sendMessage(msg.chat, { text, ...o }, { quoted: m });
      },
      replyRaw: (t, o = {}) => sock.sendMessage(msg.chat, { text: fontify(t), ...o }, { quoted: m }),
      send: (content, o = {}) => sock.sendMessage(msg.chat, content, { quoted: m, ...o }),
      react: (e) => msg.react(e),
      newsletterCtx
    };

    db.bumpCommand(msg.sender, cmdName).catch(() => {});

    try {
      await command.handler(ctx);
      diag.bump('commandsRun');
    } catch (err) {
      diag.bump('commandsFailed');
      diag.recordError(`command:${cmdName}`, err);
      console.error(`[CMD:${cmdName}]`, err);
      await ctx.reply(`An error occurred while running *${cmdName}*\n\n${String(err.message || err).slice(0, 300)}`).catch(() => {});
    }
  } catch (e) {
    diag.recordError('handler', e);
    console.error('[HANDLER]', e);
  }
}

module.exports = { handleMessage, newsletterCtx, getGroupMetadata, isOwner, groupMeta, clearGroupMeta };
