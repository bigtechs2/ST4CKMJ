import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import commandLoader from '../core/commandLoader.js';
import permissions from '../core/permissions.js';
import tier from '../core/tier.js';
import coins from '../core/coins.js';
import { Session, SessionConfig, User, CommandLog } from '../database/index.js';
import { handleButtonResponse } from './buttonHandler.js';

const log = logger.child('messageHandler');

const IGNORE_KEYS = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo'
]);

function getMessageContent(msg) {
  const m = msg.message;
  if (!m) return null;

  if (m.conversation) return m.conversation;

  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;

  if (m.buttonsResponseMessage?.selectedButtonId) {
    return m.buttonsResponseMessage.selectedButtonId;
  }

  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  }

  if (m.templateButtonReplyMessage?.selectedId) {
    return m.templateButtonReplyMessage.selectedId;
  }

  return null;
}

function getSenderNumber(msg) {
  const jid =
    msg.key?.participant ||
    msg.key?.remoteJid ||
    '';

  if (!jid) return '';

  if (jid === 'status@broadcast') return '';

  const user = jid.split('@')[0].split(':')[0];
  return user.replace(/\D/g, '');
}

function getChatId(msg) {
  return msg.key?.remoteJid || '';
}

function getChatType(chatId) {
  if (!chatId) return C.CHAT_TYPE.private;
  if (chatId === 'status@broadcast') return C.CHAT_TYPE.status;
  if (chatId.endsWith('@g.us')) return C.CHAT_TYPE.group;
  if (chatId.endsWith('@newsletter')) return C.CHAT_TYPE.channel;
  return C.CHAT_TYPE.private;
}

function isSelfMessage(msg) {
  return msg.key?.fromMe === true;
}

function isBotMessage(msg) {
  const jid = msg.key?.remoteJid || '';
  return jid.endsWith('@bot') || jid.endsWith('@broadcast');
}

function isButtonResponse(msg) {
  const m = msg.message;
  if (!m) return false;

  return !!(
    m.buttonsResponseMessage ||
    m.listResponseMessage ||
    m.interactiveResponseMessage ||
    m.templateButtonReplyMessage
  );
}

function parseCommand(text, prefix) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trimStart();

  if (!trimmed.startsWith(prefix)) return null;

  const withoutPrefix = trimmed.slice(prefix.length).trim();

  if (!withoutPrefix) return null;

  const parts = withoutPrefix.split(/\s+/);
  const name = parts[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  const args = parts.slice(1);

  if (!name) return null;

  return { name, args, raw: withoutPrefix };
}

function extractMentionedJids(msg) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    {};

  return ctx.mentionedJid || [];
}

function extractQuotedMessage(msg) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    {};

  if (!ctx.quotedMessage) return null;

  return {
    message: ctx.quotedMessage,
    key: {
      remoteJid:   msg.key.remoteJid,
      fromMe:      false,
      id:          ctx.stanzaId,
      participant: ctx.participant
    },
    sender: ctx.participant?.split('@')[0]?.replace(/\D/g, '') || ''
  };
}

function getPushName(msg) {
  return msg.pushName || '';
}

async function replyDenied(sock, chatId, reason, extra = {}, quoted) {
  const text = permissions.deniedReason(reason, extra);

  try {
    await sock.sendMessage(chatId, { text }, { quoted });
  } catch (err) {
    log.warn(`Denied reply failed: ${err.message}`);
  }
}

async function recordCommand(data) {
  try {
    await CommandLog.record(data);
  } catch (err) {
    log.debug(`CommandLog failed: ${err.message}`);
  }
}

async function ensureUser(sessionId, phoneNumber, pushName) {
  try {
    const user = await User.findOrCreate(phoneNumber, {
      sessionId,
      pushName,
      name: pushName
    });

    if (pushName && user.pushName !== pushName) {
      user.pushName = pushName;
      await user.save();
    }

    return user;
  } catch (err) {
    log.debug(`ensureUser failed: ${err.message}`);
    return null;
  }
}

