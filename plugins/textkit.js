/**
 * TEXT KIT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Pure offline text manipulation. No API, no network, never fails.
 * © POWERD BY LAKSHAN X MD </>
 */
const { cmd } = require('../lib/command');

/* Text taken from the argument, or from the message you replied to. */
const input = ({ q, m }) => (q && q.trim()) || m.quoted?.text || '';
const need = (reply, example) => reply(`Provide some text, or reply to a message.\n\nExample: ${example}`);
const CAP = 3500;
const cut = (s) => (s.length > CAP ? s.slice(0, CAP) + '\n\n...(truncated)' : s);
const words = (t) => t.trim().split(/\s+/).filter(Boolean);

/* ============ CASE CONVERSION ============ */

cmd({ pattern: 'titlecase', alias: ['tcase'], desc: 'Capitalise The First Letter Of Every Word', category: 'text', use: '<text>', react: '🔤' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.titlecase hello world');
  await ctx.reply('*TITLE CASE*\n\n' + cut(t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())));
});

cmd({ pattern: 'sentencecase', alias: ['scase'], desc: 'Fix capitalisation sentence by sentence', category: 'text', use: '<text>', react: '📝' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.sentencecase hello. how are you');
  const out = t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase());
  await ctx.reply('*SENTENCE CASE*\n\n' + cut(out));
});

cmd({ pattern: 'togglecase', alias: ['swapcase'], desc: 'Swap upper and lower case', category: 'text', use: '<text>', react: '🔃' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.togglecase Hello World');
  const out = t.replace(/[a-zA-Z]/g, c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
  await ctx.reply('*TOGGLED CASE*\n\n' + cut(out));
});

cmd({ pattern: 'randomcase', alias: ['mockcase', 'spongebob'], desc: 'rAnDoM mOcKiNg CaSe', category: 'text', use: '<text>', react: '🤪' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.randomcase this is fine');
  const out = t.split('').map(c => (Math.random() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join('');
  await ctx.reply('*MOCKING CASE*\n\n' + cut(out));
});

cmd({ pattern: 'camelcase', alias: ['camel'], desc: 'Convert text to camelCase', category: 'text', use: '<text>', react: '🐫' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.camelcase hello world again');
  const w = words(t.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/[_-]/g, ' '));
  const out = w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase())).join('');
  await ctx.reply(`*CAMEL CASE*\n\n${out}`);
});

cmd({ pattern: 'pascalcase', alias: ['pascal'], desc: 'Convert text to PascalCase', category: 'text', use: '<text>', react: '🅿️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.pascalcase hello world');
  const out = words(t.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/[_-]/g, ' '))
    .map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join('');
  await ctx.reply(`*PASCAL CASE*\n\n${out}`);
});

cmd({ pattern: 'snakecase', alias: ['snake'], desc: 'Convert text to snake_case', category: 'text', use: '<text>', react: '🐍' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.snakecase Hello World');
  await ctx.reply(`*SNAKE CASE*\n\n${words(t.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/[_-]/g, ' ')).join('_').toLowerCase()}`);
});

cmd({ pattern: 'kebabcase', alias: ['kebab', 'slugify', 'slug'], desc: 'Convert text to kebab-case / url slug', category: 'text', use: '<text>', react: '🍢' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.slugify My Blog Post Title');
  const out = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await ctx.reply(`*SLUG / KEBAB CASE*\n\n${out}`);
});

cmd({ pattern: 'constcase', alias: ['screamcase'], desc: 'Convert text to CONSTANT_CASE', category: 'text', use: '<text>', react: '📢' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.constcase max retry count');
  await ctx.reply(`*CONSTANT CASE*\n\n${words(t.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/[_-]/g, ' ')).join('_').toUpperCase()}`);
});

/* ============ LINE OPERATIONS ============ */

