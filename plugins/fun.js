/**
 * FUN / ENTERTAINMENT COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const { withFooter, pickRandom, jidToNum, axios, sleep, truncate } = require('../lib/utils');

/* ============ RANDOM GENERATORS ============ */
const QUOTES = [
  'The only way to do great work is to love what you do.',
  'Success is not final, failure is not fatal: it is the courage to continue that counts.',
  'Do not watch the clock. Do what it does. Keep going.',
  'The future belongs to those who believe in the beauty of their dreams.',
  'It always seems impossible until it is done.',
  'Quality is not an act, it is a habit.',
  'Your limitation is only your imagination.',
  'Great things never came from comfort zones.',
  'Dream it. Wish it. Do it.',
  'Push yourself, because no one else is going to do it for you.',
  'Discipline is the bridge between goals and accomplishment.',
  'Little by little, a little becomes a lot.'
];

const FACTS = [
  'Honey never spoils. Archaeologists have found edible honey in ancient tombs.',
  'Octopuses have three hearts and blue blood.',
  'Bananas are berries, but strawberries are not.',
  'A day on Venus is longer than a year on Venus.',
  'The Eiffel Tower can grow about 15 cm taller in summer.',
  'Sharks existed before trees did.',
  'There are more possible chess games than atoms in the observable universe.',
  'Wombat droppings are cube shaped.',
  'The human brain uses about 20 percent of the body total energy.',
  'Sri Lanka was the first country in the world to elect a female prime minister.'
];

const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'A SQL query walks into a bar, approaches two tables and asks: may I join you?',
  'Why did the developer go broke? He used up all his cache.',
  'There are only 10 kinds of people: those who understand binary and those who do not.',
  'I would tell you a UDP joke, but you might not get it.',
  'Why do Java developers wear glasses? Because they cannot C sharp.',
  'My code does not have bugs, it just develops random features.',
  'A programmer puts two glasses on the bedside table: one full in case he gets thirsty and one empty in case he does not.'
];

const ADVICE = [
  'Sleep on big decisions. Clarity usually arrives in the morning.',
  'Track your money for one month. You will learn more than any book teaches.',
  'Learn to say no politely. Your time is your most limited resource.',
  'Fix small problems before they become expensive ones.',
  'Reply slowly when angry, quickly when grateful.'
];

function randomText({ pattern, alias, list, title, react, desc }) {
  cmd({ pattern, alias, desc, category: 'fun', react },
  async ({ reply }) => reply(`*${title}*\n\n${pickRandom(list)}`));
}

randomText({ pattern: 'quote', alias: ['motivation', 'inspire'], list: QUOTES, title: 'MOTIVATIONAL QUOTE', react: '💡', desc: 'Random motivational quote' });
randomText({ pattern: 'fact', alias: ['randomfact', 'didyouknow'], list: FACTS, title: 'RANDOM FACT', react: '🧠', desc: 'A random interesting fact' });
randomText({ pattern: 'joke', alias: ['funny', 'lol'], list: JOKES, title: 'JOKE', react: '😂', desc: 'A random joke' });
randomText({ pattern: 'advice', alias: ['tip'], list: ADVICE, title: 'LIFE ADVICE', react: '🧭', desc: 'A piece of life advice' });

cmd({ pattern: 'roll', alias: ['dice', 'rolldice'], desc: 'Roll a dice', category: 'fun', use: '<sides>', react: '🎲' },
async ({ args, reply }) => {
  const sides = Math.min(Math.max(parseInt(args[0]) || 6, 2), 1000);
  await reply(`*DICE ROLL*\n\nSides  : ${sides}\nResult : ${Math.floor(Math.random() * sides) + 1}`);
});

cmd({ pattern: 'flipcoin', alias: ['coinflip', 'toss'], desc: 'Flip a coin', category: 'fun', react: '🪙' },
async ({ reply }) => reply(`*COIN FLIP*\n\nResult : ${Math.random() < 0.5 ? 'HEADS' : 'TAILS'}`));

