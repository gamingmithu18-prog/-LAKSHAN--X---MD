/**
 * ECONOMY / GAME SYSTEM - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const db = require('../lib/database');
const { withFooter, jidToNum, numToJid, pickRandom } = require('../lib/utils');

const money = (n) => Number(n || 0).toLocaleString();
const HOUR = 3600000, DAY = 86400000;

async function wallet(jid, name = '') {
  const u = await db.getUser(jid, name);
  if (!u.economy) u.economy = { balance: 1000, bank: 0, xp: 0, level: 1 };
  return u;
}

function cooldownLeft(last, period) {
  if (!last) return 0;
  const left = period - (Date.now() - new Date(last).getTime());
  return left > 0 ? left : 0;
}

const fmtLeft = (ms) => {
  const h = Math.floor(ms / HOUR), m = Math.floor((ms % HOUR) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
};

cmd({ pattern: 'balance', alias: ['bal', 'wallet', 'money'], desc: 'Check your coin balance', category: 'economy', react: '💰' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || (args[0] ? numToJid(args[0]) : m.sender);
  const u = await wallet(t, m.pushName);
  const e = u.economy;
  await reply(`*WALLET*\n\nUser    : ${t === m.sender ? m.pushName : jidToNum(t)}\nCash    : ${money(e.balance)} coins\nBank    : ${money(e.bank)} coins\nTotal   : ${money(e.balance + e.bank)} coins\nLevel   : ${e.level}\nXP      : ${e.xp}`);
});

cmd({ pattern: 'daily', alias: ['claim'], desc: 'Claim your daily coin reward', category: 'economy', react: '🎁' },
async ({ m, reply }) => {
  const u = await wallet(m.sender, m.pushName);
  const left = cooldownLeft(u.economy.lastDaily, DAY);
  if (left) return reply(`*DAILY REWARD*\n\nYou already claimed today.\nCome back in ${fmtLeft(left)}.`);
  const amount = Math.floor(Math.random() * 3000) + 1500;
  u.economy.balance += amount;
  u.economy.lastDaily = new Date();
  u.economy.xp += 25;
  await u.save();
  await reply(`*DAILY REWARD CLAIMED*\n\nReward  : ${money(amount)} coins\nBalance : ${money(u.economy.balance)} coins\nXP      : +25\n\nCome back in 24 hours.`);
});

cmd({ pattern: 'work', alias: ['job'], desc: 'Work to earn coins', category: 'economy', react: '💼' },
async ({ m, reply }) => {
  const u = await wallet(m.sender, m.pushName);
  const left = cooldownLeft(u.economy.lastWork, HOUR);
  if (left) return reply(`*WORK*\n\nYou are tired. Rest for ${fmtLeft(left)} before working again.`);
  const jobs = ['delivered food orders', 'fixed a broken server', 'wrote code for a startup', 'sold vegetables at the market', 'drove a tuk tuk all morning', 'designed a logo', 'taught a class', 'repaired a phone screen'];
  const amount = Math.floor(Math.random() * 800) + 200;
  u.economy.balance += amount;
  u.economy.lastWork = new Date();
  u.economy.xp += 10;
  await u.save();
  await reply(`*WORK COMPLETE*\n\nYou ${pickRandom(jobs)} and earned ${money(amount)} coins.\n\nBalance : ${money(u.economy.balance)} coins\nXP      : +10`);
});

cmd({ pattern: 'rob', alias: ['steal'], desc: 'Attempt to rob another user', category: 'economy', use: '@user', react: '🥷' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] ? numToJid(args[0]) : null);
  if (!t) return reply('Mention the user you want to rob.\nExample: .rob @user');
  if (t === m.sender) return reply('You cannot rob yourself.');
  const me = await wallet(m.sender, m.pushName);
  const left = cooldownLeft(me.economy.lastRob, 2 * HOUR);
  if (left) return reply(`*ROB*\n\nThe police are still watching you. Wait ${fmtLeft(left)}.`);
  const victim = await wallet(t);
  if (victim.economy.balance < 500) return reply('That user has too little cash to be worth robbing.');
  me.economy.lastRob = new Date();
  const success = Math.random() < 0.45;
  if (success) {
    const stolen = Math.floor(victim.economy.balance * (Math.random() * 0.3 + 0.05));
    victim.economy.balance -= stolen;
    me.economy.balance += stolen;
    await Promise.all([me.save(), victim.save()]);
    return reply(`*ROBBERY SUCCESSFUL*\n\nYou stole ${money(stolen)} coins from @${jidToNum(t)}.\nBalance : ${money(me.economy.balance)} coins`, { mentions: [t] });
  }
  const fine = Math.floor(me.economy.balance * 0.15);
  me.economy.balance = Math.max(0, me.economy.balance - fine);
  await me.save();
  await reply(`*ROBBERY FAILED*\n\nYou were caught and fined ${money(fine)} coins.\nBalance : ${money(me.economy.balance)} coins`);
});

cmd({ pattern: 'deposit', alias: ['dep'], desc: 'Deposit coins into your bank', category: 'economy', use: '<amount|all>', react: '🏦' },
async ({ m, args, reply }) => {
  const u = await wallet(m.sender, m.pushName);
  const amt = String(args[0]).toLowerCase() === 'all' ? u.economy.balance : parseInt(args[0]);
  if (!amt || amt <= 0) return reply('Provide an amount.\nExample: .deposit 5000  or  .deposit all');
  if (amt > u.economy.balance) return reply(`You only have ${money(u.economy.balance)} coins in cash.`);
  u.economy.balance -= amt; u.economy.bank += amt; await u.save();
  await reply(`*DEPOSIT COMPLETE*\n\nDeposited : ${money(amt)} coins\nCash      : ${money(u.economy.balance)}\nBank      : ${money(u.economy.bank)}`);
});

cmd({ pattern: 'withdraw', alias: ['wd'], desc: 'Withdraw coins from your bank', category: 'economy', use: '<amount|all>', react: '💸' },
async ({ m, args, reply }) => {
  const u = await wallet(m.sender, m.pushName);
  const amt = String(args[0]).toLowerCase() === 'all' ? u.economy.bank : parseInt(args[0]);
  if (!amt || amt <= 0) return reply('Provide an amount.\nExample: .withdraw 5000  or  .withdraw all');
  if (amt > u.economy.bank) return reply(`Your bank only holds ${money(u.economy.bank)} coins.`);
  u.economy.bank -= amt; u.economy.balance += amt; await u.save();
  await reply(`*WITHDRAWAL COMPLETE*\n\nWithdrawn : ${money(amt)} coins\nCash      : ${money(u.economy.balance)}\nBank      : ${money(u.economy.bank)}`);
});

cmd({ pattern: 'transfer', alias: ['pay', 'give'], desc: 'Send coins to another user', category: 'economy', use: '@user <amount>', react: '🤝' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender;
  const amt = parseInt(args.find(a => /^\d+$/.test(a)));
  if (!t || !amt) return reply('Format: .transfer @user 1000');
  if (t === m.sender) return reply('You cannot transfer coins to yourself.');
  const me = await wallet(m.sender, m.pushName);
  if (amt > me.economy.balance) return reply(`Insufficient funds. You have ${money(me.economy.balance)} coins.`);
  const other = await wallet(t);
  me.economy.balance -= amt; other.economy.balance += amt;
  await Promise.all([me.save(), other.save()]);
  await reply(`*TRANSFER COMPLETE*\n\nSent    : ${money(amt)} coins\nTo      : @${jidToNum(t)}\nBalance : ${money(me.economy.balance)} coins`, { mentions: [t] });
});

cmd({ pattern: 'gamble', alias: ['bet', 'slot'], desc: 'Gamble your coins', category: 'economy', use: '<amount>', react: '🎰' },
async ({ m, args, reply }) => {
  const u = await wallet(m.sender, m.pushName);
  const amt = String(args[0]).toLowerCase() === 'all' ? u.economy.balance : parseInt(args[0]);
  if (!amt || amt <= 0) return reply('Provide a bet amount.\nExample: .gamble 1000');
  if (amt > u.economy.balance) return reply(`You only have ${money(u.economy.balance)} coins.`);
  const symbols = ['🍒', '🍋', '🔔', '⭐', '💎'];
  const roll = [pickRandom(symbols), pickRandom(symbols), pickRandom(symbols)];
  let multiplier = 0;
  if (roll[0] === roll[1] && roll[1] === roll[2]) multiplier = 5;
  else if (roll[0] === roll[1] || roll[1] === roll[2] || roll[0] === roll[2]) multiplier = 1.5;
  const win = Math.floor(amt * multiplier) - amt;
  u.economy.balance += win;
  await u.save();
  await reply(`*SLOT MACHINE*\n\n[ ${roll.join(' | ')} ]\n\nBet     : ${money(amt)}\nResult  : ${win >= 0 ? 'WON ' + money(win) : 'LOST ' + money(Math.abs(win))} coins\nBalance : ${money(u.economy.balance)} coins`);
});

cmd({ pattern: 'coinflipbet', alias: ['cfbet'], desc: 'Bet on a coin flip', category: 'economy', use: '<heads|tails> <amount>', react: '🪙' },
async ({ m, args, reply }) => {
  const side = String(args[0] || '').toLowerCase();
  const amt = parseInt(args[1]);
  if (!['heads', 'tails'].includes(side) || !amt) return reply('Format: .coinflipbet heads 1000');
  const u = await wallet(m.sender, m.pushName);
  if (amt > u.economy.balance) return reply(`You only have ${money(u.economy.balance)} coins.`);
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = side === result;
  u.economy.balance += won ? amt : -amt;
  await u.save();
  await reply(`*COIN FLIP BET*\n\nYour side : ${side}\nResult    : ${result}\nOutcome   : ${won ? 'WON ' + money(amt) : 'LOST ' + money(amt)} coins\nBalance   : ${money(u.economy.balance)} coins`);
});

cmd({ pattern: 'leaderboard', alias: ['lb', 'top', 'rich'], desc: 'Richest users leaderboard', category: 'economy', react: '🏆' },
async ({ reply }) => {
  const top = await db.User.find().sort({ 'economy.balance': -1 }).limit(15).lean();
  if (!top.length) return reply('The leaderboard is empty.');
  let t = `*RICHEST USERS*\n\n`;
  top.forEach((u, i) => {
    const total = (u.economy?.balance || 0) + (u.economy?.bank || 0);
    t += `${String(i + 1).padStart(2)}. ${jidToNum(u.jid).padEnd(14)} ${money(total)}\n`;
  });
  await reply(t);
});

cmd({ pattern: 'xptop', alias: ['levels', 'toplevel'], desc: 'Top users by level and XP', category: 'economy', react: '📈' },
async ({ reply }) => {
  const top = await db.User.find().sort({ 'economy.xp': -1 }).limit(15).lean();
  let t = `*TOP LEVELS*\n\n`;
  top.forEach((u, i) => { t += `${String(i + 1).padStart(2)}. ${jidToNum(u.jid).padEnd(14)} Lv.${u.economy?.level || 1}  XP ${u.economy?.xp || 0}\n`; });
  await reply(t);
});

cmd({ pattern: 'level', alias: ['rank', 'xp'], desc: 'Check your level and XP progress', category: 'economy', react: '🎖️' },
async ({ m, reply }) => {
  const u = await wallet(m.sender, m.pushName);
  const e = u.economy;
  const needed = e.level * 100;
  const pct = Math.min(100, Math.round((e.xp % needed) / needed * 100));
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  await reply(`*LEVEL PROFILE*\n\nUser  : ${m.pushName}\nLevel : ${e.level}\nXP    : ${e.xp}\nNext  : ${needed} XP\n\n${bar} ${pct}%\n\nCommands used: ${u.commandCount}`);
});

cmd({ pattern: 'addcoins', alias: ['givecoins'], desc: 'Add coins to a user', category: 'economy', ownerOnly: true, use: '@user <amount>', react: '➕' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] ? numToJid(args[0]) : null);
  const amt = parseInt(args.find(a => /^\d+$/.test(a) && a.length < 12));
  if (!t || !amt) return reply('Format: .addcoins @user 5000');
  const u = await wallet(t); u.economy.balance += amt; await u.save();
  await reply(`Added ${money(amt)} coins to @${jidToNum(t)}.\nNew balance: ${money(u.economy.balance)}`, { mentions: [t] });
});

cmd({ pattern: 'removecoins', alias: ['takecoins'], desc: 'Remove coins from a user', category: 'economy', ownerOnly: true, use: '@user <amount>', react: '➖' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || m.quoted?.sender || (args[0] ? numToJid(args[0]) : null);
  const amt = parseInt(args.find(a => /^\d+$/.test(a) && a.length < 12));
  if (!t || !amt) return reply('Format: .removecoins @user 5000');
  const u = await wallet(t); u.economy.balance = Math.max(0, u.economy.balance - amt); await u.save();
  await reply(`Removed ${money(amt)} coins from @${jidToNum(t)}.\nNew balance: ${money(u.economy.balance)}`, { mentions: [t] });
});

cmd({ pattern: 'resetbal', alias: ['resetbalance'], desc: 'Reset a user economy account', category: 'economy', ownerOnly: true, use: '@user', react: '🧹' },
async ({ m, args, reply }) => {
  const t = m.mentions?.[0] || (args[0] ? numToJid(args[0]) : null);
  if (!t) return reply('Mention the user.');
  const u = await wallet(t);
  u.economy = { balance: 1000, bank: 0, xp: 0, level: 1, lastDaily: null, lastWork: null, lastRob: null };
  await u.save();
  await reply(`Economy reset for @${jidToNum(t)}.`, { mentions: [t] });
});

cmd({ pattern: 'shop', alias: ['store'], desc: 'View the coin shop', category: 'economy', react: '🛒' },
async ({ reply, prefix }) => {
  await reply(
`*COIN SHOP*

1. Premium access      50,000 coins
2. Custom bot nickname 20,000 coins
3. XP boost (2x, 24h)  15,000 coins
4. Rob protection 24h  10,000 coins
5. Lottery ticket       5,000 coins

Use ${prefix}buy <number> to purchase.
Contact the owner for manual delivery of premium items.`);
});

cmd({ pattern: 'buy', desc: 'Buy an item from the shop', category: 'economy', use: '<item number>', react: '🧾' },
async ({ m, args, reply }) => {
  const items = { 1: ['Premium access', 50000], 2: ['Custom nickname', 20000], 3: ['XP boost', 15000], 4: ['Rob protection', 10000], 5: ['Lottery ticket', 5000] };
  const pick = items[args[0]];
  if (!pick) return reply('Choose a valid item number from .shop');
  const u = await wallet(m.sender, m.pushName);
  if (u.economy.balance < pick[1]) return reply(`You need ${money(pick[1])} coins but only have ${money(u.economy.balance)}.`);
  u.economy.balance -= pick[1];
  if (args[0] === '1') u.premium = true;
  if (args[0] === '5') {
    const won = Math.random() < 0.1 ? 50000 : 0;
    u.economy.balance += won;
    await u.save();
    return reply(`*LOTTERY TICKET*\n\n${won ? `You won ${money(won)} coins.` : 'No win this time. Better luck next ticket.'}\nBalance: ${money(u.economy.balance)} coins`);
  }
  await u.save();
  await reply(`*PURCHASE COMPLETE*\n\nItem    : ${pick[0]}\nCost    : ${money(pick[1])} coins\nBalance : ${money(u.economy.balance)} coins`);
});
