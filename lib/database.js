/**
 * DATA LAYER - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *
 * Two storage engines behind one stable API:
 *   - Firebase Realtime DB (lib/firebase.js) : users, groups, global bot
 *     settings, command stats, banned/premium/admin lists.
 *   - MongoDB (lib/mongodb.js)               : Baileys auth creds + the
 *     session registry (what the connection manager needs).
 * No plugin needed rewriting.
 */
const gh = require('./mongodb');          // session + creds engine
const fb = require('./firebase');         // settings engine
const config = require('../config');

const now = () => new Date().toISOString();
const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0];

/* ============================================================
   CONNECT
   ============================================================ */
async function connectDB() {
  /* Connect both engines independently - one failure should not prevent
     the other from working. The bot needs at least MongoDB for sessions. */
  let fbOk = false, ghOk = false;
  try {
    await fb.init();
    fbOk = true;
  } catch (e) {
    console.error('[DB] ❌ Firebase connection failed:', e.message);
    console.error('[DB]    Bot will use defaults for users/groups/settings.');
  }
  try {
    await gh.init();
    ghOk = true;
  } catch (e) {
    console.error('[DB] ❌ MongoDB connection failed:', e.message);
    console.error('[DB]    Sessions CANNOT be restored without MongoDB!');
  }
  if (!fbOk && !ghOk) {
    throw new Error('Both Firebase and MongoDB failed to connect. Bot cannot function.');
  }
  if (fbOk && ghOk) {
    await migrateFromMongoToFirebase().catch(e => console.warn('[DB] firebase migration skipped:', e.message));
  }
  console.log(`[DB] ✅ Database ready (Firebase: ${fbOk ? 'connected' : 'OFFLINE'}, MongoDB: ${ghOk ? 'connected' : 'OFFLINE'})`);
  return true;
}

const isConnected = () => fb.isReady() || gh.isReady();
const getLastError = () => fb.getLastError() || gh.getLastError();

/* ============================================================
   USERS
   ============================================================ */
function blankUser(jid, name = '') {
  return {
    jid,
    number: numOf(jid),
    name,
    commandCount: 0,
    lastCommand: null,
    warns: 0,
    economy: { balance: 1000, bank: 0, lastDaily: null, lastWork: null, lastRob: null, xp: 0, level: 1 },
    afk: { active: false, reason: '', since: null },
    firstSeen: now(),
    lastSeen: now()
  };
}

/** Returns a live object; call .save() to persist. */
function wrapUser(jid, raw) {
  const obj = { ...raw };
  Object.defineProperty(obj, 'save', {
    enumerable: false,
    value: async function () {
      fb.update('user', (db) => {
        const { save, banned, premium, ...clean } = this;
        db[jid] = { ...clean, lastSeen: now() };
      });
      if (this.banned !== undefined) setBanned(jid, this.banned);
      if (this.premium !== undefined) setPremium(jid, this.premium);
      return this;
    }
  });
  obj.banned = isBanned(jid);
  obj.premium = isPremium(jid);
  return obj;
}

async function getUser(jid, name = '') {
  if (!jid) return null;
  const db = fb.get('user');
  if (!db[jid]) {
    fb.update('user', (u) => { u[jid] = blankUser(jid, name); });
  } else if (name && db[jid].name !== name) {
    fb.update('user', (u) => { u[jid].name = name; });
  }
  return wrapUser(jid, fb.get('user')[jid]);
}

function allUsers() {
  return Object.entries(fb.get('user')).map(([jid, u]) => ({ ...u, jid, banned: isBanned(jid), premium: isPremium(jid) }));
}

/* ---------- banned / premium / admin lists ---------- */
const listHas = (key, jid) => {
  const n = numOf(jid);
  return fb.get(key).some(x => numOf(x) === n);
};
function listAdd(key, jid) {
  const n = numOf(jid);
  fb.update(key, (arr) => { if (!arr.some(x => numOf(x) === n)) arr.push(n); }, true);
}
function listRemove(key, jid) {
  const n = numOf(jid);
  fb.update(key, (arr) => arr.filter(x => numOf(x) !== n), true);
}

const isBanned  = (jid) => listHas('banned', jid);
const isPremium = (jid) => listHas('premium', jid);
const isAdmin   = (jid) => listHas('admin', jid) || config.OWNER_NUMBERS.includes(numOf(jid));

