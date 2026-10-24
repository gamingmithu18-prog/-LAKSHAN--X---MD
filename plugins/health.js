/**
 * HEALTH / DIAGNOSTIC COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Helps diagnose why the bot isn't responding to commands.
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const db = require('../lib/database');
const diag = require('../lib/diag');
const { withFooter } = require('../lib/utils');

cmd({ pattern: 'health', alias: ['diagnose', 'diagnostic', 'check'], desc: 'Full system health check and diagnostics', category: 'owner', ownerOnly: true, react: '🏥' },
async ({ reply, session }) => {
  const snap = diag.snapshot();
  const { sessions } = require('../lib/connection');
  
  let sessionsInfo = '';
  for (const [sid, s] of sessions) {
    sessionsInfo += `  • ${sid}: ${s.status} (number: ${s.number || 'pending'})\n`;
  }
  if (!sessionsInfo) sessionsInfo = '  • No active sessions\n';

  let dbStatus = 'unknown';
  let dbDetails = '';
  try {
    const stats = db.getStats();
    dbStatus = db.isConnected() ? '✅ Connected' : '❌ Offline';
    if (stats.mongo) {
      dbDetails += `  MongoDB: ${stats.mongo.ready ? '✅' : '❌'} (${stats.mongo.provider || 'mongo'})\n`;
    }
    if (stats.firebase) {
      dbDetails += `  Firebase: ${stats.firebase.ready ? '✅' : '❌'} (${stats.firebase.provider || 'firebase'})\n`;
    }
    const err = db.getLastError();
    if (err) dbDetails += `  ⚠️ Last error: ${err.code || ''} - ${err.human || err.message || ''}\n`;
  } catch (e) {
    dbStatus = `❌ Error: ${e.message}`;
  }

  let envCheck = '';
  envCheck += `  MONGODB_URI: ${process.env.MONGODB_URI ? '✅ Set' : '❌ MISSING'}\n`;
  envCheck += `  FIREBASE_SA_JSON: ${process.env.FIREBASE_SA_JSON ? '✅ Set' : '❌ MISSING'}\n`;
  envCheck += `  GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ Set' : '⚠️ Not set'}\n`;

  const mode = session?.mode || config.MODE;
  const prefix = session?.prefix || config.PREFIX;

  await reply(
`🏥 *SYSTEM HEALTH CHECK*

*DATABASE*
  Status: ${dbStatus}
${dbDetails}
*ENVIRONMENT VARIABLES*
${envCheck}
*SESSIONS*
${sessionsInfo}
*BOT CONFIG*
  Mode    : ${mode}
  Prefix  : ${prefix}
  Multi   : ${config.MULTI_PREFIX ? 'enabled' : 'disabled'}
  Prefixes: ${config.PREFIX_LIST.join(' ')}

*PERFORMANCE*
  Uptime  : ${snap.uptimeSinceBoot}
  RAM     : ${snap.memoryUsedMb} MB
  Heap    : ${snap.heapUsedMb} MB
  Node    : ${snap.node}

*MESSAGE STATS*
  Seen    : ${snap.counters.messagesSeen}
  Cmds run: ${snap.counters.commandsRun}
  Failed  : ${snap.counters.commandsFailed}
  Pairs   : ${snap.counters.pairSuccess}/${snap.counters.pairAttempts}

*RECENT ERRORS (${snap.errorCount})*
${snap.recentErrors.slice(0, 5).map(e => `  • [${e.scope}] ${e.name}: ${e.message}`).join('\n') || '  • None'}

*RECENT EVENTS*
${snap.recentEvents.slice(0, 5).map(e => `  • ${e.type}: ${e.detail}`).join('\n') || '  • None'}`);
});

cmd({ pattern: 'fix', alias: ['repair', 'troubleshoot'], desc: 'Auto-fix common issues', category: 'owner', ownerOnly: true, react: '🔧' },
async ({ reply, session }) => {
  const fixes = [];
  const { sessions } = require('../lib/connection');
  
  /* Check 1: Are there any connected sessions? */
  const connected = [...sessions.values()].filter(s => s.status === 'connected');
  if (connected.length === 0) {
    fixes.push('❌ No WhatsApp sessions connected. Use .pair <number> to connect.');
  } else {
    fixes.push(`✅ ${connected.length} session(s) connected`);
  }
  
  /* Check 2: Database connectivity */
  if (!db.isConnected()) {
    fixes.push('❌ Database offline. Check MONGODB_URI and FIREBASE_SA_JSON.');
  } else {
    fixes.push('✅ Database connected');
  }
  
  /* Check 3: Mode check */
  const mode = session?.mode || config.MODE;
  if (mode === 'private') {
    fixes.push('⚠️ Bot is in PRIVATE mode. Only owner can use commands. Use .setmode public');
  } else {
    fixes.push(`✅ Bot mode: ${mode}`);
  }
  
  /* Check 4: Plugin count */
  const { stats } = require('../lib/command');
  const s = stats();
  if (s.total === 0) {
    fixes.push('❌ No commands loaded! Plugins failed to initialize.');
  } else {
    fixes.push(`✅ ${s.total} commands loaded in ${s.categories} categories`);
  }
  
  /* Check 5: Try to reload plugins if command count seems low */
  if (s.total < 10) {
    const { loadPlugins } = require('../lib/command');
    const path = require('path');
    const n = loadPlugins(path.join(__dirname));
    const s2 = stats();
    fixes.push(`🔄 Reloaded plugins: ${n} files, ${s2.total} commands now`);
  }
  
  /* Check 6: WA Version */
  try {
    const waver = require('../lib/waversion');
    const info = waver.info();
    if (info.version) {
      fixes.push(`✅ WA Web version: ${info.version} (${info.source})`);
    } else {
      fixes.push('⚠️ WA version not detected yet');
    }
  } catch (_) {
    fixes.push('⚠️ Could not check WA version');
  }
  
  await reply(`🔧 *AUTO DIAGNOSTIC*\n\n${fixes.join('\n')}\n\n💡 If commands still don't work, try:\n• .reload - reload all plugins\n• .restart - restart the bot\n• Check VPS logs with: pm2 logs`);
});
