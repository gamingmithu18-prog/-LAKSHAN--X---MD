/**
 * SUPPORT ASSISTANT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Groq powered help desk that answers ONLY about this bot:
 * its errors, bugs, commands, status and setup.
 * © POWERD BY LAKSHAN X MD </>
 */
const { cmd, commands, categories, stats, findCommand } = require('../lib/command');
const config = require('../config');
const groq = require('../lib/groq');
const diag = require('../lib/diag');
const { runtime, truncate, withFooter } = require('../lib/utils');

/* ============================================================
   SCOPE GUARD
   The assistant must talk about THIS BOT only. A model told to
   "stay on topic" will still drift, so off-topic questions are
   rejected locally before a single token is spent.
   ============================================================ */

/* Things that clearly belong to this bot's world. */
const ON_TOPIC = [
  'bot', 'ghost', 'command', 'cmd', 'plugin', 'prefix', 'menu', 'error', 'bug', 'crash', 'fail',
  'issue', 'problem', 'broken', 'not working', 'doesnt work', 'does not work', 'fix', 'debug',
  'status', 'health', 'uptime', 'online', 'offline', 'connect', 'disconnect', 'reconnect',
  'pair', 'pairing', 'link', 'qr', 'session', 'login', 'logout', 'device',
  'deploy', 'heroku', 'server', 'host', 'restart', 'setup', 'install', 'config', 'env',
  'database', 'github', 'storage', 'save', 'creds', 'token',
  'group', 'admin', 'owner', 'premium', 'ban', 'mute', 'antilink', 'antidelete', 'welcome',
  'download', 'sticker', 'convert', 'economy', 'setting', 'panel', 'password', 'api',
  'memory', 'ram', 'slow', 'lag', 'speed', 'rate limit', 'spam',
  'support', 'help', 'how do i', 'how to', 'what is', 'why', 'feature', 'version', 'update'
];

/* Things that are plainly nothing to do with the bot. */
const OFF_TOPIC = [
  'weather in', 'football', 'cricket score', 'president', 'capital of', 'recipe for',
  'write me a poem', 'love letter', 'homework', 'translate this into', 'stock price',
  'bitcoin price', 'who is the', 'movie review', 'song lyrics', 'joke about'
];

function isOnTopic(text) {
  const t = String(text || '').toLowerCase();
  if (OFF_TOPIC.some(k => t.includes(k))) return false;
  if (ON_TOPIC.some(k => t.includes(k))) return true;
  /* Naming any real command counts as on topic (e.g. ".support tiktok"). */
  const words = t.replace(/[^a-z0-9\s.]/g, ' ').split(/\s+/).filter(Boolean);
  return words.some(w => findCommand(w.replace(/^\./, '')));
}

/* ============================================================
   CONTEXT BUILDER
   Everything the model is allowed to know, gathered from the
   live bot rather than invented.
   ============================================================ */