const setBanned  = (jid, v) => v ? listAdd('banned', jid)  : listRemove('banned', jid);
const setPremium = (jid, v) => v ? listAdd('premium', jid) : listRemove('premium', jid);
const setAdmin   = (jid, v) => v ? listAdd('admin', jid)   : listRemove('admin', jid);

const bannedList  = () => fb.get('banned');
const premiumList = () => fb.get('premium');
const adminList   = () => fb.get('admin');

/* ============================================================
   GROUPS
   ============================================================ */
function blankGroup(jid, name = '') {
  return {
    jid, name,
    antilink: false, antilinkAction: 'delete',
    antibadword: false, antibot: false, antisticker: false,
    welcome: false, welcomeText: '',
    goodbye: false, goodbyeText: '',
    mute: false, nsfw: false, autoSticker: false,
    filters: {},
    createdAt: now()
  };
}

function wrapGroup(jid, raw) {
  const obj = { ...raw };
  Object.defineProperty(obj, 'save', {
    enumerable: false,
    value: async function () {
      fb.update('groups', (db) => {
        const { save, ...clean } = this;
        db[jid] = clean;
      });
      return this;
    }
  });
  return obj;
}

async function getGroup(jid, name = '') {
  if (!jid) return null;
  if (!fb.get('groups')[jid]) fb.update('groups', (g) => { g[jid] = blankGroup(jid, name); });
  else if (name && fb.get('groups')[jid].name !== name) fb.update('groups', (g) => { g[jid].name = name; });
  return wrapGroup(jid, fb.get('groups')[jid]);
}

/* ============================================================
   SETTINGS  +  COMMAND STATS  (Firebase)
   ============================================================ */
async function getSetting(key, def = null) {
  const s = fb.get('settings');
  return key in s ? s[key] : def;
}
async function setSetting(key, value) {
  fb.update('settings', (s) => { s[key] = value; });
  return value;
}

async function bumpCommand(jid, cmd) {
  try {
    fb.update('user', (db) => {
      if (!db[jid]) db[jid] = blankUser(jid);
      db[jid].commandCount = (db[jid].commandCount || 0) + 1;
      db[jid].lastCommand = cmd;
      db[jid].lastSeen = now();
    });
    fb.update('settings', (s) => {
      if (!s._commandStats) s._commandStats = {};
      s._commandStats[cmd] = (s._commandStats[cmd] || 0) + 1;
    });
  } catch (_) {}
}

function commandStats() {
  const s = fb.get('settings')._commandStats || {};
  return Object.entries(s).map(([command, count]) => ({ command, count })).sort((a, b) => b.count - a.count);
}

/* ============================================================
   PER-SESSION SETTINGS + SCHEDULES  (Firebase, keyed by session id)
   The panel password / status metadata stay in the MongoDB registry.
   ============================================================ */
function fbSessionDoc(sessionId) {
  const db = fb.get('sessions');
  if (!db[sessionId]) db[sessionId] = { settings: {} };
  if (db[sessionId].settings == null) db[sessionId].settings = {};
  if (!Array.isArray(db[sessionId].schedules)) db[sessionId].schedules = [];
  return db[sessionId];
}

async function getSession(sessionId) {
  /* Mongo registry doc is the source of truth for status/number/jid;
     settings + schedules are merged in from Firebase. */
  const mongo = gh.get('sessions')[sessionId] || null;
  const fbDoc = fb.get('sessions')[sessionId] || null;
  if (!mongo && !fbDoc) return null;
  return {
    ...(fbDoc ? { settings: fbDoc.settings, schedules: fbDoc.schedules } : {}),
    ...(mongo || {}),
    sessionId
  };
}
async function saveSession(sessionId, patch) {
  gh.update('sessions', (db) => {
    db[sessionId] = { ...(db[sessionId] || {}), ...patch, sessionId, updatedAt: now() };
  }, true);
  /* settings/schedules move to Firebase; keep the mongo doc lean. */
  const { settings, schedules, ...rest } = patch;
  if (settings !== undefined || schedules !== undefined) {
    fb.update('sessions', (db) => {
      const doc = fbSessionDoc(sessionId);
      if (settings !== undefined) doc.settings = settings;
      if (schedules !== undefined) doc.schedules = schedules;
      db[sessionId] = doc;
    }, true);
  }
  return true;
}
async function deleteSession(sessionId) {
  gh.update('sessions', (db) => { delete db[sessionId]; }, true);
  gh.update('creds', (db) => { delete db[sessionId]; }, true);
  fb.update('sessions', (db) => { delete db[sessionId]; }, true);
  return true;
}
function allSessions() {
  const out = [];
  const seen = new Set();
  for (const s of Object.values(gh.get('sessions'))) { if (!seen.has(s.sessionId)) { seen.add(s.sessionId); out.push(s); } }
  for (const [id, fbDoc] of Object.entries(fb.get('sessions'))) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ sessionId: id, settings: fbDoc.settings || {}, schedules: fbDoc.schedules || [] });
  }
  return out;
}

