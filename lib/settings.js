/**
 * ==========================================================
 *  PER-SESSION SETTINGS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *  © POWERD BY LAKSHAN X MD </>
 * ==========================================================
 *
 *  Every connected bot owns its own settings document, stored in the
 *  MongoDB database (sessions.json). Changes made from the web panel
 *  take effect on the very next message, because the handler reads the
 *  session document fresh on each event.
 */
const crypto = require('crypto');
const config = require('../config');
const db = require('./database');

/* ---------------------------------------------------------------
   SCHEMA - drives both the API validation and the web UI rendering
   --------------------------------------------------------------- */
const SCHEMA = [
  {
    group: 'General',
    items: [
      { key: 'prefix',   label: 'Command Prefix', type: 'text',   default: config.PREFIX, max: 3,
        help: 'The character typed before every command.' },
      { key: 'mode',     label: 'Bot Mode',       type: 'select', default: config.MODE,
        options: ['public', 'private', 'group', 'inbox'],
        help: 'Public lets everyone use the bot. Private restricts it to you.' }
    ]
  },
  {
    group: 'Presence',
    items: [
      { key: 'alwaysOnline',  label: 'Always Online',      type: 'bool', default: config.ALWAYS_ONLINE,
        help: 'Keep the bot shown as online at all times.' },
      { key: 'autoTyping',    label: 'Auto Typing',        type: 'bool', default: config.AUTO_TYPING,
        help: 'Show the typing indicator before replying.' },
      { key: 'autoRecording', label: 'Auto Recording',     type: 'bool', default: config.AUTO_RECORDING,
        help: 'Show the recording indicator before replying.' },
      { key: 'autoReadMessages', label: 'Auto Read Messages', type: 'bool', default: config.AUTO_READ_MESSAGES,
        help: 'Mark incoming chats as read automatically.' },
      { key: 'freezeLastSeen', label: 'Freeze Last Seen', type: 'bool', default: false,
        help: 'Stop presence updates after enabling this toggle.' }
    ]
  },
  {
    group: 'Status Updates',
    items: [
      { key: 'autoReadStatus', label: 'Auto View Status', type: 'bool', default: config.AUTO_READ_STATUS,
        help: 'Automatically view the status updates of your contacts.' },
      { key: 'newsletterReact', label: 'Auto React Newsletter', type: 'bool', default: true,
        help: 'Automatically react with an emoji to new posts on the bot\'s own channel.' },
      { key: 'autoLikeStatus', label: 'Auto Like Status',  type: 'bool', default: config.AUTO_LIKE_STATUS,
        help: 'React to every status the bot views.' },
      { key: 'statusEmoji',    label: 'Status Reaction',   type: 'text', default: config.STATUS_EMOJI, max: 4,
        help: 'Fallback emoji used when liking a status.' },
      { key: 'statusEmojis',   label: 'Status Emoji Pool', type: 'text', default: '❤️,👍,😂,🔥,😍,👏,🥰,✨', max: 500,
        help: 'Comma-separated emojis. One is selected randomly for each status.' }
    ]
  },
  {
    group: 'Protection',
    items: [
      { key: 'antiDelete',    label: 'Anti Delete',        type: 'bool', default: config.ANTI_DELETE,
        help: 'Recover deleted messages and forward them to your inbox.' },
      { key: 'antiCall',      label: 'Reject Calls',       type: 'bool', default: config.ANTI_CALL,
        help: 'Automatically decline incoming calls.' },
      { key: 'antiCallBlock', label: 'Block Callers', type: 'bool', default: config.ANTI_CALL_BLOCK,
        help: 'Block a contact after rejecting their call.' },
      { key: 'antiDeleteDestination', label: 'Anti Delete Destination', type: 'select', default: 'self', options: ['self', 'chat'],
        help: 'Send recovered deleted media/text to your self chat or the original chat.' }
    ]
  },
  {
    group: 'Automation',
    items: [
      { key: 'autoReactMessages', label: 'Auto React Messages', type: 'bool', default: false, help: 'React to incoming messages automatically.' },
      { key: 'autoReactEmoji', label: 'Auto React Emoji', type: 'text', default: '👍', max: 4, help: 'Emoji used for automatic reactions.' },
      { key: 'autoViewOnce', label: 'Auto View Once', type: 'bool', default: false, help: 'Automatically process view-once media.' },
      { key: 'autoDownloadMedia', label: 'Auto Download Media', type: 'bool', default: false, help: 'Automatically download incoming media.' },
      { key: 'autoSticker', label: 'Auto Sticker', type: 'bool', default: false, help: 'Convert incoming images to stickers.' },
      { key: 'welcomeMessages', label: 'Welcome Messages', type: 'bool', default: false, help: 'Send configured group welcome messages.' },
      { key: 'goodbyeMessages', label: 'Goodbye Messages', type: 'bool', default: false, help: 'Send configured group goodbye messages.' },
      { key: 'antiSpam', label: 'Anti Spam', type: 'bool', default: false, help: 'Limit repeated messages from a sender.' },
      { key: 'antiBot', label: 'Anti Bot', type: 'bool', default: false, help: 'Filter suspicious automated messages.' },
      { key: 'blockUnknown', label: 'Block Unknown Senders', type: 'bool', default: false, help: 'Ignore messages from unknown users.' },
      { key: 'autoPresence', label: 'Auto Presence', type: 'select', default: 'available', options: ['available', 'unavailable'], help: 'Presence shown while online.' },
      { key: 'replyMode', label: 'Reply Mode', type: 'select', default: 'quoted', options: ['quoted', 'plain'], help: 'Reply with or without a quoted message.' },
      { key: 'reactOnCmd', label: 'React On Commands', type: 'bool', default: config.REACT_ON_CMD, help: 'React to each command message.' },
      { key: 'cmdReaction', label: 'Command Reaction', type: 'text', default: config.CMD_REACTION, max: 4, help: 'Emoji used on commands.' },
      { key: 'commandCooldown', label: 'Command Cooldown Seconds', type: 'text', default: '1', max: 3, help: 'Minimum delay between commands.' },
      { key: 'maxUploadMb', label: 'Maximum Upload MB', type: 'text', default: String(config.MAX_UPLOAD_MB), max: 4, help: 'Maximum media upload size.' },
      { key: 'language', label: 'Reply Language', type: 'select', default: 'en', options: ['en', 'si'], help: 'Default language for built-in replies.' },
      { key: 'statusPrivacy', label: 'Status Privacy', type: 'select', default: 'contacts', options: ['contacts', 'private'], help: 'Status handling privacy mode.' },
      { key: 'logCommands', label: 'Command Activity Log', type: 'bool', default: true, help: 'Keep command counters for diagnostics.' },
      { key: 'maintenanceMode', label: 'Maintenance Mode', type: 'bool', default: false, help: 'Temporarily allow owner commands only.' },
      { key: 'sendReadReceipts', label: 'Send Read Receipts', type: 'bool', default: true, help: 'Mark handled messages as read.' },
      { key: 'autoAiReply', label: 'Auto AI Reply', type: 'bool', default: false, help: 'Reply to normal incoming messages with the configured Groq assistant.' },
      { key: 'groqApiKey', label: 'Groq API Key', type: 'text', default: '', max: 200, help: 'Get a key at https://console.groq.com/keys and keep it private.' },
      { key: 'aiLanguage', label: 'AI Reply Language', type: 'select', default: 'auto', options: ['auto', 'en', 'si'], help: 'Language used by the AI assistant.' },
      { key: 'viewOnceAutoForward', label: 'Auto Forward View Once', type: 'bool', default: false, help: 'Automatically forward incoming view-once media to the selected destination.' },
      { key: 'viewOnceDestination', label: 'View Once Destination', type: 'select', default: 'self', options: ['self', 'chat'], help: 'Send recovered view-once media to your self chat or the original chat.' }
    ]
  }
];

