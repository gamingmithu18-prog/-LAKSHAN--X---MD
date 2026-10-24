/**
 * GROUP MANAGEMENT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const db = require('../lib/database');
const { withFooter, jidToNum, numToJid, truncate, sleep } = require('../lib/utils');

const resolveTarget = (m, args, participants) => {
  if (m.mentions?.length) return m.mentions[0];
  if (m.quoted?.sender) return m.quoted.sender;
  if (args[0] && /^[0-9]{7,15}$/.test(args[0].replace(/[^0-9]/g, ''))) return numToJid(args[0]);
  return null;
};

/* ============ MEMBER ACTIONS ============ */
cmd({ pattern: 'kick', alias: ['remove', 'ban1'], desc: 'Remove a member from the group', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '@user', react: '🚪' },
async ({ sock, m, args, participants, reply }) => {
  const t = resolveTarget(m, args, participants);
  if (!t) return reply('Mention, reply to, or type the number of the user you want to remove.');
  if (jidToNum(t) === jidToNum(sock.user.id)) return reply('I cannot remove myself.');
  await sock.groupParticipantsUpdate(m.chat, [t], 'remove');
  await reply(`Removed @${jidToNum(t)} from the group.`, { mentions: [t] });
});

cmd({ pattern: 'add', alias: ['adduser'], desc: 'Add a member to the group', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '<number>', react: '➕' },
async ({ sock, m, args, reply }) => {
  if (!args[0]) return reply('Provide a number.\nExample: .add 94771234567');
  const jid = numToJid(args[0]);
  const r = await sock.groupParticipantsUpdate(m.chat, [jid], 'add');
  const status = r?.[0]?.status;
  if (status === '200') return reply(`Added @${jidToNum(jid)} successfully.`, { mentions: [jid] });
  await reply(`Could not add that user (status ${status}). They may have privacy settings enabled; an invite was sent instead if possible.`);
});

cmd({ pattern: 'promote', alias: ['admin', 'makeadmin'], desc: 'Give admin rights to a member', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '@user', react: '⬆️' },
async ({ sock, m, args, reply }) => {
  const t = resolveTarget(m, args);
  if (!t) return reply('Mention or reply to the user you want to promote.');
  await sock.groupParticipantsUpdate(m.chat, [t], 'promote');
  await reply(`@${jidToNum(t)} is now a group admin.`, { mentions: [t] });
});

cmd({ pattern: 'demote', alias: ['unadmin', 'removeadmin'], desc: 'Remove admin rights from a member', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '@user', react: '⬇️' },
async ({ sock, m, args, reply }) => {
  const t = resolveTarget(m, args);
  if (!t) return reply('Mention or reply to the user you want to demote.');
  await sock.groupParticipantsUpdate(m.chat, [t], 'demote');
  await reply(`@${jidToNum(t)} is no longer an admin.`, { mentions: [t] });
});

cmd({ pattern: 'kickall', alias: ['removeall'], desc: 'Remove every non-admin member', category: 'group', onlyGroup: true, ownerOnly: true, botAdmin: true, react: '💣' },
async ({ sock, m, participants, reply, botNum }) => {
  const targets = participants.filter(p => !p.admin && jidToNum(p.id) !== botNum).map(p => p.id);
  if (!targets.length) return reply('There are no removable members.');
  await reply(`Removing ${targets.length} member(s). This may take a moment.`);
  for (const t of targets) { await sock.groupParticipantsUpdate(m.chat, [t], 'remove').catch(() => {}); await sleep(700); }
  await reply('Operation completed.');
});

cmd({ pattern: 'promoteall', desc: 'Promote every member to admin', category: 'group', onlyGroup: true, ownerOnly: true, botAdmin: true, react: '👑' },
async ({ sock, m, participants, reply }) => {
  const targets = participants.filter(p => !p.admin).map(p => p.id);
  if (!targets.length) return reply('Everyone is already an admin.');
  await sock.groupParticipantsUpdate(m.chat, targets, 'promote').catch(() => {});
  await reply(`Promoted ${targets.length} member(s).`);
});

