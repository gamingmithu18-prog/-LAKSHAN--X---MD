/**
 * MATH / CONVERSION / FINANCE KIT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 * Everything computed locally - no API, always available.
 * © POWERD BY LAKSHAN X MD </>
 */
const { cmd } = require('../lib/command');

const num = (v) => { const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const bar = (p) => '█'.repeat(Math.round(Math.max(0, Math.min(100, p)) / 5)).padEnd(20, '░');

/* ============ NUMBER THEORY ============ */

cmd({ pattern: 'isprime', alias: ['prime'], desc: 'Check whether a number is prime', category: 'math', use: '<number>', react: '🔢' },
async ({ q, reply }) => {
  const n = num(q);
  if (n === null || n < 0 || !Number.isInteger(n)) return reply('Give a whole number.\nExample: .isprime 97');
  if (n > 1e15) return reply('That number is too large to test here.');
  const test = (x) => {
    if (x < 2) return false;
    if (x % 2 === 0) return x === 2;
    for (let i = 3; i * i <= x; i += 2) if (x % i === 0) return i;
    return true;
  };
  const r = test(n);
  if (r === true) return reply(`*PRIME CHECK*\n\n${fmt(n, 0)} is a PRIME number.`);
  if (r === false) return reply(`*PRIME CHECK*\n\n${fmt(n, 0)} is not prime (numbers below 2 are not prime).`);
  await reply(`*PRIME CHECK*\n\n${fmt(n, 0)} is NOT prime.\nSmallest factor : ${r}\n${fmt(n, 0)} = ${r} x ${fmt(n / r, 0)}`);
});

cmd({ pattern: 'factors', alias: ['divisors'], desc: 'List all divisors of a number', category: 'math', use: '<number>', react: '➗' },
async ({ q, reply }) => {
  const n = num(q);
  if (n === null || n < 1 || !Number.isInteger(n) || n > 1e9) return reply('Give a whole number from 1 to 1,000,000,000.\nExample: .factors 360');
  const f = [];
  for (let i = 1; i * i <= n; i++) if (n % i === 0) { f.push(i); if (i !== n / i) f.push(n / i); }
  f.sort((a, b) => a - b);
  const sum = f.reduce((a, b) => a + b, 0);
  await reply(`*DIVISORS OF ${fmt(n, 0)}*\n\nCount : ${f.length}\nSum   : ${fmt(sum, 0)}\nType  : ${sum - n === n ? 'perfect number' : sum - n > n ? 'abundant' : 'deficient'}\n\n${f.slice(0, 200).join(', ')}`);
});

cmd({ pattern: 'primefactors', alias: ['pfactor', 'factorise'], desc: 'Prime factorisation of a number', category: 'math', use: '<number>', react: '🧮' },
async ({ q, reply }) => {
  let n = num(q);
  if (n === null || n < 2 || !Number.isInteger(n) || n > 1e12) return reply('Give a whole number from 2 to 1,000,000,000,000.\nExample: .primefactors 5040');
  const orig = n, out = [];
  for (let d = 2; d * d <= n; d++) while (n % d === 0) { out.push(d); n /= d; }
  if (n > 1) out.push(n);
  const grouped = {};
  out.forEach(p => { grouped[p] = (grouped[p] || 0) + 1; });
  const pretty = Object.entries(grouped).map(([p, e]) => (e > 1 ? `${p}^${e}` : p)).join(' x ');
  await reply(`*PRIME FACTORISATION*\n\n${fmt(orig, 0)} = ${pretty}\n\nFlat  : ${out.join(' x ')}\nUnique: ${Object.keys(grouped).length} prime(s)`);
});

cmd({ pattern: 'gcd', alias: ['hcf', 'lcm'], desc: 'Greatest common divisor and lowest common multiple', category: 'math', use: '<a> <b>', react: '🔗' },
async ({ args, reply }) => {
  const a = num(args[0]), b = num(args[1]);
  if (a === null || b === null || a < 1 || b < 1) return reply('Give two positive whole numbers.\nExample: .gcd 48 180');
  const g = (x, y) => (y ? g(y, x % y) : x);
  const gc = g(Math.round(a), Math.round(b));
  await reply(`*GCD & LCM*\n\nNumbers : ${fmt(a, 0)} and ${fmt(b, 0)}\nGCD/HCF : ${fmt(gc, 0)}\nLCM     : ${fmt((a * b) / gc, 0)}\nCoprime : ${gc === 1 ? 'yes' : 'no'}`);
});

cmd({ pattern: 'fibonacci', alias: ['fib'], desc: 'Fibonacci sequence up to N terms', category: 'math', use: '<count>', react: '🌀' },
async ({ q, reply }) => {
  const n = Math.min(Math.max(parseInt(q) || 10, 1), 90);
  const s = [0, 1];
  while (s.length < n) s.push(s[s.length - 1] + s[s.length - 2]);
  const out = s.slice(0, n);
  await reply(`*FIBONACCI - ${n} TERMS*\n\n${out.map(x => fmt(x, 0)).join(', ')}\n\nLast term : ${fmt(out[out.length - 1], 0)}\nSum       : ${fmt(out.reduce((a, b) => a + b, 0), 0)}`);
});

cmd({ pattern: 'factorial', alias: ['fact2'], desc: 'Factorial of a number', category: 'math', use: '<number>', react: '❗' },
async ({ q, reply }) => {
  const n = parseInt(q);
  if (!Number.isInteger(n) || n < 0 || n > 500) return reply('Give a whole number from 0 to 500.\nExample: .factorial 20');
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  const s = r.toString();
  await reply(`*FACTORIAL*\n\n${n}! has ${s.length} digit(s)\n\n${s.length > 1200 ? s.slice(0, 1200) + '...' : s}`);
});

cmd({ pattern: 'tobase', alias: ['baseconvert', 'radix'], desc: 'Convert a number between number bases', category: 'math', use: '<number> <fromBase> <toBase>', react: '🔟' },
async ({ args, reply }) => {
  const [v, f, t] = args;
  const from = parseInt(f) || 10, to = parseInt(t) || 2;
  if (!v || from < 2 || from > 36 || to < 2 || to > 36) return reply('Format: .tobase 255 10 16\nBases must be between 2 and 36.');
  const dec = parseInt(String(v), from);
  if (Number.isNaN(dec)) return reply(`"${v}" is not a valid base-${from} number.`);
  await reply(`*BASE CONVERSION*\n\nInput   : ${v} (base ${from})\nOutput  : ${dec.toString(to).toUpperCase()} (base ${to})\n\nBinary  : ${dec.toString(2)}\nOctal   : ${dec.toString(8)}\nDecimal : ${dec}\nHex     : ${dec.toString(16).toUpperCase()}`);
});

cmd({ pattern: 'roman', alias: ['toroman'], desc: 'Convert between roman and arabic numerals', category: 'math', use: '<number or roman>', react: '🏛️' },
async ({ q, reply }) => {
  const s = String(q || '').trim().toUpperCase();
  if (!s) return reply('Example: .roman 1994   or   .roman MCMXCIV');
  const MAP = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  if (/^\d+$/.test(s)) {
    let n = parseInt(s);
    if (n < 1 || n > 3999) return reply('Roman numerals cover 1 to 3999 only.');
    let out = '';
    for (const [v, r] of MAP) while (n >= v) { out += r; n -= v; }
    return reply(`*ROMAN NUMERAL*\n\n${s} = ${out}`);
  }
  if (!/^[MDCLXVI]+$/.test(s)) return reply('That is neither a number nor a roman numeral.');
  const V = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) total += V[s[i]] < V[s[i + 1]] ? -V[s[i]] : V[s[i]];
  await reply(`*ROMAN NUMERAL*\n\n${s} = ${fmt(total, 0)}`);
});