async function handleMessage(sock, sessionId, msg) {
  if (!msg?.message) return;
  if (IGNORE_KEYS.has(Object.keys(msg.message)[0])) return;
  if (isSelfMessage(msg)) return;
  if (isBotMessage(msg)) return;

  const chatId       = getChatId(msg);
  const chatType     = getChatType(chatId);
  const senderNumber = getSenderNumber(msg);
  const pushName     = getPushName(msg);

  if (chatType === C.CHAT_TYPE.status) return;
  if (!senderNumber) return;

  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return;

  const cfg = await SessionConfig.getOrCreate(sessionId, session.phoneNumber);
  const prefix = cfg.prefix || config.prefixes.whatsappDefault;

  if (isButtonResponse(msg)) {
    const handled = await handleButtonResponse(sock, sessionId, msg);
    if (handled) return;
  }

  const parsed = parseCommand(getMessageContent(msg), prefix);

  if (!parsed) {
    await ensureUser(sessionId, senderNumber, pushName);
    return;
  }

  const started = Date.now();
  const command = commandLoader.get(parsed.name);

  const user = await ensureUser(sessionId, senderNumber, pushName);

  if (!command) {
    const elapsed = Date.now() - started;

    await recordCommand({
      sessionId,
      phoneNumber:  session.phoneNumber,
      senderNumber,
      senderName:   pushName,
      chatId,
      chatType,
      command:      parsed.name,
      args:         parsed.args,
      rawText:      getMessageContent(msg),
      success:      false,
      errorReason:  'command-not-found',
      latencyMs:    elapsed
    });

    return;
  }

  const check = await permissions.checkPermissions({
    command,
    senderNumber,
    chatId,
    sessionId
  });

  if (!check.allowed) {
    const elapsed = Date.now() - started;

    await replyDenied(sock, chatId, check.reason, {
      cost:    check.cost,
      balance: check.balance,
      resetIn: check.resetIn
    }, msg);

    await recordCommand({
      sessionId,
      phoneNumber:  session.phoneNumber,
      senderNumber,
      senderName:   pushName,
      chatId,
      chatType,
      command:      command.name,
      category:     command.category,
      args:         parsed.args,
      rawText:      getMessageContent(msg),
      tier:         check.tier,
      success:      false,
      errorReason:  check.reason,
      latencyMs:    elapsed
    });

    return;
  }

  const ctx = {
    sock,
    msg,
    chatId,
    chatType,
    senderNumber,
    senderName:    pushName,
    sessionId,
    session,
    config:        cfg,
    prefix,
    args:          parsed.args,
    rawText:       getMessageContent(msg),
    command,
    tier:          check.tier,
    cost:          check.cost,
    balance:       check.balance,
    mentionedJids: extractMentionedJids(msg),
    quoted:        extractQuotedMessage(msg),
    user,
    reply:         (content, options = {}) => sock.sendMessage(chatId, content, { quoted: msg, ...options }),
    replyQuoted:   (content, options = {}) => sock.sendMessage(chatId, content, { quoted: msg, ...options })
  };

  try {
    await command.code(ctx);

    const elapsed = Date.now() - started;

    if (check.cost > 0) {
      await coins.charge(senderNumber, check.cost, `cmd:${command.name}`);
    }

    if (session) {
      await session.incrementCommands();
    }

    if (cfg) {
      await cfg.recordCommand(command.name);
    }

    if (user) {
      await user.recordCommand(command.name);
    }

    await recordCommand({
      sessionId,
      phoneNumber:  session.phoneNumber,
      senderNumber,
      senderName:   pushName,
      chatId,
      chatType,
      command:      command.name,
      category:     command.category,
      args:         parsed.args,
      rawText:      getMessageContent(msg),
      tier:         check.tier,
      coinsSpent:   check.cost,
      success:      true,
      latencyMs:    elapsed
    });

    log.event('command.run', {
      sessionId,
      sender:  senderNumber,
      cmd:     command.name,
      ms:      elapsed
    });

  } catch (err) {
    const elapsed = Date.now() - started;

    log.error(`Command ${command.name} failed: ${err.message}`);

    try {
      await ctx.reply(
        `${config.messages.errors.generic}\n➩ ${err.message.slice(0, 100)}`
      );
    } catch {}

    await recordCommand({
      sessionId,
      phoneNumber:  session.phoneNumber,
      senderNumber,
      senderName:   pushName,
      chatId,
      chatType,
      command:      command.name,
      category:     command.category,
      args:         parsed.args,
      rawText:      getMessageContent(msg),
      tier:         check.tier,
      success:      false,
      errorReason:  err.message.slice(0, 200),
      latencyMs:    elapsed
    });
  }
}

function attachMessageHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      try {
        await handleMessage(sock, sessionId, msg);
      } catch (err) {
        log.error(`handleMessage crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Message handler attached to ${sessionId}`);
}

export {
  attachMessageHandler,
  handleMessage,
  parseCommand,
  getMessageContent,
  getSenderNumber,
  getChatId,
  getChatType,
  isSelfMessage,
  isBotMessage,
  isButtonResponse,
  extractMentionedJids,
  extractQuotedMessage
};

export default {
  attachMessageHandler,
  handleMessage
};