/** SASA TEMPMAIL integration. */
const { cmd } = require('../lib/command');

const API = 'https://sasa-dev-api.xyz/api/tempmail';
const boxes = new Map(); // sender JID -> { mailbox, email }

async function request(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/json',
      'X-API-Key': require('../config').API_KEY,
      'x-api-key': require('../config').API_KEY,
      'User-Agent': 'LakshanXMD/1.0'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (data.status === false && !data.result) throw new Error(data.error || data.message || `TEMPMAIL HTTP ${res.status}`);
  return data;
}

cmd({ pattern: 'tempmail', alias: ['tempemail', '10minutemail'], desc: 'Create a SASA temporary email inbox', category: 'tools', react: '📧' },
async ({ m, reply }) => {
  try {
    const data = await request('/random');
    if (!data.mailbox || !data.email) throw new Error('The tempmail API returned an invalid mailbox.');
    boxes.set(m.sender, { mailbox: String(data.mailbox), email: String(data.email), createdAt: Date.now() });
    await reply(`📧 *TEMPORARY MAILBOX CREATED*\n\nAddress: ${data.email}\n\nUse *.mailbox* to check messages.\nUse *.refresh* to refresh the inbox.\n\n⚠️ Messages are temporary. Do not use this inbox for sensitive accounts.`);
  } catch (e) { await reply(`❌ Temporary mail failed: ${String(e.message || e).slice(0, 180)}`); }
});

async function showMailbox(sender, reply) {
  const box = boxes.get(sender);
  if (!box) return reply('📭 Create an inbox first with *.tempmail*.');
  try {
    const data = await request(`/mailbox/${encodeURIComponent(box.mailbox)}`);
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) return reply(`📭 *MAILBOX EMPTY*\n\n${box.email}\n\nNo messages yet.`);
    const lines = [];
    for (const [i, msg] of messages.slice(0, 20).entries()) {
      const full = msg.id ? await request(`/message/${encodeURIComponent(msg.id)}`).catch(() => msg) : msg;
      lines.push(`${i + 1}. *${msg.subject || '(no subject)'}*\n   From: ${msg.from || msg.sender || 'unknown'}\n   ID: ${msg.id || '-'}\n   ${msg.date || msg.created_at || ''}${full.body_text ? `\n   ${String(full.body_text).slice(0, 500)}` : ''}`);
    }
    await reply(`📬 *MAILBOX*\n\nAddress: ${box.email}\n\n${lines.join('\n\n')}\n\nUse *.refresh* to check again.`);
  } catch (e) { await reply(`❌ Mailbox refresh failed: ${String(e.message || e).slice(0, 180)}`); }
}

cmd({ pattern: 'mailbox', alias: ['inbox', 'tempmailbox'], desc: 'Check your SASA temporary inbox', category: 'tools', react: '📬' },
async ({ m, reply }) => showMailbox(m.sender, reply));

cmd({ pattern: 'refresh', alias: ['refreshmail', 'checkmail'], desc: 'Refresh your SASA temporary inbox', category: 'tools', react: '🔄' },
async ({ m, reply }) => showMailbox(m.sender, reply));
