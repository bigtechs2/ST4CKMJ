import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { Session, SessionConfig } from '../database/index.js';

const log = logger.child('anticall');

const CALL_COUNT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CALLS         = 3;
const MAX_TRACK         = 5000;

const callCounts = new Map();

function countKey(callerNumber) {
  return `anticall:${callerNumber}`;
}

function getCount(callerNumber) {
  const entry = callCounts.get(countKey(callerNumber));
  if (!entry) return 0;
  if (Date.now() - entry.at > CALL_COUNT_TTL_MS) {
    callCounts.delete(countKey(callerNumber));
    return 0;
  }
  return entry.count;
}

function addCount(callerNumber) {
  const key = countKey(callerNumber);
  const existing = callCounts.get(key);

  const count = (existing && Date.now() - existing.at < CALL_COUNT_TTL_MS)
    ? existing.count + 1
    : 1;

  callCounts.set(key, { count, at: Date.now() });

  if (callCounts.size > MAX_TRACK) {
    const first = callCounts.keys().next().value;
    callCounts.delete(first);
  }

  return count;
}

function clearCount(callerNumber) {
  callCounts.delete(countKey(callerNumber));
}

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isSuperOwner(number) {
  const clean = String(number || '').replace(/\D/g, '');
  if (!clean) return false;

  const main = String(config.owners.whatsapp.id || '').replace(/\D/g, '');
  if (main && clean === main) return true;

  return (config.owners.whatsapp.co || []).some(
    (co) => String(co.id || '').replace(/\D/g, '') === clean
  );
}

async function rejectCall(sock, callId, callerJid) {
  try {
    await sock.rejectCall(callId, callerJid);
    return true;
  } catch (err) {
    log.warn(`rejectCall failed: ${err.message}`);
    return false;
  }
}

async function blockCaller(sock, callerJid) {
  try {
    await sock.updateBlockStatus(callerJid, 'block');
    return true;
  } catch (err) {
    log.warn(`block failed: ${err.message}`);
    return false;
  }
}

async function handleCall(sock, sessionId, callEvent) {
  const { from, id, status } = callEvent;

  if (status !== 'offer') return;

  const callerJid = from;
  if (!callerJid) return;

  const callerNumber = normalizeNumber(callerJid);
  if (!callerNumber) return;

  if (isSuperOwner(callerNumber)) {
    log.debug('ignoring super owner call');
    return;
  }

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.anticallMode || (cfg.anticall ? 'reject' : 'off');
  if (mode === 'off') return;

  const count = addCount(callerNumber);

  log.event('anticall.received', {
    sessionId,
    caller: callerNumber,
    callNumber: count,
    mode
  });

  const rejected = await rejectCall(sock, id, callerJid);

  if (!rejected) {
    log.warn(`could not reject call from ${callerNumber}`);
    return;
  }

  if (count >= MAX_CALLS) {
    const blocked = await blockCaller(sock, callerJid);

    if (blocked) {
      log.event('anticall.blocked', {
        sessionId,
        caller: callerNumber,
        afterCalls: count
      });

      clearCount(callerNumber);
    }
  }
}

function attachAnticallHandler(sock, sessionId) {
  sock.ev.on('call', async (calls) => {
    if (!Array.isArray(calls)) calls = [calls];

    for (const call of calls) {
      try {
        await handleCall(sock, sessionId, call);
      } catch (err) {
        log.error(`anticall crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Anticall handler attached to ${sessionId}`);
}

function cleanup() {
  callCounts.clear();
}

export {
  attachAnticallHandler,
  handleCall,
  getCount,
  clearCount,
  cleanup,
  MAX_CALLS,
  CALL_COUNT_TTL_MS
};

export default {
  attachAnticallHandler,
  handleCall
};