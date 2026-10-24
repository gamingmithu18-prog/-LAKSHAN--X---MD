/**
 * GAMES & INTERACTIVE COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Self-contained games with in-memory state per chat.
 * © POWERD BY LAKSHAN X MD </>
 */
const { cmd } = require('../lib/command');
const { pickRandom } = require('../lib/utils');
const crypto = require('crypto');

/* One live game of each type per chat. Auto-expires so nothing leaks. */
const games = new Map();          // `${type}:${chat}` -> state
const TTL = 10 * 60 * 1000;

function getGame(type, chat) {
  const k = `${type}:${chat}`;
  const g = games.get(k);
  if (g && Date.now() - g.at > TTL) { games.delete(k); return null; }
  return g || null;
}
const setGame = (type, chat, data) => games.set(`${type}:${chat}`, { ...data, at: Date.now() });
const endGame = (type, chat) => games.delete(`${type}:${chat}`);

setInterval(() => {
  const now = Date.now();
  for (const [k, g] of games) if (now - g.at > TTL) games.delete(k);
}, 5 * 60 * 1000).unref?.();

/* ============ WORD GUESSING ============ */

const WORDS = [
  'elephant', 'computer', 'rainbow', 'mountain', 'diamond', 'guitar', 'universe', 'penguin', 'bicycle', 'volcano',
  'chocolate', 'butterfly', 'keyboard', 'sunflower', 'telescope', 'adventure', 'lighthouse', 'waterfall', 'dinosaur',
  'pineapple', 'submarine', 'crocodile', 'strawberry', 'helicopter', 'kangaroo', 'orchestra', 'pyramid', 'astronaut',
  'jellyfish', 'motorcycle', 'watermelon', 'firefighter', 'skateboard', 'thunderstorm', 'caterpillar', 'binoculars'
];

cmd({ pattern: 'hangman', alias: ['hm'], desc: 'Start a game of hangman', category: 'games', react: '🎯' },
async ({ m, reply }) => {
  if (getGame('hangman', m.chat)) return reply('A hangman game is already running here.\nGuess with *.guessletter <letter>* or stop it with *.endgame*');
  const word = pickRandom(WORDS);
  setGame('hangman', m.chat, { word, found: new Set(), wrong: [], lives: 6 });
  await reply(`*HANGMAN STARTED*\n\nWord : ${'_ '.repeat(word.length).trim()}\nLetters : ${word.length}\nLives : 6\n\nGuess with *.guessletter a*\nGuess the whole word with *.guessword <word>*`);
});

cmd({ pattern: 'guessletter', alias: ['gl', 'letter'], desc: 'Guess a letter in hangman', category: 'games', use: '<letter>', react: '🔤' },
async ({ q, m, reply }) => {
  const g = getGame('hangman', m.chat);
  if (!g) return reply('No hangman game is running. Start one with *.hangman*');
  const ch = String(q || '').trim().toLowerCase()[0];
  if (!ch || !/[a-z]/.test(ch)) return reply('Guess a single letter.\nExample: .guessletter e');
  if (g.found.has(ch) || g.wrong.includes(ch)) return reply(`You already tried "${ch}".`);

  if (g.word.includes(ch)) {
    g.found.add(ch);
    const display = g.word.split('').map(c => (g.found.has(c) ? c : '_')).join(' ');
    if (!display.includes('_')) {
      endGame('hangman', m.chat);
      return reply(`*CORRECT - YOU WON*\n\nThe word was : ${g.word.toUpperCase()}\nLives left   : ${g.lives}`);
    }
    setGame('hangman', m.chat, g);
    return reply(`*CORRECT*\n\n${display}\nLives : ${g.lives}\nWrong : ${g.wrong.join(', ') || 'none'}`);
  }

  g.lives--;
  g.wrong.push(ch);
  if (g.lives <= 0) {
    endGame('hangman', m.chat);
    return reply(`*GAME OVER*\n\nYou ran out of lives.\nThe word was : ${g.word.toUpperCase()}`);
  }
  setGame('hangman', m.chat, g);
  const display = g.word.split('').map(c => (g.found.has(c) ? c : '_')).join(' ');
  await reply(`*WRONG*\n\n${display}\nLives : ${g.lives}\nWrong : ${g.wrong.join(', ')}`);
});

