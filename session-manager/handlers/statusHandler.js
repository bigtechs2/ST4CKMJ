import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { SessionConfig, User, Session, Stats } from '../database/index.js';

const log = logger.child('statusHandler');

function extractStatusSender(msg) {
  const jid =
    msg.key?.participant ||
    msg.key?.remoteJid ||
    '';

  if (!jid) return '';

  const user = jid.split('@')[0].split(':')[0];
  return user.replace(/\D/g, '');
}

function isStatusMessage(msg) {
  const jid = msg.key?.remoteJid || '';
  return jid === 'status@broadcast';
}

function isRecentStatus(msg) {
  const ts = Number(msg.messageTimestamp || 0);
  if (!ts) return true;
  const now = Math.floor(Date.now() / 1000);
  return now - ts < 24 * 60 * 60;
}

function pickRandomEmoji(list) {
  if (!Array.isArray(list) || !list.length) return '❤️';
  return list[Math.floor(Math.random() * list.length)];
}

function buildStatusKey(msg) {
  return {
    remoteJid:   'status@broadcast',
    id:          msg.key.id,
    participant: msg.key.participant || msg.participant,
    fromMe:      false
  };
}

async function markViewed(sock, msg) {
  try {
    const key = buildStatusKey(msg);
    await sock.readMessages([key]);
    return true;
  } catch (err) {
    log.debug(`markViewed failed: ${err.message}`);
    return false;
  }
}

async function reactToStatus(sock, msg, emoji) {
  try {
    const key = buildStatusKey(msg);

    await sock.sendMessage(
      'status@broadcast',
      {
        react: {
          text: emoji,
          key
        }
      },
      {
        statusJidList: [msg.key.participant || msg.participant]
      }
    );

    return true;
  } catch (err) {
    log.debug(`reactToStatus failed: ${err.message}`);
    return false;
  }
}

async function sendStatusReply(sock, msg, text) {
  if (!text) return false;

  try {
    const senderJid = msg.key.participant || msg.participant;
    if (!senderJid) return false;

    const personal = senderJid.split('@')[0].split(':')[0] + '@s.whatsapp.net';

    await sock.sendMessage(personal, { text });
    return true;
  } catch (err) {
    log.debug(`sendStatusReply failed: ${err.message}`);
    return false;
  }
}

async function getStatusContent(msg) {
  const m = msg.message;
  if (!m) return null;

  return {
    type:
      m.imageMessage ? 'image'
      : m.videoMessage ? 'video'
      : m.audioMessage ? 'audio'
      : m.extendedTextMessage ? 'text'
      : m.conversation ? 'text'
      : 'unknown',
    caption:
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.extendedTextMessage?.text ||
      m.conversation ||
      ''
  };
}

async function handleStatus(sock, sessionId, msg) {
  if (!msg?.message) return;
  if (!isStatusMessage(msg)) return;
  if (msg.key?.fromMe) return;
  if (!isRecentStatus(msg)) return;

  const senderNumber = extractStatusSender(msg);
  if (!senderNumber) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const wantsView  = cfg.autoView === true;
  const wantsReact = cfg.autoReact === true;
  const wantsReply = Boolean(cfg.statusReplyText);

  if (!wantsView && !wantsReact && !wantsReply) return;

  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return;

  let didView  = false;
  let didReact = false;

  if (wantsView || wantsReact) {
    didView = await markViewed(sock, msg);
  }

  if (wantsReact) {
    const emoji = pickRandomEmoji(cfg.reactEmojis);
    didReact = await reactToStatus(sock, msg, emoji);
  }

  if (wantsReply) {
    await sendStatusReply(sock, msg, cfg.statusReplyText);
  }

  if (didView || didReact) {
    try {
      await cfg.incrementStat('statusViewed', didView ? 1 : 0);
      if (didReact) {
        await cfg.incrementStat('statusReacted', 1);
      }
    } catch (err) {
      log.debug(`Config stat update failed: ${err.message}`);
    }

    try {
      const user = await User.findOne({
        phoneNumber: senderNumber,
        sessionId
      });

      if (user) {
        if (didView)   await user.recordStatusView();
        if (didReact)  await user.recordStatusReact();
      }
    } catch (err) {
      log.debug(`User stat update failed: ${err.message}`);
    }

    try {
      const stats = await Stats.todayOrCreate();
      if (didView)  await stats.incrementStatus('viewed');
      if (didReact) await stats.incrementStatus('reacted');
    } catch (err) {
      log.debug(`Stats update failed: ${err.message}`);
    }

    log.event('status.processed', {
      sessionId,
      sender: senderNumber,
      view:   didView,
      react:  didReact
    });
  }
}

async function bulkProcess(sock, sessionId, messages) {
  for (const msg of messages) {
    try {
      await handleStatus(sock, sessionId, msg);
    } catch (err) {
      log.error(`handleStatus crashed for ${sessionId}: ${err.message}`);
    }
  }
}

function attachStatusHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const statusMsgs = messages.filter(isStatusMessage);
    if (!statusMsgs.length) return;

    await bulkProcess(sock, sessionId, statusMsgs);
  });

  log.debug(`Status handler attached to ${sessionId}`);
}

export {
  attachStatusHandler,
  handleStatus,
  bulkProcess,
  isStatusMessage,
  isRecentStatus,
  extractStatusSender,
  markViewed,
  reactToStatus,
  sendStatusReply,
  pickRandomEmoji,
  buildStatusKey
};

export default {
  attachStatusHandler,
  handleStatus,
  bulkProcess
};