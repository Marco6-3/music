'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const axios = require('axios');
const {
  ensurePlaylist,
  insertPlaylistSong,
  userWithCollections,
  getUserPlaylistsArray,
  stringValue,
  normalizeArtist
} = require('./database');

const DEFAULT_AGENT_MODEL = 'deepseek-v4-flash';
const DEFAULT_AGENT_BASE_URL = 'https://api.deepseek.com';
const MAX_AGENT_MESSAGE_LENGTH = 2000;
const MAX_AGENT_SONGS = 20;
const DEFAULT_SEARCH_SOURCES = ['netease', 'kuwo', 'tencent', 'kugou', 'bilibili'];

async function handleAgentAssistant(db, req, res, {
  dispatcher,
  offlineCache,
  agentModelClient,
  agentConfigResolver = resolveAgentConfig
} = {}) {
  const userId = Number(req.body.user_id || 0);
  const message = stringValue(req.body.message).slice(0, MAX_AGENT_MESSAGE_LENGTH);
  const selectedPlaylistName = stringValue(req.body.playlist_name || req.body.active_playlist_name);
  const preferredSource = stringValue(req.body.source || req.body.preferred_source || 'netease');

  if (!userId) return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  if (!message) return res.json({ success: false, message: '请先告诉助手要添加哪些歌曲' });

  const playlists = getUserPlaylistsArray(db, userId);
  const context = {
    message,
    selectedPlaylistName,
    preferredSource,
    playlists: playlists.map((playlist) => ({
      name: playlist.name,
      song_count: playlist.song_count || 0
    }))
  };
  const plan = await createAgentPlan(message, context, { agentModelClient, agentConfigResolver });
  const normalizedPlan = normalizeAgentPlan(plan);

  if (normalizedPlan.action === 'query_playlist_songs') {
    return handlePlaylistQuery(db, userId, playlists, normalizedPlan, selectedPlaylistName, res);
  }

  if (normalizedPlan.action !== 'add_songs_to_playlist') {
    return res.json({
      success: true,
      action: normalizedPlan.action,
      reply: normalizedPlan.reply || '我可以帮你把歌曲加入歌单，也可以查看某个歌单里的歌曲。',
      configured: Boolean(normalizedPlan.configured),
      model: normalizedPlan.model || ''
    });
  }

  const playlistName = stringValue(normalizedPlan.playlist_name || selectedPlaylistName);
  if (!playlistName) {
    return res.json({
      success: true,
      action: 'ask_clarification',
      reply: '要加入哪个歌单？可以告诉我歌单名，例如“把晴天加入通勤歌单”。',
      songs: normalizedPlan.songs
    });
  }

  const requestedSongs = normalizedPlan.songs.slice(0, MAX_AGENT_SONGS);
  if (!requestedSongs.length) {
    return res.json({
      success: true,
      action: 'ask_clarification',
      reply: '我还没有识别到具体歌曲。请把歌名发给我，可以一次发多首。'
    });
  }

  const searchSources = normalizeSearchSources(preferredSource);
  const resolvedSongs = [];
  const unresolvedSongs = [];

  for (const requestSong of requestedSongs) {
    const resolved = await resolveRequestedSong(requestSong, dispatcher, searchSources);
    if (resolved) resolvedSongs.push(resolved);
    else unresolvedSongs.push(requestSong);
  }

  if (!resolvedSongs.length) {
    return res.json({
      success: true,
      action: 'no_matches',
      reply: '没有在当前音源里找到可加入的歌曲。可以补充歌手名，或换一个音乐源再试。',
      requested_songs: requestedSongs,
      unresolved_songs: unresolvedSongs,
      configured: Boolean(normalizedPlan.configured),
      model: normalizedPlan.model || ''
    });
  }

  const playlist = ensurePlaylist(db, userId, playlistName);
  if (!playlist) return res.json({ success: false, message: '歌单名称不能为空' });

  const addedSongs = [];
  const existingSongs = [];
  const addSongs = db.transaction(() => {
    for (const song of resolvedSongs) {
      const exists = db.prepare(`
        SELECT id FROM playlist_songs
        WHERE playlist_id = ? AND song_id = ? AND source = ?
      `).get(playlist.id, song.id, song.source || 'netease');
      if (exists) {
        existingSongs.push(song);
        continue;
      }
      insertPlaylistSong(db, playlist.id, song);
      addedSongs.push(song);
    }
  });
  addSongs();
  if (offlineCache) offlineCache.scheduleSync();

  const replyParts = [];
  if (addedSongs.length) replyParts.push(`已把 ${addedSongs.length} 首歌加入「${playlist.name}」`);
  if (existingSongs.length) replyParts.push(`${existingSongs.length} 首已在歌单中`);
  if (unresolvedSongs.length) replyParts.push(`${unresolvedSongs.length} 首暂未找到`);

  return res.json({
    success: true,
    action: 'add_songs_to_playlist',
    reply: replyParts.join('，') || `「${playlist.name}」没有新增歌曲`,
    playlist: { id: playlist.id, name: playlist.name },
    requested_songs: requestedSongs,
    added_songs: addedSongs,
    existing_songs: existingSongs,
    unresolved_songs: unresolvedSongs,
    user: userWithCollections(db, userId),
    configured: Boolean(normalizedPlan.configured),
    model: normalizedPlan.model || ''
  });
}

