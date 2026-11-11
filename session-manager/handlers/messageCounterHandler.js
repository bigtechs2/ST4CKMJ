import config from '../config.js';
import logger from '../../shared/logger.js';
import { MessageCounter } from '../database/index.js';

const log = logger.child('msgCounter');

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function getSenderJid(msg) {
  return msg.key?.participant || msg.key?.remoteJid || '';
}

function getSenderNumber(msg) {
  return normalizeNumber(getSenderJid(msg));
}

function isGroupChat(chatId) {
  return String(chatId || '').endsWith('@g.us');
}

function hasRealContent(msg) {
  const m = msg.message;
  if (!m) return false;
  if (m.protocolMessage) return false;
  if (m.reactionMessage) return false;
  if (m.pollUpdateMessage) return false;
  if (m.senderKeyDistributionMessage) return false;
  if (m.messageContextInfo) return false;
  return true;
}

async function handleMessageCount(sock, sessionId, msg) {
  if (!msg?.message) return;
  if (msg.key?.fromMe) return;

  const chatId = msg.key?.remoteJid || '';
  if (!isGroupChat(chatId)) return;

  const senderJid = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);
  if (!senderJid || !senderNumber) return;

  if (!hasRealContent(msg)) return;

  try {
    await MessageCounter.increment({
      sessionId,
      groupId:  chatId,
      userId:   senderNumber,
      userName: msg.pushName || ''
    });
  } catch (err) {
    log.debug(`count failed: ${err.message}`);
  }
}

function attachMessageCounterHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleMessageCount(sock, sessionId, msg);
      } catch (err) {
        log.error(`counter crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Message counter attached to ${sessionId}`);
}

export {
  attachMessageCounterHandler,
  handleMessageCount
};

export default {
  attachMessageCounterHandler
};