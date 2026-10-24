/**
 * PRODUCTIVITY & REFERENCE KIT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Offline utilities: notes, lists, planning, reference tables.
 * © POWERD BY LAKSHAN X MD </>
 */
const { cmd } = require('../lib/command');
const crypto = require('crypto');
const { pickRandom } = require('../lib/utils');

/* Per-chat scratch storage. Deliberately in-memory and capped so it
   can never grow unbounded or need a database round trip. */
const notes = new Map();     // chat -> [{ text, at }]
const todos = new Map();     // chat -> [{ text, done, at }]
const MAX_ITEMS = 60;

const listOf = (map, chat) => { if (!map.has(chat)) map.set(chat, []); return map.get(chat); };
const stamp = () => new Date().toLocaleString('en-GB', { timeZone: process.env.TZ || 'Asia/Colombo' });

/* ============ NOTES ============ */

cmd({ pattern: 'note', alias: ['addnote', 'jot'], desc: 'Save a quick note in this chat', category: 'utility', use: '<text>', react: '📝' },
async ({ q, m, reply }) => {
  const text = (q || '').trim() || m.quoted?.text;
  if (!text) return reply('What should I note down?\nExample: .note buy data package on Friday');
  const list = listOf(notes, m.chat);
  if (list.length >= MAX_ITEMS) list.shift();
  list.push({ text: text.slice(0, 500), at: stamp() });
  await reply(`*NOTE SAVED* (#${list.length})\n\n${text.slice(0, 500)}\n\nView them all with *.notes*`);
});

cmd({ pattern: 'notes', alias: ['listnotes', 'mynotes'], desc: 'Show every note saved in this chat', category: 'utility', react: '📒' },
async ({ m, reply }) => {
  const list = listOf(notes, m.chat);
  if (!list.length) return reply('No notes yet in this chat.\nSave one with *.note <text>*');
  await reply(`*NOTES (${list.length})*\n\n${list.map((n, i) => `${i + 1}. ${n.text}\n   _${n.at}_`).join('\n\n')}`);
});

cmd({ pattern: 'delnote', alias: ['removenote'], desc: 'Delete one note by its number', category: 'utility', use: '<number>', react: '🗑️' },
async ({ args, m, reply }) => {
  const list = listOf(notes, m.chat);
  const i = parseInt(args[0]) - 1;
  if (!list.length) return reply('There are no notes to delete.');
  if (Number.isNaN(i) || i < 0 || i >= list.length) return reply(`Give a note number from 1 to ${list.length}.\nExample: .delnote 2`);
  const [gone] = list.splice(i, 1);
  await reply(`*NOTE DELETED*\n\n${gone.text}\n\nRemaining: ${list.length}`);
});

cmd({ pattern: 'clearnotes', desc: 'Delete every note in this chat', category: 'utility', react: '🧹' },
async ({ m, reply }) => {
  const n = listOf(notes, m.chat).length;
  notes.set(m.chat, []);
  await reply(`*NOTES CLEARED*\n\nRemoved ${n} note(s).`);
});

/* ============ TO-DO ============ */

cmd({ pattern: 'todo', alias: ['addtask'], desc: 'Add a task to this chat to-do list', category: 'utility', use: '<task>', react: '✅' },
async ({ q, m, reply }) => {
  const text = (q || '').trim();
  if (!text) return reply('What is the task?\nExample: .todo finish the maths assignment');
  const list = listOf(todos, m.chat);
  if (list.length >= MAX_ITEMS) list.shift();
  list.push({ text: text.slice(0, 300), done: false, at: stamp() });
  await reply(`*TASK ADDED* (#${list.length})\n\n${text.slice(0, 300)}\n\nSee the list with *.todolist*`);
});

