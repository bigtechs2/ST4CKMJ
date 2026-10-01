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

  SESSION_STATUS_LABEL: {
    connected:    '● Connected',
    connecting:   '◐ Connecting',
    disconnected: '○ Offline',
    loggedOut:    '○ Logged out',
    banned:       '✗ Banned',
    broken:       '⚠ Broken',
    pairing:      '⟡ Pairing'
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

  TIER: {
    superOwner:   'superOwner',
    sessionOwner: 'sessionOwner',
    premiumUser:  'premiumUser',
    freeUser:     'freeUser'
  },

  TIER_LABEL: {
    superOwner:   'Super Owner',
    sessionOwner: 'Session Owner',
    premiumUser:  'Premium',
    freeUser:     'Free'
  },

  PERMISSION: {
    owner:   'owner',
    admin:   'admin',
    premium: 'premium',
    group:   'group',
    private: 'private',
    coin:    'coin'
  },

  PLAN: {
    free:    'free',
    premium: 'premium'
  },

  ACCOUNT_TYPE: {
    website:  'website',
    telegram: 'telegram',
    linked:   'linked'
  },

  AUTH_STATE: {
    signedOut: 'signedOut',
    signedIn:  'signedIn',
    expired:   'expired'
  },

  PASSWORD_STRENGTH: {
    weak:   'weak',
    medium: 'medium',
    strong: 'strong'
  },

  PAYMENT_STATE: {
    pending:    'pending',
    processing: 'processing',
    completed:  'completed',
    failed:     'failed',
    cancelled:  'cancelled',
    expired:    'expired'
  },

  PAYMENT_PROVIDER: {
    sonicpesa: 'sonicpesa',
    telegram:  'telegram',
    manual:    'manual'
  },

  PAYMENT_METHOD: {
    ussd:   'ussd',
    manual: 'manual',
    bot:    'bot'
  },

  PAYMENT_STATE_LABEL: {
    pending:    '⏳ Pending',
    processing: '◐ Processing',
    completed:  '✓ Completed',
    failed:     '✗ Failed',
    cancelled:  '⟡ Cancelled',
    expired:    '⏱ Expired'
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
    'premium',
    'profile',
    'search',
    'tools'
  ],

  MESSAGE_TYPE: {
    text:        'text',
    image:       'image',
    video:       'video',
    audio:       'audio',
    document:    'document',
    sticker:     'sticker',
    contact:     'contact',
    location:    'location',
    reaction:    'reaction',
    buttonReply: 'buttonReply',
    listReply:   'listReply'
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
    codeLength:      8,
    expirySeconds:   60,
    refreshSeconds:  config.sessions.codeRefreshIntervalSec,
    cooldownSeconds: config.sessions.pairingCooldownSeconds,
    userTimeoutMin:  config.payment.timeoutMinutes
  },

  API: {
    internalHeader: 'x-internal-key',
    healthPath:     '/health',
    pairPath:       '/pair',
    refreshPath:    '/refresh',
    sessionPath:    '/session',
    webhookPath:    config.payment.providers.sonicpesa.webhookPath
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
    sessionId: /^[a-z0-9-]{6,32}$/,
    username:  /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/,
    label:     /^[\w\s-]{1,20}$/,
    orderId:   /^[a-zA-Z0-9_-]{6,64}$/
  },

  BUTTON_ID: {
    copyCode:      'btn_copy_code',
    getNewCode:    'btn_new_code',
    verifyJoin:    'btn_verify_join',
    joinChannel:   'btn_join_channel',
    joinGroup:     'btn_join_group',
    pairWhatsapp:  'btn_pair_wa',
    mySessions:    'btn_my_sessions',
    premium:       'btn_premium',
    help:          'btn_help',
    addNumber:     'btn_add_number',
    viewChannel:   'btn_view_channel',
    payUssd:       'btn_pay_ussd',
    payTelegram:   'btn_pay_tg',
    contactOwner:  'btn_contact_owner',
    cancelPayment: 'btn_cancel_payment'
  },

  CALLBACK_ACTION: {
    pair:          'pair',
    delpair:       'delpair',
    refresh:       'refresh',
    sessions:      'sessions',
    premium:       'premium',
    pay:           'pay',
    cancel:        'cancel',
    verifyJoin:    'verify_join',
    addNumber:     'add_number',
    killSession:   'kill_session'
  },

  EVENTS: {
    pairCreated:    'pair.created',
    pairSuccess:    'pair.success',
    pairFailed:     'pair.failed',
    sessionOpened:  'session.opened',
    sessionClosed:  'session.closed',
    paymentCreated: 'payment.created',
    paymentSuccess: 'payment.success',
    paymentFailed:  'payment.failed',
    premiumGranted: 'premium.granted',
    premiumRevoked: 'premium.revoked',
    commandRun:     'command.run'
  }

};