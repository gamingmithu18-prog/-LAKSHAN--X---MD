/**
 * Message serializer - turns raw Baileys messages into a friendly object
 * 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { getContentType, downloadMediaMessage, jidNormalizedUser } = require('baileys');
const { decodeJid, jidToNum } = require('./utils');

function getText(msg) {
  if (!msg) return '';
  const type = getContentType(msg);
  switch (type) {
    case 'conversation': return msg.conversation;
    case 'extendedTextMessage': return msg.extendedTextMessage?.text || '';
    case 'imageMessage': return msg.imageMessage?.caption || '';
    case 'videoMessage': return msg.videoMessage?.caption || '';
    case 'documentMessage': return msg.documentMessage?.caption || '';
    case 'documentWithCaptionMessage': return msg.documentWithCaptionMessage?.message?.documentMessage?.caption || '';
    case 'buttonsResponseMessage': return msg.buttonsResponseMessage?.selectedButtonId || '';
    case 'listResponseMessage': return msg.listResponseMessage?.singleSelectReply?.selectedRowId || '';
    case 'templateButtonReplyMessage': return msg.templateButtonReplyMessage?.selectedId || '';
    case 'interactiveResponseMessage': {
      try {
        const j = JSON.parse(msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}');
        return j.id || j.selectedId || '';
      } catch { return ''; }
    }
    case 'messageContextInfo': return '';
    case 'protocolMessage': return '';
    case 'reactionMessage': return '';
    case 'senderKeyDistributionMessage': return '';
    case 'ephemeralMessage': return getText(msg.ephemeralMessage?.message);
    case 'viewOnceMessage': return getText(msg.viewOnceMessage?.message);
    case 'viewOnceMessageV2': return getText(msg.viewOnceMessageV2?.message);
    case 'viewOnceMessageV2Extension': return getText(msg.viewOnceMessageV2Extension?.message);
    case 'editedMessage': return getText(msg.editedMessage?.message?.protocolMessage?.editedMessage);
    default: {
      /* Fallback: try to extract text from any message type that has a .text or .caption field.
         This handles new WhatsApp message types that Baileys doesn't explicitly map yet. */
      if (msg[type]?.text) return msg[type].text;
      if (msg[type]?.caption) return msg[type].caption;
      return '';
    }
  }
}

function unwrap(message) {
  if (!message) return message;
  const t = getContentType(message);
  if (t === 'ephemeralMessage') return unwrap(message.ephemeralMessage.message);
  if (t === 'viewOnceMessage') return unwrap(message.viewOnceMessage.message);
  if (t === 'viewOnceMessageV2') return unwrap(message.viewOnceMessageV2.message);
  if (t === 'viewOnceMessageV2Extension') return unwrap(message.viewOnceMessageV2Extension.message);
  if (t === 'documentWithCaptionMessage') return unwrap(message.documentWithCaptionMessage.message);
  return message;
}

async function serialize(sock, m, store) {
  if (!m) return m;
  const M = {};
  M.raw = m;
  M.key = m.key;
  M.id = m.key.id;
  M.chat = decodeJid(m.key.remoteJid);
  M.fromMe = m.key.fromMe;
  M.isGroup = M.chat?.endsWith('@g.us');
  M.isStatus = M.chat === 'status@broadcast';
  M.isChannel = M.chat?.endsWith('@newsletter');
  M.sender = decodeJid(M.fromMe ? (sock.user?.id) : (M.isGroup || M.isStatus ? (m.key.participant || m.participant) : M.chat));
  M.senderNum = jidToNum(M.sender);
  M.pushName = m.pushName || 'User';
  M.timestamp = (typeof m.messageTimestamp === 'number' ? m.messageTimestamp : m.messageTimestamp?.low) || Math.floor(Date.now() / 1000);

  M.message = unwrap(m.message);
  M.type = getContentType(M.message) || '';
  M.body = getText(M.message) || '';
  M.text = M.body;
  M.args = M.body.trim().split(/\s+/).slice(1);
  M.mentions = M.message?.[M.type]?.contextInfo?.mentionedJid || [];

  M.isMedia = /imageMessage|videoMessage|audioMessage|stickerMessage|documentMessage/.test(M.type);
  M.isImage = M.type === 'imageMessage';
  M.isVideo = M.type === 'videoMessage';
  M.isAudio = M.type === 'audioMessage';
  M.isSticker = M.type === 'stickerMessage';
  M.isDocument = M.type === 'documentMessage';
  M.isViewOnce = !!(m.message?.viewOnceMessage || m.message?.viewOnceMessageV2 || m.message?.viewOnceMessageV2Extension);

  /* ---- quoted ---- */
  const ctx = M.message?.[M.type]?.contextInfo;
  M.quoted = null;
  if (ctx?.quotedMessage) {
    const qmsg = unwrap(ctx.quotedMessage);
    const qtype = getContentType(qmsg);
    M.quoted = {
      key: {
        remoteJid: ctx.remoteJid || M.chat,
        fromMe: decodeJid(ctx.participant) === decodeJid(sock.user?.id),
        id: ctx.stanzaId,
        participant: M.isGroup ? decodeJid(ctx.participant) : undefined
      },
      message: qmsg,
      type: qtype,
      sender: decodeJid(ctx.participant),
      senderNum: jidToNum(ctx.participant),
      text: getText(qmsg) || '',
      isMedia: /imageMessage|videoMessage|audioMessage|stickerMessage|documentMessage/.test(qtype || ''),
      isImage: qtype === 'imageMessage',
      isVideo: qtype === 'videoMessage',
      isAudio: qtype === 'audioMessage',
      isSticker: qtype === 'stickerMessage',
      isDocument: qtype === 'documentMessage',
      download: async () => downloadMediaMessage(
        { key: { remoteJid: M.chat, id: ctx.stanzaId, participant: ctx.participant }, message: qmsg },
        'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
      )
    };
  }

  M.download = async () => downloadMediaMessage(
    { key: M.key, message: M.message }, 'buffer', {},
    { reuploadRequest: sock.updateMediaMessage }
  );

  /* ---- helpers ---- */
  M.reply = (text, opts = {}) => sock.sendMessage(M.chat, { text: String(text), ...opts }, { quoted: m });
  M.send = (content, opts = {}) => sock.sendMessage(M.chat, content, { quoted: m, ...opts });
  M.sendTo = (jid, content, opts = {}) => sock.sendMessage(jid, content, opts);
  M.react = (emoji) => sock.sendMessage(M.chat, { react: { text: emoji, key: M.key } }).catch(() => {});
  M.delete = (key) => sock.sendMessage(M.chat, { delete: key || M.key });
  M.edit = (newText, key) => sock.sendMessage(M.chat, { text: newText, edit: key || M.key });

  return M;
}

module.exports = { serialize, getText, unwrap };