cmd({ pattern: 'demoteall', desc: 'Demote every admin except the owner', category: 'group', onlyGroup: true, ownerOnly: true, botAdmin: true, react: '📉' },
async ({ sock, m, participants, metadata, reply }) => {
  const targets = participants.filter(p => p.admin === 'admin' && p.id !== metadata?.owner).map(p => p.id);
  if (!targets.length) return reply('No demotable admins found.');
  await sock.groupParticipantsUpdate(m.chat, targets, 'demote').catch(() => {});
  await reply(`Demoted ${targets.length} admin(s).`);
});

/* ============ GROUP SETTINGS ============ */
cmd({ pattern: 'mute', alias: ['close', 'lock'], desc: 'Only admins can send messages', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '🔇' },
async ({ sock, m, reply }) => { await sock.groupSettingUpdate(m.chat, 'announcement'); await reply('Group has been muted. Only admins can send messages now.'); });

cmd({ pattern: 'unmute', alias: ['open', 'unlock'], desc: 'Allow everyone to send messages', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '🔊' },
async ({ sock, m, reply }) => { await sock.groupSettingUpdate(m.chat, 'not_announcement'); await reply('Group has been unmuted. Everyone can send messages.'); });

cmd({ pattern: 'lockinfo', alias: ['lockgroup'], desc: 'Only admins can edit group info', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '🔒' },
async ({ sock, m, reply }) => { await sock.groupSettingUpdate(m.chat, 'locked'); await reply('Group info is now locked to admins.'); });

cmd({ pattern: 'unlockinfo', alias: ['unlockgroup'], desc: 'Allow all members to edit group info', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '🔓' },
async ({ sock, m, reply }) => { await sock.groupSettingUpdate(m.chat, 'unlocked'); await reply('Group info can now be edited by all members.'); });

cmd({ pattern: 'setname', alias: ['gcname', 'setsubject'], desc: 'Change the group name', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '<new name>', react: '✏️' },
async ({ sock, m, q, reply }) => { if (!q) return reply('Provide a new group name.'); await sock.groupUpdateSubject(m.chat, q); await reply(`Group name changed to: ${q}`); });

cmd({ pattern: 'setdesc', alias: ['gcdesc', 'setdescription'], desc: 'Change the group description', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '<text>', react: '📝' },
async ({ sock, m, q, reply }) => { if (!q) return reply('Provide a new description.'); await sock.groupUpdateDescription(m.chat, q); await reply('Group description updated.'); });

cmd({ pattern: 'setgcpp', alias: ['setgrouppp', 'gcpp'], desc: 'Change group profile picture (reply to an image)', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '🖼️' },
async ({ sock, m, reply }) => {
  if (!m.quoted?.isImage) return reply('Reply to an image to set it as the group picture.');
  const buf = await m.quoted.download();
  await sock.updateProfilePicture(m.chat, buf);
  await reply('Group profile picture updated.');
});

/* ============ GROUP INFO ============ */
cmd({ pattern: 'groupinfo', alias: ['gcinfo', 'ginfo'], desc: 'Full information about this group', category: 'group', onlyGroup: true, react: '📇' },
async ({ sock, m, metadata, participants, send, groupDoc }) => {
  const admins = participants.filter(p => p.admin).length;
  let pp = config.LOGO;
  try { pp = await sock.profilePictureUrl(m.chat, 'image'); } catch (_) {}
  const text =
`*GROUP INFORMATION*

Name        : ${metadata?.subject || 'unknown'}
JID         : ${m.chat}
Owner       : ${metadata?.owner ? '@' + jidToNum(metadata.owner) : 'unknown'}
Members     : ${participants.length}
Admins      : ${admins}
Created     : ${metadata?.creation ? new Date(metadata.creation * 1000).toLocaleString('en-GB') : 'unknown'}
Announce    : ${metadata?.announce ? 'muted' : 'open'}
Locked info : ${metadata?.restrict ? 'yes' : 'no'}
Anti-link   : ${groupDoc?.antilink ? 'on' : 'off'}
Welcome     : ${groupDoc?.welcome ? 'on' : 'off'}
NSFW        : ${groupDoc?.nsfw ? 'on' : 'off'}

Description :
${truncate(metadata?.desc || 'none', 500)}`;
  await send({ image: { url: pp }, caption: withFooter(text), mentions: metadata?.owner ? [metadata.owner] : [] });
});

