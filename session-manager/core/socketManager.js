import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} from '@whiskeysockets/baileys';

import NodeCache from 'node-cache';
import crypto from 'crypto';

import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { useMongoAuthState, deleteAuthState, hasAuthState } from '../auth/mongoAuthState.js';
import { Session, SessionConfig } from '../database/index.js';

import { attachMessageHandler } from '../handlers/messageHandler.js';
import { attachStatusHandler } from '../handlers/statusHandler.js';
import { attachReactionHandler } from '../handlers/reactionHandler.js';
import { attachConnectionHandler } from '../handlers/connectionHandler.js';
import { attachChatbotHandler } from '../handlers/chatbotHandler.js';

const log = logger.child('socketManager');

const activeSockets = new Map();
const pairingSessions = new Map();
const groupCache = new NodeCache({ stdTTL: 300, useClones: false });

const TERMINAL_CODES = new Set([
  DisconnectReason.loggedOut,
  DisconnectReason.forbidden,
  402,
  DisconnectReason.badSession,
  DisconnectReason.multideviceMismatch
]);

const RETRY_CODES = new Set([
  DisconnectReason.connectionLost,
  DisconnectReason.connectionClosed,
  DisconnectReason.connectionReplaced,
  DisconnectReason.restartRequired,
  DisconnectReason.timedOut
]);

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

async function getVersion() {
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    log.info(`Baileys v${version.join('.')} (latest: ${isLatest})`);
    return version;
  } catch {
    return [2, 3000, 1015901307];
  }
}

function buildSocketOptions(sessionId, version, authState) {
  return {
    version,
    logger: logger.child(`baileys:${sessionId.slice(0, 6)}`),
    printQRInTerminal: false,
    browser: Browsers.macOS(config.whatsapp.browserName),
    auth: {
      creds: authState.state.creds,
      keys:  makeCacheableSignalKeyStore(authState.state.keys, logger)
    },
    generateHighQualityLinkPreview: config.whatsapp.generateHighQualityLinkPreview,
    syncFullHistory:              config.whatsapp.syncFullHistory,
    markOnlineOnConnect:          config.whatsapp.markOnlineOnConnect,
    defaultQueryTimeoutMs:        config.whatsapp.defaultQueryTimeoutMs,
    connectTimeoutMs:             config.whatsapp.connectTimeoutMs,
    keepAliveIntervalMs:          config.whatsapp.keepAliveIntervalMs,
    retryRequestDelayMs:          config.whatsapp.retryRequestDelayMs,
    getMessage: async (key) => {
      return { conversation: '' };
    },
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    shouldIgnoreJid: (jid) => {
      if (!jid) return false;
      if (jid === 'status@broadcast') return false;
      if (jid.endsWith('@broadcast')) return true;
      return false;
    }
  };
}

async function attachHandlers(sock, sessionId) {
  attachConnectionHandler(sock, sessionId);
  attachMessageHandler(sock, sessionId);
  attachStatusHandler(sock, sessionId);
  attachReactionHandler(sock, sessionId);
  attachChatbotHandler(sock, sessionId);
}

async function startSession({
  sessionId,
  phoneNumber,
  userName = '',
  source = C.SOURCE.website,
  isPairing = false,
  accountId = null,
  label = ''
}) {
  const existing = activeSockets.get(sessionId);
  if (existing) {
    log.warn(`Socket already exists for ${sessionId} — returning existing`);
    return existing;
  }

  const authState = await useMongoAuthState(sessionId);
  const version = await getVersion();

  const sock = makeWASocket(buildSocketOptions(sessionId, version, authState));
  sock.ev.on('creds.update', authState.saveCreds);

  sock.__minist4ck = {
    sessionId,
    phoneNumber,
    userName,
    source,
    isPairing,
    accountId,
    label,
    createdAt: new Date(),
    reconnectAttempts: 0
  };

  activeSockets.set(sessionId, sock);

  await attachHandlers(sock, sessionId);

  if (isPairing && phoneNumber && !sock.authState.creds.registered) {
    await requestPairingCode(sock, sessionId, phoneNumber);
  }

  return sock;
}

