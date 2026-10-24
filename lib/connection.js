/**
 * Multi-session WhatsApp connection manager - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Handles pairing code + QR, GitHub session persistence, auto channel follow.
 */
const {
  default: makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser
} = require('baileys');
const { Boom } = require('@hapi/boom');

/* Per-number pairing cooldown tracker (see createPairing). */
const numberFailures = new Map();   // number -> { when, cooldownMs }
const COOLDOWN_MIN_MS = 3 * 60 * 1000;
const COOLDOWN_MAX_MS = 30 * 60 * 1000;
function failForNumber(num) {
  if (!num) return;
  const prev = numberFailures.get(num);
  const next = {
    when: Date.now(),
    cooldownMs: Math.min(COOLDOWN_MAX_MS, (prev ? prev.cooldownMs * 2 : COOLDOWN_MIN_MS))
  };
  numberFailures.set(num, next);
  /* Let an old cooldown die instead of growing forever. */
  setTimeout(() => {
    const cur = numberFailures.get(num);
    if (cur === next) numberFailures.delete(num);
  }, COOLDOWN_MAX_MS).unref?.();
}
const pino = require('pino');
const NodeCache = require('node-cache');
const QRCode = require('qrcode');

const config = require('../config');
const db = require('./database');
const { useGitHubAuthState, deleteSessionData, releaseSession } = require('./githubAuth');
const { handleMessage, newsletterCtx } = require('./handler');
const { wrapSock } = require('./newsletter');
const { withFooter, fontify, sleep, randomId, jidToNum } = require('./utils');
const waver = require('./waversion');
const diag = require('./diag');

const logger = pino({ level: 'silent' });
const sessions = new Map();       // sessionId -> { sock, status, ... }
const pairing = new Map();        // sessionId -> { code, qr, expiresAt, status, number }
const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({ stdTTL: 300, useClones: false });
const autoReactSeen = new NodeCache({ stdTTL: 86400, checkperiod: 600, maxKeys: 20000 });
/* Message counter for diagnostics - helps debug "bot doesn't reply" issues */
let messageCounter = 0;
let lastMessageLog = 0;
const REACTION_EMOJIS = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👍','👎','👏','🙌','🙏','🔥','❤️','💔','💯','✨','🎉','💙','💚','💛','💜','🖤','🤍','🤎'];

const channelJidCache = new Map();
async function autoReactNewsletter(sock, message, sessionId = '') {
  const remote = message?.key?.remoteJid;
  const id = message?.key?.id;
  const seenKey = `${sessionId}:${remote}:${id}`;
  if (!remote?.endsWith('@newsletter') || !id || autoReactSeen.has(seenKey)) return;
  autoReactSeen.set(seenKey, true);
  const ownerPanel = await db.getSetting('ownerPanel').catch(() => ({}));
  const stored = Array.isArray(ownerPanel?.autoreactChannels) ? ownerPanel.autoreactChannels : [];
  const configured = [...(config.AUTO_REACT_CHANNELS || []), ...stored.map(link => ({ link, emojis: REACTION_EMOJIS }))];
  for (const item of configured) {
    const link = typeof item === 'string' ? item : item.link;
    const emojis = (typeof item === 'object' && Array.isArray(item.emojis) ? item.emojis : REACTION_EMOJIS).filter(Boolean);
    const invite = String(link || '').match(/whatsapp\.com\/channel\/([^/]+)/i)?.[1];
    if (!invite) continue;
    let jid = channelJidCache.get(invite);
    if (!jid) {
      const meta = await sock.newsletterMetadata('invite', invite).catch(() => null);
      jid = meta?.id;
      if (jid) channelJidCache.set(invite, jid);
    }
    if (jid !== remote) continue;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)] || '❤️';
    try {
      await sock.newsletterReactMessage(remote, id, emoji);
      diag.bump('channelReactions');
    } catch (e) { diag.recordError('auto-channel-reaction', e, remote); }
    break;
  }
  /* React to posts on the bot's OWN newsletter channel (no invite link exists
     for the bot's channel, so the invite-matching loop above never fires). */
  const ownChannel = String(config.CHANNEL_JID || '').trim();
  if (ownChannel && remote === ownChannel && !message.key.fromMe) {
    const S = await liveSettings().catch(() => ({}));
    if (S.newsletterReact !== false && S.autoLikeStatus !== false) {
      const pool = String(S.statusEmojis || S.statusEmoji || config.STATUS_EMOJI || '❤️')
        .split(',').map(x => x.trim()).filter(Boolean);
      const emoji = pool[Math.floor(Math.random() * pool.length)] || '❤️';
      try {
        await sock.newsletterReactMessage(remote, id, emoji);
        console.log(`[NEWSLETTER] reacted to own channel post with ${emoji}`);
      } catch (e) { diag.recordError('own-channel-reaction', e, remote); }
    }
  }
}

/* ============ GROUP AUTO JOIN ============ */
async function autoJoinConfiguredGroup(sock) {
  if (!config.AUTO_JOIN_GROUP || !config.AUTO_JOIN_GROUP_LINK) return;
  const match = String(config.AUTO_JOIN_GROUP_LINK).match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
  if (!match) {
    console.warn('[GROUP] Invalid auto-join invite link');
    return;
  }
  try {
    const jid = await sock.groupAcceptInvite(match[1]);
    console.log('[GROUP] Auto-joined configured group:', jid || 'already joined');
  } catch (e) {
    // WhatsApp returns an error when the bot is already a member or the
    // invite has expired; neither condition should interrupt the session.
    console.log('[GROUP] Auto-join skipped:', e.message);
  }
}

