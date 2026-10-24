
const config = require('../config');
const NodeCache = require('node-cache');

/* Dedupe cache for channel post reactions (24h TTL, generous key budget). */
const reactedPosts = new NodeCache({ stdTTL: 86400, checkperiod: 600, maxKeys: 50000 });

const CHANNEL_JID = String(config.CHANNEL_JID || '').trim();
const CHANNEL_NAME = String(config.CHANNEL_NAME || '').trim();

/* ============================================================
   1. Forward-metadata helper
   ============================================================ */
function newsletterContext() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: 999
    }
  };
}

/* Deep-merge a contextInfo block into a message content object. */
function attach(ctxInfo, content, opts = {}) {
  if (!content || typeof content !== 'object') return content;
  if (content.react || content.delete || content.presence || content.edit) {
    /* Non-conversational payloads carry no contextInfo - leave alone. */
    return content;
  }
  /* When quoting a message FROM ANOTHER user, attaching newsletter
     forward metadata on top of it is known to cause WhatsApp to throttle
     or silently drop delivery of the reply (server not-acceptable).
     In that case send a plain quoted reply only. */
  if (opts?.quotingOther) return content;
  if (content.conversation !== undefined) {
    /* Plain text: { text: '...' } serializes to { conversation } after baileys
       composition, but at this layer the shape is { text } / { caption }. */
    content.text !== undefined && (content.contextInfo = ctxInfo);
    return content;
  }
  if (content.caption !== undefined || content.text !== undefined) {
    content.contextInfo = ctxInfo;
    return content;
  }
  /* Media / document / sticker / poll / product - attach when they accept contextInfo. */
  if (content.image || content.video || content.audio || content.document ||
      content.sticker || content.ptv || content.poll || content.product) {
    content.contextInfo = ctxInfo;
    return content;
  }
  return content;
}

/* ============================================================
   2. Wrapped socket - transparent sendMessage monkey-patch
   ============================================================ */
function wrapSock(sock) {
  if (!sock || sock.__newsletterWrapped) return sock;
  sock.__newsletterWrapped = true;
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, opts = {}) => {
    if (content) {
      
      const q = opts?.quoted?.message
        ? opts.quoted.message[Object.keys(opts.quoted.message)[0]]?.contextInfo?.participant || ''
        : '';
      const quotingOther = !!q && !q.endsWith('@s.whatsapp.net') && !q.endsWith('@lid');
      attach(newsletterContext(), content, { quotingOther });
    }
    try {
      return await original(jid, content, opts);
    } catch (err) {
      
      try {
        if (content && content.contextInfo) {
          const clean = Object.assign({}, content);
          delete clean.contextInfo;
          return await original(jid, clean, opts);
        }
        throw err;
      } catch (err2) {
        console.log('[NEWSLETTER] sendMessage failed after fallback:', (err2?.message || err2 || err?.message || err).toString().slice(0, 200));
        throw err2;
      }
    }
  };
  return sock;
}

function unwrapSock(sock) {
  if (sock && sock.__originalSendMessage) {
    sock.sendMessage = sock.__originalSendMessage;
    sock.__originalSendMessage = null;
    sock.__newsletterWrapped = false;
  }
  return sock;
}

/* ============================================================
   3. Channel post auto-react
   ============================================================ */
function isChannelPost(jid) {
  return String(jid || '').endsWith('@newsletter');
}

function getPool(settings) {
  const raw = (settings && (settings.statusEmojis || settings.statusEmoji)) || config.STATUS_EMOJI;
  return String(raw || '\u2764\ufe0f').split(',').map(x => x.trim()).filter(Boolean);
}

async function handleChannelPost(sock, m, session = {}) {
  if (!isChannelPost(m.key?.remoteJid)) return;
  if (m.key?.fromMe) return;                       /* own posts - skip */
  const settings = require('./settings').resolve(session.settings);
  if (!settings.newsletterReact && !settings.autoLikeStatus) return;   /* opt-in */
  const id = m.key?.id;
  if (!id) return;
  const dedupeKey = `${session.sessionId || 'session'}:${m.key.remoteJid}:${id}`;
  if (reactedPosts.has(dedupeKey)) return;
  reactedPosts.set(dedupeKey, true);
  const pool = getPool(settings);
  const emoji = pool[Math.floor(Math.random() * pool.length)] || '\u2764\ufe0f';
  try {
    await sock.sendMessage(m.key.remoteJid, {
      react: { text: emoji, key: { remoteJid: m.key.remoteJid, id, fromMe: false } }
    });
    console.log(`[NEWSLETTER] reacted to channel post ${id.slice(0, 8)} with ${emoji}`);
  } catch (e) {
    console.log('[NEWSLETTER] channel react failed:', e?.message || e);
  }
}

module.exports = {
  wrapSock, unwrapSock,
  newsletterContext,
  handleChannelPost,
  isChannelPost,
  reactedPosts,
  CHANNEL_JID, CHANNEL_NAME
};