function handlePlaylistQuery(db, userId, playlists, normalizedPlan, selectedPlaylistName, res) {
  const playlistName = stringValue(normalizedPlan.playlist_name || selectedPlaylistName);
  if (!playlistName) {
    return res.json({
      success: true,
      action: 'ask_clarification',
      reply: '要查看哪个歌单？可以告诉我歌单名，例如“查看通勤歌单里的歌曲”。',
      configured: Boolean(normalizedPlan.configured),
      model: normalizedPlan.model || ''
    });
  }

  const playlist = findPlaylistByName(playlists, playlistName);
  if (!playlist) {
    return res.json({
      success: true,
      action: 'query_playlist_songs',
      reply: `没有找到「${playlistName}」这个歌单。`,
      playlist_name: playlistName,
      playlists: playlists.map((item) => ({ name: item.name, song_count: item.song_count || 0 })),
      configured: Boolean(normalizedPlan.configured),
      model: normalizedPlan.model || ''
    });
  }

  const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
  return res.json({
    success: true,
    action: 'query_playlist_songs',
    reply: buildPlaylistSongsReply(playlist.name, songs),
    playlist: { name: playlist.name, song_count: songs.length },
    playlist_songs: songs,
    user: userWithCollections(db, userId),
    configured: Boolean(normalizedPlan.configured),
    model: normalizedPlan.model || ''
  });
}

async function createAgentPlan(message, context, { agentModelClient, agentConfigResolver } = {}) {
  if (agentModelClient) {
    return {
      ...(await agentModelClient({ message, context })),
      configured: true,
      model: 'test-agent'
    };
  }

  const config = agentConfigResolver();
  if (config.apiKey) {
    try {
      return {
        ...(await createDeepSeekPlan(message, context, config)),
        configured: true,
        model: config.model
      };
    } catch (error) {
      console.warn('[agent-assistant] DeepSeek plan failed, using heuristic fallback:', error.message);
    }
  }

  return {
    ...createHeuristicPlan(message, context),
    configured: Boolean(config.apiKey),
    model: config.apiKey ? config.model : ''
  };
}

async function createDeepSeekPlan(message, context, config) {
  const response = await axios.post(chatCompletionsUrl(config.baseUrl), {
    model: config.model,
    temperature: 0.1,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          '你是 music 桌面播放器的歌单助手，只处理音乐库和歌单请求。',
          '把用户的自然语言解析成 JSON，不要输出 Markdown。',
          '如果用户要把歌曲加入歌单，输出 action=add_songs_to_playlist、playlist_name 和 songs。',
          '如果用户要查看、查询、列出某个歌单里的歌曲，输出 action=query_playlist_songs 和 playlist_name，songs 为空数组。',
          'songs 中每项包含 title 和 artist；不知道歌手时 artist 为空字符串。',
          '如果缺少目标歌单或具体歌曲，输出 action=ask_clarification 和 reply。',
          '不要编造用户没有提到的歌曲。'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          user_message: message,
          selected_playlist_name: context.selectedPlaylistName || '',
          existing_playlists: context.playlists || [],
          output_schema: {
            action: 'add_songs_to_playlist | query_playlist_songs | ask_clarification | chat',
            playlist_name: 'string',
            songs: [{ title: 'string', artist: 'string' }],
            reply: 'string'
          }
        })
      }
    ]
  }, {
    timeout: 20_000,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  const content = response.data?.choices?.[0]?.message?.content || '';
  return JSON.parse(extractJsonObject(content));
}

