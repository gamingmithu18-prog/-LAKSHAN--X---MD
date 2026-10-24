/**
 * ==========================================================
 *  VPS-ONLY DEPLOYMENT LOCK
 *  This bot is licensed to run ONLY on its dedicated VPS.
 *  Attempting to run it on Heroku, Railway, Render, Replit,
 *  Koyeb, or any other cloud platform will halt the process.
 *  (c) LAKSHAN X MD
 * ==========================================================
 */

/* Platforms that are explicitly blocked. Detection uses the environment
   variables / port conventions each provider injects into the dyno. */
const BLOCKED_PROVIDERS = [
  { name: 'Heroku', detect: () => !!(process.env.DYNO || process.env.PORT && /heroku/i.test(process.env.PS || '') || process.env.DYNO_ID || process.env.HEROKU_APP_NAME) },
  { name: 'Railway', detect: () => !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_RUN_UID },
  { name: 'Render', detect: () => !!process.env.RENDER || !!process.env.RENDER_SERVICE_ID },
  { name: 'Replit', detect: () => !!process.env.REPL_ID || !!process.env.REPLIT_DB_URL },
  { name: 'Koyeb', detect: () => !!process.env.KOYEB || !!process.env.KOYEB_APP_NAME },
  { name: 'Fleek/Netlify/Vercel', detect: () => !!(process.env.NETLIFY || process.env.VERCEL || process.env.FLEEK) },
];

/* The dedicated VPS identity. The lock allows this machine only:
   - HOSTNAME matches the VPS hostname, and
   - the private IP range belongs to the expected datacenter, or
   - the lock secret (set in .env on the VPS) matches. */
function detectAllowedHost() {
  const hostname = require('os').hostname();
  const secret = process.env.VPS_LOCK_SECRET;
  /* Primary check: VPS_LOCK_SECRET environment variable.
     Set this on your VPS: export VPS_LOCK_SECRET=ghost-mini-vps-<your-secret> */
  if (secret && secret.startsWith('ghost-mini-vps-')) return true;
  /* Secondary check: SKIP_VPS_LOCK=true allows running on any server.
     Use this ONLY if you trust the server and understand the implications. */
  if (process.env.SKIP_VPS_LOCK === 'true') {
    console.log('[VPS-LOCK] SKIP_VPS_LOCK=true detected - allowing any host');
    return true;
  }
  /* Tertiary check: hostname + IP match the known VPS */
  if (/^(vps|server|ghost-mini|ubuntu)-?.*$/i.test(hostname)) {
    /* Only allow on this machine if the IP matches the known VPS public IP */
    const knownIp = process.env.VPS_PUBLIC_IP || '162.35.99.82';
    const localIps = Object.values(require('os').networkInterfaces())
      .flat()
      .filter(i => i && !i.internal)
      .map(i => i.address);
    if (localIps.includes(knownIp)) return true;
    /* Hostname matches and there is no other network (typical for this VPS) */
    if (localIps.length === 0) return true;
  }
  /* Quaternary check: allow if VPS_PUBLIC_IP matches any local IP */
  const configuredIp = process.env.VPS_PUBLIC_IP;
  if (configuredIp) {
    const localIps = Object.values(require('os').networkInterfaces())
      .flat()
      .filter(i => i && !i.internal)
      .map(i => i.address);
    if (localIps.includes(configuredIp)) return true;
  }
  return false;
}

/**
 * Enforce the lock. If a blocked provider is detected OR the host is not the
 * dedicated VPS, the process exits with code 47 (license error) immediately
 * before any WhatsApp session or web server starts.
 */
function enforceVpsOnly() {
  for (const provider of BLOCKED_PROVIDERS) {
    try {
      if (provider.detect()) {
        console.error(`[VPS-LOCK] This bot is NOT allowed to run on ${provider.name}.`);
        console.error('[VPS-LOCK] It is licensed for the dedicated VPS only. Halting.');
        process.exit(47);
      }
    } catch (_) {}
  }
  if (!detectAllowedHost()) {
    console.error('[VPS-LOCK] Host not recognized as the dedicated VPS.');
    console.error('[VPS-LOCK] To fix this, set one of these on your VPS:');
    console.error('[VPS-LOCK]   1. export VPS_LOCK_SECRET=ghost-mini-vps-yoursecret');
    console.error('[VPS-LOCK]   2. export SKIP_VPS_LOCK=true');
    console.error('[VPS-LOCK]   3. export VPS_PUBLIC_IP=<your-server-public-ip>');
    console.error('[VPS-LOCK] This build is locked to the licensed server. Halting.');
    process.exit(47);
  }
}

module.exports = { enforceVpsOnly };