cmd({ pattern: 'todolist', alias: ['tasks', 'tl'], desc: 'Show the to-do list for this chat', category: 'utility', react: '📋' },
async ({ m, reply }) => {
  const list = listOf(todos, m.chat);
  if (!list.length) return reply('The to-do list is empty.\nAdd one with *.todo <task>*');
  const done = list.filter(t => t.done).length;
  const pct = Math.round((done / list.length) * 100);
  await reply(`*TO-DO LIST*\n\n${list.map((t, i) => `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.text}`).join('\n')}\n\nProgress: ${done}/${list.length} (${pct}%)\n${'█'.repeat(Math.round(pct / 5)).padEnd(20, '░')}`);
});

cmd({ pattern: 'donetask', alias: ['tick', 'complete'], desc: 'Mark a task as finished', category: 'utility', use: '<number>', react: '☑️' },
async ({ args, m, reply }) => {
  const list = listOf(todos, m.chat);
  const i = parseInt(args[0]) - 1;
  if (!list.length) return reply('There are no tasks yet.');
  if (Number.isNaN(i) || i < 0 || i >= list.length) return reply(`Give a task number from 1 to ${list.length}.`);
  list[i].done = !list[i].done;
  await reply(`*TASK ${list[i].done ? 'COMPLETED' : 'REOPENED'}*\n\n${list[i].text}`);
});

cmd({ pattern: 'cleartasks', alias: ['cleartodo'], desc: 'Clear the to-do list', category: 'utility', react: '🧽' },
async ({ m, reply }) => {
  const n = listOf(todos, m.chat).length;
  todos.set(m.chat, []);
  await reply(`*TO-DO CLEARED*\n\nRemoved ${n} task(s).`);
});

/* ============ DECISION HELPERS ============ */