cmd({ pattern: 'guessword', alias: ['gw', 'solveword'], desc: 'Guess the full hangman word', category: 'games', use: '<word>', react: '💡' },
async ({ q, m, reply }) => {
  const g = getGame('hangman', m.chat);
  if (!g) return reply('No hangman game is running. Start one with *.hangman*');
  const guess = String(q || '').trim().toLowerCase();
  if (!guess) return reply('Type your guess.\nExample: .guessword elephant');
  if (guess === g.word) {
    endGame('hangman', m.chat);
    return reply(`*PERFECT - YOU WON*\n\nThe word was : ${g.word.toUpperCase()}`);
  }
  g.lives--;
  if (g.lives <= 0) {
    endGame('hangman', m.chat);
    return reply(`*GAME OVER*\n\nThe word was : ${g.word.toUpperCase()}`);
  }
  setGame('hangman', m.chat, g);
  await reply(`Wrong guess. Lives left : ${g.lives}`);
});

/* ============ NUMBER GUESSING ============ */

cmd({ pattern: 'numbergame', alias: ['guessnum', 'ng'], desc: 'Guess the secret number', category: 'games', use: '[max]', react: '🔢' },
async ({ args, m, reply }) => {
  if (getGame('number', m.chat)) return reply('A number game is already running here. Guess with *.ng2 <number>* or stop with *.endgame*');
  const max = Math.min(Math.max(parseInt(args[0]) || 100, 10), 10000);
  const secret = crypto.randomInt(1, max + 1);
  const tries = Math.ceil(Math.log2(max)) + 2;
  setGame('number', m.chat, { secret, max, used: 0, tries });
  await reply(`*NUMBER GUESSING GAME*\n\nI picked a number between 1 and ${max}.\nYou have ${tries} attempts.\n\nGuess with *.ng2 50*`);
});

cmd({ pattern: 'ng2', alias: ['numguess', 'tryn'], desc: 'Make a guess in the number game', category: 'games', use: '<number>', react: '🎯' },
async ({ q, m, reply }) => {
  const g = getGame('number', m.chat);
  if (!g) return reply('No number game is running. Start one with *.numbergame*');
  const n = parseInt(q);
  if (!Number.isInteger(n)) return reply('Guess a number.\nExample: .ng2 42');
  g.used++;
  if (n === g.secret) {
    endGame('number', m.chat);
    return reply(`*CORRECT*\n\nThe number was ${g.secret}\nYou found it in ${g.used} attempt(s).`);
  }
  if (g.used >= g.tries) {
    endGame('number', m.chat);
    return reply(`*OUT OF ATTEMPTS*\n\nThe number was ${g.secret}.`);
  }
  setGame('number', m.chat, g);
  const diff = Math.abs(n - g.secret);
  const heat = diff <= g.max * 0.02 ? 'burning hot' : diff <= g.max * 0.06 ? 'very warm' : diff <= g.max * 0.15 ? 'warm' : diff <= g.max * 0.3 ? 'cool' : 'freezing';
  await reply(`${n > g.secret ? 'Too HIGH' : 'Too LOW'} - you are ${heat}.\nAttempts left : ${g.tries - g.used}`);
});

/* ============ MATH QUIZ ============ */

cmd({ pattern: 'mathquiz', alias: ['mq', 'mathgame'], desc: 'Timed mental-maths question', category: 'games', use: '[easy|medium|hard]', react: '🧮' },
async ({ args, m, reply }) => {
  const lvl = String(args[0] || 'medium').toLowerCase();
  const R = (a, b) => crypto.randomInt(a, b + 1);
  let a, b, op, answer;
  if (lvl === 'easy') { a = R(1, 20); b = R(1, 20); op = pickRandom(['+', '-']); }
  else if (lvl === 'hard') { a = R(20, 200); b = R(10, 60); op = pickRandom(['+', '-', '*', '/']); }
  else { a = R(5, 50); b = R(2, 20); op = pickRandom(['+', '-', '*']); }
  if (op === '/') { answer = a; a = a * b; }
  answer = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
  setGame('math', m.chat, { answer, q: `${a} ${op} ${b}` });
  await reply(`*MATH QUIZ (${lvl})*\n\nWhat is  ${a} ${op} ${b}  ?\n\nAnswer with *.answer <number>*`);
});

