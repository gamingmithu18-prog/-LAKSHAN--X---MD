/**
 * AI / SEARCH COMMANDS - 𝐋𝐀𝐊𝐒𝐇𝐀𝐍 𝐗 𝐌𝐃
 */
const { cmd } = require('../lib/command');
const config = require('../config');
const { withFooter, axios, truncate, getBuffer, sasaApi } = require('../lib/utils');

/* SASA AI Ultra (primary) with free public fallbacks.
   Docs: https://sasa-dev-api.xyz — GET /api/sasaaiultra?text=<msg> with
   apikey param or X-API-Key header. Auto Reply user-key system is untouched. */
async function sasaUltraAI(prompt) {
  try {
    const r = await axios.get('https://sasa-dev-api.xyz/api/sasaaiultra', {
      params: { text: prompt, apikey: config.API_KEY },
      headers: { 'X-API-Key': config.API_KEY, 'x-api-key': config.API_KEY, 'User-Agent': 'LakshanXMD/1.0' },
      timeout: 120000,
      validateStatus: () => true
    });
    const d = r.data || {};
    if (d.status === true && typeof d.result === 'string' && d.result.trim()) return d.result.trim();
    return null;
  } catch (_) {
    return null;
  }
}

async function askAI(prompt) {
  /* Primary: Sasa AI Ultra (Pro) */
  const ultra = await sasaUltraAI(prompt);
  if (ultra) return ultra;
  /* Fallback: free public endpoints */
  const tries = [
    async () => {
      const r = await axios.post('https://text.pollinations.ai/', { messages: [{ role: 'user', content: prompt }], model: 'openai' }, { timeout: 90000 });
      return typeof r.data === 'string' ? r.data : r.data?.choices?.[0]?.message?.content;
    },
    async () => {
      const r = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 90000 });
      return typeof r.data === 'string' ? r.data : null;
    }
  ];
  for (const fn of tries) {
    try { const out = await fn(); if (out && String(out).trim()) return String(out).trim(); } catch (_) {}
  }
  return null;
}

function aiCommand({ pattern, alias, label, system, react }) {
  cmd({ pattern, alias, desc: `${label}`, category: 'ai', use: '<prompt>', react },
  async ({ q, m, reply }) => {
    const input = q || m.quoted?.text;
    if (!input) return reply(`*${label.toUpperCase()}*\n\nProvide a prompt.\nExample: .${pattern} explain quantum computing simply`);
    await reply('Thinking, please wait...');
    const out = await askAI(system ? `${system}\n\nUser: ${input}` : input);
    if (!out) return reply('The AI service did not respond. Please try again in a moment.');
    await reply(`*${label.toUpperCase()}*\n\n${truncate(out, 3500)}`);
  });
}

