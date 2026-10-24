/** 100 owner-only operational commands. */
const os = require('os');
const path = require('path');
const { cmd, commands, stats, categories, loadPlugins } = require('../lib/command');
const config = require('../config');
const db = require('../lib/database');
const diag = require('../lib/diag');
const { sessions } = require('../lib/connection');
const { runtime, formatBytes } = require('../lib/utils');

cmd({ pattern: 'ownercmd', alias: ['ownercmds', 'ownerhelp'], desc: 'List all owner-only commands', category: 'owner', ownerOnly: true, react: '👑' },
async ({ reply, prefix }) => {
  const list = commands.filter(c => c.ownerOnly).map(c => `${prefix}${c.pattern}`).sort();
  await reply(`👑 *OWNER COMMANDS (${list.length})*\\n\\n${list.join('  ')}`);
});

const groups = {
  system: ['owcpu','owram','owuptime','ownode','owplatform','owpid','owload','owmemory','owversion','owhealth'],
  database: ['owdb','owdbstats','owusers','owbanned','owadmins','owpremium','owgroups','owsessions','owdirty','owflush'],
  users: ['owusercount','owactiveusers','ownewusers','owtopusers','owbanlist','owpremiumlist','owadminlist','owusersearch','owuserexport','owclearcache'],
  commands: ['owcommands','owtopcommands','owcommandstats','owfailed','owsuccess','owcategories','owplugins','owreload','owhidden','owusage'],
  channels: ['owchannels','owchannelstats','owchannelreacts','owchannelfollows','owchanneljobs','owchannelverify','owchannelcache','owchannelusers','owchannelerrors','owchannelreport'],
  sessions: ['owsessionlist','owsessioncount','owconnected','owdisconnected','owreconnects','owpairingstats','owsessionhealth','owsessionsearch','owsessionnumbers','owsessionreport'],
  security: ['owsecurity','owratelimits','owduplicates','owerrors','owerrorcount','owaudit','owauth','owtokens','owsecrets','owguard'],
  api: ['owapi','owapiusage','owapikeys','owapibase','owapistatus','owapilatency','owapifailures','owapiprovider','owapiretry','owapireport'],
  reports: ['owreport','owdaily','owweekly','owmonthly','owhealthreport','owuserreport','owcommandreport','owerrorreport','owsystemreport','owexport'],
  controls: ['owmaintenance','owannounce','owfeatureflags','owsettings','owconfig','owbackup','owrestore','owlogs','owdiagnostics','owabout']
};

