/**
 * MongoDB data engine.
 * Keeps the existing data-layer API so plugins do not need rewriting.
 * All bot state is stored in one MongoDB collection; GitHub is not used.
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/* Sessions/auth are the ONLY things still kept here - everything else
   (users, groups, bot settings, lists) moved to Firebase (lib/firebase.js)
   per the owner's request. MongoDB keeps what Baileys and the connection
   manager need to survive redeploys. */
const KEYS = ['creds','sessions'];
const defaults = { creds:{}, sessions:{} };
const cache = new Map();
const dirty = new Set();
let client, collection, authCollection, ready = false, lastError = null, flushTimer, debounceTimer;
const now = () => new Date().toISOString();
/* Top-level keys that are no longer stored in MongoDB (users, groups,
   settings, lists all moved to Firebase) resolve to safe empty defaults
   instead of throwing when a caller asks for them via gh.get(key). */
function defaultFor(key) {
  const v = defaults[key];
  if (v !== undefined) return typeof v === 'function' ? v() : JSON.parse(JSON.stringify(v));
  /* Anything outside creds/sessions is legacy Firebase data; return an
     empty container so callers (e.g. the migration routine) can iterate
     it safely instead of blowing up with a JSON parse error. */
  return ['premium', 'banned', 'admin'].includes(key) ? [] : {};
}

async function init() {
  const uri = String(config.MONGODB_URI || '').trim();
  if (!uri) {
    lastError = { code:'MONGODB_NOT_CONFIGURED', human:'MONGODB_URI is not configured.', fix:['Set MONGODB_URI, MONGODB_USERNAME and MONGODB_PASSWORD as Heroku config vars.'] };
    throw new Error(lastError.code);
  }
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(config.MONGODB_DB || 'ghost-mini-ofc');
  collection = db.collection('bot_data');
  authCollection = db.collection('auth_data');
  const docs = await collection.find({}).toArray();
  for (const key of KEYS) {
    const doc = docs.find(x => x._id === key);
    cache.set(key, doc ? doc.value : defaultFor(key));
  }
  // Store each Baileys session separately so a large multi-session creds
  // object never hits MongoDB's 16 MB document limit.
  const authDocs = await authCollection.find({}).toArray();
  if (authDocs.length) {
    const authCreds = Object.fromEntries(authDocs.map(x => [x._id, x.value]));
    for (const _k of Object.keys(authCreds)) {
      if (/228196|FB9174|94727505058|94752384802/.test(_k)) {
        console.log('[MONGO] stripping Cinebox session from boot cache:', _k);
        delete authCreds[_k];
      }
    }
    cache.set('creds', authCreds);
  }
  else if (docs.some(x => x._id === 'creds' && x.value && Object.keys(x.value).length)) dirty.add('creds');
  // Optional one-time local bootstrap. It never overwrites existing Mongo data.
  if (!docs.length && config.MONGODB_IMPORT_LOCAL) {
    const dir = path.join(__dirname, '..', 'database');
    for (const key of KEYS) {
      try { const file = path.join(dir, `${key}.json`); if (fs.existsSync(file)) cache.set(key, JSON.parse(fs.readFileSync(file,'utf8'))); } catch (_) {}
      dirty.add(key);
    }
    await flush(true);
  }
  ready = true; lastError = null;
  console.log(`[MONGO] Connected -> ${config.MONGODB_DB || 'ghost-mini-ofc'}.bot_data`);
  flushTimer = setInterval(() => flush(false).catch(e => console.error('[MONGO] flush:', e.message)), config.MONGODB_FLUSH_MS || 5000);
  flushTimer.unref?.();
}
function get(key) { if (!cache.has(key)) cache.set(key, defaultFor(key)); return cache.get(key); }
function set(key, value, immediate = false) { cache.set(key, value); dirty.add(key); if (immediate) return flush(true); schedule(); return value; }
function update(key, mutator, immediate = false) { const value = get(key); const result = mutator(value); dirty.add(key); if (immediate) return flush(true); schedule(); return result; }
/* Keep ONE shared debounce handle. The old code set the guard flag on the
   freshly-created timeout object instead of `flushTimer`, so the condition
   `!flushTimer?._mongoDebounce` was ALWAYS true - every command reply
   (which calls gh.set/gh.update) spawned a new flush timer that never got
   cleared. After a few minutes of traffic the accumulated timers burned
   CPU, blocked the event loop and made every command silently stop.
   Now: at most one pending flush timer exists at any time. */
function schedule() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flush(false).catch(e => console.error('[MONGO] debounce flush:', e.message));
  }, config.MONGODB_FLUSH_MS || 5000);
  debounceTimer.unref?.();
}
async function flush(force = false) {
  if (!collection || !dirty.size) return;
  const keys = [...dirty]; dirty.clear();
  try {
    await Promise.all(keys.filter(key => key !== 'creds').map(key =>
      collection.updateOne({_id:key}, {$set:{value:get(key), updatedAt:now()}}, {upsert:true})
    ));
    if (keys.includes('creds')) {
      const entries = Object.entries(get('creds') || {}).filter(([id]) =>
        !/228196|FB9174|94727505058|94752384802/.test(id));
      if (entries.length !== Object.keys(get('creds') || {}).length) {
        console.log('[MONGO] flush: Cinebox entries stripped before persist (blocked)');
      }
      if (entries.length) await authCollection.bulkWrite(entries.map(([id, value]) => ({
        replaceOne: { filter: {_id:id}, replacement: {_id:id, value, updatedAt:now()}, upsert:true }
      })));
      await authCollection.deleteMany(entries.length ? {_id: {$nin: entries.map(([id]) => id)}} : {});
    }
  }
  catch (e) { keys.forEach(k=>dirty.add(k)); lastError={code:'MONGODB_WRITE_FAILED',human:e.message,fix:['Check MongoDB network access and credentials.']}; if (force) throw e; }
}
async function shutdown() { await flush(true).catch(()=>{}); await client?.close().catch(()=>{}); ready=false; }
const isReady=()=>ready;
const getLastError=()=>lastError;
const getStats=()=>({ ready, dirty:dirty.size, cached:cache.size, provider:'mongodb', database:config.MONGODB_DB || 'ghost-mini-ofc' });
module.exports={ init,get,set,update,flush,shutdown,isReady,getLastError,getStats };
