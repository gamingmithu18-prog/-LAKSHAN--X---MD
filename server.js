/**
 * WEB SERVER - pairing dashboard + REST API
 * 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const config = require('./config');
const db = require('./lib/database');
const { createPairing, getPairing, sessions, logoutSession } = require('./lib/connection');
const { stats } = require('./lib/command');
const { runtime, fontify } = require('./lib/utils');
const diag = require('./lib/diag');

/* The owner panel uses one consistent, persisted feature registry. The
   registry is data-driven so new controls can be added without changing the
   dashboard UI or API contract. */
const FEATURE_GROUPS = [
  ['Automation', ['Auto React','Auto Follow','Auto Read','Auto Typing','Auto Recording','Auto Presence','Auto Sticker','Auto Download','Auto View Once','Auto Reply']],
  ['Protection', ['Anti Delete','Anti Call','Anti Spam','Anti Link','Anti Bot','Block Unknown','Flood Guard','Mention Guard','Media Guard','Privacy Guard']],
  ['Messaging', ['Quoted Replies','Read Receipts','Reply Reactions','Command Cooldown','Duplicate Guard','Retry Failed Send','Message Queue','Offline Queue','Edit Tracking','Message Analytics']],
  ['Groups', ['Welcome Messages','Goodbye Messages','Admin Alerts','Join Approval','Group Mute','Group Lock','Group Filters','Group Statistics','Group Events','Group Backup']],
  ['Channels', ['Auto Follow Channels','Channel Reactions','Channel Watcher','Channel Alerts','Channel Analytics','Channel Cache','Channel Sync','Channel Scheduler','Channel Filters','Channel History']],
  ['Media', ['Sticker Converter','Thumbnail Maker','Image Tools','Video Tools','Audio Tools','Document Tools','Media Compression','Media Cache','Upload Guard','Download Guard']],
  ['Analytics', ['Live Users','Live Sessions','Command Stats','Error Stats','Latency Stats','Memory Stats','Database Stats','API Stats','Pairing Stats','Reconnect Stats']],
  ['Moderation', ['Ban System','Warn System','Sudo System','Premium System','Admin Audit','Report Queue','Spam Reports','Link Reports','Content Filters','Moderation Logs']],
  ['Web', ['Live Dashboard','Settings Sync','Theme Sync','Owner Auth','Session Auth','Rate Limiter','Health API','Command API','Config API','Audit API']],
  ['Performance', ['Fast Startup','Plugin Cache','Metadata Cache','Group Cache','Message Cache','API Cache','Lazy Media','Batch Writes','Retry Backoff','Memory Guard']],
  ['Security', ['Token Rotation','Password Hashing','Login Throttle','Request Guard','Secret Redaction','Session Isolation','CORS Guard','Header Guard','Input Validation','Secure Logout']],
  ['Notifications', ['Connection Alerts','Disconnect Alerts','Error Alerts','Owner Alerts','Pairing Alerts','Command Alerts','Channel Alerts','Admin Alerts','Daily Summary','Health Summary']],
  ['Utilities', ['JID Lookup','Profile Pictures','Bio Lookup','QR Generator','Text Tools','Math Tools','JSON Tools','Time Tools','URL Tools','Random Tools']],
  ['Database', ['User Storage','Session Storage','Group Storage','Settings Storage','Credential Storage','Stats Storage','Admin Storage','Ban Storage','Premium Storage','Backup Storage']],
  ['Owner Tools', ['Feature Flags','Channel Manager','Admin Manager','User Manager','Session Manager','Logo Manager','Name Manager','Footer Manager','API Monitor','System Monitor']],
  ['Advanced Owner', ['User Search','User Export','User Notes','Ban Reasons','Ban History','Unban Requests','Session Search','Session Export','Session Kill','Session Health']],
  ['API Control', ['Usage Breakdown','Key Inventory','Key Rotation','Key Expiry','Key Labels','Quota Alerts','Endpoint Health','Latency Monitor','Failure Monitor','Provider Monitor']],
  ['Live Operations', ['Realtime Events','Realtime Errors','Realtime Commands','Realtime Users','Realtime Memory','Realtime CPU','Realtime Queue','Realtime Sessions','Realtime Pairing','Realtime Channels']],
  ['Content Control', ['Footer Presets','Logo Presets','Name Presets','Message Templates','Command Categories','Plugin Visibility','Reply Language','Safe Mode','Maintenance Mode','Announcement Mode']],
  ['Reports', ['Daily Report','Weekly Report','Monthly Report','User Report','Command Report','API Report','Ban Report','Session Report','Channel Report','Error Report']],
  ['Governance', ['Owner Audit','Admin Audit','Permission Matrix','Role Templates','Change Approval','Config Snapshot','Config Restore','Data Retention','Privacy Export','Emergency Lock']],
  ['System Analytics', ['CPU Analysis','RAM Analysis','Live Speed','API Usage','Reaction Usage','Follower Usage','Load Average','Event Loop','Process Uptime','System Health']],
  ['Administration', ['Add Admin','Remove Admin','Ban User','Unban User','Shutdown Bot','Restart Bot','Admin Notifications','Action Confirmations','Admin Search','Admin Audit Trail']],
  ['Reliability', ['Health Probe','Failure Recovery','Queue Recovery','Session Recovery','Database Recovery','API Retry','Socket Recovery','Crash Guard','Graceful Shutdown','Backup Check']],
  ['Insights', ['User Growth','Active Users','Session Growth','Command Trends','Reaction Trends','Follower Trends','Error Trends','Latency Trends','Memory Trends','CPU Trends']],
  ['Operations', ['Maintenance Window','Broadcast Control','Message Scheduler','Channel Scheduler','Reaction Scheduler','User Import','User Export','Data Cleanup','Log Viewer','System Notes']]
];
const FEATURE_CATALOG = FEATURE_GROUPS.flatMap(([group, names]) => names.map((label, i) => ({
  id: `${group.toLowerCase().replace(/\\s+/g, '_')}_${i + 1}`,
  group, label, description: `${label} control and live status`
})));

