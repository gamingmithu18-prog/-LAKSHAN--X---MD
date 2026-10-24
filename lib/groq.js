/**
 * ==========================================================
 *  GROQ CLIENT - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 *  © POWERD BY LAKSHAN X MD </>
 * ==========================================================
 *
 *  Thin wrapper over the Groq OpenAI-compatible chat endpoint.
 *
 *  MODEL CHOICE MATTERS:
 *  Groq retires models regularly. llama-3.3-70b-versatile and
 *  llama-3.1-8b-instant are scheduled for shutdown on 2026-08-16,
 *  so hardcoding them would break this bot within weeks. We therefore
 *  try a list of models in order and remember the first one that
 *  works. A decommissioned model returns HTTP 400 with
 *  "model_decommissioned", which we detect and skip permanently.
 */
const axios = require('axios');
const config = require('../config');

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/* Ordered by preference. The first entry that the account can actually
   use is cached for the rest of the process lifetime. */
const MODEL_CHAIN = [
  'openai/gpt-oss-120b',   // production, replaces llama-3.3-70b
  'openai/gpt-oss-20b',    // production, faster / cheaper
  'groq/compound-mini',    // production agentic fallback
  'llama-3.3-70b-versatile' // legacy, retired 2026-08-16 - last resort
];

let workingModel = null;
const deadModels = new Set();

const apiKey = (override = '') => String(override || config.GROQ_API_KEY || process.env.GROQ_API_KEY || '').trim();
const isConfigured = (override = '') => !!apiKey(override);

function modelsToTry() {
  const preferred = (config.GROQ_MODEL || '').trim();
  const chain = preferred ? [preferred, ...MODEL_CHAIN] : [...MODEL_CHAIN];
  if (workingModel) chain.unshift(workingModel);
  return [...new Set(chain)].filter(m => !deadModels.has(m));
}

/**
 * Ask Groq for a chat completion.
 * @returns {Promise<{ok:boolean, text?:string, model?:string, error?:string, code?:string}>}
 */
async function chat(messages, opts = {}) {
  const requestKey = apiKey(opts.apiKey);
  /* Auto Reply user-key system stays untouched: if the user set their own
     Groq key it is used exactly as before. When no key is configured, the
     bot falls back to the owner's Sasa AI Ultra endpoint. */
  if (!requestKey) {
    const userText = messages.filter(m => m.role === 'user').map(m => String(m.content || '')).join('\n');
    if (!userText.trim()) return { ok: false, code: 'NO_KEY', error: 'No AI key configured and no user text.' };
    try {
      const res = await axios.get('https://sasa-dev-api.xyz/api/sasaaiultra', {
        params: { text: userText, apikey: config.API_KEY },
        headers: { 'X-API-Key': config.API_KEY, 'x-api-key': config.API_KEY, 'User-Agent': 'LakshanXMD/1.0' },
        timeout: opts.timeout ?? 90000,
        validateStatus: () => true
      });
      const d = res.data || {};
      if (d.status === true && typeof d.result === 'string' && d.result.trim()) {
        return { ok: true, text: d.result.trim(), model: 'sasa-ai-ultra', provider: 'Sasa AI Ultra' };
      }
      return { ok: false, code: 'SASA_FAIL', error: d.error || d.message || 'Sasa AI Ultra did not respond.' };
    } catch (e) {
      return { ok: false, code: 'NETWORK', error: String(e.message || e).slice(0, 160) };
    }
  }

  const candidates = modelsToTry();
  if (!candidates.length) {
    return { ok: false, code: 'NO_MODEL', error: 'Every known Groq model was rejected for this account.' };
  }

  let lastError = 'unknown error';
  let lastCode = 'REQUEST_FAILED';

  for (const model of candidates) {
    try {
      const res = await axios.post(ENDPOINT, {
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_completion_tokens: opts.maxTokens ?? 900,
        stream: false
      }, {
        timeout: opts.timeout ?? 45000,
        validateStatus: () => true,
        headers: {
          Authorization: `Bearer ${requestKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'GhostMiniOFC/1.0'
        }
      });

      if (res.status === 200) {
        const text = res.data?.choices?.[0]?.message?.content;
        if (text && String(text).trim()) {
          workingModel = model;
          return { ok: true, text: String(text).trim(), model, usage: res.data?.usage || null };
        }
        lastError = 'The model returned an empty response.';
        lastCode = 'EMPTY';
        continue;
      }

      const errObj = res.data?.error || {};
      const errCode = String(errObj.code || '');
      const errMsg = String(errObj.message || `HTTP ${res.status}`);

      /* Model retired or unknown -> never try it again this process. */
      if (res.status === 400 && /decommission|not_found|does not exist|unknown model/i.test(errCode + errMsg)) {
        deadModels.add(model);
        lastError = errMsg; lastCode = 'MODEL_GONE';
        continue;
      }
      if (res.status === 404) { deadModels.add(model); lastError = errMsg; lastCode = 'MODEL_GONE'; continue; }

      /* Auth problems will not be fixed by another model - stop now. */
      if (res.status === 401 || res.status === 403) {
        return { ok: false, code: 'BAD_KEY', error: 'The Groq API key was rejected. It may be invalid, revoked or expired.' };
      }
      if (res.status === 429) {
        return { ok: false, code: 'RATE_LIMIT', error: 'Groq rate limit reached. Please wait a moment and try again.' };
      }

      lastError = errMsg;
      lastCode = `HTTP_${res.status}`;
    } catch (e) {
      lastError = String(e.message || e).slice(0, 160);
      lastCode = /timeout/i.test(lastError) ? 'TIMEOUT' : 'NETWORK';
    }
  }

  return { ok: false, code: lastCode, error: lastError };
}

/** Human readable advice for a failure code. */
function explain(code) {
  return ({
    NO_KEY: 'Set the GROQ_API_KEY config variable and restart the bot.',
    BAD_KEY: 'Generate a fresh key at console.groq.com and update GROQ_API_KEY.',
    RATE_LIMIT: 'The free tier limit was hit. Wait a minute before retrying.',
    TIMEOUT: 'Groq took too long to answer. Try again with a shorter question.',
    NETWORK: 'The server could not reach api.groq.com. Check outbound network access.',
    MODEL_GONE: 'The configured model has been retired by Groq. Set GROQ_MODEL to a current one.',
    NO_MODEL: 'Set GROQ_MODEL to a model your account can access.'
  })[code] || 'Please try again shortly.';
}

module.exports = { chat, isConfigured, explain, MODEL_CHAIN, currentModel: () => workingModel };