cmd({ pattern: 'percent', alias: ['pct', 'percentage'], desc: 'Percentage calculations', category: 'math', use: '<a> <b>', react: '💯' },
async ({ args, reply }) => {
  const a = num(args[0]), b = num(args[1]);
  if (a === null || b === null) return reply('Format: .percent 45 200\nShows 45% of 200, what % 45 is of 200, and the change from 45 to 200.');
  const change = a === 0 ? 'undefined' : `${(((b - a) / Math.abs(a)) * 100).toFixed(2)}%`;
  await reply(`*PERCENTAGE TOOL*\n\nA = ${fmt(a)}\nB = ${fmt(b)}\n\n${fmt(a)}% of ${fmt(b)}   : ${fmt((a / 100) * b)}\nA is what % of B  : ${b === 0 ? 'undefined' : ((a / b) * 100).toFixed(2) + '%'}\nB is what % of A  : ${a === 0 ? 'undefined' : ((b / a) * 100).toFixed(2) + '%'}\nChange A -> B     : ${change}\nDifference        : ${fmt(b - a)}`);
});

cmd({ pattern: 'average', alias: ['mean', 'stats2'], desc: 'Mean, median, mode and spread of numbers', category: 'math', use: '<n1 n2 n3 ...>', react: '📊' },
async ({ q, reply }) => {
  const list = String(q || '').split(/[\s,]+/).map(num).filter(x => x !== null);
  if (list.length < 2) return reply('Give at least two numbers.\nExample: .average 10 20 30 45 12');
  const n = list.length;
  const sorted = [...list].sort((a, b) => a - b);
  const sum = list.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const freq = {};
  list.forEach(x => { freq[x] = (freq[x] || 0) + 1; });
  const maxF = Math.max(...Object.values(freq));
  const mode = maxF > 1 ? Object.keys(freq).filter(k => freq[k] === maxF).join(', ') : 'no repeats';
  const varc = list.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  await reply(`*STATISTICS (${n} values)*\n\nSum       : ${fmt(sum, 4)}\nMean      : ${fmt(mean, 4)}\nMedian    : ${fmt(median, 4)}\nMode      : ${mode}\nMinimum   : ${fmt(sorted[0], 4)}\nMaximum   : ${fmt(sorted[n - 1], 4)}\nRange     : ${fmt(sorted[n - 1] - sorted[0], 4)}\nVariance  : ${fmt(varc, 4)}\nStd. dev. : ${fmt(Math.sqrt(varc), 4)}`);
});