cmd({ pattern: 'pick', alias: ['choose', 'choice'], desc: 'Let the bot pick one option for you', category: 'fun', use: '<a, b, c>', react: '🎯' },
async ({ q, reply }) => {
  const opts = String(q).split(/[,|]/).map(s => s.trim()).filter(Boolean);
  if (opts.length < 2) return reply('Give at least two options separated by commas.\nExample: .pick pizza, burger, rice');
  await reply(`*RANDOM PICK*\n\nOptions : ${opts.join(', ')}\nChosen  : ${pickRandom(opts)}`);
});

cmd({ pattern: 'rate', desc: 'Rate anything out of 100', category: 'fun', use: '<thing>', react: '⭐' },
async ({ q, reply }) => {
  if (!q) return reply('What should I rate?\nExample: .rate my new haircut');
  await reply(`*RATING*\n\nSubject : ${q}\nScore   : ${Math.floor(Math.random() * 101)}/100`);
});

cmd({ pattern: 'ship', alias: ['love', 'lovecalc'], desc: 'Calculate compatibility between two names', category: 'fun', use: '<name1> & <name2>', react: '💕' },
async ({ q, m, reply }) => {
  let a, b;
  if (m.mentions?.length >= 2) { a = jidToNum(m.mentions[0]); b = jidToNum(m.mentions[1]); }
  else {
    const parts = String(q).split(/[&,+]/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return reply('Format: .ship Alice & Bob');
    [a, b] = parts;
  }
  let seed = 0; for (const c of (a + b).toLowerCase()) seed += c.charCodeAt(0);
  const score = seed % 101;
  const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
  const verdict = score > 85 ? 'Perfect match' : score > 65 ? 'Very strong' : score > 45 ? 'Promising' : score > 25 ? 'Needs work' : 'Better as friends';
  await reply(`*LOVE CALCULATOR*\n\n${a}  +  ${b}\n\n${bar}  ${score}%\n\nVerdict : ${verdict}`);
});

cmd({ pattern: '8ball', alias: ['ask', 'magicball'], desc: 'Ask the magic 8-ball a question', category: 'fun', use: '<question>', react: '🎱' },
async ({ q, reply }) => {
  if (!q) return reply('Ask a yes or no question.\nExample: .8ball will I get rich?');
  const answers = ['It is certain', 'Without a doubt', 'Yes definitely', 'Most likely', 'Signs point to yes', 'Reply hazy, try again', 'Ask again later', 'Cannot predict now', 'Do not count on it', 'My reply is no', 'Very doubtful', 'Absolutely not'];
  await reply(`*MAGIC 8-BALL*\n\nQuestion : ${q}\nAnswer   : ${pickRandom(answers)}`);
});

cmd({ pattern: 'wouldyourather', alias: ['wyr'], desc: 'Would you rather question', category: 'fun', react: '🤔' },
async ({ reply }) => {
  const pairs = [
    'be able to fly but only 1 metre above the ground, or be invisible but only when nobody is looking',
    'have unlimited money but no friends, or many friends but always be broke',
    'never use the internet again, or never travel outside your city again',
    'always speak your mind, or never speak again',
    'know when you will die, or how you will die'
  ];
  await reply(`*WOULD YOU RATHER*\n\nWould you rather ${pickRandom(pairs)}?`);
});

cmd({ pattern: 'truth', desc: 'Get a truth question', category: 'fun', react: '🫢' },
async ({ reply }) => {
  const t = ['What is the biggest lie you have ever told?', 'What is your most embarrassing memory?', 'Who was your first crush?', 'What is something you have never told your parents?', 'What is your worst habit?', 'What is the last thing you searched on your phone?'];
  await reply(`*TRUTH*\n\n${pickRandom(t)}`);
});

cmd({ pattern: 'dare', desc: 'Get a dare challenge', category: 'fun', react: '😈' },
async ({ reply }) => {
  const d = ['Send the 5th photo in your gallery to this chat.', 'Text your crush right now and say hello.', 'Change your profile picture to a cartoon for one hour.', 'Send a voice note singing the chorus of your favourite song.', 'Type your next 5 messages without using the letter E.'];
  await reply(`*DARE*\n\n${pickRandom(d)}`);
});

cmd({ pattern: 'insult', alias: ['roast'], desc: 'Playful roast', category: 'fun', use: '@user', react: '🔥' },
async ({ m, q, send }) => {
  const target = m.mentions?.[0];
  const name = target ? `@${jidToNum(target)}` : (q || 'you');
  const roasts = [
    'has the personality of a loading screen.',
    'is proof that even Wi-Fi can have weak signal in human form.',
    'brings so little to the table that the table complained.',
    'could argue with a calculator and still lose.',
    'is the reason shampoo bottles have instructions.'
  ];
  await send({ text: withFooter(`*ROAST*\n\n${name} ${pickRandom(roasts)}`), mentions: target ? [target] : [] });
});

cmd({ pattern: 'compliment', alias: ['praise'], desc: 'Send a nice compliment', category: 'fun', use: '@user', react: '🌷' },
async ({ m, q, send }) => {
  const target = m.mentions?.[0];
  const name = target ? `@${jidToNum(target)}` : (q || 'you');
  const nice = ['has an energy that makes rooms better.', 'is the kind of person people remember for the right reasons.', 'makes hard things look easy.', 'has genuinely great taste.', 'is doing better than they think they are.'];
  await send({ text: withFooter(`*COMPLIMENT*\n\n${name} ${pickRandom(nice)}`), mentions: target ? [target] : [] });
});

cmd({ pattern: 'fortune', alias: ['cookie'], desc: 'Open a fortune cookie', category: 'fun', react: '🥠' },
async ({ reply }) => {
  const f = ['A pleasant surprise is waiting for you this week.', 'Your hard work is about to pay off in an unexpected way.', 'Someone is thinking about you right now.', 'A new opportunity arrives when you stop chasing it.', 'Patience will bring you what force cannot.'];
  await reply(`*FORTUNE COOKIE*\n\n${pickRandom(f)}`);
});

cmd({ pattern: 'howgay', alias: ['gayrate'], desc: 'Fun percentage meter', category: 'fun', use: '@user', react: '🌈' },
async ({ m, q, send }) => {
  const target = m.mentions?.[0];
  const name = target ? `@${jidToNum(target)}` : (q || 'you');
  await send({ text: withFooter(`*FUN METER*\n\n${name} scored ${Math.floor(Math.random() * 101)}%\n\nThis is a joke command, do not take it seriously.`), mentions: target ? [target] : [] });
});

cmd({ pattern: 'iq', alias: ['iqtest'], desc: 'Random IQ estimate for fun', category: 'fun', use: '@user', react: '🧪' },
async ({ m, q, send }) => {
  const target = m.mentions?.[0];
  const name = target ? `@${jidToNum(target)}` : (q || m.pushName);
  await send({ text: withFooter(`*IQ SCANNER*\n\nSubject : ${name}\nIQ      : ${Math.floor(Math.random() * 130) + 50}\n\nEntertainment only.`), mentions: target ? [target] : [] });
});

cmd({ pattern: 'when', desc: 'Ask when something will happen', category: 'fun', use: '<question>', react: '📆' },
async ({ q, reply }) => {
  if (!q) return reply('Ask a question.\nExample: .when will I get a job');
  const ans = ['tomorrow', 'in 3 days', 'next week', 'next month', 'this year', 'in about 2 years', 'never', 'sooner than you think'];
  await reply(`*WHEN*\n\nQuestion : ${q}\nAnswer   : ${pickRandom(ans)}`);
});

cmd({ pattern: 'chance', alias: ['probability'], desc: 'Chance of something happening', category: 'fun', use: '<event>', react: '📉' },
async ({ q, reply }) => {
  if (!q) return reply('Describe the event.\nExample: .chance it rains today');
  await reply(`*PROBABILITY*\n\nEvent  : ${q}\nChance : ${Math.floor(Math.random() * 101)}%`);
});

cmd({ pattern: 'randomnumber', alias: ['rnd', 'random'], desc: 'Random number in a range', category: 'fun', use: '<min> <max>', react: '🔢' },
async ({ args, reply }) => {
  const min = parseInt(args[0]) || 1, max = parseInt(args[1]) || 100;
  if (min >= max) return reply('The minimum must be smaller than the maximum.');
  await reply(`*RANDOM NUMBER*\n\nRange  : ${min} to ${max}\nResult : ${Math.floor(Math.random() * (max - min + 1)) + min}`);
});

cmd({ pattern: 'rps', alias: ['rockpaperscissors'], desc: 'Play rock paper scissors', category: 'fun', use: 'rock|paper|scissors', react: '✊' },
async ({ args, reply }) => {
  const choices = ['rock', 'paper', 'scissors'];
  const you = String(args[0] || '').toLowerCase();
  if (!choices.includes(you)) return reply('Choose rock, paper or scissors.\nExample: .rps rock');
  const bot = pickRandom(choices);
  const win = (you === 'rock' && bot === 'scissors') || (you === 'paper' && bot === 'rock') || (you === 'scissors' && bot === 'paper');
  const result = you === bot ? 'DRAW' : win ? 'YOU WIN' : 'YOU LOSE';
  await reply(`*ROCK PAPER SCISSORS*\n\nYou : ${you}\nBot : ${bot}\n\nResult : ${result}`);
});

cmd({ pattern: 'guess', alias: ['guessnumber'], desc: 'Guess the number between 1 and 10', category: 'fun', use: '<number>', react: '🎰' },
async ({ args, reply }) => {
  const g = parseInt(args[0]);
  if (!g || g < 1 || g > 10) return reply('Guess a number between 1 and 10.\nExample: .guess 7');
  const n = Math.floor(Math.random() * 10) + 1;
  await reply(`*NUMBER GUESS*\n\nYour guess : ${g}\nMy number  : ${n}\nResult     : ${g === n ? 'Correct, well done' : 'Wrong, try again'}`);
});

cmd({ pattern: 'countdown', alias: ['timer'], desc: 'Start a countdown timer', category: 'fun', use: '<seconds>', react: '⏳' },
async ({ args, reply, sock, m }) => {
  const secs = Math.min(Math.max(parseInt(args[0]) || 10, 3), 60);
  await reply(`*COUNTDOWN STARTED*\n\nDuration : ${secs} second(s)`);
  await sleep(secs * 1000);
  await sock.sendMessage(m.chat, { text: withFooter(`*TIME IS UP*\n\n@${m.senderNum} your ${secs} second countdown finished.`), mentions: [m.sender] });
});

cmd({ pattern: 'emojimix', alias: ['mixemoji'], desc: 'Mix two emojis into a sticker', category: 'fun', use: '<emoji1>+<emoji2>', react: '🧬' },
async ({ q, reply, send }) => {
  if (!q.includes('+')) return reply('Format: .emojimix 😂+😍');
  const [a, b] = q.split('+').map(s => s.trim());
  try {
    const r = await axios.get(`https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(a)}_${encodeURIComponent(b)}`, { timeout: 30000 });
    const url = r.data?.results?.[0]?.url;
    if (!url) return reply('That emoji combination is not supported. Try two common emojis.');
    await send({ sticker: { url } });
  } catch { await reply('Emoji mixing service is unavailable right now.'); }
});

cmd({ pattern: 'meme', alias: ['randommeme'], desc: 'Random meme image', category: 'fun', react: '🃏' },
async ({ reply, send }) => {
  try {
    const r = await axios.get('https://meme-api.com/gimme', { timeout: 30000 });
    const d = r.data;
    await send({ image: { url: d.url }, caption: withFooter(`*RANDOM MEME*\n\nTitle : ${truncate(d.title, 80)}\nFrom  : r/${d.subreddit}\nUps   : ${d.ups}`) });
  } catch { await reply('Meme service is unavailable right now.'); }
});

cmd({ pattern: 'dog', alias: ['randomdog'], desc: 'Random dog picture', category: 'fun', react: '🐶' },
async ({ reply, send }) => {
  try { const r = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 30000 }); await send({ image: { url: r.data.message }, caption: withFooter('*RANDOM DOG*') }); }
  catch { await reply('Could not fetch a dog picture.'); }
});

