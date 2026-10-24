const menus = new Map();
const TTL = 10 * 60 * 1000;
function remember(messageId, categories, prefix) {
  if (!messageId) return;
  menus.set(messageId, { categories, prefix, expires: Date.now() + TTL });
}
function get(messageId) {
  const item = menus.get(messageId);
  if (!item || item.expires < Date.now()) { if (item) menus.delete(messageId); return null; }
  return item;
}
setInterval(() => { const now=Date.now(); for (const [id,v] of menus) if (v.expires < now) menus.delete(id); }, 60000).unref?.();
module.exports = { remember, get };