/** Public settings panel URL (Heroku host, or PUBLIC_URL override). */
function panelUrl() {
  const base = (config.PUBLIC_URL || 'https://lakshan-md.sasatech.online').replace(/\/+$/, '');
  return `${base}/setting`;
}

/**
 * The WhatsApp Web build we announce to the server.
 *
 * This is THE thing that decides whether a link is accepted. WhatsApp
 * silently refuses to finish pairing for an outdated build and the
 * phone shows "Couldn't link device - Something went wrong."
 * fetchLatestBaileysVersion() reads a file that the Baileys maintainers
 * update by hand, so it is regularly months stale - it must not be used
 * here. See lib/waversion.js.
 *
 * @param {boolean} force re-detect instead of using the cached value
 */
async function getVersion(force = false) {
  return waver.getWAVersion(force);
}

/* ============ CHANNEL AUTO FOLLOW ============ */
async function followChannel(sock) {
  const ownerPanel = await db.getSetting('ownerPanel').catch(() => ({}));
  const extra = Array.isArray(ownerPanel?.autoFollowChannels) ? ownerPanel.autoFollowChannels : [];
  const links = [...new Set([config.SUPPORT_CHANNEL, ...extra].filter(Boolean))];
  if (!config.AUTO_FOLLOW_CHANNEL && !extra.length) return;
  for (const link of links) {
    const raw = String(link).trim();
    if (!raw) continue;
    /* A direct newsletter JID (e.g. 120363411700026624@newsletter) can
       be followed straight away - the 'invite' metadata lookup only
       works for chat.whatsapp.com invite codes. */
    if (raw.endsWith('@newsletter')) {
      try {
        await sock.newsletterFollow(raw);
        require('./diag').bump('channelFollows');
        console.log('[CHANNEL] Followed support channel:', raw);
      } catch (e) {
        const detail = e?.data !== undefined ? JSON.stringify(e.data).slice(0, 800) : e.message;
        console.log('[CHANNEL] follow skipped:', e.message, detail);
      }
      continue;
    }
    const id = raw.split('/').filter(Boolean).pop();
    if (!id || /^\d+$/.test(id)) continue;
    try {
      let jid = config.CHANNEL_JID;
      const meta = await sock.newsletterMetadata('invite', id).catch(() => null);
      if (meta?.id) jid = meta.id;
      await sock.newsletterFollow(jid);
      require('./diag').bump('channelFollows');
      console.log('[CHANNEL] Followed support channel:', jid);
    } catch (e) {
      const detail = e?.data !== undefined ? JSON.stringify(e.data).slice(0, 800) : e.message;
      console.log('[CHANNEL] follow skipped:', e.message, detail);
    }
  }
}

/* ============ CONNECT MESSAGE ============ */
async function sendWelcome(sock, sessionId, panelPassword, panelUrl) {
  const jid = jidNormalizedUser(sock.user.id);
  const { stats } = require('./command');
  const s = stats();
  const num = jidToNum(jid);

  /* The panel login password must stay in a normal, easily readable
     font so it can be retyped exactly as shown. */
  const passwordLine = `\u2023 *Your Setting Change Panel Login Password* :\n\u2023 ${panelPassword}`;
  const caption = fontify(
`╭━━━〔 *${config.BOT_NAME}* 〕━━━┈⊷
┃ *Status*   : Connected
┃ *Number*   : ${num}
┃ *Prefix*   : ${config.PREFIX}
┃ *Mode*     : ${config.MODE}
┃ *Commands* : ${s.total}
┃ *Owner*    : ${config.OWNER_NAME}
┃ *Session*  : ${sessionId}
╰━━━━━━━━━━━━━━━┈⊷

Your bot is now online and blazing fast.
Type *${config.PREFIX}menu* to see every command.
Type *${config.PREFIX}alive* for a live status card.

╭━━━〔 *SETTINGS PANEL* 〕━━━┈⊷
┃ Change your bot settings live
┃ from any browser.
┃
┃ *Link*     : ${panelUrl}
┃ *Number*   : ${num}
${passwordLine}
╰━━━━━━━━━━━━━━━┈⊷

Keep this password private. Anyone who has it can
change your bot settings. Use *${config.PREFIX}newpassword*
to generate a fresh one at any time.

Support Channel:
${config.SUPPORT_CHANNEL}

${config.FOOTER}`);

  await sock.sendMessage(jid, {
    image: { url: config.LOGO },
    caption,
    contextInfo: newsletterCtx()
  }).catch(async () => {
    await sock.sendMessage(jid, { text: caption }).catch(() => {});
  });
}