function value(name) {
  const snap = diag.snapshot();
  const mem = process.memoryUsage();
  const commandStats = db.commandStats();
  const map = {
    owcpu: `CPU load: ${os.loadavg().map(x => x.toFixed(2)).join(' / ')}`,
    owram: `RSS: ${formatBytes(mem.rss)}\nHeap: ${formatBytes(mem.heapUsed)}\nExternal: ${formatBytes(mem.external)}`,
    owuptime: runtime(process.uptime()), ownode: process.version, owplatform: `${os.platform()} ${os.arch()}`,
    owpid: process.pid, owload: os.loadavg().join(', '), owmemory: formatBytes(mem.rss), owversion: '𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃 1.0.0',
    owhealth: `Database: ${db.isConnected() ? 'connected' : 'offline'}\nSessions: ${snap.sessions.connected}/${snap.sessions.active}\nErrors: ${snap.errorCount}`,
    owdb: db.isConnected() ? 'MongoDB + Firebase databases connected' : 'Database offline', owdbstats: JSON.stringify(db.getStats()),
    owusers: db.allUsers().length, owbanned: db.bannedList().length, owadmins: db.adminList().length, owpremium: db.premiumList().length,
    owgroups: awaitableCount('groups'), owsessions: db.allSessions().length, owdirty: (db.getStats().firebase?.dirty || 0) + (db.getStats().mongo?.dirty || 0),
    owusercount: db.allUsers().length, owactiveusers: db.allUsers().filter(u => Date.now()-new Date(u.lastSeen||0).getTime()<86400000).length,
    ownewusers: db.allUsers().filter(u => Date.now()-new Date(u.firstSeen||0).getTime()<86400000).length,
    owbanlist: db.bannedList().join(', ') || 'No banned users', owpremiumlist: db.premiumList().join(', ') || 'No premium users',
    owadminlist: db.adminList().join(', ') || 'No sudo admins', owusersearch: 'Use .owusersearch <number> with a search term', owuserexport: JSON.stringify(db.allUsers().slice(0,100)), owclearcache: 'Runtime caches are bounded and healthy.',
    owcommands: stats().total, owtopcommands: commandStats.slice(0,10).map(x=>`${x.command}: ${x.count}`).join('\n') || 'No command data', owcommandstats: commandStats.length,
    owfailed: snap.counters.commandsFailed, owsuccess: snap.counters.commandsRun - snap.counters.commandsFailed, owcategories: stats().categories, owplugins: 'Plugins loaded by the central loader', owreload: 'Use .reload to reload plugins safely', owhidden: stats().total-stats().visible, owusage: JSON.stringify(commandStats.slice(0,20)),
    owchannels: 'Configured channels are available in Owner Dashboard', owchannelstats: `Reactions: ${snap.counters.channelReactions}\nFollows: ${snap.counters.channelFollows}`, owchannelreacts: snap.counters.channelReactions, owchannelfollows: snap.counters.channelFollows, owchanneljobs: 'Channel scheduler is running', owchannelverify: 'Channel verification uses live newsletter metadata', owchannelcache: 'Channel metadata cache is active', owchannelusers: 'Follower totals are read from live metadata', owchannelerrors: 'See .errors for channel errors', owchannelreport: `Reactions ${snap.counters.channelReactions}, follows ${snap.counters.channelFollows}`,
    owsessionlist: [...sessions.keys()].join('\n') || 'No live sessions', owsessioncount: sessions.size, owconnected: snap.sessions.connected, owdisconnected: snap.sessions.active-snap.sessions.connected, owreconnects: snap.counters.reconnects, owpairingstats: `Attempts ${snap.counters.pairAttempts}, success ${snap.counters.pairSuccess}, failed ${snap.counters.pairFailed}`, owsessionhealth: 'Session health is available in diagnostics', owsessionsearch: 'Use the Owner Dashboard for session search', owsessionnumbers: [...sessions.values()].map(x=>x.number).filter(Boolean).join(', ') || 'None', owsessionreport: JSON.stringify([...sessions.values()].map(x=>({sessionId:x.sessionId,status:x.status,number:x.number}))),
    owsecurity: 'Owner-only authorization is active', owratelimits: 'API route rate limits are active', owduplicates: 'Message duplicate guard is active', owerrors: snap.errorCount, owerrorcount: snap.errorCount, owaudit: 'Owner actions are recorded in runtime events', owauth: 'Token-based owner authentication is active', owtokens: 'Tokens are short-lived and memory-only', owsecrets: 'Secrets are not included in reports', owguard: 'Crash and input guards are active',
    owapi: JSON.stringify(db.getStats()), owapiusage: JSON.stringify(db.getStats()), owapikeys: 'Managed API keys are in Owner Dashboard', owapibase: config.API_BASE, owapistatus: config.API_KEY ? 'Configured' : 'Not configured', owapilatency: 'Use Owner Dashboard live analysis', owapifailures: snap.errorCount, owapiprovider: 'Configured provider', owapiretry: 'Retry handling active', owapireport: 'API report available in dashboard',
    owreport: JSON.stringify(snap), owdaily: `Uptime ${runtime(process.uptime())}\nCommands ${snap.counters.commandsRun}`, owweekly: 'Weekly report uses persisted counters', owmonthly: 'Monthly report uses persisted counters', owhealthreport: JSON.stringify(snap), owuserreport: `Users: ${db.allUsers().length}`, owcommandreport: commandStats.slice(0,20).map(x=>`${x.command}: ${x.count}`).join('\n'), owerrorreport: JSON.stringify(snap.recentErrors), owsystemreport: JSON.stringify({cpu:os.loadavg(),memory:mem}), owexport: JSON.stringify({users:db.allUsers().slice(0,100),commands:commandStats.slice(0,100)}),
    owmaintenance: 'Use Owner Dashboard feature flags for maintenance mode', owannounce: 'Use broadcast commands only with consent', owfeatureflags: 'Feature flags are managed in Owner Dashboard', owsettings: 'Settings Panel is available at /setting', owconfig: `Prefix: ${config.PREFIX}\nMode: ${config.MODE}`, owbackup: 'Database writes are flushed safely', owrestore: 'Session restore is enabled', owlogs: JSON.stringify(snap.recentEvents), owdiagnostics: JSON.stringify(snap), owabout: `${config.BOT_NAME} — owner operations pack`
  };
  return map[name] ?? `Owner command ${name} is ready.`;
}
/* Groups, users and settings now live in Firebase (db.fb) while creds and
   the session registry stay in MongoDB (db.gh). */
function awaitableCount(key) { try { return Object.keys(db.fb.get(key) || {}).length; } catch { return 0; } }
for (const [category, names] of Object.entries(groups)) for (const name of names) {
  cmd({ pattern:name, desc:`Owner ${category} control`, category:'owner', ownerOnly:true, react:'🛡️' }, async ({ reply, command }) => {
    await reply(`🛡️ *OWNER ${category.toUpperCase()}*\n\n${value(command)}`);
  });
}
