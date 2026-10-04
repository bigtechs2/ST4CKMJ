'use strict';

const DC_KEY = process.env.DAVIDCYRIL_KEY || 'dc_live__QTnLsE1YSVTzwpNmWqTA1VilR2bP8WX';

const endpoints = {

  chat: [
    {
      name:    'dc-claude-sonnet-4.6',
      url:     'https://apis.davidcyriltech.my.id/ai/claude-sonnet-4.6',
      param:   'prompt',
      shape:   'davidcyril',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 40000,
      tier:    1,
      enabled: true
    },
    {
      name:    'dc-gpt-4o',
      url:     'https://apis.davidcyriltech.my.id/ai/gpt-4o',
      param:   'prompt',
      shape:   'davidcyril',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 40000,
      tier:    1,
      enabled: true
    },
    {
      name:    'dc-gemini-3.1-pro',
      url:     'https://apis.davidcyriltech.my.id/ai/gemini-3.1-pro',
      param:   'prompt',
      shape:   'davidcyril',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 40000,
      tier:    1,
      enabled: true
    },
    {
      name:    'dc-deepseek-v4-pro',
      url:     'https://apis.davidcyriltech.my.id/ai/deepseek-v4-pro',
      param:   'prompt',
      shape:   'davidcyril',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 40000,
      tier:    1,
      enabled: true
    },

    {
      name:    'nexray-powerbrain',
      url:     'https://api.nexray.eu.cc/ai/powerbrain',
      param:   'text',
      shape:   'nexray',
      timeout: 30000,
      tier:    2,
      enabled: true
    },
    {
      name:    'nexray-claude',
      url:     'https://api.nexray.eu.cc/ai/claude',
      param:   'text',
      shape:   'nexray',
      timeout: 30000,
      tier:    2,
      enabled: true
    },
    {
      name:    'nexray-copilot',
      url:     'https://api.nexray.eu.cc/ai/copilot',
      param:   'text',
      shape:   'nexray',
      timeout: 30000,
      tier:    2,
      enabled: true
    },
    {
      name:    'siputzx-gemini',
      url:     'https://api.siputzx.my.id/api/ai/gemini',
      param:   'text',
      shape:   'siputzx',
      timeout: 30000,
      tier:    2,
      enabled: true
    },
    {
      name:    'neoapis-deepseek',
      url:     'https://www.neoapis.xyz/api/ai/deepseek',
      param:   'text',
      shape:   'neoapis',
      timeout: 30000,
      tier:    2,
      enabled: true
    }
  ],

  image: [
    {
      name:    'dc-anonymous',
      url:     'https://apis.davidcyriltech.my.id/ai/anonymous/image',
      param:   'prompt',
      shape:   'dc-image-1',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 60000,
      enabled: true
    },
    {
      name:    'dc-fluxv2',
      url:     'https://apis.davidcyriltech.my.id/fluxv2',
      param:   'prompt',
      shape:   'dc-image-2',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 60000,
      enabled: true
    },
    {
      name:        'dc-writecream',
      url:         'https://apis.davidcyriltech.my.id/ai/writecream/image',
      param:       'prompt',
      shape:       'dc-image-3',
      extraParams: { ratio: '1:1' },
      headers:     { 'X-API-Key': DC_KEY },
      timeout:     60000,
      enabled:     true
    },
    {
      name:    'azbry-imagegen',
      url:     'https://api.azbry.com/api/ai/imagegen',
      param:   'prompt',
      shape:   'azbry-image',
      timeout: 60000,
      enabled: true
    },
    {
      name:    'nexray-ideogram',
      url:     'https://api.nexray.eu.cc/ai/ideogram',
      param:   'prompt',
      shape:   'nexray-image',
      timeout: 60000,
      enabled: true
    }
  ],

  vision: [
    {
      name:    'dc-vision',
      url:     'https://apis.davidcyriltech.my.id/ai/vision',
      param:   'image',
      shape:   'dc-vision',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 40000,
      enabled: true
    },
    {
      name:    'dc-anon-vision',
      url:     'https://apis.davidcyriltech.my.id/ai/anonymous/vision',
      param:   'image',
      shape:   'dc-vision',
      headers: { 'X-API-Key': DC_KEY },
      timeout: 40000,
      enabled: true
    }
  ],

  tts: [
    {
      name:    'nexray-tts',
      url:     'https://api.nexray.eu.cc/ai/gemini-tts',
      param:   'text',
      shape:   'nexray-tts',
      timeout: 30000,
      enabled: true
    }
  ],

  stt: [
    {
      name:    'groq-whisper',
      url:     'https://api.groq.com/openai/v1/audio/transcriptions',
      model:   'whisper-large-v3-turbo',
      shape:   'groq',
      enabled: true
    }
  ]

};