aiCommand({ pattern: 'ai', alias: ['gpt', 'chatgpt', 'bot2', 'ask2'], label: 'AI Assistant', system: 'You are a concise, helpful assistant.', react: '🤖' });
aiCommand({ pattern: 'explain', label: 'Explain Anything', system: 'Explain the following clearly for a beginner in under 200 words.', react: '📘' });
aiCommand({ pattern: 'summarize', alias: ['summary', 'tldr'], label: 'Text Summarizer', system: 'Summarize the following in 5 concise bullet points.', react: '📝' });
aiCommand({ pattern: 'codeai', alias: ['code', 'writecode'], label: 'Code Generator', system: 'Write clean, well commented code for this request. Output code only with a short explanation.', react: '💻' });
aiCommand({ pattern: 'fixcode', alias: ['debug'], label: 'Code Debugger', system: 'Find and fix bugs in this code. Explain what was wrong.', react: '🐛' });
aiCommand({ pattern: 'essay', alias: ['writeessay'], label: 'Essay Writer', system: 'Write a well structured essay on this topic, around 400 words.', react: '📄' });
aiCommand({ pattern: 'poem', alias: ['writepoem'], label: 'Poem Writer', system: 'Write a beautiful original poem about this topic.', react: '🪶' });
aiCommand({ pattern: 'story', alias: ['writestory'], label: 'Story Writer', system: 'Write a short, engaging story based on this idea, around 300 words.', react: '📖' });
aiCommand({ pattern: 'email', alias: ['writeemail'], label: 'Email Writer', system: 'Write a professional email for this situation.', react: '✉️' });
aiCommand({ pattern: 'caption', alias: ['captionai'], label: 'Caption Generator', system: 'Write 5 catchy social media captions with relevant hashtags for this topic.', react: '🏷️' });
aiCommand({ pattern: 'ideas', alias: ['brainstorm'], label: 'Idea Generator', system: 'Give 10 creative, practical ideas for this request.', react: '💡' });
aiCommand({ pattern: 'rewrite', alias: ['paraphrase'], label: 'Text Rewriter', system: 'Rewrite this text so it is clearer and more professional, keeping the meaning.', react: '✍️' });
aiCommand({ pattern: 'grammar', alias: ['fixgrammar', 'proofread'], label: 'Grammar Checker', system: 'Correct all grammar and spelling in this text and list the main corrections.', react: '📐' });
aiCommand({ pattern: 'translateai', alias: ['trai'], label: 'AI Translator', system: 'Translate this text into English, then explain any cultural nuance briefly.', react: '🌐' });
aiCommand({ pattern: 'sinhala', alias: ['sinhalaai'], label: 'Sinhala Assistant', system: 'Answer in Sinhala language clearly and politely.', react: '🇱🇰' });
aiCommand({ pattern: 'recipe', alias: ['cook'], label: 'Recipe Generator', system: 'Give a full recipe with ingredients, steps and cooking time for this dish.', react: '🍳' });
aiCommand({ pattern: 'workout', alias: ['fitness'], label: 'Workout Planner', system: 'Create a practical workout plan for this goal with sets and reps.', react: '💪' });
aiCommand({ pattern: 'study', alias: ['studyplan'], label: 'Study Planner', system: 'Create a realistic study plan with a weekly schedule for this subject.', react: '🎓' });
aiCommand({ pattern: 'business', alias: ['bizidea'], label: 'Business Advisor', system: 'Give practical business advice with concrete steps for this situation.', react: '📊' });
aiCommand({ pattern: 'namegen', alias: ['brandname'], label: 'Name Generator', system: 'Suggest 15 creative brand or project names with a one line reason each.', react: '🔖' });