cmd({ pattern: 'quadratic', alias: ['solvequad'], desc: 'Solve ax² + bx + c = 0', category: 'math', use: '<a> <b> <c>', react: '📐' },
async ({ args, reply }) => {
  const a = num(args[0]), b = num(args[1]), c = num(args[2]);
  if (a === null || b === null || c === null || a === 0) return reply('Format: .quadratic 1 -3 2\n(a must not be zero)');
  const d = b * b - 4 * a * c;
  let roots;
  if (d > 0) roots = `Two real roots\nx1 = ${fmt((-b + Math.sqrt(d)) / (2 * a), 6)}\nx2 = ${fmt((-b - Math.sqrt(d)) / (2 * a), 6)}`;
  else if (d === 0) roots = `One repeated root\nx = ${fmt(-b / (2 * a), 6)}`;
  else roots = `Two complex roots\nx1 = ${fmt(-b / (2 * a), 4)} + ${fmt(Math.sqrt(-d) / (2 * a), 4)}i\nx2 = ${fmt(-b / (2 * a), 4)} - ${fmt(Math.sqrt(-d) / (2 * a), 4)}i`;
  await reply(`*QUADRATIC SOLVER*\n\n${a}x² + ${b}x + ${c} = 0\n\nDiscriminant : ${fmt(d, 6)}\nVertex       : (${fmt(-b / (2 * a), 4)}, ${fmt(c - (b * b) / (4 * a), 4)})\n\n${roots}`);
});

cmd({ pattern: 'triangle', alias: ['pythagoras', 'hypotenuse'], desc: 'Right-triangle sides, area and angles', category: 'math', use: '<a> <b>', react: '📏' },
async ({ args, reply }) => {
  const a = num(args[0]), b = num(args[1]);
  if (a === null || b === null || a <= 0 || b <= 0) return reply('Give the two shorter sides.\nExample: .triangle 3 4');
  const c = Math.hypot(a, b);
  await reply(`*RIGHT TRIANGLE*\n\nSide a     : ${fmt(a, 4)}\nSide b     : ${fmt(b, 4)}\nHypotenuse : ${fmt(c, 6)}\n\nArea       : ${fmt((a * b) / 2, 4)}\nPerimeter  : ${fmt(a + b + c, 4)}\nAngle A    : ${fmt((Math.atan(a / b) * 180) / Math.PI, 2)}°\nAngle B    : ${fmt((Math.atan(b / a) * 180) / Math.PI, 2)}°\nAngle C    : 90°`);
});

cmd({ pattern: 'circle', alias: ['circlearea'], desc: 'Area, circumference and diameter of a circle', category: 'math', use: '<radius>', react: '⭕' },
async ({ q, reply }) => {
  const r = num(q);
  if (r === null || r <= 0) return reply('Give the radius.\nExample: .circle 7');
  await reply(`*CIRCLE*\n\nRadius        : ${fmt(r, 4)}\nDiameter      : ${fmt(r * 2, 4)}\nCircumference : ${fmt(2 * Math.PI * r, 6)}\nArea          : ${fmt(Math.PI * r * r, 6)}\nSphere volume : ${fmt((4 / 3) * Math.PI * r ** 3, 6)}\nSphere area   : ${fmt(4 * Math.PI * r * r, 6)}`);
});