cmd({ pattern: 'answer', alias: ['ans'], desc: 'Answer the current math quiz', category: 'games', use: '<number>', react: '✍️' },
async ({ q, m, reply }) => {
  const g = getGame('math', m.chat);
  if (!g) return reply('No quiz is running. Start one with *.mathquiz*');
  const n = Number(String(q).trim());
  if (!Number.isFinite(n)) return reply('Answer with a number.\nExample: .answer 42');
  endGame('math', m.chat);
  if (Math.abs(n - g.answer) < 0.001) return reply(`*CORRECT*\n\n${g.q} = ${g.answer}\nWell done.`);
  await reply(`*WRONG*\n\n${g.q} = ${g.answer}\nYou said ${n}. Try another with *.mathquiz*`);
});

/* ============ SCRAMBLE ============ */

cmd({ pattern: 'scramble', alias: ['unscramble', 'wordscramble'], desc: 'Unscramble the shuffled word', category: 'games', react: '🔀' },
async ({ m, reply }) => {
  const word = pickRandom(WORDS);
  const shuffled = word.split('').sort(() => Math.random() - 0.5).join('');
  setGame('scramble', m.chat, { word });
  await reply(`*WORD SCRAMBLE*\n\nUnscramble this:\n\n*${shuffled.toUpperCase()}*\n\nLetters : ${word.length}\nAnswer with *.unscrambleans <word>*`);
});

cmd({ pattern: 'unscrambleans', alias: ['ua', 'sans'], desc: 'Answer the word scramble', category: 'games', use: '<word>', react: '💭' },
async ({ q, m, reply }) => {
  const g = getGame('scramble', m.chat);
  if (!g) return reply('No scramble is running. Start one with *.scramble*');
  const guess = String(q || '').trim().toLowerCase();
  if (!guess) return reply('Type your answer.\nExample: .unscrambleans elephant');
  if (guess === g.word) { endGame('scramble', m.chat); return reply(`*CORRECT*\n\nThe word was ${g.word.toUpperCase()}`); }
  await reply(`Not quite. Hint: it starts with "${g.word[0].toUpperCase()}" and has ${g.word.length} letters.`);
});

cmd({ pattern: 'endgame', alias: ['stopgame', 'quitgame'], desc: 'Stop every running game in this chat', category: 'games', react: '🛑' },
async ({ m, reply }) => {
  let n = 0;
  for (const t of ['hangman', 'number', 'math', 'scramble']) if (getGame(t, m.chat)) { endGame(t, m.chat); n++; }
  await reply(n ? `Stopped ${n} running game(s) in this chat.` : 'No game is running in this chat.');
});

/* ============ SINGLE SHOT GAMES ============ */

cmd({ pattern: 'slot2', alias: ['slotmachine', 'spin'], desc: 'Spin the slot machine', category: 'games', react: '🎰' },
async ({ m, reply }) => {
  const S = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎', '7️⃣'];
  const r = [pickRandom(S), pickRandom(S), pickRandom(S)];
  let result;
  if (r[0] === r[1] && r[1] === r[2]) result = r[0] === '💎' ? 'JACKPOT - triple diamonds!' : 'BIG WIN - three of a kind!';
  else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) result = 'Small win - a pair!';
  else result = 'No luck this time.';
  await reply(`*SLOT MACHINE*\n\n╔═══════════╗\n║ ${r.join(' │ ')} ║\n╚═══════════╝\n\n${result}\n\nPlayer: ${m.pushName}`);
});

cmd({ pattern: 'dice2', alias: ['rolldice2', 'throwdice'], desc: 'Roll dice, e.g. 2d6', category: 'games', use: '<NdM>', react: '🎲' },
async ({ q, reply }) => {
  const mm = String(q || '1d6').trim().match(/^(\d*)d(\d+)$/i);
  if (!mm) return reply('Format: .dice2 2d6\n(2 dice with 6 sides)');
  const count = Math.min(Math.max(parseInt(mm[1]) || 1, 1), 20);
  const sides = Math.min(Math.max(parseInt(mm[2]) || 6, 2), 1000);
  const rolls = Array.from({ length: count }, () => crypto.randomInt(1, sides + 1));
  const sum = rolls.reduce((a, b) => a + b, 0);
  await reply(`*DICE ROLL - ${count}d${sides}*\n\nRolls : ${rolls.join(', ')}\nTotal : ${sum}\nHigh  : ${Math.max(...rolls)}\nLow   : ${Math.min(...rolls)}\nAvg   : ${(sum / count).toFixed(2)}`);
});

