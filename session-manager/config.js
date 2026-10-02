import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import shared from '../shared/config.js';
import brand from '../shared/brand.js';
import C from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export default {

  ...shared,

  brand,
  C,

  env:    process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  port:   Number(process.env.PORT_SESSION_MANAGER) || 3001,
  host:   process.env.SESSION_MANAGER_HOST || '127.0.0.1',

  internalKey: process.env.INTERNAL_KEY || '',

  mongo: {
    uri: process.env.MONGO_URI || '',
    options: {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS:          45000,
      maxPoolSize:              20,
      minPoolSize:              2
    }
  },

  whatsapp: {
    prefix:         shared.prefixes.whatsappDefault,
    channelJid:     shared.links.whatsappChannelJid,
    autoFollow:     shared.features.autoFollowChannel,

    browserName:    'MINIST4CK',
    browserVersion: brand.BOT_VERSION,
    browserOS:      'Ubuntu',

    markOnlineOnConnect:            true,
    syncFullHistory:                false,
    generateHighQualityLinkPreview: false,

    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs:      60000,
    keepAliveIntervalMs:   30000,
    retryRequestDelayMs:   250
  },

  auth: {
    dir:        process.env.AUTH_DIR || path.join(__dirname, 'auth_state'),
    useMongo:   true,
    collection: 'baileys_auth'
  },

  reconnect: {
    enabled:      shared.features.autoReconnect,
    batchSize:    shared.sessions.reconnectBatchSize,
    batchDelayMs: shared.sessions.reconnectBatchDelayMs,
    maxAttempts:  10,
    baseDelayMs:  2000,
    maxDelayMs:   60000,
    jitterMs:     1500
  },

  api: {
    prefix:      '/api',
    internalKey: process.env.INTERNAL_KEY || '',
    routes: {
      health:   '/health',
      pair:     '/pair',
      refresh:  '/refresh',
      session:  '/session',
      sessions: '/sessions',
      stats:    '/stats'
    }
  },

  paths: {
    root:    path.resolve(__dirname, '..'),
    logs:    path.join(__dirname, '..', 'logs'),
    session: path.join(__dirname, '..', 'sessions'),
    tmp:     path.join(__dirname, '..', 'tmp')
  },

  stats: {
    enabled:       true,
    flushInterval: 60000,
    keepDays:      30
  }

};