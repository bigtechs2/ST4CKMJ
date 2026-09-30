'use strict';

const brand = require('./brand');
const config = require('./config');

module.exports = {

  BRAND_NAME:    brand.BOT_NAME,
  BRAND_VERSION: brand.BOT_VERSION,

  PREFIX: {
    telegram: config.prefixes.telegram,
    whatsapp: config.prefixes.whatsappDefault
  },

  SOURCE: {
    telegram: 'telegram',
    website:  'website',
    whatsapp: 'whatsapp',
    admin:    'admin',
    system:   'system'
  },

  SESSION_STATE: {
    pairing:      'pairing',
    connecting:   'connecting',
    connected:    'connected',
    disconnected: 'disconnected',
    loggedOut:    'loggedOut',
    banned:       'banned',
    broken:       'broken'
  },

  DISCONNECT: {
    loggedOut:        401,
    connectionLost:   408,
    connectionClosed: 428,
    restartRequired:  515
  },

  RECONNECT_ACTION: {
    401: 'delete',
    408: 'retry',
    428: 'retry',
    515: 'restart'
  },

  PERMISSION: {
    owner:   'owner',
    admin:   'admin',
    premium: 'premium',
    group:   'group',
    private: 'private',
    coin:    'coin'
  },

  TIER: {
    owner:    'owner',
    coOwner:  'coOwner',
    premium:  'premium',
    free:     'free'
  },

  PLAN: {
    free:    'free',
    premium: 'premium'
  },

  CATEGORIES: [
    'main',
    'ai-chart',
    'ai-generator',
    'converter',
    'downloader',
    'funny',
    'game',
    'group',
    'information',
    'maker',
    'misc',
    'owner',
    'profile',
    'search',
    'tools'
  ],

  MESSAGE_TYPE: {
    text:         'text',
    image:        'image',
    video:        'video',
    audio:        'audio',
    document:     'document',
    sticker:      'sticker',
    contact:      'contact',
    location:     'location',
    reaction:     'reaction',
    buttonReply:  'buttonReply',
    listReply:    'listReply'
  },

  CHAT_TYPE: {
    private: 'private',
    group:   'group',
    status:  'status',
    channel: 'channel',
    bot:     'bot'
  },

  LOG_LEVEL: {
    info:  'info',
    warn:  'warn',
    error: 'error',
    debug: 'debug'
  },

  PROCESS: {
    pairBot:        'pair-bot',
    website:        'website',
    admin:          'admin',
    sessionManager: 'session-manager'
  },

  PORT: {
    website:        config.ports.website,
    sessionManager: config.ports.sessionManager,
    admin:          config.ports.admin
  },

  TIME: {
    second: 1000,
    minute: 60 * 1000,
    hour:   60 * 60 * 1000,
    day:    24 * 60 * 60 * 1000
  },

  PAIRING: {
    codeLength:       8,
    expirySeconds:    60,
    refreshSeconds:   config.sessions.codeRefreshIntervalSec,
    cooldownSeconds:  config.sessions.pairingCooldownSeconds
  },

  API: {
    internalHeader: 'x-internal-key',
    healthPath:     '/health',
    pairPath:       '/pair',
    refreshPath:    '/refresh',
    sessionPath:    '/session'
  },

  HTTP: {
    ok:                  200,
    created:             201,
    badRequest:          400,
    unauthorized:        401,
    forbidden:           403,
    notFound:            404,
    tooManyRequests:     429,
    internalServerError: 500
  },

  REGEX: {
    phone:     /^\d{10,15}$/,
    url:       /^https?:\/\/.+/i,
    prefix:    /^[!.#$%&+\-/~]$/,
    command:   /^[a-z0-9-]+$/,
    objectId:  /^[a-f0-9]{24}$/,
    sessionId: /^[a-z0-9-]{6,32}$/
  }

};