cmd({ pattern: 'shuffle', alias: ['randomize', 'mixup'], desc: 'Shuffle a list of items randomly', category: 'utility', use: '<a, b, c>', react: '🔀' },
async ({ q, reply }) => {
  const items = String(q || '').split(/[,|\n]/).map(s => s.trim()).filter(Boolean);
  if (items.length < 2) return reply('Give at least two items separated by commas.\nExample: .shuffle Anna, Ben, Chris, Dilan');
  for (let i = items.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  await reply(`*SHUFFLED (${items.length} items)*\n\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
});

cmd({ pattern: 'teams', alias: ['maketeams', 'split'], desc: 'Split names into balanced random teams', category: 'utility', use: '<count> <a, b, c...>', react: '👥' },
async ({ args, q, reply }) => {
  const n = parseInt(args[0]);
  const rest = q.replace(/^\s*\d+\s*/, '');
  const people = rest.split(/[,|\n]/).map(s => s.trim()).filter(Boolean);
  if (!n || n < 2 || people.length < n) return reply('Format: .teams 2 Anna, Ben, Chris, Dilan\n(number of teams first, then the names)');
  for (let i = people.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [people[i], people[j]] = [people[j], people[i]]; }
  const out = Array.from({ length: n }, () => []);
  people.forEach((p, i) => out[i % n].push(p));
  await reply(`*TEAMS (${people.length} people into ${n})*\n\n${out.map((t, i) => `*Team ${i + 1}* (${t.length})\n${t.map(x => '  • ' + x).join('\n')}`).join('\n\n')}`);
});

cmd({ pattern: 'order', alias: ['queue', 'turnorder'], desc: 'Create a random turn order', category: 'utility', use: '<a, b, c>', react: '🔢' },
async ({ q, reply }) => {
  const items = String(q || '').split(/[,|\n]/).map(s => s.trim()).filter(Boolean);
  if (items.length < 2) return reply('Give at least two names.\nExample: .order Anna, Ben, Chris');
  for (let i = items.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  await reply(`*TURN ORDER*\n\n${items.map((x, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '} ${i + 1}. ${x}`).join('\n')}`);
});

cmd({ pattern: 'pickone', alias: ['chooseone', 'randompick'], desc: 'Pick one option at random', category: 'utility', use: '<a, b, c>', react: '👉' },
async ({ q, reply }) => {
  const items = String(q || '').split(/[,|\n]/).map(s => s.trim()).filter(Boolean);
  if (items.length < 2) return reply('Give at least two options.\nExample: .pickone rice, noodles, bread');
  await reply(`*RANDOM PICK*\n\nFrom ${items.length} options:\n\n*${items[crypto.randomInt(items.length)]}*`);
});

/* ============ PLANNING ============ */

cmd({ pattern: 'pomodoro', alias: ['focusplan'], desc: 'Build a pomodoro study/work schedule', category: 'utility', use: '<hours>', react: '🍅' },
async ({ q, reply }) => {
  const hours = Math.min(Math.max(parseFloat(q) || 2, 0.5), 12);
  const blocks = Math.floor((hours * 60) / 30);
  if (!blocks) return reply('Give at least half an hour.\nExample: .pomodoro 3');
  let t = 0;
  const rows = [];
  for (let i = 1; i <= blocks; i++) {
    const start = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    t += 25;
    const end = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const isLong = i % 4 === 0;
    rows.push(`${start} - ${end}  Focus block ${i}\n${end} + ${isLong ? '15 min LONG break' : '5 min break'}`);
    t += isLong ? 15 : 5;
  }
  await reply(`*POMODORO PLAN (${hours}h)*\n\n${rows.join('\n\n')}\n\nFocus blocks : ${blocks}\nFocus time   : ${blocks * 25} minutes`);
});

cmd({ pattern: 'splitwork', alias: ['divide', 'workload'], desc: 'Divide an amount of work across days', category: 'utility', use: '<total> <days>', react: '📆' },
async ({ args, reply }) => {
  const total = Number(args[0]), days = parseInt(args[1]);
  if (!Number.isFinite(total) || !days || days < 1) return reply('Format: .splitwork 350 7\n(350 pages across 7 days)');
  const per = total / days;
  const rows = [];
  let done = 0;
  for (let d = 1; d <= Math.min(days, 30); d++) {
    const chunk = d === days ? total - done : Math.round(per);
    done += chunk;
    rows.push(`Day ${String(d).padStart(2)} : ${chunk}  (running total ${done})`);
  }
  await reply(`*WORKLOAD PLAN*\n\nTotal : ${total}\nDays  : ${days}\nPer day: ${per.toFixed(1)}\n\n${rows.join('\n')}${days > 30 ? '\n...(first 30 days shown)' : ''}`);
});

cmd({ pattern: 'grade', alias: ['marks', 'gradecalc'], desc: 'Work out a percentage and letter grade', category: 'utility', use: '<scored> <total>', react: '🎓' },
async ({ args, reply }) => {
  const got = Number(args[0]), total = Number(args[1]);
  if (!Number.isFinite(got) || !Number.isFinite(total) || total <= 0) return reply('Format: .grade 78 100');
  const pct = (got / total) * 100;
  const letter = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 75 ? 'B+' : pct >= 65 ? 'B' : pct >= 55 ? 'C' : pct >= 40 ? 'S' : 'F';
  await reply(`*GRADE*\n\nScore   : ${got} / ${total}\nPercent : ${pct.toFixed(2)}%\nGrade   : ${letter}\nStatus  : ${pct >= 40 ? 'Pass' : 'Fail'}\n${'█'.repeat(Math.round(pct / 5)).padEnd(20, '░')}`);
});

cmd({ pattern: 'neededmarks', alias: ['targetmarks'], desc: 'Marks needed in the final to hit a target', category: 'utility', use: '<current%> <weight%> <target%>', react: '🎯' },
async ({ args, reply }) => {
  const cur = Number(args[0]), w = Number(args[1]), target = Number(args[2]);
  if (![cur, w, target].every(Number.isFinite) || w <= 0 || w >= 100) return reply('Format: .neededmarks 65 40 75\n(current average, final exam weight %, target overall)');
  const needed = (target - cur * (1 - w / 100)) / (w / 100);
  await reply(`*TARGET CALCULATOR*\n\nCurrent average : ${cur}%\nFinal weight    : ${w}%\nTarget overall  : ${target}%\n\nYou need *${needed.toFixed(1)}%* in the final.\n\n${needed > 100 ? 'That is above 100% - the target is out of reach.' : needed < 0 ? 'You have already secured the target.' : 'That is achievable.'}`);
});

/* ============ REFERENCE ============ */

cmd({ pattern: 'emojimeaning', alias: ['whatemoji'], desc: 'Meaning of common emoji', category: 'utility', use: '<emoji>', react: '❓' },
async ({ q, reply }) => {
  const M = {
    '😂': 'Face with tears of joy - something is very funny.', '❤️': 'Red heart - love and affection.',
    '🙏': 'Folded hands - please, thank you, or prayer.', '🔥': 'Fire - excellent, impressive, trending.',
    '💀': 'Skull - dying of laughter, or something shocking.', '👍': 'Thumbs up - agreement or approval.',
    '😭': 'Loudly crying - overwhelmed, sad or laughing hard.', '✨': 'Sparkles - special, new or clean.',
    '🤔': 'Thinking face - doubt or consideration.', '👀': 'Eyes - watching, or drawing attention.',
    '🫡': 'Saluting face - respect or acknowledgement.', '💯': 'Hundred - full agreement, keeping it real.',
    '🥲': 'Smiling with tear - happy but bittersweet.', '🤝': 'Handshake - agreement or partnership.'
  };
  const e = String(q || '').trim();
  if (!e) return reply(`*EMOJI MEANINGS*\n\n${Object.entries(M).map(([k, v]) => `${k}  ${v}`).join('\n')}`);
  const hit = Object.keys(M).find(k => e.includes(k));
  await reply(hit ? `*${hit}*\n\n${M[hit]}` : `I do not have a meaning stored for "${e.slice(0, 10)}".\nSend *.emojimeaning* on its own to see the list.`);
});

cmd({ pattern: 'phonetic', alias: ['nato', 'spellout'], desc: 'Spell a word using the NATO alphabet', category: 'utility', use: '<text>', react: '📻' },
async ({ q, m, reply }) => {
  const t = (q || '').trim() || m.quoted?.text;
  if (!t) return reply('Give a word to spell.\nExample: .phonetic GHOST');
  const N = { a: 'Alpha', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot', g: 'Golf', h: 'Hotel', i: 'India', j: 'Juliett', k: 'Kilo', l: 'Lima', m: 'Mike', n: 'November', o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform', v: 'Victor', w: 'Whiskey', x: 'X-ray', y: 'Yankee', z: 'Zulu' };
  const out = t.toLowerCase().slice(0, 60).split('').map(c => (N[c] ? N[c] : c === ' ' ? '(space)' : /[0-9]/.test(c) ? c : c)).join(' - ');
  await reply(`*NATO PHONETIC*\n\n${t}\n\n${out}`);
});

cmd({ pattern: 'romannum', alias: ['numwords', 'spellnumber'], desc: 'Write a number out in English words', category: 'utility', use: '<number>', react: '🔤' },
async ({ q, reply }) => {
  const n = parseInt(String(q).replace(/[, ]/g, ''));
  if (!Number.isInteger(n) || Math.abs(n) > 999999999) return reply('Give a whole number up to 999,999,999.\nExample: .numwords 4207');
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const conv = (x) => {
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : '');
    if (x < 1000) return ones[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' and ' + conv(x % 100) : '');
    if (x < 1e6) return conv(Math.floor(x / 1000)) + ' thousand' + (x % 1000 ? ' ' + conv(x % 1000) : '');
    return conv(Math.floor(x / 1e6)) + ' million' + (x % 1e6 ? ' ' + conv(x % 1e6) : '');
  };
  await reply(`*NUMBER IN WORDS*\n\n${n.toLocaleString()}\n\n${(n < 0 ? 'minus ' : '') + conv(Math.abs(n))}`);
});

cmd({ pattern: 'zodiac', alias: ['starsign', 'horoscope2'], desc: 'Find the star sign for a birth date', category: 'utility', use: '<MM-DD>', react: '♈' },
async ({ q, reply }) => {
  const mm = String(q || '').match(/(\d{1,2})\D+(\d{1,2})/);
  if (!mm) return reply('Give a month and day.\nExample: .zodiac 06-15');
  const [month, day] = [parseInt(mm[1]), parseInt(mm[2])];
  const S = [
    [1, 20, 'Capricorn ♑', 'Earth'], [2, 19, 'Aquarius ♒', 'Air'], [3, 21, 'Pisces ♓', 'Water'],
    [4, 20, 'Aries ♈', 'Fire'], [5, 21, 'Taurus ♉', 'Earth'], [6, 21, 'Gemini ♊', 'Air'],
    [7, 23, 'Cancer ♋', 'Water'], [8, 23, 'Leo ♌', 'Fire'], [9, 23, 'Virgo ♍', 'Earth'],
    [10, 23, 'Libra ♎', 'Air'], [11, 22, 'Scorpio ♏', 'Water'], [12, 22, 'Sagittarius ♐', 'Fire'],
    [12, 32, 'Capricorn ♑', 'Earth']
  ];
  const hit = S.find(([m, d]) => month < m || (month === m && day < d)) || S[S.length - 1];
  await reply(`*STAR SIGN*\n\nDate    : ${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}\nSign    : ${hit[2]}\nElement : ${hit[3]}`);
});

cmd({ pattern: 'chinesezodiac', alias: ['cnzodiac'], desc: 'Chinese zodiac animal for a year', category: 'utility', use: '<year>', react: '🐉' },
async ({ q, reply }) => {
  const y = parseInt(q);
  if (!y || y < 1900 || y > 2200) return reply('Give a year between 1900 and 2200.\nExample: .chinesezodiac 1998');
  const A = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
  const E = ['Metal', 'Metal', 'Water', 'Water', 'Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth'];
  await reply(`*CHINESE ZODIAC*\n\nYear    : ${y}\nAnimal  : ${A[(y - 1900) % 12]}\nElement : ${E[(y - 1900) % 10]}`);
});

cmd({ pattern: 'birthstone', alias: ['gemstone'], desc: 'Birthstone and flower for a month', category: 'utility', use: '<month>', react: '💎' },
async ({ q, reply }) => {
  const B = [
    ['January', 'Garnet', 'Carnation'], ['February', 'Amethyst', 'Violet'], ['March', 'Aquamarine', 'Daffodil'],
    ['April', 'Diamond', 'Daisy'], ['May', 'Emerald', 'Lily of the valley'], ['June', 'Pearl', 'Rose'],
    ['July', 'Ruby', 'Larkspur'], ['August', 'Peridot', 'Gladiolus'], ['September', 'Sapphire', 'Aster'],
    ['October', 'Opal', 'Marigold'], ['November', 'Topaz', 'Chrysanthemum'], ['December', 'Turquoise', 'Narcissus']
  ];
  const raw = String(q || '').trim().toLowerCase();
  let i = parseInt(raw) - 1;
  if (Number.isNaN(i) || i < 0 || i > 11) i = B.findIndex(b => b[0].toLowerCase().startsWith(raw.slice(0, 3)));
  if (i < 0) return reply('Give a month.\nExample: .birthstone June   or   .birthstone 6');
  await reply(`*BIRTH SYMBOLS*\n\nMonth      : ${B[i][0]}\nBirthstone : ${B[i][1]}\nFlower     : ${B[i][2]}`);
});

cmd({ pattern: 'countdownnewyear', alias: ['newyear'], desc: 'Time left until the next new year', category: 'utility', react: '🎆' },
async ({ reply }) => {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const ms = target - now;
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), mn = Math.floor((ms % 3600000) / 60000);
  const total = 365.25 * 86400000;
  const pct = Math.round(((total - ms) / total) * 100);
  await reply(`*NEW YEAR COUNTDOWN*\n\nTarget : 1 January ${target.getUTCFullYear()}\n\nDays   : ${d}\nExact  : ${d}d ${h}h ${mn}m\n\nYear progress: ~${pct}%\n${'█'.repeat(Math.round(pct / 5)).padEnd(20, '░')}`);
});

cmd({ pattern: 'weekinfo', alias: ['weeknumber', 'dayinfo'], desc: 'Week number and details for a date', category: 'utility', use: '[YYYY-MM-DD]', react: '📅' },
async ({ q, reply, config }) => {
  const d = q ? new Date(q) : new Date();
  if (Number.isNaN(d.getTime())) return reply('Give a valid date.\nExample: .weekinfo 2026-07-27');
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((d - start) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInYear = isLeap(d.getUTCFullYear()) ? 366 : 365;
  await reply(`*DATE DETAILS*\n\nDate        : ${d.toDateString()}\nDay of week : ${d.toLocaleDateString('en-GB', { weekday: 'long' })}\nDay of year : ${dayOfYear} of ${daysInYear}\nWeek number : ${week}\nQuarter     : Q${Math.ceil((d.getUTCMonth() + 1) / 3)}\nLeap year   : ${isLeap(d.getUTCFullYear()) ? 'yes' : 'no'}\nYear left   : ${daysInYear - dayOfYear} days`);
});

cmd({ pattern: 'motivate', alias: ['pushme', 'encourage'], desc: 'A short motivational push', category: 'utility', react: '🚀' },
async ({ reply }) => {
  const M = [
    'Start before you feel ready. Momentum comes from motion, not from waiting.',
    'One finished task beats ten perfect plans.',
    'The work you avoid today becomes the pressure you feel tomorrow.',
    'Small daily progress compounds faster than rare bursts of effort.',
    'You do not need more time, you need fewer open tabs.',
    'Discipline is choosing what you want most over what you want now.',
    'Every expert was once a beginner who refused to quit.',
    'Focus on the next single step, not the whole staircase.',
    'Consistency beats intensity when the goal is far away.',
    'Done is better than perfect, and shipped is better than planned.'
  ];
  await reply(`*MOTIVATION*\n\n${pickRandom(M)}`);
});

cmd({ pattern: 'checklist', alias: ['steps'], desc: 'Turn a comma list into a tick-box checklist', category: 'utility', use: '<a, b, c>', react: '☑️' },
async ({ q, reply }) => {
  const items = String(q || '').split(/[,|\n]/).map(s => s.trim()).filter(Boolean);
  if (!items.length) return reply('Give some items.\nExample: .checklist pack bag, charge phone, print ticket');
  await reply(`*CHECKLIST (${items.length})*\n\n${items.map(x => `⬜ ${x}`).join('\n')}`);
});

cmd({ pattern: 'progressbar', alias: ['progress'], desc: 'Draw a progress bar for any value', category: 'utility', use: '<done> <total>', react: '📊' },
async ({ args, reply }) => {
  const done = Number(args[0]), total = Number(args[1]);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return reply('Format: .progressbar 35 100');
  const pct = Math.max(0, Math.min(100, (done / total) * 100));
  await reply(`*PROGRESS*\n\n${done} of ${total}\n\n${'█'.repeat(Math.round(pct / 4)).padEnd(25, '░')}\n${pct.toFixed(1)}% complete\nRemaining: ${Math.max(0, total - done)}`);
});

cmd({ pattern: 'randomname', alias: ['namepicker', 'fakename'], desc: 'Generate random display names', category: 'utility', use: '[count]', react: '🎭' },
async ({ args, reply }) => {
  const n = Math.min(Math.max(parseInt(args[0]) || 5, 1), 20);
  const A = ['Silent', 'Crimson', 'Golden', 'Shadow', 'Rapid', 'Frozen', 'Neon', 'Iron', 'Lunar', 'Solar', 'Wild', 'Ghost'];
  const B = ['Falcon', 'Tiger', 'Comet', 'Wolf', 'Phoenix', 'Raven', 'Viper', 'Drift', 'Blade', 'Storm', 'Echo', 'Nova'];
  const out = Array.from({ length: n }, () => `${A[crypto.randomInt(A.length)]}${B[crypto.randomInt(B.length)]}${crypto.randomInt(10, 100)}`);
  await reply(`*RANDOM NAMES*\n\n${out.map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
});

cmd({ pattern: 'strengthcheck', alias: ['passcheck', 'pwstrength'], desc: 'Rate how strong a password is', category: 'utility', use: '<password>', react: '🔐' },
async ({ q, reply }) => {
  const p = String(q || '');
  if (!p) return reply('Give a password to check.\nExample: .strengthcheck MyP@ssw0rd\n\nTip: do not test a password you actually use.');
  let score = 0;
  const checks = [
    [p.length >= 8, 'at least 8 characters'], [p.length >= 14, 'at least 14 characters'],
    [/[a-z]/.test(p), 'lowercase letters'], [/[A-Z]/.test(p), 'uppercase letters'],
    [/[0-9]/.test(p), 'numbers'], [/[^A-Za-z0-9]/.test(p), 'symbols'],
    [!/(.)\1{2,}/.test(p), 'no long repeats'], [!/^(123|abc|qwe|password|admin)/i.test(p), 'no common prefix']
  ];
  checks.forEach(([ok]) => { if (ok) score++; });
  const pct = Math.round((score / checks.length) * 100);
  const label = pct >= 90 ? 'Very strong' : pct >= 70 ? 'Strong' : pct >= 50 ? 'Moderate' : pct >= 30 ? 'Weak' : 'Very weak';
  await reply(`*PASSWORD STRENGTH*\n\nLength : ${p.length}\nScore  : ${score}/${checks.length} (${pct}%)\nRating : ${label}\n${'█'.repeat(Math.round(pct / 5)).padEnd(20, '░')}\n\n${checks.map(([ok, name]) => `${ok ? '✅' : '❌'} ${name}`).join('\n')}\n\nNever share a real password in a chat.`);
});

cmd({ pattern: 'summarylines', alias: ['bulletise', 'tobullets'], desc: 'Turn sentences into bullet points', category: 'utility', use: '<text>', react: '•' },
async ({ q, m, reply }) => {
  const t = (q || '').trim() || m.quoted?.text;
  if (!t) return reply('Give some text or reply to a message.\nExample: .tobullets First point. Second point. Third point.');
  const parts = t.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean).slice(0, 30);
  await reply(`*BULLET POINTS (${parts.length})*\n\n${parts.map(p => `• ${p.replace(/[.]$/, '')}`).join('\n')}`);
});

cmd({ pattern: 'initialsavatar', alias: ['monogram'], desc: 'Make a text monogram from a name', category: 'utility', use: '<name>', react: '🅰️' },
async ({ q, reply }) => {
  const t = String(q || '').trim();
  if (!t) return reply('Give a name.\nExample: .monogram Kasun Perera');
  const parts = t.split(/\s+/).filter(Boolean);
  const ini = parts.map(p => p[0].toUpperCase()).join('');
  const big = ini.split('').map(c => String.fromCodePoint(0x1F170 + c.charCodeAt(0) - 65)).join(' ');
  await reply(`*MONOGRAM*\n\nName     : ${t}\nInitials : ${ini}\n\n${big}`);
});

cmd({ pattern: 'caseconvertall', alias: ['allcases'], desc: 'Show a text in every case style at once', category: 'utility', use: '<text>', react: '🔠' },
async ({ q, m, reply }) => {
  const t = ((q || '').trim() || m.quoted?.text || '').trim();
  if (!t) return reply('Give some text.\nExample: .allcases hello world example');
  const w = t.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/[_-]/g, ' ').split(/\s+/).filter(Boolean);
  await reply(
`*ALL CASE STYLES*

Original   : ${t}
UPPER      : ${t.toUpperCase()}
lower      : ${t.toLowerCase()}
Title Case : ${t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
camelCase  : ${w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase())).join('')}
PascalCase : ${w.map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join('')}
snake_case : ${w.join('_').toLowerCase()}
kebab-case : ${w.join('-').toLowerCase()}
CONST_CASE : ${w.join('_').toUpperCase()}`);
});