const shapes = {

  davidcyril: (data) =>
    data?.result ||
    data?.reply ||
    data?.message ||
    data?.response ||
    data?.data?.reply ||
    (typeof data === 'string' ? data : null),

  nexray: (data) =>
    data?.data?.reply ||
    data?.reply ||
    data?.result ||
    data?.message ||
    data?.response ||
    (typeof data === 'string' ? data : null),

  siputzx: (data) => {
    const r =
      data?.result ||
      data?.message ||
      data?.answer ||
      data?.response ||
      data?.data?.reply ||
      data?.reply;

    if (r === undefined || r === null) return null;
    if (typeof r === 'object') return JSON.stringify(r);
    return String(r);
  },

  neoapis: (data) =>
    data?.data?.reply ||
    data?.reply ||
    data?.result ||
    data?.message ||
    (typeof data === 'string' ? data : null),

  'dc-image-1': (data) =>
    data?.result?.image ||
    data?.result?.url ||
    data?.image ||
    data?.url ||
    data?.data?.image ||
    data?.data?.url ||
    (typeof data === 'string' ? data : null),

  'dc-image-2': (data) =>
    data?.result?.image ||
    data?.result ||
    data?.image ||
    data?.url ||
    (typeof data === 'string' ? data : null),

  'dc-image-3': (data) =>
    data?.result?.image ||
    data?.result?.url ||
    data?.image ||
    data?.url ||
    (typeof data === 'string' ? data : null),

  'azbry-image': (data) =>
    data?.result?.image ||
    data?.result?.url ||
    data?.image ||
    data?.url ||
    data?.data?.image ||
    (typeof data === 'string' ? data : null),

  'nexray-image': (data) =>
    data?.result?.image ||
    data?.result?.url ||
    data?.image ||
    data?.url ||
    data?.data?.[0]?.url ||
    (typeof data === 'string' ? data : null),

  'dc-vision': (data) =>
    data?.result?.reply ||
    data?.result?.text ||
    data?.result ||
    data?.reply ||
    data?.text ||
    data?.message ||
    (typeof data === 'string' ? data : null),

  'nexray-tts': (data) =>
    data?.result?.url ||
    data?.result?.audio ||
    data?.result ||
    data?.url ||
    data?.audio ||
    data?.data?.url ||
    (typeof data === 'string' ? data : null),

  groq: (data) =>
    data?.text ||
    data?.transcription ||
    data?.result ||
    (typeof data === 'string' ? data : null)

};

function getList(category) {
  return endpoints[category] || [];
}

function getEnabled(category) {
  return getList(category).filter((e) => e.enabled !== false);
}

function getByName(category, name) {
  return getList(category).find((e) => e.name === name) || null;
}

function getFirstEnabled(category) {
  return getEnabled(category)[0] || null;
}

function getByTier(category, tier) {
  return getEnabled(category).filter((e) => e.tier === tier);
}

function getBest(category) {
  const enabled = getEnabled(category);
  if (!enabled.length) return null;

  const ranked = enabled.slice().sort((a, b) => {
    const ta = a.tier ?? 99;
    const tb = b.tier ?? 99;
    return ta - tb;
  });

  return ranked[0];
}

function getFallbacks(category, exclude = []) {
  const skip = new Set(exclude);
  return getEnabled(category).filter((e) => !skip.has(e.name));
}

function parseShape(shapeName, data) {
  const parser = shapes[shapeName];
  if (!parser) return null;

  try {
    const result = parser(data);
    if (result === undefined || result === null) return null;
    if (typeof result === 'object') return JSON.stringify(result);
    return String(result);
  } catch {
    return null;
  }
}

function buildParams(endpoint, value) {
  const params = {};

  if (endpoint.param) {
    params[endpoint.param] = value;
  } else {
    params.text = value;
  }

  if (endpoint.extraParams && typeof endpoint.extraParams === 'object') {
    Object.assign(params, endpoint.extraParams);
  }

  return params;
}

function getHeaders(endpoint) {
  if (!endpoint || !endpoint.headers) return {};
  return { ...endpoint.headers };
}

function listNames(category) {
  return getList(category).map((e) => e.name);
}

function count(category) {
  return getList(category).length;
}

function stats() {
  return {
    chat:   count('chat'),
    image:  count('image'),
    vision: count('vision'),
    tts:    count('tts'),
    stt:    count('stt'),
    total:  ['chat', 'image', 'vision', 'tts', 'stt']
      .reduce((sum, k) => sum + count(k), 0)
  };
}

module.exports = {
  endpoints,
  shapes,

  getList,
  getEnabled,
  getByName,
  getFirstEnabled,
  getByTier,
  getBest,
  getFallbacks,

  parseShape,
  buildParams,
  getHeaders,
  listNames,
  count,
  stats,

  DC_KEY
};