/* flat lookup */
const FIELDS = {};
SCHEMA.forEach(g => g.items.forEach(i => { FIELDS[i.key] = i; }));

let _defaultsSnap = null;
function defaults() {
  if (_defaultsSnap) return { ..._defaultsSnap };
  const out = {};
  for (const [k, f] of Object.entries(FIELDS)) out[k] = f.default;
  _defaultsSnap = out;
  return { ...out };
}

/** Merge stored settings over the defaults. */
function resolve(stored = {}) {
  const out = defaults();
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      if (k in FIELDS) out[k] = v;
    }
  }
  return out;
}

/**
 * Validate and coerce a single incoming value.
 * Returns { ok, value, error }
 */
function coerce(key, raw) {
  const f = FIELDS[key];
  if (!f) return { ok: false, error: 'Unknown setting' };

  if (f.type === 'bool') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    if (raw === 'true' || raw === 1 || raw === '1')  return { ok: true, value: true };
    if (raw === 'false' || raw === 0 || raw === '0') return { ok: true, value: false };
    return { ok: false, error: 'Must be true or false' };
  }

  if (f.type === 'select') {
    const v = String(raw);
    if (!f.options.includes(v)) return { ok: false, error: `Must be one of ${f.options.join(', ')}` };
    return { ok: true, value: v };
  }

  /* text */
  const v = String(raw ?? '').trim();
  if (!v) return { ok: false, error: 'Cannot be empty' };
  if (f.max && [...v].length > f.max) return { ok: false, error: `Maximum ${f.max} characters` };
  if (key === 'prefix' && /\s/.test(v)) return { ok: false, error: 'Prefix cannot contain spaces' };
  return { ok: true, value: v };
}