cmd({ pattern: 'cat', alias: ['randomcat'], desc: 'Random cat picture', category: 'fun', react: '🐱' },
async ({ reply, send }) => {
  try { const r = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 30000 }); await send({ image: { url: r.data[0].url }, caption: withFooter('*RANDOM CAT*') }); }
  catch { await reply('Could not fetch a cat picture.'); }
});

cmd({ pattern: 'fox', desc: 'Random fox picture', category: 'fun', react: '🦊' },
async ({ reply, send }) => {
  try { const r = await axios.get('https://randomfox.ca/floof/', { timeout: 30000 }); await send({ image: { url: r.data.image }, caption: withFooter('*RANDOM FOX*') }); }
  catch { await reply('Could not fetch a fox picture.'); }
});

cmd({ pattern: 'duck', desc: 'Random duck picture', category: 'fun', react: '🦆' },
async ({ reply, send }) => {
  try { const r = await axios.get('https://random-d.uk/api/random', { timeout: 30000 }); await send({ image: { url: r.data.url }, caption: withFooter('*RANDOM DUCK*') }); }
  catch { await reply('Could not fetch a duck picture.'); }
});

cmd({ pattern: 'wallpaper', alias: ['wall', 'randomwall'], desc: 'Random high quality wallpaper', category: 'fun', use: '<topic>', react: '🖼️' },
async ({ q, send }) => {
  const topic = encodeURIComponent(q || 'nature');
  await send({ image: { url: `https://source.unsplash.com/1080x1920/?${topic}` }, caption: withFooter(`*WALLPAPER*\n\nTopic : ${q || 'nature'}`) });
});

