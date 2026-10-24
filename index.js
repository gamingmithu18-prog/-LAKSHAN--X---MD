/**
 * ==========================================================
 *  𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *  Ultra fast modern multi-device WhatsApp bot
 *  © POWERD BY LAKSHAN X MD </>
 * ==========================================================
 */
process.env.TZ = process.env.TZ || 'Asia/Colombo';

/* --- VPS-only deployment lock (must run before anything else) --- */
require('./lib/vpslock').enforceVpsOnly();

const path = require('path');
const config = require('./config');
const db = require('./lib/database');
const diag = require('./lib/diag');
const { loadPlugins, stats } = require('./lib/command');
const { restoreSessions } = require('./lib/connection');
const { loadRemembered } = require('./lib/waversion');
const startServer = require('./server');
const keepalive = require('./lib/keepalive');

const banner = `
╔══════════════════════════════════════════════╗
║            𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃                ║
║      Ultra Fast Modern WhatsApp Bot          ║
║      © POWERD BY LAKSHAN X MD </>            ║
╚══════════════════════════════════════════════╝`;

async function boot() {
  console.log(banner);
  console.log(`[BOOT] Node ${process.version} | TZ ${process.env.TZ}`);

  /* Environment check - show what's configured */
  console.log('[BOOT] Environment check:');
  console.log(`  MONGODB_URI     : ${process.env.MONGODB_URI ? '✅ configured' : '❌ NOT SET - database will fail'}`);
  console.log(`  FIREBASE_SA_JSON: ${process.env.FIREBASE_SA_JSON ? '✅ configured' : '❌ NOT SET - database will fail'}`);
  console.log(`  GROQ_API_KEY    : ${process.env.GROQ_API_KEY ? '✅ configured' : '⚠️  not set'}`);
  console.log(`  MODE            : ${config.MODE}`);
  console.log(`  PREFIX          : ${config.PREFIX}`);
  console.log(`  MULTI_PREFIX    : ${config.MULTI_PREFIX}`);

  /* Keep an observable process heartbeat. This prevents accidental process
     exits and makes Heroku logs show that the app is alive every 90 seconds
     (Heroku recycles dynos frequently; 3 minutes was too slow to notice a
     problem before users complained). */
  setInterval(() => {
    console.log(`[KEEPALIVE] alive | uptime ${Math.floor(process.uptime())}s | sessions ${require('./lib/connection').sessions.size}`);
  }, 90000);

  /* 1. Plugins (fast, synchronous) */
  const loaded = loadPlugins(path.join(__dirname, 'plugins'));
  const s = stats();
  console.log(`[BOOT] Loaded ${loaded} plugin file(s) -> ${s.total} commands in ${s.categories} categories`);

  /* 2. Web server first, so the pairing site is instantly reachable */
  startServer();

  /* 2b. Anti-sleep keep-alive (Heroku). Pings the app's own public URL
     every 60s so the Heroku router never idles the dyno to sleep - this
     is what stops the "bot goes dead after a few minutes / auto logout"
     behaviour on Heroku hosting. */
  keepalive.start();

  /* 3. Database (non blocking - the site stays up even if Atlas is slow) */
  db.connectDB()
    .then(async () => {
      console.log('[BOOT] Database ready. Restoring saved sessions...');
      /* Pull the remembered WhatsApp Web build into memory so any pairing
         that starts now uses the last known good version instead of a
         stale in-memory default. */
      await loadRemembered().catch(() => {});
      setTimeout(() => restoreSessions().catch(e => console.error('[BOOT]', e.message)), 1500);
    })
    .catch((e) => {
      const d = db.getLastError && db.getLastError();
      diag.recordError('database', e, d ? d.code : '');
      console.error('[BOOT] ❌ Database connection FAILED:', d ? d.human : e.message);
      console.error('[BOOT] The bot CANNOT process commands without a database.');
      console.error('[BOOT] WhatsApp sessions will NOT be restored.');
      console.error('[BOOT] To fix this:');
      if (d) d.fix.forEach((f, i) => console.error('        ' + (i + 1) + '. ' + f));
      else {
        console.error('        1. Set MONGODB_URI environment variable');
        console.error('        2. Set FIREBASE_SA_JSON environment variable');
        console.error('        3. Restart the bot');
      }
    });

  console.log('[BOOT] 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃 is ready.');
}

/* ---- crash guards: never let the bot die ---- */
process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err);
  if (/Socket connection timeout|rate-overlimit|Connection Closed|Timed Out|conflict|EPIPE|ECONNRESET/i.test(msg)) return;
  diag.recordError('uncaughtException', err);
  console.error('[UNCAUGHT]', msg);
});

process.on('unhandledRejection', (err) => {
  const msg = String(err?.message || err);
  if (/Socket connection timeout|rate-overlimit|Connection Closed|Timed Out|conflict|EPIPE|ECONNRESET|qid is not defined|Bad MAC/i.test(msg)) return;
  diag.recordError('unhandledRejection', err);
  console.error('[UNHANDLED]', msg);
});

/* flush pending database writes before the dyno dies */
let exiting = false;
async function gracefulExit(sig) {
  if (exiting) return;
  exiting = true;
  console.log(`[EXIT] ${sig} received - saving database...`);
  try { await db.shutdown(); } catch (_) {}
  process.exit(0);
}
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGINT', () => gracefulExit('SIGINT'));

boot();