/** Validate a whole patch object. */
function validatePatch(patch = {}) {
  const clean = {};
  const errors = {};
  for (const [k, v] of Object.entries(patch)) {
    const r = coerce(k, v);
    if (r.ok) clean[k] = r.value; else errors[k] = r.error;
  }
  return { clean, errors, hasErrors: Object.keys(errors).length > 0 };
}

/* ---------------------------------------------------------------
   PANEL PASSWORD
   --------------------------------------------------------------- */
const WORDS = [
  'ghost', 'shadow', 'phantom', 'spectre', 'wraith', 'nova', 'onyx', 'raven',
  'falcon', 'cobra', 'viper', 'tiger', 'lotus', 'ember', 'frost', 'storm',
  'blaze', 'quartz', 'cosmic', 'lunar', 'solar', 'nebula', 'orbit', 'zenith'
];

/**
 * Produces passwords like  40201-92020
 * Numbers only format for easy typing on mobile keyboards.
 */
function generatePassword() {
  let block1 = '';
  for (let i = 0; i < 5; i++) block1 += crypto.randomInt(10);
  let block2 = '';
  for (let i = 0; i < 5; i++) block2 += crypto.randomInt(10);
  return `${block1}-${block2}`;
}

/* Passwords are stored hashed; the plaintext only ever goes to the owner. */
function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw) + '::ghost-mini-ofc').digest('hex');
}

function verifyPassword(pw, hash) {
  if (!pw || !hash) return false;
  const a = Buffer.from(hashPassword(pw));
  const b = Buffer.from(String(hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------
   PERSISTENCE
   --------------------------------------------------------------- */
const norm = (n) => String(n || '').replace(/[^0-9]/g, '');

/** Find the session record belonging to a phone number. */
function findByNumber(number) {
  const n = norm(number);
  if (!n) return null;
  return db.allSessions()
    .filter(s => norm(s.number) === n && s.panelPassword)
    // Prefer the live/newest record when an old pairing exists for a number.
    .sort((a, b) => {
      const connected = (s) => s.status === 'connected' ? 1 : 0;
      return connected(b) - connected(a)
        || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })[0] || null;
}

async function getSettings(sessionId) {
  const s = await db.getSession(sessionId);
  return resolve(s?.settings);
}

async function saveSettings(sessionId, patch) {
  const current = await db.getSession(sessionId);
  const merged = { ...resolve(current?.settings), ...patch };
  await db.saveSession(sessionId, { settings: merged });
  return merged;
}

/** Called on every successful connect: issue a fresh panel password. */
async function issuePassword(sessionId, number) {
  const plain = generatePassword();
  await db.saveSession(sessionId, {
    number: norm(number),
    panelPassword: hashPassword(plain),
    panelPasswordSetAt: new Date().toISOString()
  });
  // Make the replacement durable immediately, not only after the debounce.
  await db.flush(true).catch(() => {});
  return plain;
}

module.exports = {
  SCHEMA, FIELDS, defaults, resolve,
  coerce, validatePatch,
  generatePassword, hashPassword, verifyPassword,
  findByNumber, getSettings, saveSettings, issuePassword,
  norm
};
