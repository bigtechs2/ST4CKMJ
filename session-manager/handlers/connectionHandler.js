import { DisconnectReason } from '@whiskeysockets/baileys';

import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { Session } from '../database/index.js';
import socketManager from '../core/socketManager.js';
import pairingFlow from '../core/pairingFlow.js';
import autoFollow from '../core/autoFollow.js';

const log = logger.child('connection');

const TERMINAL_CODES = new Set([
  DisconnectReason.loggedOut,
  DisconnectReason.forbidden,
  402,
  DisconnectReason.badSession,
  DisconnectReason.multideviceMismatch
]);

const SOFT_CODES = new Set([
  DisconnectReason.connectionLost,
  DisconnectReason.connectionClosed,
  DisconnectReason.connectionReplaced,
  DisconnectReason.restartRequired,
  DisconnectReason.timedOut
]);

function getStatusCode(lastDisconnect) {
  try {
    return lastDisconnect?.error?.output?.statusCode || null;
  } catch {
    return null;
  }
}

function getReasonText(lastDisconnect) {
  try {
    return lastDisconnect?.error?.message || 'unknown';
  } catch {
    return 'unknown';
  }
}

function randomJitter(base, jitter) {
  return base + Math.floor(Math.random() * jitter);
}

async function handleTerminal(sessionId, code, reason) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return;

  log.warn(`Terminal disconnect for ${sessionId} — code ${code} (${reason})`);

  try {
    if (code === 401) {
      await session.markLoggedOut();
    } else if (code === 402) {
      await session.markBanned('WhatsApp temporary ban', null);
    } else if (code === 403) {
      await session.markBanned('WhatsApp permanent ban');
    } else {
      await session.markBanned(`Terminal: ${reason}`);
    }
  } catch (err) {
    log.error(`Failed to mark terminal for ${sessionId}:`, err.message);
  }

  try {
    await socketManager.closeSession(sessionId, `terminal-${code}`);
  } catch (err) {
    log.error(`Close failed for ${sessionId}:`, err.message);
  }

  log.event('session.terminal', {
    sessionId,
    code,
    phone: session.phoneNumber
  });
}

async function handleSoftDisconnect(sessionId, code, reason) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return;

  log.warn(`Soft disconnect for ${sessionId} — code ${code} (${reason})`);

  try {
    await session.markDisconnected(code, reason);
  } catch (err) {
    log.error(`Mark disconnect failed for ${sessionId}:`, err.message);
  }

  if (!config.reconnect.enabled) {
    log.info(`Reconnect disabled — skipping ${sessionId}`);
    return;
  }

  const attempts = (session.reconnectAttempts || 0) + 1;

  if (attempts > config.reconnect.maxAttempts) {
    log.warn(`Max reconnect attempts reached for ${sessionId} — marking broken`);

    try {
      await session.markBroken('Max reconnect attempts exceeded');
      await socketManager.closeSession(sessionId, 'max-attempts');
    } catch {}

    return;
  }

  const delay = Math.min(
    config.reconnect.baseDelayMs * Math.pow(2, attempts - 1),
    config.reconnect.maxDelayMs
  );

  const jittered = randomJitter(delay, config.reconnect.jitterMs);

  log.info(`Reconnecting ${sessionId} in ${jittered}ms (attempt ${attempts})`);

  setTimeout(async () => {
    try {
      await socketManager.reconnectSession(sessionId);
    } catch (err) {
      log.error(`Reconnect attempt failed for ${sessionId}:`, err.message);
    }
  }, jittered);
}

async function handleConnectionOpen(sock, sessionId) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return;

  log.ready(`Session ${sessionId} connected (${session.phoneNumber})`);

  try {
    await session.markConnected('connected');
  } catch (err) {
    log.error(`markConnected failed for ${sessionId}:`, err.message);
  }

  const meta = sock.__minist4ck || {};

  if (meta.isPairing) {
    await pairingFlow.onRegistered(sessionId);
  }

  if (config.features.autoFollowChannel) {
    try {
      await autoFollow.ensureFollow(sessionId);
    } catch (err) {
      log.warn(`Auto-follow failed for ${sessionId}: ${err.message}`);
    }
  }
}

function attachConnectionHandler(sock, sessionId) {
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log.debug(`QR event for ${sessionId} — ignored (using pairing code)`);
    }

    if (connection === 'open') {
      await handleConnectionOpen(sock, sessionId);
      return;
    }

    if (connection === 'connecting') {
      log.debug(`Connecting ${sessionId}...`);
      return;
    }

    if (connection === 'close') {
      const code = getStatusCode(lastDisconnect);
      const reason = getReasonText(lastDisconnect);

      log.debug(`Close event for ${sessionId} — code ${code}`);

      if (code === null) {
        log.warn(`Unknown close code for ${sessionId} — treating as soft`);

        try {
          await Session.updateOne(
            { sessionId },
            {
              $set: {
                status:         C.SESSION_STATE.disconnected,
                lastSeenReason: 'disconnected'
              }
            }
          );
        } catch {}

        return;
      }

      if (TERMINAL_CODES.has(code)) {
        await handleTerminal(sessionId, code, reason);
        return;
      }

      if (SOFT_CODES.has(code)) {
        await handleSoftDisconnect(sessionId, code, reason);
        return;
      }

      log.warn(`Unhandled code ${code} for ${sessionId} — treating as soft`);
      await handleSoftDisconnect(sessionId, code, reason);
    }
  });

  sock.ev.on('creds.update', () => {
    log.debug(`Creds updated for ${sessionId}`);
  });

  log.debug(`Connection handler attached to ${sessionId}`);
}

export {
  attachConnectionHandler,
  handleConnectionOpen,
  handleTerminal,
  handleSoftDisconnect,
  TERMINAL_CODES,
  SOFT_CODES
};

export default {
  attachConnectionHandler,
  handleConnectionOpen,
  handleTerminal,
  handleSoftDisconnect
};