cmd({ pattern: 'imagine', alias: ['aiimage', 'imgai', 'draw', 'text2img'], desc: 'Generate an image from a text prompt', category: 'ai', use: '<prompt>', react: '🎨' },
async ({ q, reply, send }) => {
  if (!q) return reply('Describe the image you want.\nExample: .imagine a cyberpunk city at night in the rain');
  await reply('Generating your image, this can take up to a minute...');
  try {
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&nologo=true&seed=${seed}`;
    const buf = await getBuffer(url, { timeout: 180000 });
    await send({ image: buf, caption: withFooter(`*AI IMAGE GENERATED*\n\nPrompt : ${truncate(q, 150)}\nSize   : 1024x1024\nSeed   : ${seed}`) });
  } catch (e) { await reply('Image generation failed. Try a simpler prompt.'); }
});

cmd({ pattern: 'imagine2', alias: ['aiart'], desc: 'Generate artistic AI image in wide format', category: 'ai', use: '<prompt>', react: '🖌️' },
async ({ q, reply, send }) => {
  if (!q) return reply('Describe the artwork you want.');
  await reply('Painting your artwork...');
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(q + ', highly detailed digital art, cinematic lighting')}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
    const buf = await getBuffer(url, { timeout: 180000 });
    await send({ image: buf, caption: withFooter(`*AI ARTWORK*\n\nPrompt : ${truncate(q, 150)}\nFormat : 1280x720`) });
  } catch { await reply('Artwork generation failed.'); }
});

cmd({ pattern: 'describe', alias: ['imgdesc', 'vision'], desc: 'Describe an image using AI', category: 'ai', react: '👁️' },
async ({ m, reply }) => {
  const t = m.quoted?.isImage ? m.quoted : (m.isImage ? m : null);
  if (!t) return reply('Reply to an image to have it described.');
  await reply('Analysing the image...');
  try {
    const buf = await t.download();
    const b64 = buf.toString('base64');
    const r = await axios.post('https://text.pollinations.ai/openai', {
      model: 'openai',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image in detail.' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }] }]
    }, { timeout: 120000 });
    const out = r.data?.choices?.[0]?.message?.content;
    if (!out) throw new Error('empty');
    await reply(`*IMAGE DESCRIPTION*\n\n${truncate(out, 3000)}`);
  } catch { await reply('Image analysis is unavailable right now.'); }
});

/* ============ SEARCH ============ */
cmd({ pattern: 'google', alias: ['gsearch', 'websearch'], desc: 'Search the web', category: 'search', use: '<query>', react: '🔍' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a search query.\nExample: .google best laptops 2026');
  try {
    const r = await axios.get('https://api.duckduckgo.com/', { params: { q, format: 'json', no_html: 1, skip_disambig: 1 }, timeout: 40000 });
    const d = r.data;
    let t = `*WEB SEARCH*\nQuery: ${q}\n\n`;
    if (d.AbstractText) t += `${d.AbstractText}\n\nSource: ${d.AbstractURL}\n\n`;
    const topics = (d.RelatedTopics || []).filter(x => x.Text).slice(0, 8);
    topics.forEach((x, i) => { t += `${i + 1}. ${truncate(x.Text, 120)}\n   ${x.FirstURL}\n\n`; });
    if (!d.AbstractText && !topics.length) return reply(`No direct results for *${q}*. Try more specific keywords or use .ai instead.`);
    await reply(t.slice(0, 3800));
  } catch { await reply('Search service is unavailable right now.'); }
});

cmd({ pattern: 'imagesearch', alias: ['img', 'searchimage', 'pinterest'], desc: 'Search for images', category: 'search', use: '<query>', react: '🖼️' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide a search term.\nExample: .imagesearch mountain sunset');
  try {
    for (let i = 0; i < 3; i++) {
      await send({ image: { url: `https://source.unsplash.com/1024x1024/?${encodeURIComponent(q)}&sig=${Date.now() + i}` }, caption: withFooter(`*IMAGE SEARCH*\n\nQuery: ${q}\nResult ${i + 1} of 3`) });
    }
  } catch { await reply('Image search failed.'); }
});

cmd({ pattern: 'github', alias: ['gh', 'ghsearch'], desc: 'Look up a GitHub user or repository', category: 'search', use: '<user|user/repo>', react: '🐙' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide a username or repo.\nExample: .github torvalds  or  .github facebook/react');
  try {
    if (q.includes('/')) {
      const r = await axios.get(`https://api.github.com/repos/${q.trim()}`, { timeout: 30000 });
      const d = r.data;
      return send({ image: { url: d.owner.avatar_url }, caption: withFooter(`*GITHUB REPOSITORY*\n\nName     : ${d.full_name}\nStars    : ${d.stargazers_count.toLocaleString()}\nForks    : ${d.forks_count.toLocaleString()}\nIssues   : ${d.open_issues_count}\nLanguage : ${d.language || '-'}\nLicense  : ${d.license?.name || 'none'}\nUpdated  : ${new Date(d.updated_at).toLocaleDateString('en-GB')}\n\n${truncate(d.description || 'No description', 250)}\n\n${d.html_url}`) });
    }
    const r = await axios.get(`https://api.github.com/users/${q.trim()}`, { timeout: 30000 });
    const d = r.data;
    await send({ image: { url: d.avatar_url }, caption: withFooter(`*GITHUB USER*\n\nName      : ${d.name || d.login}\nUsername  : ${d.login}\nBio       : ${truncate(d.bio || 'none', 150)}\nRepos     : ${d.public_repos}\nFollowers : ${d.followers.toLocaleString()}\nFollowing : ${d.following}\nCompany   : ${d.company || '-'}\nLocation  : ${d.location || '-'}\nJoined    : ${new Date(d.created_at).toLocaleDateString('en-GB')}\n\n${d.html_url}`) });
  } catch { await reply('GitHub lookup failed. Check the username or repo name.'); }
});