cmd({ pattern: 'tagall', alias: ['everyone', 'all'], desc: 'Mention every member of the group', category: 'group', onlyGroup: true, adminOnly: true, use: '<message>', react: '📢' },
async ({ m, q, participants, send }) => {
  const mentions = participants.map(p => p.id);
  let t = `*GROUP ANNOUNCEMENT*\n\nMessage: ${q || 'Attention everyone'}\nMembers: ${mentions.length}\n\n`;
  mentions.forEach(j => { t += `@${jidToNum(j)}\n`; });
  await send({ text: withFooter(t), mentions });
});

cmd({ pattern: 'hidetag', alias: ['htag', 'silenttag'], desc: 'Tag everyone invisibly', category: 'group', onlyGroup: true, adminOnly: true, use: '<message>', react: '👻' },
async ({ m, q, participants, sock }) => {
  await sock.sendMessage(m.chat, { text: withFooter(q || 'Attention'), mentions: participants.map(p => p.id) });
});

cmd({ pattern: 'tagadmins', alias: ['admins', 'tagadmin'], desc: 'Mention only the group admins', category: 'group', onlyGroup: true, react: '🛡️' },
async ({ participants, send, metadata }) => {
  const admins = participants.filter(p => p.admin);
  if (!admins.length) return send({ text: withFooter('No admins found.') });
  let t = `*GROUP ADMINS*\n${metadata?.subject || ''}\nTotal: ${admins.length}\n\n`;
  admins.forEach((a, i) => { t += `${i + 1}. @${jidToNum(a.id)} ${a.admin === 'superadmin' ? '(owner)' : ''}\n`; });
  await send({ text: withFooter(t), mentions: admins.map(a => a.id) });
});

cmd({ pattern: 'members', alias: ['listmembers', 'memberlist'], desc: 'List every group member', category: 'group', onlyGroup: true, react: '👥' },
async ({ participants, reply }) => {
  let t = `*MEMBER LIST*\nTotal: ${participants.length}\n\n`;
  participants.forEach((p, i) => { t += `${i + 1}. ${jidToNum(p.id)}${p.admin ? ' [admin]' : ''}\n`; });
  await reply(t.slice(0, 4000));
});

cmd({ pattern: 'invite', alias: ['link', 'gclink', 'grouplink'], desc: 'Get the group invite link', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '🔗' },
async ({ sock, m, metadata, reply }) => {
  const code = await sock.groupInviteCode(m.chat);
  await reply(`*GROUP INVITE LINK*\n\n${metadata?.subject || 'Group'}\nhttps://chat.whatsapp.com/${code}`);
});

cmd({ pattern: 'revoke', alias: ['resetlink', 'revokelink'], desc: 'Reset the group invite link', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '♻️' },
async ({ sock, m, reply }) => { const c = await sock.groupRevokeInvite(m.chat); await reply(`Invite link reset.\nNew link:\nhttps://chat.whatsapp.com/${c}`); });

cmd({ pattern: 'leave', alias: ['left', 'exitgc'], desc: 'Make the bot leave this group', category: 'group', onlyGroup: true, ownerOnly: true, react: '👋' },
async ({ sock, m, reply }) => { await reply('Leaving this group. Goodbye.'); await sleep(1500); await sock.groupLeave(m.chat); });

cmd({ pattern: 'joinlink', alias: ['join'], desc: 'Make the bot join a group by invite link', category: 'group', ownerOnly: true, use: '<invite link>', react: '🚪' },
async ({ sock, q, reply }) => {
  const m2 = String(q).match(/chat\.whatsapp\.com\/([A-Za-z0-9]{15,})/);
  if (!m2) return reply('Provide a valid WhatsApp group invite link.');
  const res = await sock.groupAcceptInvite(m2[1]);
  await reply(`Joined the group successfully.\nJID: ${res}`);
});

/* ============ TOGGLES ============ */
function toggle({ pattern, alias, field, label, react }) {
  cmd({ pattern, alias, desc: `Enable or disable ${label}`, category: 'group', onlyGroup: true, adminOnly: true, use: 'on | off', react },
  async ({ m, args, reply }) => {
    const g = await db.getGroup(m.chat);
    const val = String(args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(val)) return reply(`*${label.toUpperCase()}*\n\nCurrent state: ${g[field] ? 'on' : 'off'}\n\nUse: .${pattern} on  |  .${pattern} off`);
    g[field] = val === 'on';
    await g.save();
    await reply(`${label} is now *${val}* for this group.`);
  });
}