cmd({ pattern: 'lottery', alias: ['lotto', 'lottodraw'], desc: 'Draw random lottery numbers', category: 'games', use: '[count] [max]', react: '🎟️' },
async ({ args, reply }) => {
  const count = Math.min(Math.max(parseInt(args[0]) || 6, 1), 20);
  const max = Math.min(Math.max(parseInt(args[1]) || 49, count), 999);
  const pool = new Set();
  while (pool.size < count) pool.add(crypto.randomInt(1, max + 1));
  const nums = [...pool].sort((a, b) => a - b);
  await reply(`*LOTTERY DRAW*\n\n${nums.map(n => String(n).padStart(2, '0')).join('  -  ')}\n\nDrawn : ${count} of ${max}\nBonus : ${crypto.randomInt(1, max + 1)}\n\nGood luck.`);
});

cmd({ pattern: 'wheel', alias: ['spinwheel', 'decide'], desc: 'Spin a wheel of your own options', category: 'games', use: '<a | b | c>', react: '🎡' },
async ({ q, reply }) => {
  const opts = String(q || '').split(/[|,]/).map(s => s.trim()).filter(Boolean);
  if (opts.length < 2) return reply('Give at least two options separated by | or ,\nExample: .wheel pizza | burger | rice');
  const winner = opts[crypto.randomInt(opts.length)];
  await reply(`*WHEEL OF FORTUNE*\n\nOptions (${opts.length}):\n${opts.map(o => `• ${o}`).join('\n')}\n\nThe wheel stopped on:\n\n*${winner}*`);
});

cmd({ pattern: 'coinflip2', alias: ['flip2', 'headstails'], desc: 'Flip one or many coins', category: 'games', use: '[count]', react: '🪙' },
async ({ args, reply }) => {
  const n = Math.min(Math.max(parseInt(args[0]) || 1, 1), 50);
  const flips = Array.from({ length: n }, () => (crypto.randomInt(2) ? 'Heads' : 'Tails'));
  const heads = flips.filter(f => f === 'Heads').length;
  if (n === 1) return reply(`*COIN FLIP*\n\nResult : *${flips[0]}*`);
  await reply(`*COIN FLIPS x${n}*\n\n${flips.map(f => f[0]).join(' ')}\n\nHeads : ${heads}\nTails : ${n - heads}`);
});

cmd({ pattern: 'wyr2', alias: ['thisorthat'], desc: 'This or that - pick one', category: 'games', react: '⚖️' },
async ({ reply }) => {
  const P = [
    ['Be able to fly', 'Be invisible'], ['Never use the internet again', 'Never watch a film again'],
    ['Always be 10 minutes late', 'Always be 20 minutes early'], ['Have unlimited money', 'Have unlimited time'],
    ['Live without music', 'Live without television'], ['Know when you die', 'Know how you die'],
    ['Be famous but poor', 'Be unknown but rich'], ['Read minds', 'Predict the future'],
    ['Never feel physical pain', 'Never feel emotional pain'], ['Only whisper', 'Only shout'],
    ['Fight one horse-sized duck', 'Fight one hundred duck-sized horses'], ['Have no phone', 'Have no laptop'],
    ['Speak every language', 'Play every instrument'], ['Travel to the past', 'Travel to the future'],
    ['Always tell the truth', 'Always have to lie'], ['Live in a big city', 'Live in the countryside']
  ];
  const p = pickRandom(P);
  await reply(`*THIS OR THAT*\n\n1️⃣  ${p[0]}\n\n— OR —\n\n2️⃣  ${p[1]}\n\nReply with 1 or 2 and say why.`);
});