/* ============================================================
   COMPAT SHIMS
   Plugins were written against Mongoose models. These provide the
   handful of query methods those plugins actually call.
   ============================================================ */
function sortBy(arr, spec) {
  const [field, dir] = Object.entries(spec || {})[0] || [];
  if (!field) return arr;
  const pick = (o) => {
    const v = field.split('.').reduce((a, k) => (a || {})[k], o);
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const t = Date.parse(v);                 // ISO date strings sort chronologically
    return Number.isNaN(t) ? String(v) : t;
  };
  return [...arr].sort((a, b) => {
    const x = pick(a), y = pick(b);
    const c = (typeof x === 'string' || typeof y === 'string') ? String(x).localeCompare(String(y)) : x - y;
    return dir === 1 ? c : -c;
  });
}

function matches(item, q = {}) {
  return Object.entries(q).every(([k, v]) => {
    const val = k.split('.').reduce((a, kk) => (a || {})[kk], item);
    if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(val);
    return val === v;
  });
}

function makeQuery(getAll) {
  return function find(q = {}) {
    let rows = getAll().filter(r => matches(r, q));
    const chain = {
      sort(s) { rows = sortBy(rows, s); return chain; },
      limit(n) { rows = rows.slice(0, n); return chain; },
      lean() { return Promise.resolve(rows); },
      then(res, rej) { return Promise.resolve(rows).then(res, rej) }
    };
    return chain;
  };
}

const User = {
  find: makeQuery(allUsers),
  findOne: async (q = {}) => {
    const hit = allUsers().find(u => matches(u, q));
    return hit ? wrapUser(hit.jid, fb.get('user')[hit.jid]) : null;
  },
  countDocuments: async (q = {}) => allUsers().filter(u => matches(u, q)).length,
  updateOne: async (q, upd) => {
    const jid = q.jid;
    if (!jid) return;
    fb.update('user', (db) => {
      if (!db[jid]) db[jid] = blankUser(jid);
      if (upd.$inc) for (const [k, v] of Object.entries(upd.$inc)) db[jid][k] = (db[jid][k] || 0) + v;
      if (upd.$set) Object.assign(db[jid], upd.$set);
    });
  }
};

const Group = {
  find: makeQuery(() => Object.values(fb.get('groups'))),
  findOne: async (q = {}) => {
    const hit = Object.values(fb.get('groups')).find(g => matches(g, q));
    return hit ? wrapGroup(hit.jid, hit) : null;
  },
  countDocuments: async () => Object.keys(fb.get('groups')).length
};

const Session = {
  find: makeQuery(allSessions),
  findOne: (q = {}) => {
    const hit = allSessions().find(s => matches(s, q));
    const chain = { lean: () => Promise.resolve(hit || null), then: (r, j) => Promise.resolve(hit || null).then(r, j) };
    return chain;
  },
  countDocuments: async (q = {}) => allSessions().filter(s => matches(s, q)).length,
  updateOne: async (q, upd) => saveSession(q.sessionId, upd.$set || {}),
  deleteOne: async (q) => deleteSession(q.sessionId)
};

const Stat = {
  find: makeQuery(commandStats),
  updateOne: async () => {}
};

/* anti-delete is memory only - it expires in 24h and must never spam writes */
const antiDeleteStore = new Map();
setInterval(() => {
  const cutoff = Date.now() - 86400000;
  for (const [k, v] of antiDeleteStore) if (v._t < cutoff) antiDeleteStore.delete(k);
}, 600000).unref?.();

const AntiDelete = {
  create: async (doc) => { antiDeleteStore.set(doc.msgId, { ...doc, _t: Date.now() }); return doc; },
  findOne: async (q) => antiDeleteStore.get(q.msgId) || null,
  deleteOne: async (q) => { if (q.msgId) antiDeleteStore.delete(q.msgId); else for (const [k, v] of antiDeleteStore) if (v === q._id) antiDeleteStore.delete(k); },
  deleteMany: async () => { const n = antiDeleteStore.size; antiDeleteStore.clear(); return { deletedCount: n }; },
  countDocuments: async () => antiDeleteStore.size
};