async function requestPairingCode(sock, sessionId, phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');

  if (!clean || clean.length < 10 || clean.length > 15) {
    throw new Error('Invalid phone number format');
  }

  if (sock.authState.creds.registered) {
    throw new Error('Session already registered — cannot request new code');
  }

  try {
    const code = await sock.requestPairingCode(clean);

    log.event('pairing.code.issued', {
      sessionId,
      phone: clean,
      code:  code.slice(0, 4) + '-****'
    });

    return code;
  } catch (err) {
    log.error(`requestPairingCode failed for ${sessionId}:`, err.message);
    throw err;
  }
}

async function createPairing({
  phoneNumber,
  userName = '',
  source = C.SOURCE.website,
  accountId = null,
  label = ''
}) {
  const clean = String(phoneNumber).replace(/\D/g, '');

  if (!C.REGEX.phone.test(clean)) {
    throw new Error('Invalid phone number');
  }

  const existing = await Session.findByPhone(clean);

  if (existing && existing.status === C.SESSION_STATE.connected) {
    throw new Error('ALREADY_PAIRED');
  }

  if (existing && existing.status === C.SESSION_STATE.pairing) {
    const pairSocket = pairingSessions.get(existing.sessionId);
    if (pairSocket) {
      const code = await requestPairingCode(pairSocket, existing.sessionId, clean);
      return { sessionId: existing.sessionId, code, isNew: false };
    }
  }

  const sessionId = existing?.sessionId || generateSessionId();

  if (!existing) {
    await Session.create({
      sessionId,
      accountId,
      userName: userName || 'User',
      phoneNumber: clean,
      label,
      source,
      status: C.SESSION_STATE.pairing
    });
  } else {
    existing.status      = C.SESSION_STATE.pairing;
    existing.userName    = userName || existing.userName;
    existing.accountId   = accountId || existing.accountId;
    existing.source      = source;
    existing.label       = label || existing.label;
    existing.deletedAt   = null;
    await existing.save();
  }

  const sock = await startSession({
    sessionId,
    phoneNumber: clean,
    userName,
    source,
    isPairing: true,
    accountId,
    label
  });

  const code = await requestPairingCode(sock, sessionId, clean);

  pairingSessions.set(sessionId, sock);

  return { sessionId, code, isNew: !existing };
}

async function refreshCode(sessionId) {
  const sock = pairingSessions.get(sessionId) || activeSockets.get(sessionId);

  if (!sock) throw new Error('SESSION_NOT_FOUND');
  if (sock.authState.creds.registered) throw new Error('ALREADY_REGISTERED');

  const meta = sock.__minist4ck;
  if (!meta || !meta.phoneNumber) throw new Error('MISSING_PHONE');

  return await requestPairingCode(sock, sessionId, meta.phoneNumber);
}

async function closeSession(sessionId, reason = '') {
  const sock = activeSockets.get(sessionId);

  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch (err) {
      log.warn(`Failed to close socket ${sessionId}:`, err.message);
    }
    activeSockets.delete(sessionId);
    pairingSessions.delete(sessionId);
    log.info(`Socket closed for ${sessionId} — ${reason || 'no reason'}`);
  }

  groupCache.flushAll();
}

async function deleteSession(sessionId, { wipeAuth = true, soft = false } = {}) {
  await closeSession(sessionId, 'delete');

  if (wipeAuth) {
    await deleteAuthState(sessionId);
  }

  try {
    if (soft) {
      await Session.softDelete(sessionId);
    } else {
      await Session.deleteOne({ sessionId });
      await SessionConfig.deleteOne({ sessionId });
    }
    log.info(`Session ${sessionId} deleted from DB`);
  } catch (err) {
    log.error(`Failed to delete session ${sessionId}:`, err.message);
  }
}