/* ============ START SESSION ============ */
async function startSession(sessionId, opts = {}) {
  if (sessions.has(sessionId) && sessions.get(sessionId).status === 'connected') {
    return sessions.get(sessionId).sock;
  }

  const { state, saveCreds, clearState, flushNow } = await useGitHubAuthState(sessionId);

  /* Refuse to resume a half-finished pairing. Such creds carry the
     placeholder `me` written by requestPairingCode() but no `account`,
     which makes Baileys send a LOGIN node for an account that was never
     linked. WhatsApp rejects that, and the code the user types can never
     be matched. Start clean instead. */
  if (opts.pairMethod === 'restore' && !state.creds.account) {
    console.warn(`[CONN] ${sessionId} has no completed pairing - discarding stale creds`);
    await clearState().catch(() => {});
    releaseSession(sessionId);
    await db.deleteSession(sessionId).catch(() => {});
    pairing.delete(sessionId);
    sessions.delete(sessionId);
    return null;
  }

  const version = await getVersion();
  const isCode = opts.pairMethod === 'code';
  const startupSettings = require('./settings').resolve((await db.getSession(sessionId).catch(() => null))?.settings);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    /* WhatsApp rotates the pairing reference and closes the socket once
       the refs run out. With the default (60s + 20s each) a user typing
       the code slowly can lose the socket mid-way, which the phone
       reports as "Couldn't link device". Give the code flow a long,
       stable window. */
    qrTimeout: isCode ? 120000 : 60000,
    connectTimeoutMs: 60000,
    /* The browser identity is part of the registration handshake.
       It MUST stay identical between the pairing attempt and the 515
       restart, otherwise WhatsApp invalidates the link and the phone
       shows "Couldn't link device". So it is fixed for every path. */
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    markOnlineOnConnect: startupSettings.freezeLastSeen ? false : config.ALWAYS_ONLINE,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    msgRetryCounterCache,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    emitOwnEvents: true,
    retryRequestDelayMs: 250,
    transactionOpts: { maxCommitRetries: 5, delayBetweenTriesMs: 300 },
    getMessage: async () => ({ conversation: config.BOT_NAME })
  });

  const entry = {
    sock, sessionId, status: 'connecting', startedAt: Date.now(),
    number: opts.number || null, retries: opts.retries || 0
  };
  sessions.set(sessionId, entry);
  /* Newsletter Forward System: auto-attach forward metadata to all replies. */
  wrapSock(sock);
  // Recover a half-open WebSocket that no longer emits replies/events.
  entry.watchdog = setInterval(() => {
    if (entry.status !== 'connected') return;
    if (sock.ws?.isOpen === false) {
      console.warn(`[CONN] ${sessionId} socket is stale - closing for reconnect`);
      try { sock.ws.close(); } catch (_) {}
    }
  }, 45000);
  entry.watchdog.unref?.();

  /* Watchdog: after a 515 restart the socket should reach 'open' quickly.
     If it does not, surface a real error instead of leaving the UI
     spinning on "Logging in" indefinitely. */
  if (opts.pairMethod === 'restore' && pairing.get(sessionId)?.status === 'linking') {
    setTimeout(() => {
      const e = sessions.get(sessionId);
      const p = pairing.get(sessionId);
      if (p?.status === 'linking' && e && e.status !== 'connected') {
        console.warn(`[CONN] ${sessionId} stuck linking for 75s - giving up`);
        pairing.set(sessionId, {
          status: 'error', code: null, qr: null, expiresAt: Date.now(),
          error: 'The link timed out. Please generate a new code and try again.'
        });
        killSession(sessionId, 'link timeout').catch(() => {});
      }
    }, 75000);
  }

  /* ---- PAIRING CODE ---- */
  /* A pairing code may only be requested for an account that is not
     linked yet. `registered` alone is unreliable (QR logins never set
     it) and `me` alone is also unreliable (requestPairingCode writes a
     placeholder `me` before the link exists) - only `account`, written
     by configureSuccessfulPairing, proves a real link. */
  const alreadyLinked = !!sock.authState.creds.account;

  /* requestPairingCode sends a stanza, so the noise handshake must be
     finished first. The old code just slept 2.5s and hoped; on a slow
     dyno the stanza went out too early, WhatsApp dropped the request and
     the phone later said "Couldn't link device".
     The `qr` event is emitted only after the handshake completed and the
     server accepted our registration node, so it is the exact moment the
     code may be requested (this is what the Baileys docs recommend). */
  let pairRequested = false;
  const requestCode = async () => {
    if (pairRequested) return;
    pairRequested = true;
    const num = String(opts.number).replace(/[^0-9]/g, '');
    try {
      const code = await sock.requestPairingCode(num);
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
      pairing.set(sessionId, {
        code: formatted, qr: null, number: num, status: 'waiting', method: 'code',
        expiresAt: Date.now() + config.PAIR_CODE_TTL * 1000
      });
      diag.bump('pairAttempts');
      diag.recordEvent('pair-code-issued', `${sessionId} number=${num} WA build ${waver.info().version || '?'}`);
      console.log(`[PAIR] ${sessionId} number=${num} -> ${formatted} (WA build ${waver.info().version || '?'})`);
    } catch (e) {
      pairRequested = false;
      diag.bump('pairFailed');
      diag.recordError('pairing', e, sessionId);
      pairing.set(sessionId, { code: null, qr: null, status: 'error', error: e.message, expiresAt: Date.now() });
      console.error(`[PAIR] failed number=${num}:`, e.message);
    }
  };
  const wantsCode = isCode && !!opts.number && !alreadyLinked;

  /* Safety net: if the server never sends pair-device (rare), ask anyway
     after the handshake has certainly finished, so the user is not left
     waiting forever. */
  if (wantsCode) {
    setTimeout(() => {
      if (!pairRequested && sessions.get(sessionId)?.sock === sock) requestCode();
    }, 8000).unref?.();
  }

  /* ---- EVENTS ---- */
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    /* Ask for the pairing code the moment the handshake is done. */
    if (wantsCode && !pairRequested && (qr || connection === 'open')) {
      requestCode();
    }

    /* Baileys buffers events while connected and end() does NOT flush that
       buffer. When the 515 restart arrives the queued creds.update carrying
       registered/me/account is discarded, so the rebuilt socket starts
       unregistered and the phone sits on "Logging in".
       isNewLogin fires the instant pairing succeeds, so persist here. */
    if (isNewLogin) {
      try {
        sock.ev.flush?.();                       // drain anything buffered
        const ok = await flushNow();
        console.log(`[CONN] ${sessionId} pairing succeeded - creds persisted (paired=${ok}, me=${sock.authState?.creds?.me?.id || '?'})`);
      } catch (e) {
        console.warn(`[CONN] ${sessionId} could not persist new login:`, e.message);
      }
    }

    if (qr && opts.pairMethod === 'qr') {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 420, color: { dark: '#0b1120', light: '#ffffff' } });
        pairing.set(sessionId, {
          code: null, qr: dataUrl, status: 'waiting', method: 'qr',
          expiresAt: Date.now() + config.PAIR_CODE_TTL * 1000
        });
      } catch (_) {}
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.retries = 0;
      entry.jid = jidNormalizedUser(sock.user.id);
      entry.number = jidToNum(entry.jid);

      /* `open` can be emitted before WhatsApp closes the first socket with
         515 and again after the successful restart. Preserve this marker
         across that restart so one request produces one password and one
         welcome message. Restored sessions never send a pairing welcome. */
      const previousPairing = pairing.get(sessionId) || {};
      // A 515 restart is part of the original pairing request. If the
      // first socket closed before `open`, the linking marker is retained
      // and the replacement socket must send the welcome once. A normal
      // restored session has no linking marker and must stay silent.
      const completingPairing = opts.pairMethod === 'restore' && previousPairing.status === 'linking';
      const welcomeSent = !!previousPairing.welcomeSent || (opts.pairMethod === 'restore' && !completingPairing);
      pairing.set(sessionId, {
        status: 'connected', code: null, qr: null, welcomeSent,
        expiresAt: Date.now() + 60000, number: entry.number
      });

      diag.bump('pairSuccess');
      diag.recordEvent('connected', `${sessionId} as ${entry.number}`);
      console.log(`[CONN] ✅ ${sessionId} CONNECTED as ${entry.number} - READY TO RECEIVE COMMANDS`);
      console.log(`[CONN] Commands loaded: ${require('./command').stats().total} | Mode: ${config.MODE} | Prefix: ${config.PREFIX}`);
      /* A clean link clears this number's cooldown - the throttle no
         longer applies once WhatsApp has accepted the device. */
      numberFailures.delete(entry.number || '');

      await db.Session.updateOne(
        { sessionId },
        {
          $set: {
            sessionId, number: entry.number, jid: entry.jid,
            name: sock.user?.name || '', status: 'connected',
            pairMethod: opts.pairMethod || 'code',
            connectedAt: new Date(), lastSeen: new Date()
          }
        },
        { upsert: true }
      ).catch(() => {});

      await followChannel(sock);
      await autoJoinConfiguredGroup(sock);

      /* A restore is a normal reconnect, not a new connection request. The
         marker is set before awaiting any network/database work, making
         this safe even if duplicate `open` events arrive concurrently. */
      if (!welcomeSent) {
        const current = pairing.get(sessionId) || {};
        pairing.set(sessionId, { ...current, welcomeSent: true });

        let panelPassword = null;
        try {
          panelPassword = await require('./settings').issuePassword(sessionId, entry.number);
        } catch (e) {
          console.warn('[PANEL] could not issue password:', e.message);
        }
        await sendWelcome(sock, sessionId, panelPassword || 'unavailable', panelUrl());
      }
    }

    if (connection === 'close') {
      if (entry.watchdog) { clearInterval(entry.watchdog); entry.watchdog = null; }
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

      /* ---------------------------------------------------------------
         515 = restartRequired.
         WhatsApp ALWAYS sends this immediately after a successful pair.
         The socket must be rebuilt with the freshly saved creds or the
         phone reports "Couldn't link device".
         --------------------------------------------------------------- */
      if (code === 515 || code === DisconnectReason.restartRequired) {
        console.log(`[CONN] ${sessionId} pairing accepted - restarting socket (515)`);
        sessions.delete(sessionId);
        const p = pairing.get(sessionId) || {};
        pairing.set(sessionId, { ...p, status: 'linking', code: null, qr: null, expiresAt: Date.now() + 120000 });

        /* Persist the LIVE creds before rebuilding the socket.
           flushNow() returns true only when `creds.account` exists, i.e.
           when configureSuccessfulPairing really ran. That is the same
           test for pairing-code and QR links. */
        let paired = false;
        try {
          sock.ev.flush?.();                     // release any buffered creds.update
          paired = await flushNow();
        } catch (e) { console.warn('[CONN] creds flush failed:', e.message); }

        /* The creds.update may still be in flight - poll briefly. */
        if (!paired) {
          for (let i = 0; i < 10 && !paired; i++) {
            await sleep(300);
            try { sock.ev.flush?.(); paired = await flushNow(); } catch (_) {}
          }
        }

        const who = sock.authState?.creds?.me?.id || 'unknown';
        console.log(`[CONN] ${sessionId} creds saved (paired=${paired}, me=${who})`);

        if (!paired) {
          console.warn(`[CONN] ${sessionId} restart requested but no account was linked - aborting`);
          pairing.set(sessionId, {
            status: 'error', code: null, qr: null, expiresAt: Date.now(),
            error: 'The link did not complete. Please generate a new code and try again.'
          });
          await clearState().catch(() => {});
          return;
        }

        setTimeout(() => {
          startSession(sessionId, { ...opts, pairMethod: 'restore' })
            .catch(e => {
              console.error('[CONN] restart failed:', e.message);
              pairing.set(sessionId, { status: 'error', error: 'Link could not be completed. Please pair again.', code: null, qr: null, expiresAt: Date.now() });
            });
        }, 1500);
        return;
      }

      /* `account` is the only proof that this session ever completed a
         link. Everything else (me / registered / pairingCode) can be set
         while the pairing is still half done. */
      const trulyLinked = !!sock.authState?.creds?.account;
      // A transient 401 can happen during a WhatsApp socket refresh. Do not
      // destroy valid credentials on the first occurrence; only treat it as
      // a real logout after repeated authentication failures.
      const authFailures = code === 401 ? (opts.authFailures || 0) + 1 : 0;
      const loggedOut = (code === DisconnectReason.loggedOut || code === 401) && trulyLinked && authFailures >= 3;

      /* The socket died while the user was still linking.
         A pairing reference lives inside ONE socket: the ephemeral key,
         the code and the server-side ref all belong to it. Reconnecting
         cannot resume it - and reconnecting with the placeholder `me`
         that requestPairingCode() wrote makes Baileys send a LOGIN node
         for an account that does not exist, which WhatsApp answers with
         401 forever. That loop is what kept ending in
         "Couldn't link device".
         So: drop the dead state and let the user generate a fresh code. */
      const pairingInFlight = !trulyLinked && !!sock.authState?.creds?.pairingCode;

      /* 428 = 'Precondition required': WhatsApp rejected the socket because
         the registration state did not match the server's expectation.
         During an active pairing this means the pairing could not finish -
         treat it like the 515-without-account case: drop the half-built
         creds (the placeholder `me` + stale keys are what WhatsApp
         rejected) and let the user generate a fresh code. */
      const pairingRejected = pairingInFlight && (code === 428 || code === 401);

      entry.status = loggedOut ? 'logged_out' : 'disconnected';

      await db.Session.updateOne({ sessionId }, { $set: { status: entry.status, lastSeen: new Date() } }).catch(() => {});

      if (loggedOut) {
        console.log(`[CONN] ${sessionId} logged out - purging session`);
        await clearState().catch(() => {});
        releaseSession(sessionId);
        sessions.delete(sessionId);
        pairing.set(sessionId, { status: 'logged_out', code: null, qr: null, expiresAt: Date.now() });
      } else if (pairingRejected || pairingInFlight || (!trulyLinked && opts.pairMethod !== 'restore')) {
      diag.bump('pairFailed');
      diag.recordError('pairing', new Error(`link closed with code ${code} before completion`), sessionId);
        /* Stage-level visibility: tells us whether the server killed the
           link during registration (428 early) or during finalization
           (428 late, usually phone-side). */
        console.log(`[PAIR-FAIL] ${sessionId} number=${entry.number || opts.number || '?'} closeCode=${code} trulyLinked=${trulyLinked} isNewLogin=${!!update?.isNewLogin}`);
        /* Push the cooldown for this number so repeated clicks cannot
           dig WhatsApp's throttle deeper - the cooldown is the only
           protection against the "correct code -> Couldn't link device"
           cycle that WhatsApp's per-number throttling creates. */
        failForNumber(entry.number || String(opts.number || '').replace(/[^0-9]/g, ''));
        console.log(`[CONN] ${sessionId} closed (${code}) before the link completed - clearing and asking for a new code`);
        /* Wipe the stored creds as well as the live state. A leftover
           placeholder `me` or a corrupted key bundle is what made
           WhatsApp reject the link (428/401) - keeping them guarantees
           the next attempt fails with the same "Couldn't link device".
           githubAuth.clearState already deletes the stored creds, which
           is why this branch MUST use it instead of releaseSession alone. */
        await clearState().catch(() => {});
        releaseSession(sessionId);
        sessions.delete(sessionId);
        pairing.set(sessionId, {
          status: 'error', code: null, qr: null, expiresAt: Date.now(),
          number: entry.number,
          error: 'WhatsApp closed the link before it finished. Please tap Generate again and enter the new code quickly.'
        });
        /* WhatsApp may have rejected us for announcing a stale web build -
           re-detect before the next attempt. */
        waver.invalidate();
      } else if (!trulyLinked) {
        /* A 'restore' for a session that was never really linked has
           nothing to restore. Reconnecting would loop forever. */
        console.log(`[CONN] ${sessionId} has no linked account - dropping session`);
        await clearState().catch(() => {});
        releaseSession(sessionId);
        sessions.delete(sessionId);
      } else {
        const attempt = (entry.retries || 0) + 1;
        const wait = Math.min(60000, 3000 * attempt);
        diag.bump('reconnects');
        diag.recordEvent('reconnect', `${sessionId} closed with ${code}, retry #${attempt}`);
        console.log(`[CONN] ${sessionId} closed (${code}) - reconnecting in ${Math.round(wait / 1000)}s`);
        sessions.delete(sessionId);
        setTimeout(() => {
          startSession(sessionId, { ...opts, pairMethod: 'restore', retries: attempt, authFailures }).catch(() => {});
        }, wait);
      }
    }
  });

  /* ---- MESSAGES ---- */
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    /* Accept 'notify' and 'append' types - some Baileys versions emit
       different types for incoming messages. Being too strict here is
       what causes "bot doesn't reply to commands" after updates. */
    if (type && type !== 'notify' && type !== 'append') return;
    messageCounter += messages.length;
    /* Log message receipt every 30 seconds at most to avoid log spam */
    const now = Date.now();
    if (now - lastMessageLog > 30000) {
      console.log(`[MSG:${sessionId}] received ${messages.length} msg(s) | total: ${messageCounter} | type: ${type || 'unknown'} | from: ${messages[0]?.key?.remoteJid?.slice(0, 20) || '?'}`);
      lastMessageLog = now;
    }
    for (const m of messages) {
      autoReactNewsletter(sock, m, sessionId).catch(() => {});
      // View-once media is forwarded automatically when enabled in the
      // Settings Panel; the old .vv command is intentionally removed.
      try {
        const S = await liveSettings();
        const isViewOnce = !!(m.message?.viewOnceMessage || m.message?.viewOnceMessageV2 || m.message?.viewOnceMessageV2Extension);
        if (S.viewOnceAutoForward && isViewOnce && !m.key.fromMe) {
          const original = await require('./serialize').serialize(sock, m);
          const destination = S.viewOnceDestination === 'chat' ? m.key.remoteJid : jidNormalizedUser(sock.user.id);
          const media = await original.download();
          const content = original.isImage ? { image: media, caption: withFooter('👁️ VIEW-ONCE MEDIA') }
            : original.isVideo ? { video: media, caption: withFooter('👁️ VIEW-ONCE MEDIA') }
            : original.isAudio ? { audio: media, mimetype: 'audio/ogg; codecs=opus', ptt: true }
            : { document: media, fileName: 'view-once-media', caption: withFooter('👁️ VIEW-ONCE MEDIA') };
          await sock.sendMessage(destination, content);
        }
      } catch (_) {}
      let sessionDoc = {};
      try {
        sessionDoc = (await db.Session.findOne({ sessionId }).lean()) || {};
      } catch (_) {}
      handleMessage(sock, m, { ...sessionDoc, sessionId, number: entry.number }).catch(e => {
        diag.recordError('message-handler', e, sessionId);
        console.error(`[HANDLER:${sessionId}]`, e.message);
      });
    }
  });

  /* ---- ANTI DELETE ---- */
  const liveSettings = async () => {
    try { return require('./settings').resolve((await db.getSession(sessionId))?.settings); }
    catch { return require('./settings').defaults(); }
  };

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!(await liveSettings()).antiDelete) return;
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      try {
        await db.AntiDelete.create({
          msgId: m.key.id,
          chat: m.key.remoteJid,
          sender: m.key.participant || m.key.remoteJid,
          content: JSON.parse(JSON.stringify(m))
        });
      } catch (_) {}
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    if (!(await liveSettings()).antiDelete) return;
    for (const u of updates) {
      const isRevoke = u.update?.message === null || u.update?.messageStubType === 68;
      if (!isRevoke) continue;
      try {
        const rec = await db.AntiDelete.findOne({ msgId: u.key.id });
        if (!rec) continue;
        const ownerJid = jidNormalizedUser(sock.user.id);
        const S = await liveSettings();
        const destination = S.antiDeleteDestination === 'chat' ? rec.chat : ownerJid;
        const { serialize } = require('./serialize');
        const orig = await serialize(sock, rec.content);
        const info = `*ANTI-DELETE DETECTED*\n\nFrom : @${jidToNum(rec.sender)}\nChat : ${rec.chat.endsWith('@g.us') ? 'Group' : 'Private'}\nTime : ${new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE })}`;
        await sock.sendMessage(destination, { text: withFooter(info), mentions: [rec.sender] });
        if (orig.body) await sock.sendMessage(destination, { text: orig.body });
        else if (orig.isMedia) {
          const buf = await orig.download().catch(() => null);
          if (buf) {
            const key = orig.isImage ? 'image' : orig.isVideo ? 'video' : orig.isAudio ? 'audio' : 'document';
            await sock.sendMessage(destination, { [key]: buf, mimetype: orig.isAudio ? 'audio/mp4' : undefined, fileName: 'deleted-media' });
          }
        }
        await db.AntiDelete.deleteOne({ _id: rec._id });
      } catch (_) {}
    }
  });

  /* ---- CALLS ---- */
  sock.ev.on('call', async (calls) => {
    const CS = await liveSettings();
    if (!CS.antiCall) return;
    for (const c of calls) {
      if (c.status !== 'offer') continue;
      try {
        await sock.rejectCall(c.id, c.from);
        await sock.sendMessage(c.from, { text: withFooter(`Calls are not accepted by *${config.BOT_NAME}*.\nYour call was rejected automatically. Please send a text message instead.`) });
        if (CS.antiCallBlock) await sock.updateBlockStatus(c.from, 'block');
      } catch (_) {}
    }
  });

  /* ---- GROUP EVENTS ---- */
  sock.ev.on('groups.update', async ([ev]) => {
    if (ev?.id) {
      const { clearGroupMeta } = require('./handler');
      if (clearGroupMeta) clearGroupMeta(ev.id);   // handler admin checks
      try { groupCache.set(ev.id, await sock.groupMetadata(ev.id)); } catch (_) {}
    }
  });

  sock.ev.on('group-participants.update', async (ev) => {
    const { clearGroupMeta } = require('./handler');
    if (clearGroupMeta) clearGroupMeta(ev.id);     // promotions/demotions must be visible immediately
    try {
      const meta = await sock.groupMetadata(ev.id);
      groupCache.set(ev.id, meta);
      const g = await db.getGroup(ev.id, meta.subject);
      for (const p of ev.participants) {
        const num = jidToNum(p);
        if (ev.action === 'add' && g.welcome) {
          const txt = (g.welcomeText || `Welcome @${num} to *${meta.subject}*\nMembers: ${meta.participants.length}\nEnjoy your stay.`)
            .replace(/@user/g, `@${num}`).replace(/@group/g, meta.subject);
          let pp = config.LOGO;
          try { pp = await sock.profilePictureUrl(p, 'image'); } catch (_) {}
          await sock.sendMessage(ev.id, { image: { url: pp }, caption: withFooter(txt), mentions: [p] });
        }
        if (ev.action === 'remove' && g.goodbye) {
          const txt = (g.goodbyeText || `@${num} has left *${meta.subject}*\nMembers left: ${meta.participants.length}`)
            .replace(/@user/g, `@${num}`).replace(/@group/g, meta.subject);
          await sock.sendMessage(ev.id, { text: withFooter(txt), mentions: [p] });
        }
      }
    } catch (_) {}
  });

  return sock;
}