function buildContext(question) {
  const snap = diag.snapshot();
  const cats = categories();

  /* Only include commands that look relevant, so the prompt stays small. */
  const q = String(question).toLowerCase();
  const mentioned = commands
    .filter(c => !c.hidden && (q.includes(c.pattern) || c.alias.some(a => q.includes(a))))
    .slice(0, 8)
    .map(c => `.${c.pattern} (${c.category}) - ${c.desc}. Usage: .${c.pattern} ${c.use || ''}`.trim());

  const errorLines = snap.recentErrors.length
    ? snap.recentErrors.map(e => `- [${e.when}] ${e.scope}: ${e.name}: ${e.message}${e.occurrences > 1 ? ` (x${e.occurrences})` : ''}`).join('\n')
    : '- No errors have been recorded since the last restart.';

  const eventLines = snap.recentEvents.length
    ? snap.recentEvents.map(e => `- [${e.when}] ${e.type}: ${e.detail}`).join('\n')
    : '- No notable events recorded yet.';

  return `LIVE STATUS OF THIS BOT (authoritative - trust this over any assumption)
Bot name        : ${config.BOT_NAME}
Owner           : ${config.OWNER_NAME}
Default prefix  : ${config.PREFIX}
Mode            : ${config.MODE}
Uptime          : ${runtime(snap.uptimeSeconds)}
Node runtime    : ${snap.node} on ${snap.platform}
Memory used     : ${snap.memoryUsedMb} MB (heap ${snap.heapUsedMb} MB), system free ${snap.systemFreeMb} MB
Commands loaded : ${snap.commands.total} across ${snap.commands.categories} categories
Categories      : ${Object.keys(cats).sort().join(', ')}
Sessions        : ${snap.sessions.connected} connected of ${snap.sessions.active} active
Database        : ${snap.database}${snap.databaseIssue ? ` (issue ${snap.databaseIssue.code}: ${snap.databaseIssue.problem})` : ''}
WhatsApp build  : ${snap.waWebVersion || 'not detected yet'}${snap.waVersionSource ? ` (source: ${snap.waVersionSource})` : ''}

COUNTERS SINCE RESTART
Commands run    : ${snap.counters.commandsRun}
Commands failed : ${snap.counters.commandsFailed}
Pair attempts   : ${snap.counters.pairAttempts} (success ${snap.counters.pairSuccess}, failed ${snap.counters.pairFailed})
Reconnects      : ${snap.counters.reconnects}

RECENT ERRORS (newest first)
${errorLines}

RECENT EVENTS
${eventLines}
${mentioned.length ? `\nCOMMANDS THE USER MENTIONED\n${mentioned.join('\n')}` : ''}`;
}

const SYSTEM_PROMPT = `You are the official support assistant for a WhatsApp bot called "${config.BOT_NAME}", built by ${config.OWNER_NAME}.

STRICT RULES:
1. You may ONLY discuss this bot: its commands, errors, bugs, status, connection/pairing, deployment and settings.
2. If asked about anything else (general knowledge, news, homework, other software), politely refuse in one sentence and remind the user you only handle questions about this bot.
3. Base every factual claim about the bot's current state on the LIVE STATUS block you are given. Never invent errors, numbers or command names.
4. If the live data does not contain the answer, say so plainly and suggest what the user should check.
5. Be concise and practical: short paragraphs or a numbered list, under 200 words unless the user asks for full details.
6. Write plain text for WhatsApp. Use *asterisks* for emphasis. Never use markdown headers or code fences.
7. If the user writes in Sinhala, answer in Sinhala. Otherwise answer in English.`;

/* ============================================================
   .support
   ============================================================ */
cmd({
  pattern: 'support',
  alias: ['helpdesk', 'askbot', 'botsupport'],
  desc: 'Ask the AI assistant about this bot: errors, bugs, status and full details',
  category: 'main',
  use: '<your question>',
  react: '🛟'
},
async ({ q, m, reply, prefix }) => {
  const question = (q || '').trim() || m.quoted?.text;

  if (!question) {
    const s = stats();
    return reply(
`*SUPPORT ASSISTANT*

Ask me anything about *${config.BOT_NAME}* and I will answer using this bot's live data.

I can help with:
• Errors and bugs - what failed and why
• Connection and pairing problems
• How a specific command works
• Current status, uptime and health
• Deployment and setup questions

Examples:
${prefix}support status
${prefix}support why is pairing failing
${prefix}support any errors right now
${prefix}support how does .tiktok work
${prefix}support full details

I answer questions about this bot only.
Commands available: ${s.total}`);
  }

  if (!isOnTopic(question)) {
    return reply(
`*OUT OF SCOPE*

I am the support assistant for *${config.BOT_NAME}* and I only answer questions about this bot - its commands, errors, status and setup.

Try something like:
${prefix}support why did my command fail
${prefix}support is the bot healthy`);
  }

    /* AI is always available now (Sasa AI Ultra powers the assistant when no
     GROQ_API_KEY is set; a user-supplied key is still honored untouched). */

  await reply('Checking the bot diagnostics, one moment...');

  const res = await groq.chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: buildContext(question) },
    { role: 'user', content: question }
  ], { temperature: 0.25, maxTokens: 900 });

  if (!res.ok) {
    diag.recordError('support', new Error(`${res.code}: ${res.error}`));
    return reply(
`*SUPPORT UNAVAILABLE*

The AI service could not answer right now.

Reason : ${res.error}
Code   : ${res.code}
Fix    : ${groq.explain(res.code)}

Meanwhile try *${prefix}health* for the raw status.`);
  }

  await reply(`*SUPPORT - ${config.BOT_NAME}*\n\n${truncate(res.text, 3200)}`);
});