function createHeuristicPlan(message, context = {}) {
  if (isPlaylistQueryRequest(message)) {
    const playlistName = inferPlaylistQueryName(message, context);
    return {
      action: playlistName ? 'query_playlist_songs' : 'ask_clarification',
      playlist_name: playlistName,
      songs: [],
      reply: playlistName ? '' : '要查看哪个歌单？'
    };
  }

  const playlistName = inferPlaylistName(message, context);
  const songs = inferSongs(message);
  if (!playlistName) {
    return {
      action: 'ask_clarification',
      playlist_name: '',
      songs,
      reply: '要加入哪个歌单？'
    };
  }
  if (!songs.length) {
    return {
      action: 'ask_clarification',
      playlist_name: playlistName,
      songs: [],
      reply: '请告诉我要添加哪些歌曲。'
    };
  }
  return {
    action: 'add_songs_to_playlist',
    playlist_name: playlistName,
    songs,
    reply: ''
  };
}

function inferPlaylistName(message, context = {}) {
  const text = String(message || '');
  const existingName = inferExistingPlaylistName(text, context);
  if (existingName) return existingName;

  const patterns = [
    /(?:加入|加到|放到|添加到|存到)\s*([^，。,.!?！？\s]{1,30})\s*(?:歌单|列表|playlist)/i,
    /(?:歌单|playlist)\s*[:：]\s*([^，。,.!?！？\s]{1,30})/i,
    /(?:到|进)\s*([^，。,.!?！？\s]{1,30})\s*(?:歌单|列表)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanupPlaylistName(match[1]);
  }
  return stringValue(context.selectedPlaylistName);
}

function inferPlaylistQueryName(message, context = {}) {
  const text = String(message || '');
  const existingName = inferExistingPlaylistName(text, context);
  if (existingName) return existingName;

  const patterns = [
    /(?:查看|查询|看看|列出|显示)\s*([^，。,.!?！？\s]{1,60})\s*(?:歌单|列表|playlist)(?:里|中|里面|中的)?(?:的)?(?:歌曲|歌|内容)?/i,
    /([^，。,.!?！？\s]{1,60})\s*(?:歌单|列表|playlist)(?:里|中|里面|中的)?(?:有|包含|收录)?(?:哪些|什么|几首|多少|歌曲|歌|内容)/i,
    /(?:歌单|playlist)\s*[:：]\s*([^，。,.!?！？\s]{1,60})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanupPlaylistName(match[1]);
  }

  return stringValue(context.selectedPlaylistName);
}

function inferExistingPlaylistName(message, context = {}) {
  const text = normalizeMentionText(message);
  const playlists = Array.isArray(context.playlists) ? context.playlists : [];
  return playlists
    .map((playlist) => stringValue(playlist.name))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((name) => text.includes(normalizeMentionText(name))) || '';
}

function isPlaylistQueryRequest(message) {
  const text = String(message || '');
  if (/(?:加入|加到|放到|添加到|存到|新增)/.test(text)) return false;
  return /(?:查看|查询|看看|列出|显示|有哪些|有什么|多少|几首|歌单.*(?:里|中|里面|歌曲|歌|内容))/.test(text);
}