/* ============ UNIT CONVERSION ============ */

const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  weight: { kg: 1, g: 0.001, mg: 0.000001, t: 1000, lb: 0.45359237, oz: 0.028349523, st: 6.35029318 },
  volume: { l: 1, ml: 0.001, m3: 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735296 },
  area:   { m2: 1, km2: 1e6, cm2: 0.0001, ha: 10000, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.110336 },
  speed:  { mps: 1, kmh: 0.277777778, mph: 0.44704, kn: 0.514444444, fts: 0.3048 },
  data:   { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776, bit: 0.125 },
  time:   { s: 1, ms: 0.001, min: 60, h: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 }
};

cmd({ pattern: 'convert', alias: ['unit', 'uconvert'], desc: 'Convert between units (length, weight, volume, area, speed, data, time)', category: 'math', use: '<value> <from> <to>', react: '🔄' },
async ({ args, reply }) => {
  const v = num(args[0]);
  const from = String(args[1] || '').toLowerCase();
  const to = String(args[2] || '').toLowerCase().replace(/^to$/, '') || String(args[3] || '').toLowerCase();
  if (v === null || !from || !to) {
    return reply(`*UNIT CONVERTER*\n\nFormat: .convert 10 km mi\n\nLength : ${Object.keys(UNITS.length).join(' ')}\nWeight : ${Object.keys(UNITS.weight).join(' ')}\nVolume : ${Object.keys(UNITS.volume).join(' ')}\nArea   : ${Object.keys(UNITS.area).join(' ')}\nSpeed  : ${Object.keys(UNITS.speed).join(' ')}\nData   : ${Object.keys(UNITS.data).join(' ')}\nTime   : ${Object.keys(UNITS.time).join(' ')}`);
  }
  const kind = Object.keys(UNITS).find(k => UNITS[k][from] && UNITS[k][to]);
  if (!kind) return reply(`Cannot convert ${from} to ${to}. Both units must belong to the same category.\nSend .convert on its own to see every unit.`);
  const out = (v * UNITS[kind][from]) / UNITS[kind][to];
  await reply(`*UNIT CONVERSION (${kind})*\n\n${fmt(v, 6)} ${from} = ${fmt(out, 6)} ${to}\n\nReverse: 1 ${to} = ${fmt(UNITS[kind][to] / UNITS[kind][from], 6)} ${from}`);
});

cmd({ pattern: 'temp', alias: ['temperature', 'celsius', 'fahrenheit'], desc: 'Convert temperature units', category: 'math', use: '<value> <c|f|k>', react: '🌡️' },
async ({ args, reply }) => {
  const v = num(args[0]);
  const u = String(args[1] || 'c').toLowerCase()[0];
  if (v === null) return reply('Format: .temp 32 f\nUnits: c (celsius), f (fahrenheit), k (kelvin)');
  let c;
  if (u === 'f') c = (v - 32) * 5 / 9;
  else if (u === 'k') c = v - 273.15;
  else c = v;
  await reply(`*TEMPERATURE*\n\nInput      : ${fmt(v, 2)}°${u.toUpperCase()}\n\nCelsius    : ${fmt(c, 2)} °C\nFahrenheit : ${fmt(c * 9 / 5 + 32, 2)} °F\nKelvin     : ${fmt(c + 273.15, 2)} K\nRankine    : ${fmt((c + 273.15) * 9 / 5, 2)} °R`);
});

/* ============ FINANCE & HEALTH ============ */

cmd({ pattern: 'bmi', alias: ['bodymass'], desc: 'Body mass index from weight and height', category: 'math', use: '<kg> <cm>', react: '⚖️' },
async ({ args, reply }) => {
  const kg = num(args[0]), cm = num(args[1]);
  if (kg === null || cm === null || kg <= 0 || cm <= 0) return reply('Format: .bmi 70 175\n(weight in kg, height in cm)');
  const m = cm / 100;
  const bmi = kg / (m * m);
  const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal weight' : bmi < 30 ? 'Overweight' : 'Obese';
  await reply(`*BODY MASS INDEX*\n\nWeight   : ${fmt(kg, 1)} kg\nHeight   : ${fmt(cm, 1)} cm\n\nBMI      : ${bmi.toFixed(1)}\nCategory : ${cat}\n\nHealthy range for your height:\n${fmt(18.5 * m * m, 1)} kg to ${fmt(24.9 * m * m, 1)} kg\n\nThis is a rough guide, not medical advice.`);
});