cmd({ pattern: 'neverhaveiever', alias: ['nhie'], desc: 'Never have I ever prompt', category: 'games', react: '🙈' },
async ({ reply }) => {
  const L = [
    'broken a bone', 'travelled outside my country', 'sung karaoke in public', 'stayed awake for 24 hours straight',
    'lied about my age', 'gone camping alone', 'forgotten my own password ten times', 'eaten food that fell on the floor',
    'sent a message to the wrong person', 'fallen asleep in a meeting', 'been on live television',
    'learned a language just for fun', 'cooked a meal for more than ten people', 'missed a flight',
    'pretended to know someone I did not', 'cried at an advertisement', 'gone a whole day without my phone'
  ];
  await reply(`*NEVER HAVE I EVER*\n\nNever have I ever...\n\n*${pickRandom(L)}*\n\nEveryone who has done it, react 🙋`);
});

cmd({ pattern: 'riddle', alias: ['puzzle'], desc: 'Get a riddle to solve', category: 'games', react: '🧩' },
async ({ m, reply }) => {
  const R = [
    ['I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', 'An echo'],
    ['The more of me you take, the more you leave behind. What am I?', 'Footsteps'],
    ['I have keys but no locks, space but no room. You can enter but not go outside. What am I?', 'A keyboard'],
    ['What has to be broken before you can use it?', 'An egg'],
    ['I am tall when I am young and short when I am old. What am I?', 'A candle'],
    ['What has hands but cannot clap?', 'A clock'],
    ['What can travel around the world while staying in a corner?', 'A postage stamp'],
    ['What gets wetter the more it dries?', 'A towel'],
    ['I have cities but no houses, forests but no trees, water but no fish. What am I?', 'A map'],
    ['What has one eye but cannot see?', 'A needle'],
    ['The person who makes it does not need it. The person who buys it does not use it. What is it?', 'A coffin'],
    ['What goes up but never comes down?', 'Your age'],
    ['What has a neck but no head?', 'A bottle'],
    ['Forward I am heavy, backward I am not. What am I?', 'The word "ton"'],
    ['What can you catch but not throw?', 'A cold']
  ];
  const [question, ans] = pickRandom(R);
  setGame('riddle', m.chat, { ans });
  await reply(`*RIDDLE*\n\n${question}\n\nReveal the answer with *.riddleans*`);
});

cmd({ pattern: 'riddleans', alias: ['solveriddle', 'reveal2'], desc: 'Reveal the answer to the last riddle', category: 'games', react: '💡' },
async ({ m, reply }) => {
  const g = getGame('riddle', m.chat);
  if (!g) return reply('No riddle is waiting. Get one with *.riddle*');
  endGame('riddle', m.chat);
  await reply(`*RIDDLE ANSWER*\n\n${g.ans}`);
});

cmd({ pattern: 'wouldyou', alias: ['dilemma'], desc: 'A moral dilemma to argue about', category: 'games', react: '🤔' },
async ({ reply }) => {
  const D = [
    'You find a wallet with a large amount of cash and an ID. Nobody saw you. What do you do?',
    'A friend asks you to lie for them to protect their job. Do you agree?',
    'You can save five strangers or one person you love. Which do you choose?',
    'You discover your company is quietly harming customers. Do you report it and lose your job?',
    'You can erase one painful memory forever. Would you?',
    'A machine offers a perfectly happy simulated life. Do you plug in?',
    'You can give one person a second chance at life. Who and why?',
    'You may know every secret anyone has ever kept about you. Do you look?'
  ];
  await reply(`*DILEMMA*\n\n${pickRandom(D)}\n\nDiscuss.`);
});

cmd({ pattern: 'rate2', alias: ['scoreme', 'howmuch'], desc: 'Rate anything out of 100 (for fun)', category: 'games', use: '<thing>', react: '💯' },
async ({ q, m, reply }) => {
  const thing = q || m.pushName;
  const seed = crypto.createHash('md5').update(String(thing).toLowerCase().trim()).digest();
  const score = seed[0] % 101;
  const bar = '█'.repeat(Math.round(score / 5)).padEnd(20, '░');
  const verdict = score >= 90 ? 'legendary' : score >= 75 ? 'excellent' : score >= 55 ? 'pretty good' : score >= 35 ? 'average' : score >= 15 ? 'needs work' : 'oh dear';
  await reply(`*RATING*\n\nSubject : ${thing}\nScore   : ${score}/100\n${bar}\nVerdict : ${verdict}\n\nThis rating is stable - the same input always gives the same score.`);
});

