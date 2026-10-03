import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { Session, User, Stats } from '../database/index.js';

const log = logger.child('reactionHandler');

const pendingReactions = new Map();

const CONFIRM_EMOJIS = new Set(['✅', '✔️', '☑️', '👍', '🆗']);
const CANCEL_EMOJIS  = new Set(['❌', '✖️', '🚫', '👎', '🛑']);

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function buildKey(chatId, messageId) {
  return `${chatId}:${messageId}`;
}

function extractReaction(reaction) {
  if (!reaction) return null;

  const chatId =
    reaction.key?.remoteJid ||
    reaction.key?.participant ||
    '';

  if (!chatId) return null;

  const messageId = reaction.key?.id || '';
  if (!messageId) return null;

  const senderJid =
    reaction.key?.participant ||
    reaction.key?.remoteJid ||
    reaction.senderJid ||
    '';

  const senderNumber = String(senderJid)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');

  const emoji = reaction.reaction?.text || reaction.text || '';
  const fromMe = reaction.key?.fromMe === true;

  return {
    chatId,
    messageId,
    senderNumber,
    emoji,
    fromMe,
    timestamp: Date.now()
  };
}

function registerPending({ chatId, messageId, ttlMs = DEFAULT_TTL_MS, onConfirm, onCancel, onEmoji, metadata = {} }) {
  const key = buildKey(chatId, messageId);

  const timer = setTimeout(() => {
    pendingReactions.delete(key);
    log.debug(`Pending reaction expired: ${key}`);
  }, ttlMs);

  pendingReactions.set(key, {
    key,
    chatId,
    messageId,
    onConfirm,
    onCancel,
    onEmoji,
    metadata,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    timer
  });

  return key;
}

function unregisterPending(chatId, messageId) {
  const key = buildKey(chatId, messageId);
  const entry = pendingReactions.get(key);

  if (entry?.timer) clearTimeout(entry.timer);
  pendingReactions.delete(key);

  return !!entry;
}

function getPending(chatId, messageId) {
  return pendingReactions.get(buildKey(chatId, messageId)) || null;
}

function isConfirm(emoji) {
  return CONFIRM_EMOJIS.has(emoji);
}

function isCancel(emoji) {
  return CANCEL_EMOJIS.has(emoji);
}

async function handlePending(entry, reaction) {
  const { emoji, senderNumber } = reaction;

  try {
    if (isConfirm(emoji) && typeof entry.onConfirm === 'function') {
      await entry.onConfirm(reaction, entry.metadata);
      unregisterPending(entry.chatId, entry.messageId);
      return { handled: true, action: 'confirm' };
    }

    if (isCancel(emoji) && typeof entry.onCancel === 'function') {
      await entry.onCancel(reaction, entry.metadata);
      unregisterPending(entry.chatId, entry.messageId);
      return { handled: true, action: 'cancel' };
    }

    if (typeof entry.onEmoji === 'function') {
      await entry.onEmoji(reaction, entry.metadata);
      return { handled: true, action: 'emoji' };
    }
  } catch (err) {
    log.error(`Pending reaction callback failed: ${err.message}`);
  }

  return { handled: false };
}

async function trackReaction(sessionId, senderNumber, emoji) {
  try {
    const user = await User.findOne({ phoneNumber: senderNumber, sessionId });
    if (user) {
      await user.touch('reaction');
    }
  } catch (err) {
    log.debug(`User touch failed: ${err.message}`);
  }
}

async function handleReaction(sock, sessionId, reaction) {
  const data = extractReaction(reaction);

  if (!data) return;
  if (data.fromMe) return;

  const {
    chatId,
    messageId,
    senderNumber,
    emoji
  } = data;

  const entry = getPending(chatId, messageId);

  if (entry) {
    const result = await handlePending(entry, data);

    if (result.handled) {
      log.event('reaction.handled', {
        sessionId,
        chatId,
        messageId,
        action: result.action,
        sender: senderNumber,
        emoji
      });
    }

    return;
  }

  if (!emoji) {
    log.debug(`Reaction removed on ${messageId}`);
    return;
  }

  await trackReaction(sessionId, senderNumber, emoji);

  log.debug(`Reaction received — ${emoji} from ${senderNumber}`);
}

function attachReactionHandler(sock, sessionId) {
  if (typeof sock.ev.on !== 'function') return;

  sock.ev.on('messages.reaction', async (reactions) => {
    if (!Array.isArray(reactions)) reactions = [reactions];

    for (const r of reactions) {
      try {
        await handleReaction(sock, sessionId, r);
      } catch (err) {
        log.error(`handleReaction crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Reaction handler attached to ${sessionId}`);
}

function clearSession(sessionId) {
  let removed = 0;

  for (const [key, entry] of pendingReactions.entries()) {
    if (entry.metadata?.sessionId === sessionId) {
      if (entry.timer) clearTimeout(entry.timer);
      pendingReactions.delete(key);
      removed += 1;
    }
  }

  if (removed) {
    log.debug(`Cleared ${removed} pending reactions for ${sessionId}`);
  }

  return removed;
}

function clearAll() {
  for (const entry of pendingReactions.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  pendingReactions.clear();
  log.info('All pending reactions cleared');
}

function count() {
  return pendingReactions.size;
}

export {
  attachReactionHandler,
  handleReaction,
  registerPending,
  unregisterPending,
  getPending,
  clearSession,
  clearAll,
  count,
  isConfirm,
  isCancel,
  extractReaction,
  CONFIRM_EMOJIS,
  CANCEL_EMOJIS
};

export default {
  attachReactionHandler,
  handleReaction,
  registerPending,
  unregisterPending,
  getPending,
  clearSession,
  clearAll,
  count
};