cmd({ pattern: 'sortlines', alias: ['sortl'], desc: 'Sort every line alphabetically', category: 'text', use: '<multi-line text>', react: '🔡' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a list and send .sortlines');
  const desc = /^-r\b|--desc/.test(ctx.q);
  const lines = t.replace(/^(-r|--desc)\s*/, '').split('\n').filter(l => l.trim());
  lines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  if (desc) lines.reverse();
  await ctx.reply(`*SORTED (${lines.length} lines${desc ? ', descending' : ''})*\n\n` + cut(lines.join('\n')));
});

cmd({ pattern: 'dedupe', alias: ['uniquelines', 'removeduplicates'], desc: 'Remove duplicate lines', category: 'text', use: '<multi-line text>', react: '♻️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a list and send .dedupe');
  const all = t.split('\n').map(l => l.trim()).filter(Boolean);
  const uniq = [...new Set(all)];
  await ctx.reply(`*DUPLICATES REMOVED*\n\nBefore : ${all.length} lines\nAfter  : ${uniq.length} lines\nRemoved: ${all.length - uniq.length}\n\n` + cut(uniq.join('\n')));
});

cmd({ pattern: 'shufflelines', alias: ['shufflel'], desc: 'Randomly shuffle the lines', category: 'text', use: '<multi-line text>', react: '🔀' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a list and send .shufflelines');
  const l = t.split('\n').filter(x => x.trim());
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  await ctx.reply('*SHUFFLED*\n\n' + cut(l.join('\n')));
});

cmd({ pattern: 'numberlines', alias: ['numlines', 'nl'], desc: 'Add a number to every line', category: 'text', use: '<multi-line text>', react: '🔢' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a list and send .numberlines');
  const l = t.split('\n').filter(x => x.trim());
  const pad = String(l.length).length;
  await ctx.reply('*NUMBERED*\n\n' + cut(l.map((x, i) => `${String(i + 1).padStart(pad, ' ')}. ${x.trim()}`).join('\n')));
});

cmd({ pattern: 'reverselines', alias: ['revlines'], desc: 'Reverse the order of the lines', category: 'text', use: '<multi-line text>', react: '↕️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a list and send .reverselines');
  await ctx.reply('*REVERSED ORDER*\n\n' + cut(t.split('\n').filter(x => x.trim()).reverse().join('\n')));
});

cmd({ pattern: 'cleantext', alias: ['tidy', 'trimlines'], desc: 'Strip extra spaces and blank lines', category: 'text', use: '<text>', react: '🧹' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.cleantext   messy    text   here');
  const out = t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  await ctx.reply(`*CLEANED*\n\nSaved ${t.length - out.length} characters.\n\n` + cut(out));
});

cmd({ pattern: 'removespaces', alias: ['nospace'], desc: 'Delete every space from the text', category: 'text', use: '<text>', react: '🚫' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.removespaces h e l l o');
  await ctx.reply('*SPACES REMOVED*\n\n' + cut(t.replace(/\s+/g, '')));
});

cmd({ pattern: 'spaceout', alias: ['spread'], desc: 'P u t   s p a c e   b e t w e e n   l e t t e r s', category: 'text', use: '<text>', react: '🪄' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.spaceout ghost');
  await ctx.reply('*SPACED OUT*\n\n' + cut(t.split('').join(' ')));
});

