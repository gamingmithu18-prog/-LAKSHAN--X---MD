/**
 * EXTRA COMMAND PACK - 100 lightweight, offline-first commands.
 * These commands intentionally use no third-party API, so they remain fast
 * and usable even when an external service is unavailable.
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const { withFooter, runtime, pickRandom } = require('../lib/utils');

const register = (names, category, desc, handler) => {
  for (const name of names) cmd({ pattern: name, desc: `${desc} (${name})`, category, react: '✨' }, handler);
};

register(['nowtime','currenttime','clocknow','timecheck','localtime','utcclock','timezone','datecheck','todaydate','tomorrowdate'], 'utility', 'Show date and time information', async ({ reply, command }) => {
  const now = new Date();
  const text = command === 'tomorrowdate'
    ? new Date(now.getTime() + 86400000).toLocaleDateString('en-GB')
    : command === 'timezone' ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : command === 'utcclock' ? now.toISOString()
    : `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB')}`;
  await reply(`🕒 *TIME TOOL*\n\n${text}`);
});

register(['uppertext','lowertext','titletext','reversewords','reversechars','trimtext','countletters','countwords','countlines','removespaces'], 'text', 'Transform or analyze text', async ({ q, reply, command }) => {
  if (!q) return reply(`✍️ Give me text. Example: .${command} hello world`);
  let out = q;
  if (command === 'uppertext') out = q.toUpperCase();
  if (command === 'lowertext') out = q.toLowerCase();
  if (command === 'titletext') out = q.replace(/\w\S*/g, x => x[0].toUpperCase() + x.slice(1).toLowerCase());
  if (command === 'reversewords') out = q.split(/\s+/).reverse().join(' ');
  if (command === 'reversechars') out = [...q].reverse().join('');
  if (command === 'trimtext') out = q.trim().replace(/\s+/g, ' ');
  if (command === 'countletters') out = `Letters: ${(q.match(/[A-Za-z]/g) || []).length}`;
  if (command === 'countwords') out = `Words: ${q.trim() ? q.trim().split(/\s+/).length : 0}`;
  if (command === 'countlines') out = `Lines: ${q.split('\n').length}`;
  if (command === 'removespaces') out = q.replace(/\s+/g, '');
  await reply(`✅ *TEXT RESULT*\n\n${out}`);
});