cmd({ pattern: 'npm', alias: ['npmsearch'], desc: 'Look up an npm package', category: 'search', use: '<package>', react: '📦' },
async ({ q, reply }) => {
  if (!q) return reply('Provide a package name.\nExample: .npm express');
  try {
    const r = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(q.trim())}`, { timeout: 30000 });
    const d = r.data, latest = d['dist-tags']?.latest;
    await reply(`*NPM PACKAGE*\n\nName     : ${d.name}\nVersion  : ${latest}\nLicense  : ${d.license || '-'}\nHomepage : ${d.homepage || '-'}\nAuthor   : ${d.author?.name || '-'}\n\n${truncate(d.description || '', 250)}\n\nInstall:\nnpm install ${d.name}`);
  } catch { await reply('Package not found on npm.'); }
});

cmd({ pattern: 'movieinfo2', alias: ['imdb', 'omdb'], desc: 'Movie details from IMDb data', category: 'search', use: '<title>', react: '🎬' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide a movie title.\nExample: .imdb inception');
  try {
    const r = await axios.get('https://www.omdbapi.com/', { params: { t: q, apikey: '564727fa' }, timeout: 30000 });
    const d = r.data;
    if (d.Response === 'False') return reply(`No movie found for *${q}*.`);
    const text = `*MOVIE INFORMATION*\n\nTitle    : ${d.Title}\nYear     : ${d.Year}\nRated    : ${d.Rated}\nReleased : ${d.Released}\nRuntime  : ${d.Runtime}\nGenre    : ${d.Genre}\nDirector : ${d.Director}\nActors   : ${d.Actors}\nIMDb     : ${d.imdbRating} (${d.imdbVotes} votes)\nCountry  : ${d.Country}\nAwards   : ${d.Awards}\n\nPlot:\n${d.Plot}`;
    if (d.Poster && d.Poster !== 'N/A') return send({ image: { url: d.Poster }, caption: withFooter(text) });
    await reply(text);
  } catch { await reply('Movie database lookup failed.'); }
});

cmd({ pattern: 'anime', alias: ['animeinfo', 'mal'], desc: 'Search anime information', category: 'search', use: '<title>', react: '🌸' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide an anime title.\nExample: .anime naruto');
  try {
    const r = await axios.get('https://api.jikan.moe/v4/anime', { params: { q, limit: 1 }, timeout: 40000 });
    const d = r.data?.data?.[0];
    if (!d) return reply(`No anime found for *${q}*.`);
    const text = `*ANIME INFORMATION*\n\nTitle    : ${d.title}\nJapanese : ${d.title_japanese || '-'}\nType     : ${d.type}\nEpisodes : ${d.episodes || '?'}\nStatus   : ${d.status}\nAired    : ${d.aired?.string || '-'}\nScore    : ${d.score || '-'} (${d.scored_by?.toLocaleString() || 0} users)\nRank     : #${d.rank || '-'}\nGenres   : ${(d.genres || []).map(g => g.name).join(', ')}\nStudio   : ${(d.studios || []).map(s => s.name).join(', ') || '-'}\n\nSynopsis:\n${truncate(d.synopsis || 'none', 700)}`;
    await send({ image: { url: d.images?.jpg?.large_image_url }, caption: withFooter(text) });
  } catch { await reply('Anime lookup failed.'); }
});

cmd({ pattern: 'manga', desc: 'Search manga information', category: 'search', use: '<title>', react: '📚' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide a manga title.\nExample: .manga one piece');
  try {
    const r = await axios.get('https://api.jikan.moe/v4/manga', { params: { q, limit: 1 }, timeout: 40000 });
    const d = r.data?.data?.[0];
    if (!d) return reply(`No manga found for *${q}*.`);
    await send({ image: { url: d.images?.jpg?.large_image_url }, caption: withFooter(`*MANGA INFORMATION*\n\nTitle    : ${d.title}\nType     : ${d.type}\nChapters : ${d.chapters || '?'}\nVolumes  : ${d.volumes || '?'}\nStatus   : ${d.status}\nScore    : ${d.score || '-'}\nGenres   : ${(d.genres || []).map(g => g.name).join(', ')}\n\n${truncate(d.synopsis || '', 700)}`) });
  } catch { await reply('Manga lookup failed.'); }
});

