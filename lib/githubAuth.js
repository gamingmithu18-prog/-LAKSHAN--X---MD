/**
 * useGitHubAuthState - Baileys auth state persisted in GitHub creds.json
 * 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *
 * Baileys writes signal keys constantly. Every write goes to RAM
 * immediately (so the socket never waits) and MongoDB adapter debounces the
 * actual commit, batching hundreds of key writes into one push.
 *
 * Layout inside creds.json:
 *   { "<sessionId>": { creds: {...}, keys: { "<type>-<id>": {...} } } }
 */
const { proto, initAuthCreds, BufferJSON } = require('baileys');
const gh = require('./mongodb');

const enc = (v) => JSON.parse(JSON.stringify(v, BufferJSON.replacer));
const dec = (v) => JSON.parse(JSON.stringify(v), BufferJSON.reviver);

/**
 * One live auth instance per session.
 *
 * Every startSession() used to build a fresh `creds` object. When a
 * reconnect or the 515 restart overlapped the original pairing socket,
 * two instances existed at once and whichever called saveCreds() last
 * won. A stale instance therefore overwrote `me` and `pairingCode` that
 * requestPairingCode() had just written, leaving exactly
 * { me: null, pairingCode: null, pairingEphemeralKeyPair: set } - which
 * makes companion_finish impossible and the phone reports
 * "Couldn't link device".
 *
 * Sharing one instance per sessionId removes the race entirely.
 */
const instances = new Map();

function bucket(sessionId) {
  const db = gh.get('creds');
  if (!db[sessionId]) db[sessionId] = { creds: null, keys: {} };
  if (!db[sessionId].keys) db[sessionId].keys = {};
  return db[sessionId];
}

async function useGitHubAuthState(sessionId) {
  const existing = instances.get(sessionId);
  if (existing) return existing;

  const store = bucket(sessionId);

  let creds = store.creds ? dec(store.creds) : initAuthCreds();

  /* Discard a half-finished pairing.
     requestPairingCode() writes a PLACEHOLDER `me` ({ id, name: '~' })
     before the account exists. If that state is ever reused, Baileys
     sees `creds.me` and sends a LOGIN node for an account that was never
     linked - WhatsApp answers 401/device_removed and every later attempt
     on this session fails with "Couldn't link device".
     `account` is written only by a genuinely successful pairing, so
     me-without-account means: throw it away and start clean.
     This runs only when no live instance exists for the session, so it
     can never interrupt a pairing that is currently in progress. */
  if (creds.me && !creds.account) {
    console.log(`[AUTH] ${sessionId}: discarding incomplete pairing state (never linked)`);
    creds = initAuthCreds();
    store.creds = null;
    store.keys = {};
  }

  if (!store.creds) {
    store.creds = enc(creds);
    gh.set('creds', gh.get('creds'), true);
  }

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const b = bucket(sessionId);
        const out = {};
        for (const id of ids) {
          let val = b.keys[`${type}-${id}`];
          if (val) {
            val = dec(val);
            if (type === 'app-state-sync-key') val = proto.Message.AppStateSyncKeyData.fromObject(val);
          }
          out[id] = val;
        }
        return out;
      },
      set: async (data) => {
        const b = bucket(sessionId);
        let touched = false;
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            const k = `${category}-${id}`;
            if (value) b.keys[k] = enc(value); else delete b.keys[k];
            touched = true;
          }
        }
        if (touched) gh.set('creds', gh.get('creds'));   // debounced commit
      }
    }
  };

  const handle = {
    state,
    saveCreds: async () => {
      const b = bucket(sessionId);
      b.creds = enc(creds);
      gh.set('creds', gh.get('creds'));                  // debounced commit
    },

    /**
     * Snapshot the CURRENT live creds and push them immediately.
     * Used right before the 515 restart: WhatsApp mutates `creds` in
     * place when it accepts a pairing, and that final mutation can land
     * after (or instead of) the last creds.update event. Reading the
     * live object here guarantees registered/me/account are persisted,
     * otherwise the rebuilt socket starts unregistered and the phone
     * hangs on "Logging in".
     */
    flushNow: async () => {
      const b = bucket(sessionId);
      b.creds = enc(creds);
      gh.set('creds', gh.get('creds'), true);
      try { await gh.flush(true); } catch (_) {}
      /* What proves a link actually happened?
           - `me`         : NO. requestPairingCode() writes a placeholder
                            `me` before anything is linked.
           - `registered` : NO. It is set at the companion_finish stage,
                            which happens before the account is issued.
           - `account`    : YES. Only configureSuccessfulPairing() writes
                            it, and it does so for pairing-code AND QR.
         Using the weaker signals made the bot restart the socket with
         half-finished credentials, which WhatsApp answers with 401 and
         the phone shows "Couldn't link device". */
      return !!creds.account;
    },

    /** live view, for logging/diagnostics */
    peek: () => creds,
    clearState: async () => {
      instances.delete(sessionId);
      gh.update('creds', (db) => { delete db[sessionId]; }, true);
    }
  };

  instances.set(sessionId, handle);
  return handle;
}

async function deleteSessionData(sessionId) {
  instances.delete(sessionId);
  gh.update('creds', (db) => { delete db[sessionId]; }, true);
}

/** Drop the cached instance without touching stored data. */
function releaseSession(sessionId) {
  instances.delete(sessionId);
}

module.exports = { useGitHubAuthState, deleteSessionData, releaseSession };