/* ============================================================
   .health - raw diagnostics, no AI, always works
   ============================================================ */
cmd({
  pattern: 'health',
  alias: ['diagnostics', 'botstatus', 'selftest'],
  desc: 'Full health and diagnostics report for the bot',
  category: 'main',
  react: '🩺'
},
async ({ send }) => {
  const s = diag.snapshot();
  const pct = s.counters.commandsRun
    ? ((s.counters.commandsRun - s.counters.commandsFailed) / s.counters.commandsRun * 100).toFixed(1)
    : '100.0';

  await send({ image: { url: config.LOGO }, caption: withFooter(`*HEALTH REPORT*

*RUNTIME*
Uptime    : ${runtime(s.uptimeSeconds)}
Node      : ${s.node}
Platform  : ${s.platform}
Memory    : ${s.memoryUsedMb} MB used, ${s.systemFreeMb} MB free
Heap      : ${s.heapUsedMb} MB

*BOT*
Commands  : ${s.commands.total} in ${s.commands.categories} categories
Sessions  : ${s.sessions.connected} connected / ${s.sessions.active} active
Database  : ${s.database}${s.databaseIssue ? `\nDB issue  : ${s.databaseIssue.code}` : ''}
WA build  : ${s.waWebVersion || 'not detected'}
AI support: ${groq.isConfigured() ? 'configured' : 'not configured'}

*ACTIVITY SINCE RESTART*
Commands run    : ${s.counters.commandsRun}
Commands failed : ${s.counters.commandsFailed}
Success rate    : ${pct}%
Pair attempts   : ${s.counters.pairAttempts} (ok ${s.counters.pairSuccess}, failed ${s.counters.pairFailed})
Reconnects      : ${s.counters.reconnects}

*ERRORS*
Recorded  : ${s.errorCount}
${s.recentErrors.length ? s.recentErrors.slice(0, 5).map(e => `• [${e.when}] ${e.scope}: ${truncate(e.message, 90)}${e.occurrences > 1 ? ` (x${e.occurrences})` : ''}`).join('\n') : '• None since the last restart.'}`) });
});

/* ============================================================
   .errors - the raw error log
   ============================================================ */
cmd({
  pattern: 'errors',
  alias: ['errorlog', 'bugs', 'lasterror'],
  desc: 'Show the recent internal error log',
  category: 'main',
  react: '🐞'
},
async ({ reply }) => {
  const list = diag.recentErrors(15);
  if (!list.length) return reply('*ERROR LOG*\n\nNo errors have been recorded since the last restart.\nThe bot is running cleanly.');
  await reply(
`*ERROR LOG (${list.length} newest)*

${list.map((e, i) => `${i + 1}. [${e.when}] *${e.scope}*\n   ${e.name}: ${truncate(e.message, 140)}${e.occurrences > 1 ? `\n   occurred ${e.occurrences} times` : ''}`).join('\n\n')}

Ask *.support why am I getting these errors* for an explanation.`);
});

/* ============================================================
   .clearerrors - owner only
   ============================================================ */
cmd({
  pattern: 'clearerrors',
  alias: ['resetdiag'],
  desc: 'Clear the recorded error log',
  category: 'owner',
  ownerOnly: true,
  react: '🧹'
},
async ({ reply }) => {
  const n = diag.snapshot().errorCount;
  diag.clear();
  await reply(`*DIAGNOSTICS CLEARED*\n\nRemoved ${n} recorded error(s) and reset all counters.`);
});