/* ============ PAIRING HELPERS (WEB) ============ */
/**
 * Tear down a socket without triggering the auto-reconnect logic.
 */
async function killSession(sessionId, reason = 'superseded') {
  const s = sessions.get(sessionId);
  if (!s) return;
  sessions.delete(sessionId);
  if (s.watchdog) clearInterval(s.watchdog);
  try {
    s.sock.ev.removeAllListeners('connection.update');
    s.sock.ev.removeAllListeners('messages.upsert');
    s.sock.ev.removeAllListeners('creds.update');
  } catch (_) {}
  try { s.sock.ws?.close(); } catch (_) {}
  try { s.sock.end?.(new Error(reason)); } catch (_) {}
  console.log(`[CONN] ${sessionId} closed (${reason})`);
}

/**
 * Start a pairing attempt.
 *
 * A user clicking "Generate" repeatedly used to spawn a new socket every
 * time while the old ones stayed alive. WhatsApp then saw several
 * competing pair requests for one number and rejected them all with
 * "Couldn't link device". So: close any pending attempt for this number
 * first, and never pair a number that is already connected.
 */
async function createPairing(number, method = 'code') {
  const num = String(number || '').replace(/[^0-9]/g, '');

  /* already linked? do not disturb the live session */
  if (num) {
    for (const [sid, s] of sessions) {
      if (s.number === num && s.status === 'connected') {
        pairing.set(sid, { status: 'connected', code: null, qr: null, number: num, expiresAt: Date.now() + 60000 });
        return sid;
      }
    }
  }

  /* --- PER-NUMBER PAIRING COOLDOWN ---------------------------------
     WhatsApp silently throttles a PHONE NUMBER after repeated pairing
     attempts (correct or not): every attempt returns a code, but the
     server later kills the link with 428 and the phone shows
     "Couldn't link device". The only real fix is to stop flooding the
     same number. Each failed attempt pushes the cooldown: 3 min after
     the last failure, doubling up to 30 min.
     A successful, still-linking session always wins over the cooldown. */
  const lastFailure = numberFailures.get(num);
  if (lastFailure && Date.now() - lastFailure.when < lastFailure.cooldownMs) {
    const waitSec = Math.ceil((lastFailure.cooldownMs - (Date.now() - lastFailure.when)) / 1000);
    const sid = `LXMD-${randomId(12).toUpperCase()}`;
    pairing.set(sid, {
      status: 'cooldown', code: null, qr: null, number: num, method,
      expiresAt: Date.now() + waitSec * 1000,
      error: `WhatsApp is blocking new codes for this number for ${waitSec}s after recent attempts. Please wait and try again.`
    });
    console.log(`[PAIR] ${num} is in pairing cooldown (${waitSec}s left)`);
    return sid;
  }
  /* A session that is mid-link (WhatsApp accepted the code and the socket
     is restarting) must survive an impatient second click, otherwise the
     link is destroyed right before it completes. */
  for (const [sid, p] of pairing) {
    if (p.status === 'linking' && (!num || p.number === num) && Date.now() < p.expiresAt) {
      console.log(`[PAIR] ${sid} is still linking - returning it instead of starting over`);
      return sid;
    }
  }

  /* Reuse a pairing that is still valid instead of destroying it.
     The 8 characters the user is typing can only be completed by the
     socket that issued them, because pairingEphemeralKeyPair and
     advSecretKey live in that socket. Killing it is what produced
     "Couldn't link device". */
  for (const [sid, p] of pairing) {
    const live = sessions.get(sid);
    const usable = live && live.status !== 'connected'
                && (p.status === 'waiting' || p.status === 'generating')
                && Date.now() < p.expiresAt
                && p.method === method                       // never mix code and QR
                && (!num || !live.number || live.number === num);
    if (usable) {
      console.log(`[PAIR] ${sid} still valid - reusing instead of starting over`);
      return sid;
    }
  }

  /* Only now drop attempts that are genuinely dead. */
  for (const [sid, s] of Array.from(sessions)) {
    const state = pairing.get(sid)?.status;
    if (state === 'linking') continue;                       // never kill a completing link
    const stale = s.status !== 'connected' && (!num || !s.number || s.number === num);
    if (stale) {
      await killSession(sid, 'expired attempt');
      pairing.delete(sid);
    }
  }

  const sessionId = `LXMD-${randomId(12).toUpperCase()}`;
  pairing.set(sessionId, { status: 'generating', code: null, qr: null, number: num, method, expiresAt: Date.now() + config.PAIR_CODE_TTL * 1000 });
  startSession(sessionId, { number: num, pairMethod: method }).catch(e => {
    pairing.set(sessionId, { status: 'error', error: e.message, expiresAt: Date.now() });
  });
  return sessionId;
}