cmd({ pattern: 'wraptext', alias: ['wrap'], desc: 'Wrap text at a given line width', category: 'text', use: '<width> <text>', react: '📐' },
async (ctx) => {
  const width = Math.min(Math.max(parseInt(ctx.args[0]) || 40, 10), 200);
  const t = ctx.args.slice(1).join(' ') || ctx.m.quoted?.text;
  if (!t) return need(ctx.reply, '.wraptext 30 your long paragraph here');
  const out = [];
  let line = '';
  for (const w of words(t)) {
    if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  await ctx.reply(`*WRAPPED AT ${width}*\n\n` + cut(out.join('\n')));
});

cmd({ pattern: 'repeat', alias: ['xtimes'], desc: 'Repeat text N times', category: 'text', use: '<times> <text>', react: '🔁' },
async (ctx) => {
  const n = Math.min(Math.max(parseInt(ctx.args[0]) || 0, 1), 100);
  const t = ctx.args.slice(1).join(' ') || ctx.m.quoted?.text;
  if (!t) return need(ctx.reply, '.repeat 5 ghost');
  await ctx.reply(`*REPEATED x${n}*\n\n` + cut(Array(n).fill(t).join('\n')));
});

/* ============ EXTRACTION ============ */

cmd({ pattern: 'extracturls', alias: ['extractlinks', 'getlinks'], desc: 'Pull every link out of a text', category: 'text', use: '<text>', react: '🔗' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a message and send .extracturls');
  const found = [...new Set(t.match(/https?:\/\/[^\s<>"')]+/gi) || [])];
  if (!found.length) return ctx.reply('No links found in that text.');
  await ctx.reply(`*LINKS FOUND (${found.length})*\n\n` + cut(found.map((u, i) => `${i + 1}. ${u}`).join('\n')));
});

cmd({ pattern: 'extractemails', alias: ['getemails'], desc: 'Pull every e-mail address out of a text', category: 'text', use: '<text>', react: '📧' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a message and send .extractemails');
  const found = [...new Set(t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])];
  if (!found.length) return ctx.reply('No e-mail addresses found in that text.');
  await ctx.reply(`*EMAILS FOUND (${found.length})*\n\n` + cut(found.join('\n')));
});

cmd({ pattern: 'extractnumbers', alias: ['getnumbers'], desc: 'Pull every number out of a text', category: 'text', use: '<text>', react: '🔟' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a message and send .extractnumbers');
  const found = t.match(/-?\d+(\.\d+)?/g) || [];
  if (!found.length) return ctx.reply('No numbers found in that text.');
  const nums = found.map(Number);
  const sum = nums.reduce((a, b) => a + b, 0);
  await ctx.reply(`*NUMBERS FOUND (${found.length})*\n\n${cut(found.join(', '))}\n\nSum     : ${sum}\nAverage : ${(sum / nums.length).toFixed(2)}`);
});

cmd({ pattern: 'findreplace', alias: ['replaceall', 'sub'], desc: 'Find and replace inside a text', category: 'text', use: '<find>|<replace> (reply to text)', react: '🔍' },
async (ctx) => {
  const [find, rep = ''] = String(ctx.q || '').split('|');
  const t = ctx.m.quoted?.text;
  if (!t || !find) return ctx.reply('Reply to a message and use:\n.findreplace old|new');
  const count = t.split(find).length - 1;
  await ctx.reply(`*REPLACED ${count} occurrence(s)*\n\n` + cut(t.split(find).join(rep)));
});

cmd({ pattern: 'grep', alias: ['filterlines'], desc: 'Keep only the lines containing a word', category: 'text', use: '<word> (reply to text)', react: '🔎' },
async (ctx) => {
  const needle = String(ctx.q || '').trim();
  const t = ctx.m.quoted?.text;
  if (!t || !needle) return ctx.reply('Reply to a text and use:\n.grep keyword');
  const hits = t.split('\n').filter(l => l.toLowerCase().includes(needle.toLowerCase()));
  if (!hits.length) return ctx.reply(`No line contains "${needle}".`);
  await ctx.reply(`*MATCHES (${hits.length})*\n\n` + cut(hits.join('\n')));
});

/* ============ ANALYSIS ============ */

cmd({ pattern: 'wordfreq', alias: ['wordcount2', 'topwords'], desc: 'Most frequently used words', category: 'text', use: '<text>', react: '📊' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to a long message and send .wordfreq');
  const freq = {};
  for (const w of t.toLowerCase().match(/[a-z\u0D80-\u0DFF']+/gi) || []) freq[w] = (freq[w] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!top.length) return ctx.reply('No words to count.');
  const max = top[0][1];
  const rows = top.map(([w, n]) => `${w.padEnd(14).slice(0, 14)} ${'▇'.repeat(Math.max(1, Math.round((n / max) * 12)))} ${n}`);
  await ctx.reply(`*WORD FREQUENCY (top ${top.length})*\n\n\`\`\`${rows.join('\n')}\`\`\``);
});

cmd({ pattern: 'charfreq', alias: ['letterfreq'], desc: 'Most frequently used letters', category: 'text', use: '<text>', react: '🔠' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.charfreq hello world');
  const freq = {};
  for (const c of t.toLowerCase().replace(/[^a-z]/g, '')) freq[c] = (freq[c] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (!top.length) return ctx.reply('No letters to count.');
  await ctx.reply('*LETTER FREQUENCY*\n\n' + top.map(([c, n]) => `${c} : ${'▇'.repeat(Math.min(n, 20))} ${n}`).join('\n'));
});

cmd({ pattern: 'readtime', alias: ['readingtime'], desc: 'Estimate how long a text takes to read', category: 'text', use: '<text>', react: '⏱️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, 'reply to an article and send .readtime');
  const w = words(t).length;
  const mins = w / 200, speak = w / 130;
  const f = (m) => (m < 1 ? `${Math.ceil(m * 60)} sec` : `${Math.floor(m)} min ${Math.round((m % 1) * 60)} sec`);
  await ctx.reply(`*READING TIME*\n\nWords        : ${w}\nCharacters   : ${t.length}\nSentences    : ${t.split(/[.!?]+/).filter(x => x.trim()).length}\n\nSilent read  : ${f(mins)}\nRead aloud   : ${f(speak)}`);
});

cmd({ pattern: 'palindrome', alias: ['ispalindrome'], desc: 'Check whether a text is a palindrome', category: 'text', use: '<text>', react: '🪞' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.palindrome A man a plan a canal Panama');
  const clean = t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rev = clean.split('').reverse().join('');
  await ctx.reply(`*PALINDROME CHECK*\n\nText     : ${t.slice(0, 100)}\nNormalised: ${clean.slice(0, 100)}\nResult   : ${clean && clean === rev ? 'YES - it is a palindrome' : 'NO - not a palindrome'}`);
});

cmd({ pattern: 'anagram', alias: ['isanagram'], desc: 'Check if two words are anagrams', category: 'text', use: '<word1> <word2>', react: '🔤' },
async (ctx) => {
  const [a, b] = String(ctx.q || '').split(/\s+/);
  if (!a || !b) return ctx.reply('Give two words.\nExample: .anagram listen silent');
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '').split('').sort().join('');
  await ctx.reply(`*ANAGRAM CHECK*\n\n${a} <-> ${b}\nResult : ${norm(a) === norm(b) && norm(a) ? 'YES - they are anagrams' : 'NO - not anagrams'}`);
});

cmd({ pattern: 'acronym', alias: ['initials'], desc: 'Build an acronym from a phrase', category: 'text', use: '<phrase>', react: '🅰️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.acronym as soon as possible');
  const w = words(t).filter(x => /[a-zA-Z]/.test(x));
  await ctx.reply(`*ACRONYM*\n\nPhrase  : ${t}\nAcronym : ${w.map(x => x[0].toUpperCase()).join('')}\nDotted  : ${w.map(x => x[0].toUpperCase()).join('.')}.`);
});

cmd({ pattern: 'vowels', alias: ['vowelcount'], desc: 'Count vowels and consonants', category: 'text', use: '<text>', react: '🅾️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.vowels hello world');
  const v = (t.match(/[aeiou]/gi) || []).length;
  const c = (t.match(/[b-df-hj-np-tv-z]/gi) || []).length;
  const d = (t.match(/[0-9]/g) || []).length;
  await ctx.reply(`*CHARACTER BREAKDOWN*\n\nVowels     : ${v}\nConsonants : ${c}\nDigits     : ${d}\nSpaces     : ${(t.match(/\s/g) || []).length}\nOther      : ${t.length - v - c - d - (t.match(/\s/g) || []).length}\nTotal      : ${t.length}`);
});

/* ============ CIPHERS & FUN TEXT ============ */

cmd({ pattern: 'rot13', desc: 'Encode or decode ROT13', category: 'text', use: '<text>', react: '🔐' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.rot13 hello world');
  await ctx.reply('*ROT13*\n\n' + cut(t.replace(/[a-zA-Z]/g, c =>
    String.fromCharCode((c <= 'Z' ? 90 : 122) >= c.charCodeAt(0) + 13 ? c.charCodeAt(0) + 13 : c.charCodeAt(0) - 13))));
});

cmd({ pattern: 'caesar', alias: ['shiftcipher'], desc: 'Caesar cipher with a custom shift', category: 'text', use: '<shift> <text>', react: '🏛️' },
async (ctx) => {
  const shift = parseInt(ctx.args[0]);
  const t = ctx.args.slice(1).join(' ') || ctx.m.quoted?.text;
  if (Number.isNaN(shift) || !t) return ctx.reply('Format: .caesar 3 attack at dawn\nUse a negative shift to decode.');
  const s = ((shift % 26) + 26) % 26;
  const out = t.replace(/[a-zA-Z]/g, ch => {
    const base = ch === ch.toUpperCase() ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + s) % 26) + base);
  });
  await ctx.reply(`*CAESAR CIPHER (shift ${shift})*\n\n${cut(out)}\n\nDecode with: .caesar ${-shift} <text>`);
});

cmd({ pattern: 'atbash', desc: 'Atbash cipher (a<->z mirror)', category: 'text', use: '<text>', react: '🔡' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.atbash secret message');
  const out = t.replace(/[a-zA-Z]/g, ch => {
    const base = ch === ch.toUpperCase() ? 65 : 97;
    return String.fromCharCode(base + 25 - (ch.charCodeAt(0) - base));
  });
  await ctx.reply('*ATBASH CIPHER*\n\n' + cut(out) + '\n\nRun it again on the result to decode.');
});

cmd({ pattern: 'leetspeak', alias: ['leet', '1337'], desc: 'Convert text to l33t sp34k', category: 'text', use: '<text>', react: '👾' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.leetspeak elite hacker');
  const M = { a: '4', b: '8', e: '3', g: '6', i: '1', l: '1', o: '0', s: '5', t: '7', z: '2' };
  await ctx.reply('*L33T SP34K*\n\n' + cut(t.toLowerCase().split('').map(c => M[c] || c).join('')));
});

cmd({ pattern: 'upsidedown', alias: ['flipt', 'flipped'], desc: 'Flip text upside down', category: 'text', use: '<text>', react: '🙃' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.upsidedown hello there');
  const M = {
    a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ',
    n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
    '.': '˙', ',': "'", '?': '¿', '!': '¡', "'": ',', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
    '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄣ', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6', '0': '0', '_': '‾'
  };
  await ctx.reply('*UPSIDE DOWN*\n\n' + cut(t.toLowerCase().split('').map(c => M[c] || c).reverse().join('')));
});

cmd({ pattern: 'bubbletext', alias: ['bubble'], desc: 'Ⓑⓤⓑⓑⓛⓔ ⓣⓔⓧⓣ', category: 'text', use: '<text>', react: '🫧' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.bubbletext laksxan x md');
  const out = t.split('').map(c => {
    if (/[a-z]/.test(c)) return String.fromCodePoint(0x24D0 + c.charCodeAt(0) - 97);
    if (/[A-Z]/.test(c)) return String.fromCodePoint(0x24B6 + c.charCodeAt(0) - 65);
    if (/[1-9]/.test(c)) return String.fromCodePoint(0x2460 + c.charCodeAt(0) - 49);
    if (c === '0') return '⓪';
    return c;
  }).join('');
  await ctx.reply('*BUBBLE TEXT*\n\n' + cut(out));
});

cmd({ pattern: 'squaretext', alias: ['square'], desc: '🅂🅀🅄🄰🅁🄴 🅃🄴🅇🅃', category: 'text', use: '<text>', react: '⬛' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.squaretext ghost');
  const out = t.toUpperCase().split('').map(c => (/[A-Z]/.test(c) ? String.fromCodePoint(0x1F170 + c.charCodeAt(0) - 65) : c)).join('');
  await ctx.reply('*SQUARE TEXT*\n\n' + cut(out));
});

cmd({ pattern: 'fullwidth', alias: ['vaporwave', 'aesthetic'], desc: 'ｆｕｌｌ ｗｉｄｔｈ ｔｅｘｔ', category: 'text', use: '<text>', react: '🌸' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.fullwidth aesthetic');
  const out = t.split('').map(c => {
    const code = c.charCodeAt(0);
    return code > 32 && code < 127 ? String.fromCharCode(code + 0xFEE0) : (c === ' ' ? '　' : c);
  }).join('');
  await ctx.reply('*ＦＵＬＬ ＷＩＤＴＨ*\n\n' + cut(out));
});

cmd({ pattern: 'strikethrough', alias: ['striket'], desc: 'C̶r̶o̶s̶s̶ ̶o̶u̶t̶ ̶t̶e̶x̶t̶', category: 'text', use: '<text>', react: '✂️' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.strikethrough deleted words');
  await ctx.reply('*STRIKETHROUGH*\n\n' + cut(t.split('').join('\u0336') + '\u0336'));
});

cmd({ pattern: 'underlinetext', alias: ['underline'], desc: 'U̲n̲d̲e̲r̲l̲i̲n̲e̲ ̲t̲e̲x̲t̲', category: 'text', use: '<text>', react: '📏' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.underline important');
  await ctx.reply('*UNDERLINED*\n\n' + cut(t.split('').join('\u0332') + '\u0332'));
});

cmd({ pattern: 'zalgo', alias: ['cursed', 'glitchtext'], desc: 'C̸u̸r̸s̸e̸d̸ glitch text', category: 'text', use: '<text>', react: '😈' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.zalgo chaos');
  const marks = ['\u0300', '\u0301', '\u0302', '\u0303', '\u0308', '\u030A', '\u0327', '\u0316', '\u0317', '\u0323', '\u0324', '\u0330'];
  const out = t.slice(0, 200).split('').map(c => {
    if (c === ' ') return c;
    let s = c;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) s += marks[Math.floor(Math.random() * marks.length)];
    return s;
  }).join('');
  await ctx.reply('*ZALGO*\n\n' + out);
});

cmd({ pattern: 'clap', alias: ['clapify'], desc: 'Put 👏 between 👏 every 👏 word', category: 'text', use: '<text>', react: '👏' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.clap say it louder');
  await ctx.reply(cut(words(t).join(' 👏 ')));
});

cmd({ pattern: 'emojify', alias: ['emojitext'], desc: 'Turn text into emoji letters', category: 'text', use: '<text>', react: '🎉' },
async (ctx) => {
  const t = input(ctx);
  if (!t) return need(ctx.reply, '.emojify ghost');
  const N = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  const out = t.toLowerCase().slice(0, 120).split('').map(c => {
    if (/[a-z]/.test(c)) return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 97) + ' ';
    if (/[0-9]/.test(c)) return N[+c] + ' ';
    if (c === ' ') return '   ';
    return c + ' ';
  }).join('');
  await ctx.reply(out);
});

cmd({ pattern: 'lorem', alias: ['lipsum', 'placeholder'], desc: 'Generate placeholder lorem ipsum text', category: 'text', use: '<paragraphs>', react: '📄' },
async (ctx) => {
  const n = Math.min(Math.max(parseInt(ctx.args[0]) || 2, 1), 8);
  const W = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
    'enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in ' +
    'reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa').split(' ');
  const sentence = () => {
    const len = 8 + Math.floor(Math.random() * 10);
    const s = Array.from({ length: len }, () => W[Math.floor(Math.random() * W.length)]).join(' ');
    return s[0].toUpperCase() + s.slice(1) + '.';
  };
  const paras = Array.from({ length: n }, () => Array.from({ length: 3 + Math.floor(Math.random() * 3) }, sentence).join(' '));
  await ctx.reply(`*LOREM IPSUM (${n} paragraph${n > 1 ? 's' : ''})*\n\n` + cut(paras.join('\n\n')));
});
