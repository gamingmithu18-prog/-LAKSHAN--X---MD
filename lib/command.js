/**
 * Command registry / loader - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const fs = require('fs');
const path = require('path');

const commands = [];
const aliasMap = new Map();

/**
 * cmd({ pattern, alias, desc, category, use, react, fromMe, onlyGroup, onlyPrivate,
 *        adminOnly, botAdmin, ownerOnly, premium, nsfw, dontAddCommandList }, handler)
 */
function cmd(info, handler) {
  const data = {
    pattern: String(info.pattern || '').toLowerCase(),
    alias: (info.alias || []).map(a => String(a).toLowerCase()),
    desc: info.desc || 'No description',
    category: (info.category || 'misc').toLowerCase(),
    use: info.use || '',
    react: info.react || null,
    fromMe: !!info.fromMe,
    ownerOnly: !!info.ownerOnly || !!info.fromMe,
    onlyGroup: !!info.onlyGroup,
    onlyPrivate: !!info.onlyPrivate,
    adminOnly: !!info.adminOnly,
    botAdmin: !!info.botAdmin,
    premium: !!info.premium,
    nsfw: !!info.nsfw,
    hidden: !!info.dontAddCommandList,
    filename: info.filename || '',
    handler
  };
  commands.push(data);
  aliasMap.set(data.pattern, data);
  data.alias.forEach(a => aliasMap.set(a, data));
  return data;
}

function findCommand(name) {
  return aliasMap.get(String(name || '').toLowerCase()) || null;
}

function loadPlugins(dir = path.join(__dirname, '..', 'plugins')) {
  // Loading is also used by the owner reload command. Clear both sides of
  // the registry; clearing only `commands` leaves aliases pointing at old
  // handlers and causes commands to appear registered but not run.
  commands.length = 0;
  aliasMap.clear();
  dir = path.resolve(dir);
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  let loaded = 0;
  for (const f of files) {
    try {
      delete require.cache[require.resolve(path.join(dir, f))];
      require(path.join(dir, f));
      loaded++;
    } catch (e) {
      console.error(`[PLUGIN] Failed ${f}:`, e.message);
    }
  }
  return loaded;
}

function categories() {
  const map = {};
  for (const c of commands) {
    if (c.hidden) continue;
    if (!map[c.category]) map[c.category] = [];
    map[c.category].push(c);
  }
  return map;
}

function stats() {
  return {
    total: commands.length,
    visible: commands.filter(c => !c.hidden).length,
    categories: Object.keys(categories()).length
  };
}

module.exports = { cmd, commands, findCommand, loadPlugins, categories, stats, aliasMap };