toggle({ pattern: 'antilink', field: 'antilink', label: 'Anti-Link protection', react: '🚫' });
toggle({ pattern: 'antibot', field: 'antibot', label: 'Anti-Bot protection', react: '🤖' });
toggle({ pattern: 'antibadword', alias: ['antiswear'], field: 'antibadword', label: 'Bad word filter', react: '🤬' });
toggle({ pattern: 'antisticker', field: 'antisticker', label: 'Sticker blocker', react: '🩹' });
toggle({ pattern: 'welcome', field: 'welcome', label: 'Welcome messages', react: '🎉' });
toggle({ pattern: 'goodbye', alias: ['leftmsg'], field: 'goodbye', label: 'Goodbye messages', react: '🥲' });
toggle({ pattern: 'nsfw', field: 'nsfw', label: 'NSFW commands', react: '🔞' });
toggle({ pattern: 'gcmute', alias: ['botmute'], field: 'mute', label: 'Bot silence in this group', react: '🤐' });

cmd({ pattern: 'setwelcome', alias: ['welcomemsg'], desc: 'Set a custom welcome message', category: 'group', onlyGroup: true, adminOnly: true, use: '<text with @user and @group>', react: '💬' },
async ({ m, q, reply }) => {
  if (!q) return reply('Provide the welcome text.\nPlaceholders: @user @group\n\nExample:\n.setwelcome Hello @user, welcome to @group');
  const g = await db.getGroup(m.chat); g.welcomeText = q; g.welcome = true; await g.save();
  await reply('Welcome message saved and enabled.');
});

cmd({ pattern: 'setgoodbye', alias: ['goodbyemsg'], desc: 'Set a custom goodbye message', category: 'group', onlyGroup: true, adminOnly: true, use: '<text>', react: '💬' },
async ({ m, q, reply }) => {
  if (!q) return reply('Provide the goodbye text.\nPlaceholders: @user @group');
  const g = await db.getGroup(m.chat); g.goodbyeText = q; g.goodbye = true; await g.save();
  await reply('Goodbye message saved and enabled.');
});

cmd({ pattern: 'antilinkaction', desc: 'Choose what happens when a link is posted', category: 'group', onlyGroup: true, adminOnly: true, use: 'delete | warn | kick', react: '⚙️' },
async ({ m, args, reply }) => {
  const v = String(args[0] || '').toLowerCase();
  if (!['delete', 'warn', 'kick'].includes(v)) return reply('Choose one: delete, warn, kick\nExample: .antilinkaction kick');
  const g = await db.getGroup(m.chat); g.antilinkAction = v; await g.save();
  await reply(`Anti-link action set to *${v}*.`);
});

/* ============ WARN SYSTEM ============ */
cmd({ pattern: 'warn', desc: 'Warn a member (3 warns = removal)', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: '@user', react: '⚠️' },
async ({ sock, m, args, reply }) => {
  const t = resolveTarget(m, args);
  if (!t) return reply('Mention or reply to the member you want to warn.');
  const u = await db.getUser(t);
  u.warns = (u.warns || 0) + 1; await u.save();
  if (u.warns >= 3) {
    await sock.groupParticipantsUpdate(m.chat, [t], 'remove').catch(() => {});
    u.warns = 0; await u.save();
    return reply(`@${jidToNum(t)} reached 3 warnings and has been removed.`, { mentions: [t] });
  }
  await reply(`Warning issued to @${jidToNum(t)}\nWarns: ${u.warns}/3`, { mentions: [t] });
});

cmd({ pattern: 'unwarn', alias: ['delwarn'], desc: 'Remove one warning from a member', category: 'group', onlyGroup: true, adminOnly: true, use: '@user', react: '✅' },
async ({ m, args, reply }) => {
  const t = resolveTarget(m, args);
  if (!t) return reply('Mention or reply to the member.');
  const u = await db.getUser(t); u.warns = Math.max(0, (u.warns || 0) - 1); await u.save();
  await reply(`Warning removed for @${jidToNum(t)}\nWarns: ${u.warns}/3`, { mentions: [t] });
});

cmd({ pattern: 'warns', alias: ['checkwarn'], desc: 'Check warnings of a member', category: 'group', onlyGroup: true, use: '@user', react: '📋' },
async ({ m, args, reply }) => {
  const t = resolveTarget(m, args) || m.sender;
  const u = await db.getUser(t);
  await reply(`Warnings for @${jidToNum(t)} : ${u.warns || 0}/3`, { mentions: [t] });
});