cmd({ pattern: 'loan', alias: ['emi', 'mortgage'], desc: 'Monthly loan instalment (EMI)', category: 'math', use: '<amount> <annual%> <years>', react: '🏦' },
async ({ args, reply }) => {
  const p = num(args[0]), rate = num(args[1]), years = num(args[2]);
  if (p === null || rate === null || years === null || p <= 0 || years <= 0) return reply('Format: .loan 500000 12 5\n(amount, annual interest %, years)');
  const n = years * 12;
  const r = rate / 100 / 12;
  const emi = r === 0 ? p / n : (p * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  const total = emi * n;
  await reply(`*LOAN CALCULATOR*\n\nPrincipal      : ${fmt(p)}\nInterest rate  : ${fmt(rate, 2)}% per year\nTerm           : ${fmt(years, 1)} years (${n} months)\n\nMonthly EMI    : ${fmt(emi)}\nTotal payable  : ${fmt(total)}\nTotal interest : ${fmt(total - p)}\nInterest share : ${((total - p) / total * 100).toFixed(1)}%\n${bar(((total - p) / total) * 100)}`);
});

cmd({ pattern: 'interest', alias: ['compound', 'investment'], desc: 'Simple and compound interest growth', category: 'math', use: '<principal> <rate%> <years>', react: '📈' },
async ({ args, reply }) => {
  const p = num(args[0]), rate = num(args[1]), y = num(args[2]);
  if (p === null || rate === null || y === null) return reply('Format: .interest 100000 8 10\n(principal, annual rate %, years)');
  const simple = p * (1 + (rate / 100) * y);
  const yearly = p * (1 + rate / 100) ** y;
  const monthly = p * (1 + rate / 100 / 12) ** (12 * y);
  await reply(`*INTEREST CALCULATOR*\n\nPrincipal : ${fmt(p)}\nRate      : ${fmt(rate, 2)}% per year\nPeriod    : ${fmt(y, 1)} years\n\nSimple interest\n  Final  : ${fmt(simple)}\n  Earned : ${fmt(simple - p)}\n\nCompounded yearly\n  Final  : ${fmt(yearly)}\n  Earned : ${fmt(yearly - p)}\n\nCompounded monthly\n  Final  : ${fmt(monthly)}\n  Earned : ${fmt(monthly - p)}\n\nDoubling time (rule of 72): ${rate > 0 ? (72 / rate).toFixed(1) + ' years' : 'never'}`);
});

cmd({ pattern: 'discount', alias: ['sale', 'off'], desc: 'Price after a discount', category: 'math', use: '<price> <percent>', react: '🏷️' },
async ({ args, reply }) => {
  const p = num(args[0]), d = num(args[1]);
  if (p === null || d === null) return reply('Format: .discount 2500 30\n(price, discount %)');
  const save = (p * d) / 100;
  await reply(`*DISCOUNT*\n\nOriginal price : ${fmt(p)}\nDiscount       : ${fmt(d, 2)}%\nYou save       : ${fmt(save)}\nFinal price    : ${fmt(p - save)}`);
});

cmd({ pattern: 'tipcalc', alias: ['splitbill', 'billsplit'], desc: 'Split a bill and calculate the tip', category: 'math', use: '<bill> <tip%> <people>', react: '🍽️' },
async ({ args, reply }) => {
  const bill = num(args[0]);
  const pct = num(args[1]) ?? 10;
  const people = Math.max(1, Math.round(num(args[2]) || 1));
  if (bill === null) return reply('Format: .tipcalc 4500 10 4\n(bill, tip %, number of people)');
  const tip = (bill * pct) / 100;
  const total = bill + tip;
  await reply(`*BILL SPLITTER*\n\nBill      : ${fmt(bill)}\nTip       : ${fmt(pct, 1)}% = ${fmt(tip)}\nTotal     : ${fmt(total)}\nPeople    : ${people}\n\nEach pays : ${fmt(total / people)}`);
});

cmd({ pattern: 'vat', alias: ['tax', 'gst'], desc: 'Add or remove tax from a price', category: 'math', use: '<amount> <rate%>', react: '🧾' },
async ({ args, reply }) => {
  const a = num(args[0]), r = num(args[1]) ?? 15;
  if (a === null) return reply('Format: .vat 1000 18\n(amount, tax rate %)');
  const added = a * (1 + r / 100);
  const base = a / (1 + r / 100);
  await reply(`*TAX CALCULATOR (${fmt(r, 2)}%)*\n\nAmount : ${fmt(a)}\n\nIf tax is ADDED\n  Tax   : ${fmt(added - a)}\n  Total : ${fmt(added)}\n\nIf tax is INCLUDED\n  Base  : ${fmt(base)}\n  Tax   : ${fmt(a - base)}`);
});

cmd({ pattern: 'ratio', alias: ['simplify'], desc: 'Simplify a ratio or fraction', category: 'math', use: '<a> <b>', react: '⚗️' },
async ({ args, q, reply }) => {
  const parts = String(q || '').split(/[\s:\/]+/).map(num).filter(x => x !== null);
  const [a, b] = parts;
  if (a === undefined || b === undefined || !b) return reply('Format: .ratio 1920 1080  (or .ratio 45/60)');
  const g = (x, y) => (y ? g(y, x % y) : x);
  const gc = g(Math.abs(Math.round(a)), Math.abs(Math.round(b))) || 1;
  await reply(`*RATIO / FRACTION*\n\nInput      : ${fmt(a, 4)} : ${fmt(b, 4)}\nSimplified : ${fmt(a / gc, 4)} : ${fmt(b / gc, 4)}\nDecimal    : ${fmt(a / b, 6)}\nPercentage : ${fmt((a / b) * 100, 3)}%\nInverted   : ${fmt(b / gc, 4)} : ${fmt(a / gc, 4)}`);
});

cmd({ pattern: 'randomnum', alias: ['rollrange', 'randbetween'], desc: 'Random integer inside a range', category: 'math', use: '<min> <max> [count]', react: '🎲' },
async ({ args, reply }) => {
  const min = Math.round(num(args[0]) ?? 1);
  const max = Math.round(num(args[1]) ?? 100);
  const count = Math.min(Math.max(parseInt(args[2]) || 1, 1), 50);
  if (min >= max) return reply('The minimum must be smaller than the maximum.\nExample: .randomnum 1 100 5');
  const out = Array.from({ length: count }, () => Math.floor(Math.random() * (max - min + 1)) + min);
  await reply(`*RANDOM NUMBER${count > 1 ? 'S' : ''}*\n\nRange : ${fmt(min, 0)} to ${fmt(max, 0)}\nResult: ${out.join(', ')}${count > 1 ? `\nSum   : ${fmt(out.reduce((a, b) => a + b, 0), 0)}` : ''}`);
});

cmd({ pattern: 'countdown2', alias: ['daysuntil', 'until'], desc: 'Time remaining until a date', category: 'math', use: '<YYYY-MM-DD>', react: '⏳' },
async ({ q, reply }) => {
  const target = new Date(String(q || '').trim());
  if (!q || Number.isNaN(target.getTime())) return reply('Give a date.\nExample: .daysuntil 2027-01-01');
  const diff = target.getTime() - Date.now();
  const past = diff < 0;
  const ms = Math.abs(diff);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  await reply(`*COUNTDOWN*\n\nTarget : ${target.toDateString()}\nStatus : ${past ? 'already passed' : 'upcoming'}\n\nDays   : ${fmt(d, 0)}\nExact  : ${d}d ${h}h ${m}m\nWeeks  : ${fmt(d / 7, 1)}\nMonths : ${fmt(d / 30.44, 1)}\nYears  : ${fmt(d / 365.25, 2)}`);
});

cmd({ pattern: 'datediff', alias: ['between', 'daysbetween'], desc: 'Days between two dates', category: 'math', use: '<date1> <date2>', react: '📆' },
async ({ args, reply }) => {
  const a = new Date(args[0]), b = new Date(args[1] || new Date().toISOString().slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return reply('Format: .datediff 2020-01-01 2026-07-27');
  const ms = Math.abs(b - a);
  const d = Math.floor(ms / 86400000);
  await reply(`*DATE DIFFERENCE*\n\nFrom : ${a.toDateString()}\nTo   : ${b.toDateString()}\n\nDays    : ${fmt(d, 0)}\nWeeks   : ${fmt(d / 7, 2)}\nMonths  : ${fmt(d / 30.44, 2)}\nYears   : ${fmt(d / 365.25, 2)}\nHours   : ${fmt(d * 24, 0)}\nMinutes : ${fmt(d * 1440, 0)}`);
});