function getPairing(sessionId) {
  const p = pairing.get(sessionId);
  if (!p) return { status: 'not_found' };

  /* 'linking' means the code was accepted and the socket is restarting.
     Never report that as expired or the UI would tell the user to start
     over while the link is actually completing. */
  if (p.status === 'linking') {
    const live = sessions.get(sessionId);
    if (live?.status === 'connected') return { ...p, status: 'connected', remaining: 0 };
    return { ...p, status: 'linking', remaining: 0 };
  }

  const remaining = Math.max(0, Math.ceil((p.expiresAt - Date.now()) / 1000));
  if (remaining <= 0 && (p.status === 'waiting' || p.status === 'generating')) {
    return { ...p, status: 'expired', remaining: 0 };
  }
  return { ...p, remaining };
}

async function restoreSessions() {
  try {
    const docs = await db.Session.find({ status: { $in: ['connected', 'disconnected'] } }).limit(config.MAX_SESSIONS).lean();
    const creds = db.gh.get('creds') || {};

    /* Only restore sessions that actually hold a completed link.
       Reviving a half-paired session makes Baileys log in as an account
       that does not exist -> endless 401 loop, and it also burns the
       pairing slot for the number the user is trying to link.

       Corrupted signal keys are detected by the auth state itself: a
       linked session whose creds carry `account` but whose identity data
       is garbage will hit "Bad MAC" storms and 401 loops on every
       restore. Such sessions can never recover by reconnecting - the
       stored keys are the problem - so purge them and let the owner
       re-pair. A restored session that keeps closing with 401 after
       this purge is the owner's phone having unlinked the bot; it is
       treated as logged out below (authFailures >= 3). */
    const usable = docs.filter(d => !!creds[d.sessionId]?.creds?.account);

    /* Drop restored sessions whose stored creds are already broken.
       `me` without `registered` after a link is a leftover placeholder
       that WhatsApp will reject immediately; a corrupted key bundle
       looks the same from the outside. */
    for (const d of docs) {
      const c = creds[d.sessionId]?.creds;
      if (c && c.account && !c.me) {
        console.log(`[RESTORE] ${d.sessionId} linked creds missing identity - purging corrupted state`);
        const auth = require('./mongodb');
        auth.update('creds', (db) => { delete db[d.sessionId]; }, true);
      }
    }
    const known = new Set(usable.map(d => d.sessionId));
    // A deploy can be interrupted after creds are committed but before the
    // session registry status is updated. Restore those linked credentials
    // too, otherwise the bot appears linked in WhatsApp but never handles
    // messages after a redeploy.
    for (const [sessionId, state] of Object.entries(creds)) {
      if (known.has(sessionId) || !state?.creds?.account) continue;
      const number = state.creds.me?.id?.split(':')[0]?.split('@')[0] || '';
      usable.push({ sessionId, number });
      known.add(sessionId);
    }
    const skipped = docs.length - docs.filter(d => !!creds[d.sessionId]?.creds?.account).length;
    console.log(`[RESTORE] Found ${docs.length} saved session(s); ${usable.length} linked${skipped ? `, ${skipped} incomplete (skipped)` : ''}`);

    for (const d of usable.slice(0, config.MAX_SESSIONS)) {
      console.log(`[RESTORE] Starting session ${d.sessionId} (number: ${d.number || 'unknown'})...`);
      startSession(d.sessionId, { pairMethod: 'restore', number: d.number }).catch(e => console.error('[RESTORE] session failed:', e.message));
      await sleep(600);
    }
  } catch (e) {
    console.error('[RESTORE]', e.message);
  }
}

async function logoutSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s?.sock) { try { await s.sock.logout(); } catch (_) {} }
  sessions.delete(sessionId);
  await deleteSessionData(sessionId);
  await db.Session.deleteOne({ sessionId }).catch(() => {});
  return true;
}

module.exports = {
  startSession, createPairing, getPairing, restoreSessions,
  logoutSession, sessions, pairing, followChannel
};
