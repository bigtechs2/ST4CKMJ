import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { Session, SessionConfig } from '../database/index.js';
import socketManager from './socketManager.js';

const log = logger.child('pairingFlow');

const REFRESH_MS      = config.sessions.codeRefreshIntervalSec * 1000;
const TIMEOUT_MS      = config.payment.timeoutMinutes * 60 * 1000;
const COOLDOWN_MS     = config.sessions.pairingCooldownSeconds * 1000;

const activePairings = new Map();
const cooldowns      = new Map();

function isOnCooldown(phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');
  const until = cooldowns.get(clean);

  if (!until) return { onCooldown: false };

  const now = Date.now();

  if (now >= until) {
    cooldowns.delete(clean);
    return { onCooldown: false };
  }

  return {
    onCooldown: true,
    seconds:    Math.ceil((until - now) / 1000)
  };
}

function startCooldown(phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');
  cooldowns.set(clean, Date.now() + COOLDOWN_MS);
}

function clearCooldown(phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');
  cooldowns.delete(clean);
}

async function begin({
  phoneNumber,
  userName    = '',
  source      = C.SOURCE.website,
  accountId   = null,
  label       = '',
  skipCooldown = false
}) {
  const clean = String(phoneNumber).replace(/\D/g, '');

  if (!C.REGEX.phone.test(clean)) {
    throw new Error('INVALID_NUMBER');
  }

  if (!skipCooldown) {
    const cd = isOnCooldown(clean);
    if (cd.onCooldown) {
      const err = new Error('COOLDOWN');
      err.seconds = cd.seconds;
      throw err;
    }
  }

  const existing = await Session.findByPhone(clean);

  if (existing && existing.status === C.SESSION_STATE.connected) {
    throw new Error('ALREADY_PAIRED');
  }

  const { sessionId, code, isNew } = await socketManager.createPairing({
    phoneNumber: clean,
    userName,
    source,
    accountId,
    label
  });

  const flow = {
    sessionId,
    phoneNumber: clean,
    userName,
    source,
    accountId,
    label,
    isNew,
    code,
    createdAt:   Date.now(),
    expiresAt:   Date.now() + TIMEOUT_MS,
    refreshTimer: null,
    timeoutTimer: null,
    refreshCount: 0,
    status:      'active'
  };

  startTimers(flow);
  activePairings.set(sessionId, flow);

  startCooldown(clean);

  log.event('pairing.begin', {
    sessionId,
    phone: clean,
    source,
    isNew
  });

  return {
    sessionId,
    code,
    isNew,
    expiresIn:    Math.floor(TIMEOUT_MS / 1000),
    refreshEvery: Math.floor(REFRESH_MS / 1000)
  };
}

function startTimers(flow) {
  flow.refreshTimer = setInterval(async () => {
    await doRefresh(flow);
  }, REFRESH_MS);

  flow.timeoutTimer = setTimeout(async () => {
    await doTimeout(flow);
  }, TIMEOUT_MS);
}

async function doRefresh(flow) {
  if (flow.status !== 'active') return;

  try {
    const sock = socketManager.getSocket(flow.sessionId);

    if (!sock) {
      log.warn(`Refresh skipped — no socket for ${flow.sessionId}`);
      return;
    }

    if (sock.authState?.creds?.registered) {
      log.info(`Session ${flow.sessionId} registered — stopping refresh`);
      await finalize(flow, 'registered');
      return;
    }

    const newCode = await socketManager.refreshCode(flow.sessionId);

    flow.code = newCode;
    flow.refreshCount += 1;

    log.debug(`Refreshed code for ${flow.sessionId} (#${flow.refreshCount})`);
  } catch (err) {
    if (err.message.includes('ALREADY_REGISTERED')) {
      await finalize(flow, 'registered');
      return;
    }

    log.warn(`Refresh failed for ${flow.sessionId}: ${err.message}`);
  }
}

async function doTimeout(flow) {
  if (flow.status !== 'active') return;

  log.info(`Pairing timeout for ${flow.sessionId}`);

  flow.status = 'timeout';

  try {
    await socketManager.closeSession(flow.sessionId, 'pairing-timeout');

    await Session.updateOne(
      { sessionId: flow.sessionId },
      {
        $set: {
          status:         C.SESSION_STATE.broken,
          statusReason:   'Pairing code expired',
          lastSeenReason: 'disconnected'
        }
      }
    );
  } catch (err) {
    log.error(`Timeout cleanup failed for ${flow.sessionId}:`, err.message);
  }

  activePairings.delete(flow.sessionId);
}

async function finalize(flow, reason = 'registered') {
  if (flow.refreshTimer) clearInterval(flow.refreshTimer);
  if (flow.timeoutTimer) clearTimeout(flow.timeoutTimer);

  flow.status = reason;

  activePairings.delete(flow.sessionId);

  log.event('pairing.finalize', {
    sessionId: flow.sessionId,
    reason
  });
}

