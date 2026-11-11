import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { Session, SessionConfig, GhostRead } from '../database/index.js';

const log = logger.child('antighost');

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_DELAY_HOURS = 24;

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isGroupChat(chatId) {
  return String(chatId || '').endsWith('@g.us');
}

function isStatusOrBroadcast(chatId) {
  if (!chatId) return true;
  if (chatId === 'status@broadcast') return true;
  if (chatId.endsWith('@broadcast')) return true;
  if (chatId.endsWith('@newsletter')) return true;
  return false;
}

async function isGhostModeActive(sessionId) {
  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return false;
  return cfg.antighost === true;
}

async function handleReadUpdate(sock, sessionId, update) {
  const status = update.update?.status;
  if (status !== 4) return;

  const key = update.key;
  if (!key) return;
  if (!key.fromMe) return;

  const chatId = key.remoteJid || '';
  if (isGroupChat(chatId)) return;
  if (isStatusOrBroadcast(chatId)) return;

  const active = await isGhostModeActive(sessionId);
  if (!active) return;

  const recipientNumber = normalizeNumber(chatId);
  if (!recipientNumber) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  const delayHours = cfg.antighostDelayHours || DEFAULT_DELAY_HOURS;

  await GhostRead.recordRead({
    sessionId,
    chatId,
    recipientNumber,
    messageId: key.id,
    delayHours
  });

  log.event('antighost.read', {
    sessionId,
    chatId,
    recipient: recipientNumber,
    messageId: key.id,
    delayHours
  });
}

async function handleIncomingMessage(sock, sessionId, msg) {
  if (!msg?.message) return;
  if (msg.key?.fromMe) return;

  const chatId = msg.key?.remoteJid || '';
  if (!chatId) return;
  if (isGroupChat(chatId)) return;
  if (isStatusOrBroadcast(chatId)) return;

  const active = await isGhostModeActive(sessionId);
  if (!active) return;

  await GhostRead.markReplied(chatId);

  log.debug(`antighost: reply from ${chatId} — cancelled pending`);
}

async function processExpired(sock, sessionId) {
  const active = await isGhostModeActive(sessionId);
  if (!active) return;

  const expired = await GhostRead.findExpired();
  if (!expired.length) return;

  log.info(`antighost: processing ${expired.length} expired reads`);

  for (const record of expired) {
    if (record.sessionId !== sessionId) continue;

    const chatId = record.chatId;
    const recipientNumber = record.recipientNumber;

    try {
      const blocked = await sock.updateBlockStatus(chatId, 'block');

      await GhostRead.markBlocked(record._id);

      log.event('antighost.blocked', {
        sessionId,
        chatId,
        recipient: recipientNumber,
        readAt: record.readAt
      });

    } catch (err) {
      log.warn(`block failed for ${recipientNumber}: ${err.message}`);
    }
  }
}

function attachAntighostHandler(sock, sessionId) {
  sock.ev.on('messages.update', async (updates) => {
    if (!Array.isArray(updates)) updates = [updates];

    for (const update of updates) {
      try {
        await handleReadUpdate(sock, sessionId, update);
      } catch (err) {
        log.error(`antighost read crashed: ${err.message}`);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleIncomingMessage(sock, sessionId, msg);
      } catch (err) {
        log.error(`antighost reply crashed: ${err.message}`);
      }
    }
  });

  const interval = setInterval(async () => {
    try {
      await processExpired(sock, sessionId);
    } catch (err) {
      log.error(`antighost check failed: ${err.message}`);
    }
  }, CHECK_INTERVAL_MS);

  sock.__antighostInterval = interval;

  log.debug(`Antighost handler attached to ${sessionId}`);
}

function cleanup(sessionId) {
  const sock = null;
  log.debug(`antighost cleanup for ${sessionId}`);
}

export {
  attachAntighostHandler,
  handleReadUpdate,
  handleIncomingMessage,
  processExpired,
  cleanup,
  CHECK_INTERVAL_MS,
  DEFAULT_DELAY_HOURS
};

export default {
  attachAntighostHandler
};