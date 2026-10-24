/**
 * ==========================================================
 *  DIAGNOSTICS RECORDER - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *  © POWERD BY LAKSHAN X MD </>
 * ==========================================================
 *
 *  Keeps a rolling, in-memory record of what actually went wrong
 *  inside the bot, so the .support command can answer questions
 *  about REAL errors instead of guessing.
 *
 *  Nothing is written to disk or GitHub: this is deliberately
 *  ephemeral (a restart clears it) and capped, so it can never
 *  grow into a memory leak or leak a user's message content.
 */
const os = require('os');

const MAX_ERRORS = 60;       // keep the newest N errors
const MAX_EVENTS = 40;       // keep the newest N lifecycle events

const errors = [];           // { at, scope, name, message, count }
const events = [];           // { at, type, detail }
const counters = {
  commandsRun: 0,
  commandsFailed: 0,
  messagesSeen: 0,
  pairAttempts: 0,
  pairSuccess: 0,
  pairFailed: 0,
  reconnects: 0,
  channelReactions: 0,
  channelFollows: 0
};

const startedAt = Date.now();

/** Strip anything that could identify a user or leak a secret. */
function scrub(text) {
  return String(text || '')
    .replace(/\b\d{9,15}@s\.whatsapp\.net\b/g, '<jid>')
    .replace(/\b\d{10,20}-?\d*@g\.us\b/g, '<group>')
    .replace(/\b(gsk_|ghp_|github_pat_|sk-)[A-Za-z0-9_-]{10,}/g, '<redacted-key>')
    .replace(/Bearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer <redacted>')
    .slice(0, 400);
}

/**
 * Record an error. Identical errors are collapsed into one entry
 * with a counter, so one broken command cannot flood the buffer.
 */
function recordError(scope, err, extra = '') {
  try {
    const name = err?.name || 'Error';
    const message = scrub(err?.message || err);
    const key = `${scope}|${name}|${message}`;
    const existing = errors.find(e => e.key === key);
    if (existing) {
      existing.count++;
      existing.at = Date.now();
      return;
    }
    errors.unshift({
      key, at: Date.now(), scope: String(scope).slice(0, 40),
      name, message, extra: scrub(extra), count: 1
    });
    if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS;
  } catch (_) {}
}

/** Record a notable lifecycle event (connect, pair, restart...). */
function recordEvent(type, detail = '') {
  try {
    events.unshift({ at: Date.now(), type: String(type).slice(0, 40), detail: scrub(detail) });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  } catch (_) {}
}

const bump = (key, n = 1) => { if (key in counters) counters[key] += n; };

const ago = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

function recentErrors(limit = 12) {
  return errors.slice(0, limit).map(e => ({
    when: ago(e.at), scope: e.scope, name: e.name,
    message: e.message, occurrences: e.count
  }));
}

function recentEvents(limit = 10) {
  return events.slice(0, limit).map(e => ({ when: ago(e.at), type: e.type, detail: e.detail }));
}

/** A compact health snapshot used by .support and .health. */
function snapshot() {
  let sessions = { active: 0, connected: 0 };
  try {
    const { sessions: live } = require('./connection');
    sessions.active = live.size;
    for (const s of live.values()) if (s.status === 'connected') sessions.connected++;
  } catch (_) {}

  let commands = { total: 0, categories: 0 };
  try { commands = require('./command').stats(); } catch (_) {}

  let database = 'unknown';
  let databaseIssue = null;
  try {
    const db = require('./database');
    database = db.isConnected() ? 'connected' : 'offline';
    const e = db.getLastError && db.getLastError();
    if (e) databaseIssue = { code: e.code, problem: e.human };
  } catch (_) {}

  let waVersion = null;
  try { waVersion = require('./waversion').info(); } catch (_) {}

  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.round(process.uptime()),
    uptimeSinceBoot: ago(startedAt),
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    memoryUsedMb: +(mem.rss / 1048576).toFixed(1),
    heapUsedMb: +(mem.heapUsed / 1048576).toFixed(1),
    systemFreeMb: +(os.freemem() / 1048576).toFixed(1),
    sessions,
    commands,
    database,
    databaseIssue,
    waWebVersion: waVersion?.version || null,
    waVersionSource: waVersion?.source || null,
    counters: { ...counters },
    errorCount: errors.length,
    recentErrors: recentErrors(12),
    recentEvents: recentEvents(8)
  };
}

function clear() {
  errors.length = 0;
  events.length = 0;
  for (const k of Object.keys(counters)) counters[k] = 0;
}

module.exports = { recordError, recordEvent, bump, snapshot, recentErrors, recentEvents, clear, counters, ago };