cmd({ pattern: 'resetwarn', alias: ['clearwarns'], desc: 'Reset warnings for a member', category: 'group', onlyGroup: true, adminOnly: true, use: '@user', react: '🧹' },
async ({ m, args, reply }) => {
  const t = resolveTarget(m, args);
  if (!t) return reply('Mention or reply to the member.');
  const u = await db.getUser(t); u.warns = 0; await u.save();
  await reply(`All warnings cleared for @${jidToNum(t)}.`, { mentions: [t] });
});

/* ============ EXTRAS ============ */
cmd({ pattern: 'del', alias: ['delete', 'dlt'], desc: 'Delete a message (reply to it)', category: 'group', adminOnly: true, botAdmin: true, react: '🗑️' },
async ({ sock, m, reply }) => {
  if (!m.quoted) return reply('Reply to the message you want to delete.');
  await sock.sendMessage(m.chat, { delete: m.quoted.key });
});

cmd({ pattern: 'poll', desc: 'Create a poll in the group', category: 'group', onlyGroup: true, use: 'question | option1, option2', react: '📊' },
async ({ sock, m, q, reply }) => {
  if (!q.includes('|')) return reply('Format: .poll question | option1, option2, option3');
  const [question, opts] = q.split('|');
  const values = opts.split(',').map(s => s.trim()).filter(Boolean);
  if (values.length < 2) return reply('Provide at least two options.');
  await sock.sendMessage(m.chat, { poll: { name: question.trim(), values: values.slice(0, 12), selectableCount: 1 } });
});

cmd({ pattern: 'requests', alias: ['joinrequests'], desc: 'List pending join requests', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '📥' },
async ({ sock, m, reply }) => {
  const list = await sock.groupRequestParticipantsList(m.chat).catch(() => []);
  if (!list?.length) return reply('There are no pending join requests.');
  await reply(`*PENDING JOIN REQUESTS (${list.length})*\n\n${list.map((r, i) => `${i + 1}. ${jidToNum(r.jid)}`).join('\n')}\n\nUse .acceptall or .rejectall`);
});

cmd({ pattern: 'acceptall', desc: 'Approve all pending join requests', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '✅' },
async ({ sock, m, reply }) => {
  const list = await sock.groupRequestParticipantsList(m.chat).catch(() => []);
  if (!list?.length) return reply('No pending requests.');
  await sock.groupRequestParticipantsUpdate(m.chat, list.map(r => r.jid), 'approve');
  await reply(`Approved ${list.length} join request(s).`);
});

cmd({ pattern: 'rejectall', desc: 'Reject all pending join requests', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, react: '❌' },
async ({ sock, m, reply }) => {
  const list = await sock.groupRequestParticipantsList(m.chat).catch(() => []);
  if (!list?.length) return reply('No pending requests.');
  await sock.groupRequestParticipantsUpdate(m.chat, list.map(r => r.jid), 'reject');
  await reply(`Rejected ${list.length} join request(s).`);
});

cmd({ pattern: 'ephemeral', alias: ['disappear'], desc: 'Turn disappearing messages on or off', category: 'group', onlyGroup: true, adminOnly: true, botAdmin: true, use: 'off|1d|7d|90d', react: '⌛' },
async ({ sock, m, args, reply }) => {
  const map = { off: 0, '1d': 86400, '7d': 604800, '90d': 7776000 };
  const v = map[String(args[0] || '').toLowerCase()];
  if (v === undefined) return reply('Use one of: off, 1d, 7d, 90d');
  await sock.groupToggleEphemeral(m.chat, v);
  await reply(`Disappearing messages set to *${args[0]}*.`);
});

cmd({ pattern: 'groupstats', alias: ['gcstats'], desc: 'Activity statistics for this group', category: 'group', onlyGroup: true, react: '📈' },
async ({ participants, metadata, reply }) => {
  const jids = participants.map(p => p.id);
  const top = await db.User.find({ jid: { $in: jids } }).sort({ commandCount: -1 }).limit(10).lean();
  let t = `*GROUP ACTIVITY*\n${metadata?.subject || ''}\n\n*TOP USERS*\n`;
  top.forEach((u, i) => { t += `${i + 1}. ${jidToNum(u.jid)} — ${u.commandCount} commands\n`; });
  await reply(t);
});