register(['addnums','subnums','mulnums','divnums','avgnums','minnums','maxnums','sumnums','evencheck','oddcheck'], 'math', 'Calculate numbers', async ({ q, reply, command }) => {
  const nums = (q.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return reply(`🔢 Enter numbers. Example: .${command} 10 20 30`);
  let result;
  if (command === 'addnums' || command === 'sumnums') result = nums.reduce((a,b) => a+b, 0);
  if (command === 'subnums') result = nums.slice(1).reduce((a,b) => a-b, nums[0]);
  if (command === 'mulnums') result = nums.reduce((a,b) => a*b, 1);
  if (command === 'divnums') result = nums.slice(1).reduce((a,b) => a/b, nums[0]);
  if (command === 'avgnums') result = nums.reduce((a,b) => a+b, 0) / nums.length;
  if (command === 'minnums') result = Math.min(...nums);
  if (command === 'maxnums') result = Math.max(...nums);
  if (command === 'evencheck') result = nums.map(n => `${n}: ${n % 2 === 0 ? 'even' : 'odd'}`).join('\n');
  if (command === 'oddcheck') result = nums.map(n => `${n}: ${n % 2 ? 'odd' : 'even'}`).join('\n');
  await reply(`🧮 *MATH RESULT*\n\n${Number.isFinite(result) ? result : result}`);
});

register(['randomnumber','randomdice','randomcoin','randompercent','randomcolor','randomletter','randomemoji','randomchoice','randomteam','randomyesno'], 'fun', 'Generate a random result', async ({ q, reply, command }) => {
  const emojis = ['😀','😂','🥰','😎','🔥','💯','✨','🎉','🤖','🚀'];
  let out;
  if (command === 'randomnumber') { const [a,b] = (q.match(/-?\d+/g) || []).map(Number); const lo = Number.isFinite(a) ? a : 1; const hi = Number.isFinite(b) ? b : 100; out = Math.floor(Math.random() * (Math.abs(hi-lo)+1)) + Math.min(lo,hi); }
  if (command === 'randomdice') out = 1 + Math.floor(Math.random() * 6);
  if (command === 'randomcoin') out = Math.random() < .5 ? 'Heads' : 'Tails';
  if (command === 'randompercent') out = `${Math.floor(Math.random()*101)}%`;
  if (command === 'randomcolor') out = '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
  if (command === 'randomletter') out = String.fromCharCode(65 + Math.floor(Math.random()*26));
  if (command === 'randomemoji') out = pickRandom(emojis);
  if (command === 'randomchoice') { const a = q.split(',').map(x=>x.trim()).filter(Boolean); out = a.length ? pickRandom(a) : 'Add comma-separated choices.'; }
  if (command === 'randomteam') out = `Team ${1 + Math.floor(Math.random()*2)}`;
  if (command === 'randomyesno') out = Math.random() < .5 ? 'Yes ✅' : 'No ❌';
  await reply(`🎲 *RANDOM RESULT*\n\n${out}`);
});

register(['botname','botprefix','botmode','botowner','botcommands','botruntime','botnode','botplatform','botversion','bothelp'], 'main', 'Show bot information', async ({ reply, command, prefix }) => {
  const data = {
    botname: config.BOT_NAME, botprefix: config.PREFIX, botmode: config.MODE,
    botowner: config.OWNER_NAME, botcommands: require('../lib/command').stats().total,
    botruntime: runtime(process.uptime()), botnode: process.version, botplatform: process.platform,
    botversion: '1.0.0', bothelp: `Use ${prefix}menu or ${prefix}help <command>`
  };
  await reply(`ℹ️ *BOT INFORMATION*\n\n${data[command]}`);
});

register(['isprime','factorial','square','cube','percentage','celsius','fahrenheit','metersfeet','kilometersmiles','byteskb'], 'math', 'Run a quick calculation', async ({ q, reply, command }) => {
  const n = Number((q.match(/-?\d+(?:\.\d+)?/) || [])[0]);
  if (!Number.isFinite(n)) return reply(`🔢 Enter a number. Example: .${command} 25`);
  let out;
  if (command === 'isprime') { let p = n > 1; for(let i=2;i<=Math.sqrt(n)&&p;i++) if(n%i===0)p=false; out = p ? 'Prime ✅' : 'Not prime ❌'; }
  if (command === 'factorial') out = n < 0 || n > 170 ? 'Use a number from 0 to 170.' : Array.from({length:Math.floor(n)},(_,i)=>i+1).reduce((a,b)=>a*b,1);
  if (command === 'square') out = n*n;
  if (command === 'cube') out = n*n*n;
  if (command === 'percentage') out = `${n}%`;
  if (command === 'celsius') out = `${(n * 9/5 + 32).toFixed(2)} °F`;
  if (command === 'fahrenheit') out = `${((n - 32) * 5/9).toFixed(2)} °C`;
  if (command === 'metersfeet') out = `${(n * 3.28084).toFixed(3)} ft`;
  if (command === 'kilometersmiles') out = `${(n * 0.621371).toFixed(3)} mi`;
  if (command === 'byteskb') out = `${(n / 1024).toFixed(2)} KB`;
  await reply(`🧮 *CALCULATION*\n\n${out}`);
});

register(['jsonformat','jsonminify','slugify','camelcase','kebabcase','snakecase','hashtag','initials','wordshuffle','sortwords'], 'text', 'Format or organize text', async ({ q, reply, command }) => {
  if (!q) return reply(`✍️ Give me text. Example: .${command} hello world`);
  let out = q;
  if (command === 'slugify') out = q.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if (command === 'camelcase') out = q.toLowerCase().split(/\s+/).map((x,i)=>i?x[0].toUpperCase()+x.slice(1):x).join('');
  if (command === 'kebabcase') out = q.toLowerCase().trim().replace(/\s+/g,'-');
  if (command === 'snakecase') out = q.toLowerCase().trim().replace(/\s+/g,'_');
  if (command === 'hashtag') out = q.split(/\s+/).map(x=>'#'+x.replace(/[^\w]/g,'')).join(' ');
  if (command === 'initials') out = q.split(/\s+/).filter(Boolean).map(x=>x[0].toUpperCase()).join('');
  if (command === 'wordshuffle') out = q.split(/\s+/).sort(()=>Math.random()-.5).join(' ');
  if (command === 'sortwords') out = q.split(/\s+/).sort((a,b)=>a.localeCompare(b)).join(' ');
  if (command === 'jsonformat' || command === 'jsonminify') { try { const j=JSON.parse(q); out=command==='jsonformat'?JSON.stringify(j,null,2):JSON.stringify(j); } catch { out='Invalid JSON.'; } }
  await reply(`✍️ *TEXT RESULT*\n\n${out}`);
});

register(['timerinfo','memoryinfo','cpucount','processid','nodearch','hostname','platforminfo','uptimeinfo','envinfo','healthcheck'], 'utility', 'Show local runtime information', async ({ reply, command }) => {
  const os = require('os'); const m = process.memoryUsage();
  const map = { timerinfo:new Date().toISOString(), memoryinfo:`${(m.rss/1048576).toFixed(1)} MB RSS`, cpucount:os.cpus().length, processid:process.pid, nodearch:process.arch, hostname:os.hostname(), platforminfo:`${os.platform()} ${os.release()}`, uptimeinfo:runtime(process.uptime()), envinfo:process.env.NODE_ENV||'production', healthcheck:'OK ✅' };
  await reply(`🖥️ *RUNTIME INFO*\n\n${map[command]}`);
});

register(['yesno','chooseone','eightball','rpsrock','rpspaper','rpsscissors','luckcheck','numberguess','truthcheck','darecheck'], 'fun', 'Play a quick offline mini game', async ({ q, reply, command }) => {
  const out = command==='yesno' ? pickRandom(['Yes ✅','No ❌','Maybe 🤔']) : command==='chooseone' ? pickRandom(q.split(',').map(x=>x.trim()).filter(Boolean)) : command==='eightball' ? pickRandom(['Definitely ✅','Probably','Ask again later 🤔','Not today ❌']) : command==='rpsrock' ? 'Rock 🪨' : command==='rpspaper' ? 'Paper 📄' : command==='rpsscissors' ? 'Scissors ✂️' : command==='luckcheck' ? `${Math.floor(Math.random()*101)}% luck 🍀` : command==='numberguess' ? 1+Math.floor(Math.random()*10) : command==='truthcheck' ? 'Truth mode: be honest 💬' : command==='darecheck' ? 'Dare mode: be respectful 🎯' : 'Try again.';
  await reply(`🎮 *${command.toUpperCase()}*\n\n${out}`);
});

// Ten additional practical shortcuts: 100 new registrations in this pack.
register(['quoteofday','motivation','compliment','insultless','moodhappy','moodsad','moodfunny','moodcalm','moodfire','moodfocus'], 'fun', 'Return a useful quick message', async ({ reply, command }) => {
  const map = { quoteofday:'Small steps still move you forward.', motivation:'You can do this — one step at a time.', compliment:'You are doing better than you think.', insultless:'Kindness is always stronger.', moodhappy:'Keep that good energy going! 😊', moodsad:'It is okay to take a breath and reset. 💙', moodfunny:'Today needs more laughter. 😂', moodcalm:'Slow down, breathe, and focus. 🌊', moodfire:'Bring the energy — you are ready. 🔥', moodfocus:'One task. One goal. Full focus. 🎯' };
  await reply(`💬 *${command.toUpperCase()}*\n\n${map[command]}`);
});