function inferSongs(message) {
  let text = String(message || '')
    .replace(/请|帮我|麻烦|可以|把|将|歌曲|歌名|这些歌|这些歌曲/g, '')
    .replace(/(?:加入|加到|放到|添加到|存到|导入|新增).*/g, '')
    .trim();
  const quoted = Array.from(String(message || '').matchAll(/[“"『「']([^”"』」']{1,80})[”"』」']/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
  const rawItems = quoted.length ? quoted : text.split(/[，,、\n；;]+|\s+和\s+|\s+以及\s+/);
  return rawItems
    .map((item) => parseSongMention(item))
    .filter((song) => song.title)
    .slice(0, MAX_AGENT_SONGS);
}

function parseSongMention(value) {
  const text = String(value || '').trim().replace(/^[-*]\s*/, '');
  if (!text) return { title: '', artist: '' };
  const byArtist = text.match(/^(.+?)[\s-]+(?:by|--|——|-)\s*(.+)$/i);
  if (byArtist) return { title: cleanupSongTitle(byArtist[1]), artist: stringValue(byArtist[2]) };
  const cnArtist = text.match(/^(.+?)(?:的|演唱的)(.+)$/);
  if (cnArtist) return { title: cleanupSongTitle(cnArtist[2]), artist: stringValue(cnArtist[1]) };
  return { title: cleanupSongTitle(text), artist: '' };
}

function normalizeAgentPlan(plan) {
  const action = normalizeAgentAction(plan?.action || 'chat');
  const songs = (Array.isArray(plan?.songs) ? plan.songs : [])
    .map((song) => ({
      title: stringValue(song.title || song.name || song.song_title),
      artist: stringValue(song.artist || song.singer || song.song_artist)
    }))
    .filter((song) => song.title)
    .slice(0, MAX_AGENT_SONGS);
  return {
    action,
    playlist_name: cleanupPlaylistName(plan?.playlist_name || plan?.playlist || plan?.target_playlist),
    songs,
    reply: stringValue(plan?.reply || plan?.message),
    configured: Boolean(plan?.configured),
    model: stringValue(plan?.model)
  };
}

function normalizeAgentAction(value) {
  const action = stringValue(value || 'chat').toLowerCase();
  if (['query_playlist_songs', 'list_playlist_songs', 'get_playlist_songs', 'show_playlist_songs', 'show_playlist', 'read_playlist'].includes(action)) {
    return 'query_playlist_songs';
  }
  if (['add_songs_to_playlist', 'add_song_to_playlist', 'add_playlist_songs'].includes(action)) {
    return 'add_songs_to_playlist';
  }
  if (['ask_clarification', 'clarify'].includes(action)) return 'ask_clarification';
  return action || 'chat';
}

async function resolveRequestedSong(requestSong, dispatcher, sources) {
  const title = stringValue(requestSong.title);
  const artist = stringValue(requestSong.artist);
  if (!title || !dispatcher?.search) return null;
  const keyword = [title, artist].filter(Boolean).join(' ');

  for (const source of sources) {
    try {
      const candidates = await dispatcher.search(source, keyword, 5);
      const match = chooseBestSongMatch(candidates, title, artist ? [artist] : []);
      if (match) {
        return normalizeResolvedSong(match, {
          source,
          original_title: title,
          original_artist: artist
        });
      }
    } catch (error) {
      console.warn(`[agent-assistant] search failed on ${source}:`, error.message);
    }
  }
  return null;
}

function normalizeResolvedSong(song, fallback) {
  return {
    id: stringValue(song.id || song.song_id),
    source: stringValue(song.source || fallback.source || 'netease'),
    name: stringValue(song.name || song.title || song.song_title),
    artist: normalizeArtist(song.artist || song.singer || song.song_artist),
    album: stringValue(song.album),
    pic_id: stringValue(song.pic_id || song.pic || song.cover || song.song_cover),
    original_title: stringValue(song.original_title || fallback.original_title),
    original_artist: stringValue(song.original_artist || fallback.original_artist)
  };
}

function chooseBestSongMatch(candidates, name, artists) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const normalizedName = normalizeMatchText(name);
  const normalizedArtists = artists.map(normalizeMatchText).filter(Boolean);
  return candidates.find((candidate) => {
    const candidateName = normalizeMatchText(candidate.name || candidate.title || candidate.song_title);
    const candidateArtists = artistList(candidate.artist || candidate.singer || candidate.song_artist).map(normalizeMatchText);
    const titleMatches = candidateName === normalizedName
      || candidateName.includes(normalizedName)
      || normalizedName.includes(candidateName);
    const artistMatches = !normalizedArtists.length
      || normalizedArtists.some((artist) => candidateArtists.some((candidateArtist) => candidateArtist.includes(artist) || artist.includes(candidateArtist)));
    return titleMatches && artistMatches;
  }) || candidates[0];
}

function normalizeSearchSources(preferredSource) {
  const source = stringValue(preferredSource || 'netease');
  return [source, ...DEFAULT_SEARCH_SOURCES].filter((item, index, list) => item && list.indexOf(item) === index);
}

function artistList(value) {
  if (Array.isArray(value)) return value;
  return normalizeArtist(value).split(/[,/&、]/).map((artist) => artist.trim()).filter(Boolean);
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function normalizeMentionText(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[“”"『』「」'\s]/g, '');
}

function cleanupPlaylistName(value) {
  return stringValue(value).replace(/[“”"『』「」']/g, '').slice(0, 60);
}

function findPlaylistByName(playlists, name) {
  const normalizedName = normalizeMentionText(name);
  const candidates = Array.isArray(playlists) ? playlists : [];
  return candidates.find((playlist) => normalizeMentionText(playlist.name) === normalizedName)
    || candidates.find((playlist) => {
      const candidateName = normalizeMentionText(playlist.name);
      return candidateName.includes(normalizedName) || normalizedName.includes(candidateName);
    });
}

function buildPlaylistSongsReply(playlistName, songs) {
  if (!songs.length) return `「${playlistName}」目前还没有歌曲。`;
  const preview = songs.slice(0, 8).map((song) => {
    const name = stringValue(song.name || song.title || song.song_title);
    const artist = normalizeArtist(song.artist || song.singer || song.song_artist);
    return artist ? `${name} - ${artist}` : name;
  }).filter(Boolean);
  const suffix = songs.length > preview.length ? ' 等' : '';
  return `「${playlistName}」里有 ${songs.length} 首歌：${preview.join('、')}${suffix}`;
}

function cleanupSongTitle(value) {
  return stringValue(value)
    .replace(/^(听|播放|添加|加入|收藏)\s*/g, '')
    .replace(/[“”"『』「」']/g, '')
    .trim();
}

function extractJsonObject(content) {
  const text = String(content || '').trim();
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型没有返回 JSON');
  return match[0];
}

function resolveAgentConfig() {
  const localConfig = readLocalAgentConfig();
  const apiKey = firstValue(
    process.env.MUSIC_AGENT_API_KEY,
    process.env.MUSIQ_AGENT_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    localConfig.MUSIC_AGENT_API_KEY,
    localConfig.MUSIQ_AGENT_API_KEY,
    localConfig.DEEPSEEK_API_KEY,
    process.env.OPENAI_API_KEY,
    localConfig.OPENAI_API_KEY,
    deepseekScopedAnthropicToken(localConfig)
  );
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(firstValue(
      process.env.MUSIC_AGENT_BASE_URL,
      process.env.MUSIQ_AGENT_BASE_URL,
      process.env.DEEPSEEK_BASE_URL,
      localConfig.MUSIC_AGENT_BASE_URL,
      localConfig.MUSIQ_AGENT_BASE_URL,
      localConfig.DEEPSEEK_BASE_URL,
      process.env.OPENAI_BASE_URL,
      localConfig.OPENAI_BASE_URL,
      DEFAULT_AGENT_BASE_URL
    )),
    model: firstValue(
      process.env.MUSIC_AGENT_MODEL,
      process.env.MUSIQ_AGENT_MODEL,
      process.env.DEEPSEEK_MODEL,
      localConfig.MUSIC_AGENT_MODEL,
      localConfig.MUSIQ_AGENT_MODEL,
      localConfig.DEEPSEEK_MODEL,
      process.env.OPENAI_MODEL,
      localConfig.OPENAI_MODEL,
      DEFAULT_AGENT_MODEL
    )
  };
}

function deepseekScopedAnthropicToken(localConfig) {
  const baseUrl = firstValue(localConfig.ANTHROPIC_BASE_URL, process.env.ANTHROPIC_BASE_URL);
  const model = firstValue(localConfig.ANTHROPIC_MODEL, process.env.ANTHROPIC_MODEL);
  if (!/deepseek/i.test(`${baseUrl} ${model}`)) return '';
  return firstValue(localConfig.ANTHROPIC_AUTH_TOKEN, process.env.ANTHROPIC_AUTH_TOKEN);
}

function readLocalAgentConfig() {
  return {
    ...readMarkdownEnv(path.join(process.cwd(), 'AGENTS.local.md')),
    ...readClaudeSettings()
  };
}

function readClaudeSettings() {
  const home = os.homedir();
  const config = {};
  for (const file of [
    path.join(home, '.claude', 'settings.deepseek.json'),
    path.join(home, '.claude', 'settings.json'),
    path.join(home, '.claude.json')
  ]) {
    const json = readJsonFile(file);
    if (!json) continue;
    collectEnvLikeValues(json, config);
  }
  return config;
}

function readJsonFile(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function collectEnvLikeValues(value, result) {
  if (!value || typeof value !== 'object') return;
  if (value.env && typeof value.env === 'object') {
    for (const [key, rawValue] of Object.entries(value.env)) {
      if (typeof rawValue === 'string' && isAgentConfigKey(key)) result[key] = rawValue;
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectEnvLikeValues(child, result);
  }
}

function readMarkdownEnv(file) {
  const result = {};
  try {
    if (!fs.existsSync(file)) return result;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:[-*]\s*)?(MUSIC_AGENT_[A-Z0-9_]+|MUSIQ_AGENT_[A-Z0-9_]+|DEEPSEEK_[A-Z0-9_]+|OPENAI_(?:API_KEY|BASE_URL|MODEL))\s*[:=]\s*(.+?)\s*$/);
      if (!match) continue;
      result[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
    }
  } catch {
    return result;
  }
  return result;
}

function isAgentConfigKey(key) {
  return /^(MUSIC_AGENT|MUSIQ_AGENT|DEEPSEEK|OPENAI|ANTHROPIC)_(API_KEY|AUTH_TOKEN|BASE_URL|MODEL)$/i.test(key);
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return '';
}

function normalizeBaseUrl(value) {
  return stringValue(value || DEFAULT_AGENT_BASE_URL)
    .replace(/\/anthropic\/?$/i, '')
    .replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

module.exports = {
  handleAgentAssistant,
  createHeuristicPlan,
  resolveAgentConfig
};