cmd({ pattern: 'avatar', alias: ['randomavatar'], desc: 'Generate a unique avatar image', category: 'fun', use: '<name>', react: '👤' },
async ({ q, m, send }) => {
  const seed = encodeURIComponent(q || m.pushName || 'ghost');
  await send({ image: { url: `https://api.dicebear.com/7.x/bottts/png?seed=${seed}&size=512` }, caption: withFooter(`*GENERATED AVATAR*\n\nSeed : ${q || m.pushName}`) });
});

cmd({ pattern: 'ascii', alias: ['asciiart'], desc: 'Convert text into ASCII art', category: 'fun', use: '<text>', react: '🅰️' },
async ({ q, reply }) => {
  if (!q) return reply('Provide short text.\nExample: .ascii GHOST');
  try {
    const r = await axios.get(`https://artii.herokuapp.com/make?text=${encodeURIComponent(q.slice(0, 15))}`, { timeout: 30000 });
    await reply('```' + r.data + '```');
  } catch { await reply('ASCII service is unavailable right now.'); }
});

cmd({ pattern: 'trivia', alias: ['quiz'], desc: 'Random trivia question', category: 'fun', react: '❔' },
async ({ reply, sock, m }) => {
  try {
    const r = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 30000 });
    const t = r.data.results[0];
    const opts = [...t.incorrect_answers, t.correct_answer].sort(() => Math.random() - 0.5);
    const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
    await reply(`*TRIVIA*\n\nCategory : ${dec(t.category)}\nLevel    : ${t.difficulty}\n\n${dec(t.question)}\n\n${opts.map((o, i) => `${i + 1}. ${dec(o)}`).join('\n')}\n\nThe answer will be revealed in 20 seconds.`);
    await sleep(20000);
    await sock.sendMessage(m.chat, { text: withFooter(`*TRIVIA ANSWER*\n\n${dec(t.correct_answer)}`) });
  } catch { await reply('Trivia service is unavailable right now.'); }
});