function getSocket(sessionId) {
  return activeSockets.get(sessionId) || pairingSessions.get(sessionId) || null;
}

function isActive(sessionId) {
  return activeSockets.has(sessionId);
}

function activeCount() {
  return activeSockets.size;
}

function pairingCount() {
  return pairingSessions.size;
}

function listActive() {
  return Array.from(activeSockets.entries()).map(([sessionId, sock]) => ({
    sessionId,
    meta:      sock.__minist4ck || {},
    connected: sock.ws?.readyState === 1
  }));
}

async function reconnectSession(sessionId) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) {
    log.warn(`Cannot reconnect ${sessionId} — not in DB`);
    return null;
  }

  if (TERMINAL_CODES.has(session.lastDisconnectCode)) {
    log.warn(`Skipping reconnect for ${sessionId} — terminal code`);
    return null;
  }

  if (activeSockets.has(sessionId)) {
    log.debug(`Already connected: ${sessionId}`);
    return activeSockets.get(sessionId);
  }

  const hasAuth = await hasAuthState(sessionId);

  if (!hasAuth) {
    log.warn(`No auth state for ${sessionId} — marking broken`);
    await session.markBroken('Missing auth state');
    return null;
  }

  try {
    await session.markReconnecting();

    const sock = await startSession({
      sessionId,
      phoneNumber: session.phoneNumber,
      userName:    session.userName,
      source:      session.source,
      isPairing:   false,
      accountId:   session.accountId,
      label:       session.label
    });

    return sock;
  } catch (err) {
    log.error(`Reconnect failed for ${sessionId}:`, err.message);
    await session.markDisconnected(500, 'Reconnect failed');
    return null;
  }
}

async function reconnectAll() {
  const sessions = await Session.findAllActive();

  if (!sessions.length) {
    log.info('No sessions to reconnect');
    return { total: 0, success: 0, failed: 0 };
  }

  const shuffled = sessions.sort(() => Math.random() - 0.5);

  log.info(`Reconnecting ${shuffled.length} sessions in batches of ${config.reconnect.batchSize}`);

  let success = 0;
  let failed  = 0;

  const { batchSize, batchDelayMs } = config.reconnect;

  for (let i = 0; i < shuffled.length; i += batchSize) {
    const batch = shuffled.slice(i, i + batchSize);

    await Promise.all(batch.map(async (session) => {
      try {
        const sock = await reconnectSession(session.sessionId);
        if (sock) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }));

    if (i + batchSize < shuffled.length) {
      const [min, max] = batchDelayMs;
      const delay = randomDelay(min, max);
      log.info(`Batch delay: ${delay}ms`);
      await sleep(delay);
    }
  }

  log.ready(`Reconnect complete — ${success} success, ${failed} failed`);
  return { total: shuffled.length, success, failed };
}

async function pairingLoop() {
  if (!config.whatsapp.autoFollow) return;

  const interval = setInterval(async () => {
    const now = Date.now();

    for (const [sessionId, sock] of pairingSessions.entries()) {
      if (now - sock.__minist4ck.createdAt.getTime() > 5 * 60 * 1000) {
        pairingSessions.delete(sessionId);
        await closeSession(sessionId, 'pairing-timeout');
      }
    }
  }, 60 * 1000);

  return interval;
}

export {
  createPairing,
  refreshCode,
  startSession,
  closeSession,
  deleteSession,
  reconnectSession,
  reconnectAll,
  pairingLoop,
  requestPairingCode,
  getSocket,
  isActive,
  activeCount,
  pairingCount,
  listActive,
  generateSessionId,
  attachHandlers,
  TERMINAL_CODES,
  RETRY_CODES
};

export default {
  createPairing,
  refreshCode,
  startSession,
  closeSession,
  deleteSession,
  reconnectSession,
  reconnectAll,
  pairingLoop,
  requestPairingCode,
  getSocket,
  isActive,
  activeCount,
  pairingCount,
  listActive,
  generateSessionId,
  attachHandlers
};