/**
 * In-memory rate limiter.
 *
 * Each route gets its OWN bucket. Previously every route shared a single
 * per-IP bucket, so the ~33 status polls of one 40-second pairing attempt
 * filled the bucket and then blocked /api/pair (limit 10) entirely.
 */
const buckets = new Map();   // "name|ip" -> number[]

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(name, max = config.API_RATE_LIMIT, windowMs = 60000) {
  return (req, res, next) => {
    const key = `${name}|${clientIp(req)}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);

    if (arr.length >= max) {
      const retry = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
      res.setHeader('Retry-After', retry);
      return res.status(429).json({
        status: false,
        code: 'RATE_LIMITED',
        retryAfter: retry,
        error: `Too many attempts. Please wait ${retry} second${retry === 1 ? '' : 's'} and try again.`
      });
    }

    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

/* stop the map growing forever */
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const live = arr.filter(t => now - t < 120000);
    if (live.length) buckets.set(k, live); else buckets.delete(k);
  }
}, 120000).unref?.();

function startServer() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'LAKSHAN X MD');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

  /* ---------- API ---------- */

  // Start a new pairing (code or qr)
  app.post('/api/pair', rateLimit('pair-create', 12, 60000), async (req, res) => {
    try {
      const method = String(req.body?.method || 'code').toLowerCase() === 'qr' ? 'qr' : 'code';
      let number = String(req.body?.number || '').replace(/[^0-9]/g, '');

      if (method === 'code') {
        if (!number || number.length < 8 || number.length > 15) {
          return res.status(400).json({ status: false, error: 'Enter a valid WhatsApp number with country code.' });
        }
      }
      if (!db.isConnected()) {
        const d = db.getLastError && db.getLastError();

        /* Distinguish "still booting" from "misconfigured". Reporting a
           setup error as "starting up" made the real cause invisible. */
        const SETUP_ERRORS = ['GITHUB_NOT_CONFIGURED', 'BAD_TOKEN', 'REPO_NOT_FOUND', 'GITHUB_ERROR'];
        const isSetup = d && SETUP_ERRORS.includes(d.code);
        const booting = !d && process.uptime() < 45;

        let error;
        if (isSetup) {
          error = d.code === 'GITHUB_NOT_CONFIGURED'
            ? `Bot storage is not configured yet (missing ${(d.missing || []).join(', ') || 'GitHub settings'}). The owner needs to finish setup.`
            : d.code === 'BAD_TOKEN'
              ? 'The storage access token is invalid or expired. The owner needs to renew it.'
              : d.code === 'REPO_NOT_FOUND'
                ? 'The storage repository was not found. The owner needs to check the settings.'
                : 'Storage is misconfigured. Please contact the owner.';
        } else if (booting) {
          error = 'The bot is still starting up. Please wait about 20 seconds and try again.';
        } else {
          error = 'Storage is temporarily unreachable. Please try again shortly.';
        }

        return res.status(503).json({
          status: false,
          code: d ? d.code : (booting ? 'BOOTING' : 'DB_OFFLINE'),
          error,
          hint: d ? d.fix[0] : null,
          ownerAction: !!isSetup
        });
      }

      const sessionId = await createPairing(number, method);
      res.json({ status: true, sessionId, method, ttl: config.PAIR_CODE_TTL });
    } catch (e) {
      res.status(500).json({ status: false, error: e.message });
    }
  });

  // Poll pairing state
  app.get('/api/pair/:id', rateLimit('pair-poll', 600, 60000), (req, res) => {
    const p = getPairing(req.params.id);
    res.json({
      status: true,
      state: p.status,          // generating | waiting | connected | expired | error | logged_out | not_found
      code: p.code || null,
      qr: p.qr || null,
      remaining: p.remaining != null ? p.remaining : 0,
      error: p.error || null,
      number: p.number || null
    });
  });

  // Cancel / delete a session
  app.delete('/api/pair/:id', rateLimit('pair-delete', 30, 60000), async (req, res) => {
    try { await logoutSession(req.params.id); res.json({ status: true }); }
    catch (e) { res.status(500).json({ status: false, error: e.message }); }
  });

  // Public stats for the site counters
  app.get('/api/stats', rateLimit('stats', 200, 60000), async (req, res) => {
    let users = 0, totalSessions = 0;
    try {
      users = await db.User.countDocuments();
      totalSessions = await db.Session.countDocuments({ status: 'connected' });
    } catch (_) {}
    const s = stats();
    res.json({
      status: true,
      bot: config.BOT_NAME,
      owner: config.OWNER_NAME,
      commands: s.total,
      categories: s.categories,
      activeSessions: sessions.size,
      storedSessions: totalSessions,
      users,
      uptime: runtime(process.uptime()),
      database: db.isConnected() ? 'connected' : 'offline'
    });
  });

  app.get('/api/health', (req, res) => {
    const d = db.getLastError && db.getLastError();
    res.json({
      status: true,
      ok: true,
      uptime: process.uptime(),
      database: db.isConnected(),
      databaseIssue: db.isConnected() ? null : (d ? { code: d.code, problem: d.human, howToFix: d.fix } : { code: 'CONNECTING', problem: 'Still connecting.' })
    });
  });

  app.get('/api/commands', rateLimit('commands', 120, 60000), (req, res) => {
    const { categories } = require('./lib/command');
    const cats = categories();
    const out = {};
    for (const k of Object.keys(cats)) {
      out[k] = cats[k].map(c => ({ name: c.pattern, alias: c.alias, desc: c.desc, use: c.use }));
    }
    res.json({ status: true, total: stats().total, categories: out });
  });


  /* ==========================================================
     SETTINGS PANEL API
     Token based: login with number + panel password, receive a
     short lived bearer token, then read/patch settings live.
     ========================================================== */
  const settings = require('./lib/settings');
  const crypto = require('crypto');

  const tokens = new Map();               // token -> { sessionId, number, exp }
  const TOKEN_TTL = 30 * 60 * 1000;       // 30 minutes

  setInterval(() => {
    const now = Date.now();
    for (const [t, v] of tokens) if (v.exp < now) tokens.delete(t);
  }, 60000).unref?.();

  function auth(req, res, next) {
    const raw = req.headers.authorization || '';
    const tok = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    const rec = tok && tokens.get(tok);
    if (!rec || rec.exp < Date.now()) {
      if (tok) tokens.delete(tok);
      return res.status(401).json({ status: false, code: 'UNAUTHORIZED', error: 'Your session expired. Please sign in again.' });
    }
    rec.exp = Date.now() + TOKEN_TTL;     // sliding expiry
    req.panel = rec;
    next();
  }

  /* ---- login ---- */
  app.post('/api/settings/login', rateLimit('panel-login', 10, 300000), async (req, res) => {
    try {
      if (!db.isConnected()) {
        return res.status(503).json({ status: false, error: 'Storage is unavailable. Please try again shortly.' });
      }
      const number = settings.norm(req.body?.number);
      const password = String(req.body?.password || '');
      if (!number || !password) {
        return res.status(400).json({ status: false, error: 'Enter your WhatsApp number and password.' });
      }

      const sess = settings.findByNumber(number);
      if (!sess || !sess.panelPassword) {
        return res.status(404).json({
          status: false,
          error: 'No connected bot found for that number. Connect your bot first, then use the password sent to your WhatsApp.'
        });
      }
      if (!settings.verifyPassword(password, sess.panelPassword)) {
        return res.status(401).json({ status: false, error: 'Incorrect password. Check the message sent when your bot connected.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      tokens.set(token, { sessionId: sess.sessionId, number, exp: Date.now() + TOKEN_TTL });
      res.json({
        status: true, token, number,
        sessionId: sess.sessionId,
        expiresIn: Math.floor(TOKEN_TTL / 1000)
      });
    } catch (e) {
      res.status(500).json({ status: false, error: e.message });
    }
  });

  /* ---- schema + current values ---- */
  app.get('/api/settings', rateLimit('panel-read', 240, 60000), auth, async (req, res) => {
    try {
      const current = await settings.getSettings(req.panel.sessionId);
      const live = sessions.get(req.panel.sessionId);
      res.json({
        status: true,
        schema: settings.SCHEMA,
        values: current,
        session: {
          number: req.panel.number,
          sessionId: req.panel.sessionId,
          online: !!live && live.status === 'connected',
          botName: config.BOT_NAME
        }
      });
    } catch (e) {
      res.status(500).json({ status: false, error: e.message });
    }
  });

  /* ---- live update ---- */
  app.patch('/api/settings', rateLimit('panel-write', 120, 60000), auth, async (req, res) => {
    try {
      const { clean, errors, hasErrors } = settings.validatePatch(req.body || {});
      if (hasErrors) return res.status(400).json({ status: false, code: 'VALIDATION', errors });
      if (!Object.keys(clean).length) return res.status(400).json({ status: false, error: 'Nothing to update.' });

      const merged = await settings.saveSettings(req.panel.sessionId, clean);
      await db.flush(true).catch(() => {});     // persist immediately so it survives a restart

      // Apply presence changes immediately instead of waiting for the next
      // message. This makes the Last Seen toggle live from the panel.
      const live = sessions.get(req.panel.sessionId);
      if (live?.sock && Object.prototype.hasOwnProperty.call(clean, 'freezeLastSeen')) {
        live.sock.sendPresenceUpdate(merged.freezeLastSeen ? 'unavailable' : 'available', live.jid).catch(() => {});
      }

      res.json({ status: true, values: merged, applied: Object.keys(clean) });
    } catch (e) {
      res.status(500).json({ status: false, error: e.message });
    }
  });

  /* ---- rotate password ---- */
  app.post('/api/settings/password', rateLimit('panel-pw', 5, 300000), auth, async (req, res) => {
    try {
      const plain = await settings.issuePassword(req.panel.sessionId, req.panel.number);
      await db.flush(true).catch(() => {});
      const live = sessions.get(req.panel.sessionId);
      if (live?.sock) {
        live.sock.sendMessage(live.jid, {
          text: fontify(`*NEW SETTINGS PANEL PASSWORD*\n\nYour Setting Change Panel Login Password :\n${plain}\n\nThe previous password no longer works.`) + `\n\n${config.FOOTER}`
        }).catch(() => {});
      }
      res.json({ status: true, password: plain });
    } catch (e) {
      res.status(500).json({ status: false, error: e.message });
    }
  });

  /* ---- scheduled text messages ---- */
  app.get('/api/settings/schedules', auth, async (req, res) => {
    const session = await db.getSession(req.panel.sessionId);
    res.json({ status: true, schedules: session?.schedules || [] });
  });

  app.post('/api/settings/schedules', auth, async (req, res) => {
    const when = new Date(req.body?.at).getTime();
    const text = String(req.body?.text || '').trim();
    const number = String(req.body?.number || '').replace(/[^0-9]/g, '');
    if (!Number.isFinite(when) || when <= Date.now() || !text || number.length < 8) {
      return res.status(400).json({ status: false, error: 'Provide a future date/time, text, and a valid recipient number.' });
    }
    const session = await db.getSession(req.panel.sessionId);
    const schedules = Array.isArray(session?.schedules) ? session.schedules : [];
    const item = { id: crypto.randomBytes(8).toString('hex'), at: new Date(when).toISOString(), text: text.slice(0, 4000), number, createdAt: new Date().toISOString() };
    await db.saveSession(req.panel.sessionId, { schedules: [...schedules, item].slice(-100) });
    await db.flush(true).catch(() => {});
    res.json({ status: true, schedule: item });
  });

  app.delete('/api/settings/schedules/:id', auth, async (req, res) => {
    const session = await db.getSession(req.panel.sessionId);
    const schedules = (session?.schedules || []).filter(x => x.id !== req.params.id);
    await db.saveSession(req.panel.sessionId, { schedules });
    await db.flush(true).catch(() => {});
    res.json({ status: true, schedules });
  });

  if (!global.__ghostScheduleWorker) {
    global.__ghostScheduleWorker = setInterval(async () => {
      const now = Date.now();
      for (const session of db.allSessions()) {
        const due = (session.schedules || []).filter(x => new Date(x.at).getTime() <= now);
        if (!due.length) continue;
        const live = sessions.get(session.sessionId);
        const pending = (session.schedules || []).filter(x => new Date(x.at).getTime() > now);
        if (live?.sock && live.status === 'connected') {
          for (const item of due) await live.sock.sendMessage(`${item.number}@s.whatsapp.net`, { text: item.text }).catch(() => {});
        } else {
          pending.push(...due); // retain messages until the session reconnects
        }
        await db.saveSession(session.sessionId, { schedules: pending });
      }
      await db.flush(true).catch(() => {});
    }, 15000);
    global.__ghostScheduleWorker.unref?.();
  }

  /* ---- logout ---- */
  app.post('/api/settings/logout', auth, (req, res) => {
    const raw = req.headers.authorization || '';
    tokens.delete(raw.slice(7));
    res.json({ status: true });
  });

  /* ==========================================================
     OWNER DASHBOARD API
     The dashboard is intentionally not linked from the public UI.
     Configure OWNER_PANEL_PASSWORD on the VPS (.env) before deployment.
     ========================================================== */
  const ownerTokens = new Map();
  const ownerNumber = () => String(config.OWNER_PANEL_NUMBER || '94741448572').replace(/[^0-9]/g, '');
  const getOwnerPassword = async () => (await db.getSetting('ownerPanelPassword')) || config.OWNER_PANEL_PASSWORD;
  const strongOwnerPassword = () => `LaksOwner_${crypto.randomBytes(9).toString('base64url')}`;

  async function notifyOwner(text) {
    const number = ownerNumber();
    const jid = `${number}@s.whatsapp.net`;
    // Never send owner alerts through an arbitrary user's connected bot.
    // The notification must originate from the owner's own WhatsApp account
    // and arrive in that account's self-chat (the "You" conversation).
    const ownerSessions = [...sessions.values()].filter(session =>
      session.status === 'connected' && session.sock &&
      String(session.number || '').replace(/[^0-9]/g, '') === number
    );
    for (const session of ownerSessions) {
      try { await session.sock.sendMessage(jid, { text: fontify(text) }); return true; } catch (_) {}
    }
    return false;
  }

  const ownerAuth = (req, res, next) => {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    const rec = ownerTokens.get(token);
    if (!rec || rec.exp < Date.now()) {
      ownerTokens.delete(token);
      return res.status(401).json({ status: false, error: 'Owner authentication required.' });
    }
    rec.exp = Date.now() + config.OWNER_PANEL_TOKEN_TTL;
    next();
  };

  app.post('/api/owner/login', rateLimit('owner-login', 10, 300000), async (req, res) => {
    const password = String(req.body?.password || '');
    const expected = await getOwnerPassword();
    if (!expected || password !== expected) {
      return res.status(401).json({ status: false, error: 'Invalid owner password.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    ownerTokens.set(token, { exp: Date.now() + config.OWNER_PANEL_TOKEN_TTL });
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
    notifyOwner(`🔐 OWNER PANEL LOGIN\n\n✅ Successful login detected.\n📅 ${new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE })}\n🌐 IP: ${ip}\n\n${config.FOOTER}`).catch(() => {});
    res.json({ status: true, token, expiresIn: Math.floor(config.OWNER_PANEL_TOKEN_TTL / 1000) });
  });

  app.post('/api/owner/forgot-password', rateLimit('owner-forgot', 3, 900000), async (req, res) => {
    const next = strongOwnerPassword();
    await db.setSetting('ownerPanelPassword', next);
    await db.flush(true).catch(() => {});
    const delivered = await notifyOwner(`🔑 OWNER PANEL PASSWORD RESET\n\nA new strong password was generated for the Owner Panel.\n\n🔐 Password: ${next}\n🌐 Panel: ${config.PUBLIC_URL.replace(/\/+$/, '')}/owner\n📅 ${new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE })}\n\nKeep this password private. ${config.FOOTER}`).catch(() => false);
    res.json({ status: true, delivered, message: delivered ? 'A new password was sent to the owner WhatsApp number.' : 'Password changed, but the owner WhatsApp session is currently offline.' });
  });

  app.post('/api/owner/password', ownerAuth, async (req, res) => {
    const current = String(req.body?.current || '');
    const next = String(req.body?.next || '');
    if (current !== await getOwnerPassword()) return res.status(401).json({ status: false, error: 'Current password is incorrect.' });
    if (next.length < 12 || !/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/[0-9]/.test(next)) {
      return res.status(400).json({ status: false, error: 'New password must be at least 12 characters and include uppercase, lowercase, and a number.' });
    }
    await db.setSetting('ownerPanelPassword', next);
    await db.flush(true).catch(() => {});
    await notifyOwner(`🔐 OWNER PANEL PASSWORD CHANGED\n\n✅ The owner password was changed from inside the dashboard.\n📅 ${new Date().toLocaleString('en-GB', { timeZone: config.TIMEZONE })}\n\n${config.FOOTER}`).catch(() => {});
    res.json({ status: true, message: 'Owner Panel password changed successfully.' });
  });

  app.get('/api/owner/overview', ownerAuth, async (req, res) => {
    const s = diag.snapshot();
    res.json({ status: true, runtime: s, users: db.allUsers().length,
      admins: db.adminList(), sessions: db.allSessions(), commands: stats() });
  });

  app.get('/api/owner/system-analysis', ownerAuth, (req, res) => {
    const cpu = process.cpuUsage();
    const mem = process.memoryUsage();
    const load = require('os').loadavg();
    const started = process.hrtime.bigint();
    res.json({ status: true, generatedAt: new Date().toISOString(), cpu: {
      userMicros: cpu.user, systemMicros: cpu.system, load1: load[0], load5: load[1], load15: load[2]
    }, memory: { rssMb: +(mem.rss / 1048576).toFixed(2), heapMb: +(mem.heapUsed / 1048576).toFixed(2), externalMb: +(mem.external / 1048576).toFixed(2) },
    speed: { responseMs: Number(process.hrtime.bigint() - started) / 1e6, uptimeSeconds: process.uptime() },
    api: db.getStats(), channels: { reactions: require('./lib/diag').counters.channelReactions, follows: require('./lib/diag').counters.channelFollows } });
  });

  app.get('/api/owner/admins', ownerAuth, (req, res) => {
    res.json({ status: true, admins: db.adminList(), owners: config.OWNER_NUMBERS });
  });

  app.post('/api/owner/admins', ownerAuth, async (req, res) => {
    const number = String(req.body?.number || '').replace(/[^0-9]/g, '');
    if (number.length < 8) return res.status(400).json({ status: false, error: 'Enter a valid number.' });
    db.setAdmin(number, true); await db.flush(true).catch(() => {});
    res.json({ status: true, admins: db.adminList() });
  });

  app.delete('/api/owner/admins/:number', ownerAuth, async (req, res) => {
    const number = String(req.params.number).replace(/[^0-9]/g, '');
    if (config.OWNER_NUMBERS.includes(number)) return res.status(400).json({ status: false, error: 'Primary owners cannot be removed.' });
    db.setAdmin(number, false); await db.flush(true).catch(() => {});
    res.json({ status: true, admins: db.adminList() });
  });

  app.post('/api/owner/system/:action', ownerAuth, async (req, res) => {
    const action = req.params.action;
    if (!['restart', 'shutdown'].includes(action)) return res.status(400).json({ status: false, error: 'Unknown system action.' });
    await notifyOwner(`⚠️ OWNER SYSTEM ACTION\n\n${action.toUpperCase()} requested from the Owner Panel.\n${new Date().toISOString()}`).catch(() => {});
    res.json({ status: true, action, message: `Bot ${action} requested.` });
    setTimeout(() => process.exit(action === 'restart' ? 0 : 1), 250);
  });

  app.get('/api/owner/users', ownerAuth, (req, res) => {
    const q = String(req.query.q || '').replace(/[^0-9a-zA-Z@._ -]/g, '').toLowerCase();
    const users = db.allUsers().filter(u => !q || JSON.stringify(u).toLowerCase().includes(q)).slice(0, 500);
    res.json({ status: true, total: users.length, users });
  });

  app.patch('/api/owner/users/:number/ban', ownerAuth, async (req, res) => {
    const jid = `${String(req.params.number).replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const user = await db.getUser(jid);
    user.banned = req.body?.banned !== false;
    await user.save();
    await db.flush(true).catch(() => {});
    res.json({ status: true, number: String(req.params.number).replace(/[^0-9]/g, ''), banned: user.banned });
  });

  app.get('/api/owner/commands', ownerAuth, (req, res) => {
    res.json({ status: true, commands: db.commandStats().slice(0, 100) });
  });

  app.get('/api/owner/api-usage', ownerAuth, async (req, res) => {
    const owner = (await db.getSetting('ownerPanel')) || {};
    res.json({ status: true, github: db.getStats(), apiBase: config.API_BASE,
      configured: Boolean(config.API_KEY), key: config.API_KEY ? `${config.API_KEY.slice(0, 4)}••••${config.API_KEY.slice(-4)}` : null,
      provider: owner.apiProvider || 'default', usage: owner.apiUsage || {} });
  });

  app.get('/api/owner/api-keys', ownerAuth, async (req, res) => {
    const keys = (await db.getSetting('ownerApiKeys')) || [];
    res.json({ status: true, keys: keys.map(k => ({ ...k, value: k.value ? `${k.value.slice(0, 4)}••••${k.value.slice(-4)}` : '' })) });
  });

  app.post('/api/owner/api-keys', ownerAuth, async (req, res) => {
    const label = String(req.body?.label || 'API key').slice(0, 60);
    const value = String(req.body?.value || '').trim();
    if (!value) return res.status(400).json({ status: false, error: 'API key is required.' });
    const keys = (await db.getSetting('ownerApiKeys')) || [];
    const item = { id: crypto.randomBytes(8).toString('hex'), label, value, createdAt: new Date().toISOString() };
    await db.setSetting('ownerApiKeys', [...keys, item].slice(-50));
    await db.flush(true).catch(() => {});
    res.json({ status: true, id: item.id });
  });

  app.delete('/api/owner/api-keys/:id', ownerAuth, async (req, res) => {
    const keys = (await db.getSetting('ownerApiKeys')) || [];
    await db.setSetting('ownerApiKeys', keys.filter(k => k.id !== req.params.id));
    await db.flush(true).catch(() => {});
    res.json({ status: true });
  });

  app.get('/api/owner/features', ownerAuth, async (req, res) => {
    const flags = (await db.getSetting('ownerFeatures')) || {};
    res.json({ status: true, total: FEATURE_CATALOG.length, catalog: FEATURE_CATALOG, flags });
  });

  app.patch('/api/owner/features', ownerAuth, async (req, res) => {
    const allowed = new Set(FEATURE_CATALOG.map(f => f.id));
    const current = (await db.getSetting('ownerFeatures')) || {};
    const next = { ...current };
    for (const [id, value] of Object.entries(req.body?.flags || {})) {
      if (allowed.has(id)) next[id] = Boolean(value);
    }
    await db.setSetting('ownerFeatures', next);
    await db.flush(true).catch(() => {});
    res.json({ status: true, total: FEATURE_CATALOG.length, flags: next });
  });

  app.post('/api/owner/channel/verify', ownerAuth, async (req, res) => {
    const link = String(req.body?.link || '').trim();
    const invite = link.match(/whatsapp\.com\/channel\/([^/]+)/i)?.[1];
    if (!invite) return res.status(400).json({ status: false, error: 'Enter a valid WhatsApp channel link.' });
    const candidates = [...sessions.values()].filter(s => s.status === 'connected' && s.sock);
    let found = null;
    for (const session of candidates) {
      const metadata = await session.sock.newsletterMetadata('invite', invite).catch(() => null);
      if (!metadata?.id) continue;
      const clean = value => String(value || '').split(':')[0].trim().toLowerCase();
      const ownerJid = clean(metadata.owner);
      const me = session.sock.authState?.creds?.me || {};
      const ownerIds = [session.sock.user?.id, session.sock.user?.lid, me.id, me.lid, session.number]
        .filter(Boolean).map(clean);
      const verified = !!ownerJid && ownerIds.includes(ownerJid);
      const channel = {
        jid: metadata.id, name: metadata.name || 'Unnamed channel', owner: metadata.owner || 'unknown',
        subscribers: Number(metadata.subscribers || 0), picture: metadata.picture?.url || null,
        verification: metadata.verification || 'UNVERIFIED', invite
      };
      found = { sessionId: session.sessionId, channel, verified };
      if (verified) return res.json({ status: true, verified: true, sessionId: session.sessionId, channel });
    }
    if (found) return res.json({ status: true, verified: false, sessionId: found.sessionId, channel: found.channel,
      error: 'Channel details found, but the connected session is not verified as its owner/admin.' });
    return res.status(404).json({ status: false, verified: false, error: 'Could not load channel metadata. Check the invite link and keep the owner bot connected.' });
  });

  app.get('/api/owner/channel-schedules', ownerAuth, async (req, res) => {
    res.json({ status: true, schedules: (await db.getSetting('channelSchedules')) || [] });
  });

  app.post('/api/owner/channel-schedules', ownerAuth, async (req, res) => {
    const channel = req.body?.channel;
    const text = String(req.body?.text || '');
    const expiresAt = new Date(req.body?.expiresAt).getTime();
    const times = Array.isArray(req.body?.times) ? req.body.times.filter(t => ['00:00','08:00','13:00','19:00'].includes(t)) : [];
    if (!channel?.jid || !channel?.sessionId || !text || !times.length || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.status(400).json({ status: false, error: 'Verify a channel and provide message, times, and a future expiration date.' });
    }
    const current = (await db.getSetting('channelSchedules')) || [];
    const item = { id: crypto.randomBytes(8).toString('hex'), channel, text, times, expiresAt: new Date(expiresAt).toISOString(), createdAt: new Date().toISOString(), sent: {} };
    await db.setSetting('channelSchedules', [...current, item].slice(-200));
    await db.flush(true).catch(() => {});
    res.json({ status: true, schedule: item });
  });

  app.delete('/api/owner/channel-schedules/:id', ownerAuth, async (req, res) => {
    const current = (await db.getSetting('channelSchedules')) || [];
    await db.setSetting('channelSchedules', current.filter(x => x.id !== req.params.id));
    await db.flush(true).catch(() => {});
    res.json({ status: true });
  });

  if (!global.__ghostChannelScheduler) {
    global.__ghostChannelScheduler = setInterval(async () => {
      const schedules = (await db.getSetting('channelSchedules')) || [];
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const day = now.toISOString().slice(0,10);
      let changed = false;
      for (const item of schedules) {
        if (Date.now() >= new Date(item.expiresAt).getTime() || !item.times.includes(hhmm)) continue;
        const key = `${day}_${hhmm}`;
        if (item.sent?.[key]) continue;
        const live = sessions.get(item.channel.sessionId);
        if (!live?.sock || live.status !== 'connected') continue;
        try {
          if (typeof live.sock.newsletterSendText === 'function') await live.sock.newsletterSendText(item.channel.jid, item.text);
          else await live.sock.sendMessage(item.channel.jid, { text: item.text });
          item.sent = { ...(item.sent || {}), [key]: new Date().toISOString() };
          changed = true;
        } catch (_) {}
      }
      if (changed) { await db.setSetting('channelSchedules', schedules); await db.flush(true).catch(() => {}); }
    }, 30000);
    global.__ghostChannelScheduler.unref?.();
  }

  app.get('/api/owner/config', ownerAuth, async (req, res) => {
    const value = (await db.getSetting('ownerPanel')) || { autoFollowChannels: [], autoreactChannels: [] };
    res.json({ status: true, value });
  });

  app.patch('/api/owner/config', ownerAuth, async (req, res) => {
    const current = (await db.getSetting('ownerPanel')) || { autoFollowChannels: [], autoreactChannels: [] };
    const next = { ...current };
    for (const key of ['autoFollowChannels', 'autoreactChannels']) {
      if (Array.isArray(req.body?.[key])) next[key] = req.body[key].map(String).slice(0, 100);
    }
    await db.setSetting('ownerPanel', next);
    await db.flush(true).catch(() => {});
    res.json({ status: true, value: next });
  });

  app.post('/api/owner/logout', ownerAuth, (req, res) => {
    const token = String(req.headers.authorization || '').slice(7);
    ownerTokens.delete(token);
    res.json({ status: true });
  });

  /* ---------- PAGES (single file SPA) ---------- */
  app.get('/owner', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'owner.html'));
  });
  app.get(['/setting', '/settings'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
  });

  app.get(['/', '/terms', '/privacy', '/faq', '/commands', '/pair'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

  const port = process.env.PORT || config.PORT;
  app.listen(port, () => console.log(`[WEB] Pairing dashboard running on port ${port}`));

  return app;
}

module.exports = startServer;