const Setting = {
  findOne: async (q) => { const s = fb.get('settings'); return q.key in s ? { key: q.key, value: s[q.key] } : null; },
  updateOne: async (q, upd) => setSetting(q.key, upd.$set?.value)
};

/* ============================================================
   ONE-TIME MIGRATION  GitHub/Mongo -> Firebase
   Runs at boot. Only imports data that Firebase does not have yet,
   so it can never overwrite newer settings written from the panel.
   ============================================================ */
async function migrateFromMongoToFirebase() {
  try {
    const firebaseReady = fb.isReady();
    const mongoReady = gh.isReady();
    if (!firebaseReady || !mongoReady) return;

    /* Firebase buckets are seeded only when empty (fresh deployment).
       This mirrors the old one-time local bootstrap behaviour. */
    const fbEmpty = Object.keys(fb.get('settings')).length === 0
      && Object.keys(fb.get('user')).length === 0
      && Object.keys(fb.get('groups')).length === 0;
    if (!fbEmpty) {
      /* Still move the *session-embedded* settings/schedules to Firebase so
         the new storage layout applies even when global buckets exist. */
      for (const [sessionId, s] of Object.entries(gh.get('sessions'))) {
        if (s.settings || Array.isArray(s.schedules)) {
          fb.update('sessions', (db) => {
            const doc = fbSessionDoc(sessionId);
            if (s.settings !== undefined) doc.settings = { ...doc.settings, ...s.settings };
            if (Array.isArray(s.schedules)) doc.schedules = s.schedules;
            db[sessionId] = doc;
          }, true);
          gh.update('sessions', (db) => {
            if (db[sessionId]) { delete db[sessionId].settings; delete db[sessionId].schedules; }
          }, true);
        }
      }
      if (fb.isReady()) await fb.flush(true).catch(() => {});
      return;
    }

    console.log('[DB] Importing legacy GitHub/Mongo data into Firebase...');
    for (const key of ['user', 'premium', 'banned', 'admin', 'groups', 'settings']) {
      const value = gh.get(key);
      if (value && Object.keys(value).length) {
        try {
          fb.set(key, value);
          console.log(`[DB]   migrated ${key} (${Object.keys(value).length} entries)`);
        } catch (e) {
          console.error(`[DB]   migration step failed at key '${key}':`, e.message);
          if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
          throw e;
        }
      }
    }
    /* Session-embedded settings/schedules move under fb/sessions/<id>. */
    for (const [sessionId, s] of Object.entries(gh.get('sessions'))) {
      if (s.settings || Array.isArray(s.schedules)) {
        fb.update('sessions', (db) => {
          const doc = fbSessionDoc(sessionId);
          if (s.settings !== undefined) doc.settings = { ...doc.settings, ...s.settings };
          if (Array.isArray(s.schedules)) doc.schedules = s.schedules;
          db[sessionId] = doc;
        }, true);
        gh.update('sessions', (db) => {
          if (db[sessionId]) { delete db[sessionId].settings; delete db[sessionId].schedules; }
        }, true);
      }
    }
    await fb.flush(true).catch(() => {});
    console.log('[DB] Migration into Firebase complete.');
  } catch (e) {
    console.error('[DB] Firebase migration failed (will retry on next boot):', e && e.stack || e.message);
  }
}

module.exports = {
  connectDB, isConnected, getLastError,
  gh, fb, flush: async () => { await fb.flush(true).catch(() => {}); await gh.flush(true).catch(() => {}); },
  shutdown: async () => { await fb.shutdown().catch(() => {}); await gh.shutdown().catch(() => {}); },
  getStats: () => ({ ready: isConnected(), mongo: gh.getStats(), firebase: fb.getStats() }),

  getUser, allUsers, getGroup,
  getSetting, setSetting, bumpCommand, commandStats,
  getSession, saveSession, deleteSession, allSessions,

  isBanned, isPremium, isAdmin,
  setBanned, setPremium, setAdmin,
  bannedList, premiumList, adminList,

  /* mongoose-compatible shims */
  User, Group, Session, Stat, AntiDelete, Setting
};