async function cancel(sessionId, reason = 'user-cancelled') {
  const flow = activePairings.get(sessionId);

  if (!flow) {
    return { ok: false, reason: 'not-found' };
  }

  if (flow.refreshTimer) clearInterval(flow.refreshTimer);
  if (flow.timeoutTimer) clearTimeout(flow.timeoutTimer);

  flow.status = 'cancelled';

  try {
    await socketManager.closeSession(sessionId, reason);

    await Session.updateOne(
      { sessionId },
      {
        $set: {
          status:         C.SESSION_STATE.broken,
          statusReason:   'Cancelled by user',
          lastSeenReason: 'disconnected'
        }
      }
    );
  } catch (err) {
    log.error(`Cancel cleanup failed for ${sessionId}:`, err.message);
  }

  activePairings.delete(sessionId);

  log.event('pairing.cancel', { sessionId, reason });

  return { ok: true, sessionId };
}

async function cancelAllForPhone(phoneNumber) {
  const clean = String(phoneNumber).replace(/\D/g, '');
  let count = 0;

  for (const [sessionId, flow] of activePairings.entries()) {
    if (flow.phoneNumber === clean) {
      await cancel(sessionId, 'superseded');
      count += 1;
    }
  }

  return count;
}

async function forceRefresh(sessionId) {
  const flow = activePairings.get(sessionId);

  if (!flow) throw new Error('NO_ACTIVE_PAIRING');
  if (flow.status !== 'active') throw new Error('PAIRING_NOT_ACTIVE');

  const newCode = await socketManager.refreshCode(sessionId);

  flow.code = newCode;
  flow.refreshCount += 1;

  return {
    code:         newCode,
    expiresIn:    Math.floor((flow.expiresAt - Date.now()) / 1000),
    refreshCount: flow.refreshCount
  };
}

function getFlow(sessionId) {
  const flow = activePairings.get(sessionId);
  if (!flow) return null;

  return {
    sessionId:    flow.sessionId,
    phoneNumber:  flow.phoneNumber,
    userName:     flow.userName,
    code:         flow.code,
    status:       flow.status,
    isNew:        flow.isNew,
    refreshCount: flow.refreshCount,
    createdAt:    flow.createdAt,
    expiresAt:    flow.expiresAt,
    expiresIn:    Math.max(0, Math.floor((flow.expiresAt - Date.now()) / 1000))
  };
}

function isActive(sessionId) {
  const flow = activePairings.get(sessionId);
  return !!(flow && flow.status === 'active');
}

function countActive() {
  let count = 0;
  for (const flow of activePairings.values()) {
    if (flow.status === 'active') count += 1;
  }
  return count;
}

function listActive() {
  const result = [];

  for (const flow of activePairings.values()) {
    if (flow.status !== 'active') continue;

    result.push({
      sessionId:   flow.sessionId,
      phoneNumber: flow.phoneNumber,
      userName:    flow.userName,
      isNew:       flow.isNew,
      createdAt:   flow.createdAt,
      expiresAt:   flow.expiresAt,
      expiresIn:   Math.max(0, Math.floor((flow.expiresAt - Date.now()) / 1000))
    });
  }

  return result;
}

async function onRegistered(sessionId) {
  const flow = activePairings.get(sessionId);

  if (flow) {
    await finalize(flow, 'registered');

    const clean = flow.phoneNumber;
    clearCooldown(clean);

    try {
      await SessionConfig.getOrCreate(sessionId, clean);
    } catch (err) {
      log.error(`Config init failed for ${sessionId}:`, err.message);
    }

    log.event('pairing.success', {
      sessionId,
      phone:  clean,
      source: flow.source
    });
  }
}

function cleanup() {
  for (const flow of activePairings.values()) {
    if (flow.refreshTimer) clearInterval(flow.refreshTimer);
    if (flow.timeoutTimer) clearTimeout(flow.timeoutTimer);
  }

  activePairings.clear();
  cooldowns.clear();

  log.info('Pairing flow cleanup complete');
}

export {
  begin,
  cancel,
  cancelAllForPhone,
  forceRefresh,
  getFlow,
  isActive,
  countActive,
  listActive,
  onRegistered,
  isOnCooldown,
  startCooldown,
  clearCooldown,
  cleanup,
  REFRESH_MS,
  TIMEOUT_MS,
  COOLDOWN_MS
};

export default {
  begin,
  cancel,
  cancelAllForPhone,
  forceRefresh,
  getFlow,
  isActive,
  countActive,
  listActive,
  onRegistered,
  isOnCooldown,
  startCooldown,
  clearCooldown,
  cleanup
};