cmd({ pattern: 'ship2', alias: ['matchmake', 'compat'], desc: 'Compatibility score between two names', category: 'games', use: '<name1> & <name2>', react: '💞' },
async ({ q, reply }) => {
  const parts = String(q || '').split(/[&+]|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return reply('Give two names.\nExample: .ship2 Kasun & Nimali');
  const key = parts.slice(0, 2).map(s => s.toLowerCase()).sort().join('|');
  const seed = crypto.createHash('md5').update(key).digest();
  const score = seed[0] % 101;
  const bar = '❤️'.repeat(Math.round(score / 10)).padEnd(10, '🤍');
  const label = score >= 90 ? 'Soulmates' : score >= 70 ? 'Great match' : score >= 50 ? 'Promising' : score >= 30 ? 'Needs effort' : 'Better as friends';
  const shipName = parts[0].slice(0, Math.ceil(parts[0].length / 2)) + parts[1].slice(Math.floor(parts[1].length / 2));
  await reply(`*COMPATIBILITY*\n\n${parts[0]}  ❤  ${parts[1]}\n\nScore : ${score}%\n${bar}\nStatus: ${label}\nShip name: ${shipName}\n\nJust for fun.`);
});

cmd({ pattern: 'truthordare', alias: ['tod'], desc: 'Random truth or dare challenge', category: 'games', react: '🎭' },
async ({ reply }) => {
  const T = [
    'What is the most embarrassing thing you have ever done?', 'What is a secret you have never told anyone here?',
    'Who was your first crush?', 'What is the biggest lie you have told?', 'What are you most afraid of?',
    'What is the worst gift you have received?', 'What is something you pretend to like but do not?'
  ];
  const D = [
    'Send the last photo in your gallery.', 'Type your next three messages in ALL CAPS.',
    'Send a voice note singing the chorus of any song.', 'Change your profile name for one hour.',
    'Text the third person in your chat list "I know what you did".', 'Send a selfie with no filter.',
    'Speak only in questions for the next five minutes.'
  ];
  const isTruth = crypto.randomInt(2) === 0;
  await reply(`*${isTruth ? 'TRUTH' : 'DARE'}*\n\n${pickRandom(isTruth ? T : D)}`);
});

cmd({ pattern: 'rpsgame', alias: ['rps2'], desc: 'Rock paper scissors against the bot', category: 'games', use: '<rock|paper|scissors>', react: '✊' },
async ({ q, reply }) => {
  const map = { rock: '✊', paper: '✋', scissors: '✌️', r: '✊', p: '✋', s: '✌️' };
  const key = String(q || '').trim().toLowerCase();
  const user = ['rock', 'paper', 'scissors'].find(x => x === key || x[0] === key);
  if (!user) return reply('Choose rock, paper or scissors.\nExample: .rpsgame rock');
  const bot = ['rock', 'paper', 'scissors'][crypto.randomInt(3)];
  const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const result = user === bot ? 'It is a draw' : beats[user] === bot ? 'You WIN' : 'You LOSE';
  await reply(`*ROCK PAPER SCISSORS*\n\nYou : ${map[user]} ${user}\nBot : ${map[bot]} ${bot}\n\n*${result}*`);
});

cmd({ pattern: 'magic8', alias: ['ask8', 'eightball'], desc: 'Ask the magic 8-ball a question', category: 'games', use: '<question>', react: '🎱' },
async ({ q, reply }) => {
  if (!q) return reply('Ask a yes/no question.\nExample: .magic8 Will I pass my exam?');
  const A = [
    'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You may rely on it.', 'Most likely.',
    'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
    'Better not tell you now.', 'Cannot predict now.', 'Do not count on it.', 'My reply is no.',
    'My sources say no.', 'Outlook not so good.', 'Very doubtful.'
  ];
  await reply(`*MAGIC 8 BALL*\n\nQuestion : ${q}\n\nAnswer   : ${pickRandom(A)}`);
});