cmd({ pattern: 'waifu', alias: ['animegirl'], desc: 'Random anime character image', category: 'search', react: '🌺' },
async ({ reply, send }) => {
  try { const r = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 30000 }); await send({ image: { url: r.data.url }, caption: withFooter('*RANDOM ANIME IMAGE*') }); }
  catch { await reply('Anime image service is unavailable.'); }
});

cmd({ pattern: 'quotesanime', alias: ['animequote'], desc: 'Random anime quote', category: 'search', react: '💬' },
async ({ reply }) => {
  try {
    const r = await axios.get('https://animechan.io/api/v1/quotes/random', { timeout: 30000 });
    const d = r.data?.data || r.data;
    await reply(`*ANIME QUOTE*\n\n"${d.content || d.quote}"\n\nCharacter : ${d.character?.name || d.character}\nAnime     : ${d.anime?.name || d.anime}`);
  } catch { await reply('Anime quote service is unavailable.'); }
});

cmd({ pattern: 'country', alias: ['countryinfo'], desc: 'Information about a country', category: 'search', use: '<name>', react: '🗺️' },
async ({ q, reply, send }) => {
  if (!q) return reply('Provide a country name.\nExample: .country Sri Lanka');
  try {
    const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}`, { timeout: 30000 });
    const d = r.data[0];
    const text = `*COUNTRY INFORMATION*\n\nName       : ${d.name.common} (${d.name.official})\nCapital    : ${d.capital?.[0] || '-'}\nRegion     : ${d.region} / ${d.subregion || '-'}\nPopulation : ${d.population.toLocaleString()}\nArea       : ${d.area?.toLocaleString()} km2\nCurrency   : ${Object.values(d.currencies || {}).map(c => `${c.name} (${c.symbol || ''})`).join(', ')}\nLanguages  : ${Object.values(d.languages || {}).join(', ')}\nTimezones  : ${(d.timezones || []).slice(0, 3).join(', ')}\nCalling    : ${d.idd?.root || ''}${d.idd?.suffixes?.[0] || ''}`;
    await send({ image: { url: d.flags.png }, caption: withFooter(text) });
  } catch { await reply('Country not found.'); }
});

cmd({ pattern: 'quran', alias: ['ayah'], desc: 'Get a Quran verse', category: 'search', use: '<surah:ayah>', react: '📗' },
async ({ q, reply }) => {
  const ref = q || `${Math.floor(Math.random() * 114) + 1}:1`;
  try {
    const r = await axios.get(`https://api.alquran.cloud/v1/ayah/${encodeURIComponent(ref)}/editions/quran-uthmani,en.asad`, { timeout: 30000 });
    const [ar, en] = r.data.data;
    await reply(`*QURAN VERSE*\n\nSurah : ${ar.surah.englishName} (${ar.surah.number}:${ar.numberInSurah})\n\n${ar.text}\n\nTranslation:\n${en.text}`);
  } catch { await reply('Verse lookup failed. Format: .quran 2:255'); }
});

cmd({ pattern: 'bible', alias: ['verse'], desc: 'Get a Bible verse', category: 'search', use: '<book chapter:verse>', react: '📕' },
async ({ q, reply }) => {
  const ref = q || 'john 3:16';
  try {
    const r = await axios.get(`https://bible-api.com/${encodeURIComponent(ref)}`, { timeout: 30000 });
    await reply(`*BIBLE VERSE*\n\nReference : ${r.data.reference}\nVersion   : ${r.data.translation_name}\n\n${String(r.data.text).trim()}`);
  } catch { await reply('Verse lookup failed. Format: .bible john 3:16'); }
});

cmd({ pattern: 'apisearch', alias: ['sasaapi'], desc: 'Query any SASA TECH API endpoint directly', category: 'search', ownerOnly: true, use: '<endpoint> <query>', react: '🧷' },
async ({ args, reply }) => {
  if (!args[0]) return reply('Format: .apisearch /api/v1/movie/sinhalasub/search 2024');
  const r = await sasaApi(args[0], { q: args.slice(1).join(' ') });
  await reply('```' + JSON.stringify(r, null, 2).slice(0, 3000) + '```');
});
