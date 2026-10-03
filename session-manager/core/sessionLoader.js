import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { Session, SessionConfig } from '../database/index.js';
import socketManager from './socketManager.js';

const log = logger.child('sessionLoader');

const SKIP_STATES = new Set([
  C.SESSION_STATE.banned,
  C.SESSION_STATE.loggedOut,
  C.SESSION_STATE.broken
]);

let loaded = false;

async function loadAll({ autoReconnect = true } = {}) {
  if (loaded) {
    log.debug('Sessions already loaded — skipping');
    return { total: 0, skipped: true };
  }

  const sessions = await Session.findAllActive();

  if (!sessions.length) {
    log.info('No sessions in DB to load');
    loaded = true;
    return { total: 0, reconnectable: 0, skipped: 0 };
  }

  const reconnectable = [];
  const skipped = [];

  for (const session of sessions) {
    if (SKIP_STATES.has(session.status)) {
      skipped.push({ sessionId: session.sessionId, reason: session.status });
      continue;
    }

    if (!session.phoneNumber) {
      skipped.push({ sessionId: session.sessionId, reason: 'missing-phone' });
      continue;
    }

    reconnectable.push(session.sessionId);
  }

  log.info(`Loaded ${sessions.length} sessions — ${reconnectable.length} reconnectable, ${skipped.length} skipped`);

  loaded = true;

  if (autoReconnect && reconnectable.length) {
    try {
      await socketManager.reconnectAll();
    } catch (err) {
      log.error('Bulk reconnect failed:', err.message);
    }
  }

  return {
    total:         sessions.length,
    reconnectable: reconnectable.length,
    skipped:       skipped.length,
    details:       skipped
  };
}

function isLoaded() {
  return loaded;
}

function reset() {
  loaded = false;
}

async function refreshSession(sessionId) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return null;

  if (SKIP_STATES.has(session.status)) {
    log.warn(`Cannot refresh ${sessionId} — terminal state: ${session.status}`);
    return null;
  }

  try {
    const sock = await socketManager.reconnectSession(sessionId);
    return sock ? session : null;
  } catch (err) {
    log.error(`Refresh failed for ${sessionId}:`, err.message);
    return null;
  }
}

async function getPendingSessions() {
  return Session.find({
    status:    C.SESSION_STATE.pairing,
    deletedAt: null
  }).sort({ createdAt: -1 });
}

async function getReconnectableSessions() {
  return Session.find({
    status:    { $nin: Array.from(SKIP_STATES) },
    deletedAt: null
  }).sort({ lastSeen: -1 });
}

async function getBannedSessions() {
  return Session.find({
    status:    C.SESSION_STATE.banned,
    deletedAt: null
  }).sort({ bannedAt: -1 });
}

async function getBrokenSessions() {
  return Session.find({
    status:    C.SESSION_STATE.broken,
    deletedAt: null
  }).sort({ lastSeen: -1 });
}

async function countByStatus() {
  const result = await Session.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const counts = {};
  for (const state of Object.values(C.SESSION_STATE)) {
    counts[state] = 0;
  }
  for (const row of result) {
    counts[row._id] = row.count;
  }

  return counts;
}

async function countBySource() {
  const result = await Session.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$source', count: { $sum: 1 } } }
  ]);

  const counts = {};
  for (const row of result) {
    counts[row._id] = row.count;
  }

  return counts;
}

async function cleanupDeleted() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await Session.deleteMany({
      deletedAt: { $lte: cutoff }
    });

    if (result.deletedCount) {
      log.info(`Cleaned up ${result.deletedCount} soft-deleted sessions`);
    }

    return result.deletedCount || 0;
  } catch (err) {
    log.error('Cleanup failed:', err.message);
    return 0;
  }
}

async function ensureConfig(sessionId, phoneNumber) {
  try {
    return await SessionConfig.getOrCreate(sessionId, phoneNumber);
  } catch (err) {
    log.error(`Config ensure failed for ${sessionId}:`, err.message);
    return null;
  }
}

async function getSessionsForAccount(accountId) {
  return Session.find({ accountId, deletedAt: null }).sort({ createdAt: -1 });
}

async function getSessionSummary(sessionId) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return null;

  const cfg = await SessionConfig.findBySessionId(sessionId);

  return {
    sessionId:      session.sessionId,
    userName:       session.userName,
    phoneNumber:    session.phoneNumber,
    label:          session.label,
    source:         session.source,
    status:         session.status,
    statusReason:   session.statusReason,
    premium:        session.isPremiumActive,
    premiumUntil:   session.premiumUntil,
    followedChannel: session.followedChannel,
    welcomeSent:    session.welcomeSent,
    pairedAt:       session.pairedAt,
    lastSeen:       session.lastSeen,
    lastSeenReason: session.lastSeenReason,
    totalCommands:  session.totalCommands,
    reconnectCount: session.reconnectCount,
    isActive:       socketManager.isActive(sessionId),
    prefix:         cfg?.prefix || config.prefixes.whatsappDefault
  };
}

export {
  loadAll,
  isLoaded,
  reset,
  refreshSession,
  getPendingSessions,
  getReconnectableSessions,
  getBannedSessions,
  getBrokenSessions,
  countByStatus,
  countBySource,
  cleanupDeleted,
  ensureConfig,
  getSessionsForAccount,
  getSessionSummary,
  SKIP_STATES
};

export default {
  loadAll,
  isLoaded,
  reset,
  refreshSession,
  getPendingSessions,
  getReconnectableSessions,
  getBannedSessions,
  getBrokenSessions,
  countByStatus,
  countBySource,
  cleanupDeleted,
  ensureConfig,
  getSessionsForAccount,
  getSessionSummary
};