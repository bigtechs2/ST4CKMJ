import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('antimaster');

const SYM = brand.SYM;

const MEDIA_TYPES = ['image', 'video', 'document', 'sticker', 'audio', 'voicenote', 'vcard', 'contact'];
const ALL_MEDIA_ACTIONS = ['delete', 'warn', 'kick', 'off'];

const metadataCache = new Map();
const METADATA_TTL  = 60000;

const warnings = new Map();
const WARN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_WARNINGS = 3;
const MAX_TRACK = 5000;

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function warnKey(chatId, senderNumber) {
  return `${chatId}:${senderNumber}`;
}

function addWarning(chatId, senderNumber) {
  const key = warnKey(chatId, senderNumber);
  const existing = warnings.get(key);
  const count = (existing && Date.now() - existing.at < WARN_TTL_MS)
    ? existing.count + 1
    : 1;
  warnings.set(key, { count, at: Date.now() });
  if (warnings.size > MAX_TRACK) {
    const first = warnings.keys().next().value;
    warnings.delete(first);
  }
  return count;
}

function getWarnings(chatId, senderNumber) {
  const entry = warnings.get(warnKey(chatId, senderNumber));
  if (!entry) return 0;
  if (Date.now() - entry.at > WARN_TTL_MS) {
    warnings.delete(warnKey(chatId, senderNumber));
    return 0;
  }
  return entry.count;
}

function clearWarnings(chatId, senderNumber) {
  warnings.delete(warnKey(chatId, senderNumber));
}

async function getGroupMetadata(sock, chatId) {
  const cached = metadataCache.get(chatId);
  if (cached && Date.now() - cached.at < METADATA_TTL) return cached.data;
  try {
    const data = await sock.groupMetadata(chatId);
    metadataCache.set(chatId, { data, at: Date.now() });
    return data;
  } catch (err) {
    log.warn(`groupMetadata failed: ${err.message}`);
    return null;
  }
}

function invalidateMetadata(chatId) {
  metadataCache.delete(chatId);
}

function getSenderJid(msg) {
  return msg.key?.participant || msg.key?.remoteJid || '';
}

function getSenderNumber(msg) {
  return normalizeNumber(getSenderJid(msg));
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

function isAdminInGroup(metadata, jid) {
  if (!metadata?.participants) return false;
  const me = metadata.participants.find((p) => p.id === jid);
  if (!me) return false;
  return me.admin === 'admin' || me.admin === 'superadmin';
}

function detectMediaType(msg) {
  const m = msg.message;
  if (!m) return null;

  if (m.imageMessage) return 'image';
  if (m.videoMessage) {
    if (m.videoMessage.ptt === true) return 'voicenote';
    return 'video';
  }
  if (m.stickerMessage) return 'sticker';
  if (m.documentMessage) return 'document';
  if (m.documentWithCaptionMessage?.message?.documentMessage) return 'document';

  if (m.audioMessage) {
    return m.audioMessage.ptt === true ? 'voicenote' : 'audio';
  }

  if (m.contactsArrayMessage) return 'vcard';
  if (m.contactMessage) return 'contact';

  return null;
}

function isForwarded(msg) {
  const m = msg.message;
  if (!m) return false;

  const contexts = [
    m.extendedTextMessage?.contextInfo,
    m.imageMessage?.contextInfo,
    m.videoMessage?.contextInfo,
    m.audioMessage?.contextInfo,
    m.documentMessage?.contextInfo,
    m.stickerMessage?.contextInfo
  ].filter(Boolean);

  for (const ctx of contexts) {
    if (ctx.isForwarded === true) return true;
    if (typeof ctx.forwardingScore === 'number' && ctx.forwardingScore >= 1) return true;
  }

  return false;
}

function getAction(cfg, type) {
  const map = cfg.antimaster || {};
  const action = map[type];
  if (!action || action === 'off') return 'off';
  if (ALL_MEDIA_ACTIONS.includes(action)) return action;
  return 'off';
}

async function findSharedGroup(sock, targetJid) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const targetNumber = normalizeNumber(targetJid);
    if (!targetNumber) return null;

    const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
    const botNumber = normalizeNumber(botJid);

    for (const [chatId, meta] of Object.entries(groups || {})) {
      const participants = meta.participants || [];

      const targetIsMember = participants.some(
        (p) => normalizeNumber(p.id) === targetNumber
      );
      if (!targetIsMember) continue;

      const me = participants.find((p) => normalizeNumber(p.id) === botNumber);
      const botIsAdmin = me?.admin === 'admin' || me?.admin === 'superadmin';
      if (!botIsAdmin) continue;

      return chatId;
    }

    return null;
  } catch (err) {
    log.debug(`findSharedGroup failed: ${err.message}`);
    return null;
  }
}

async function deleteMessage(sock, chatId, msg) {
  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    log.warn(`delete failed: ${err.message}`);
  }
}

async function sendWarn(sock, chatId, senderJid, senderNumber, reason, strike) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
    const strikeLine = strike ? `\n${SYM.arrow} strike · ${strike}/${MAX_WARNINGS}` : '';

    rich.addText(
      `${SYM.timer} *Antimaster Warning*\n\n` +
      `${SYM.arrow} @${senderNumber}\n` +
      `${SYM.arrow} reason · ${reason}${strikeLine}\n\n` +
      `${SYM.info} ${
        strike >= MAX_WARNINGS
          ? 'next violation → removal'
          : 'this content is not allowed here'
      }`,
      { id: 'warn' }
    );

    rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { mentions: [senderJid] });
  } catch (err) {
    log.warn(`warn send failed: ${err.message}`);
  }
}

async function kickUser(sock, chatId, senderJid) {
  try {
    await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove');
    invalidateMetadata(chatId);
    return true;
  } catch (err) {
    log.warn(`kick failed: ${err.message}`);
    return false;
  }
}

async function applyAction(sock, sessionId, chatId, msg, action, reason) {
  const senderJid = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);

  await deleteMessage(sock, chatId, msg);

  if (action === 'warn') {
    const strike = addWarning(chatId, senderNumber);
    await sendWarn(sock, chatId, senderJid, senderNumber, reason, strike);
  } else if (action === 'kick') {
    const strike = addWarning(chatId, senderNumber);
    if (strike >= MAX_WARNINGS) {
      await sendWarn(sock, chatId, senderJid, senderNumber, reason, strike);
      const kicked = await kickUser(sock, chatId, senderJid);
      if (kicked) clearWarnings(chatId, senderNumber);
    } else {
      await sendWarn(sock, chatId, senderJid, senderNumber, reason, strike);
    }
  }

  try {
    await SessionConfig.updateOne(
      { sessionId },
      { $inc: { 'stats.antimasterTriggers': 1 } }
    );
  } catch {}
}

async function handleGroupMessage(sock, sessionId, msg) {
  const chatId = msg.key?.remoteJid || '';
  if (!chatId.endsWith('@g.us')) return;
  if (msg.key?.fromMe) return;
  if (!msg.message) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const senderJid = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);
  if (!senderJid || !senderNumber) return;
  if (isSuperOwner(senderNumber)) return;

  const metadata = await getGroupMetadata(sock, chatId);
  if (metadata && isAdminInGroup(metadata, senderJid)) return;

  const mediaType = detectMediaType(msg);

  if (mediaType) {
    const action = getAction(cfg, mediaType);
    if (action !== 'off') {
      log.event('antimaster.media', {
        sessionId, chatId, sender: senderNumber, type: mediaType, action
      });
      await applyAction(sock, sessionId, chatId, msg, action, mediaType);
      return;
    }
  }

  if (isForwarded(msg)) {
    const action = getAction(cfg, 'forward');
    if (action !== 'off') {
      log.event('antimaster.forward', {
        sessionId, chatId, sender: senderNumber, action
      });
      await applyAction(sock, sessionId, chatId, msg, action, 'forwarded message');
      return;
    }
  }
}

async function handleStatusBroadcast(sock, sessionId, msg) {
  const chatId = msg.key?.remoteJid || '';
  if (chatId !== 'status@broadcast') return;
  if (msg.key?.fromMe) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antistatusmention || 'off';
  if (mode === 'off') return;

  const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
  const botNumber = normalizeNumber(botJid);

  const contexts = [
    msg.message?.extendedTextMessage?.contextInfo,
    msg.message?.imageMessage?.contextInfo,
    msg.message?.videoMessage?.contextInfo
  ].filter(Boolean);

  let isMentioned = false;
  for (const ctx of contexts) {
    const mentions = ctx?.mentionedJid || [];
    if (mentions.some((j) => normalizeNumber(j) === botNumber)) {
      isMentioned = true;
      break;
    }
  }

  if (!isMentioned) return;

  const senderJid = msg.key.participant;
  const senderNumber = normalizeNumber(senderJid);
  if (!senderNumber) return;
  if (isSuperOwner(senderNumber)) return;

  log.event('antimaster.statusmention', {
    sessionId, sender: senderNumber, mode
  });

  if (mode === 'warn') {
    const sharedGroup = await findSharedGroup(sock, senderJid);

    if (!sharedGroup) {
      log.debug('no shared group to warn — skipping');
      return;
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.timer} *Status Mention Warning*\n\n` +
        `${SYM.arrow} @${senderNumber}\n` +
        `${SYM.arrow} reason · mentioned me in status\n\n` +
        `${SYM.info} this is not allowed · stop mentioning the bot`,
        { id: 'warn' }
      );
      rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
      rich.setFooter(config.msg.footer);
      await rich.send(sharedGroup, { mentions: [senderJid] });
    } catch (err) {
      log.debug(`status mention group warn failed: ${err.message}`);
    }
  } else if (mode === 'block') {
    try {
      await sock.updateBlockStatus(senderJid, 'block');
      log.event('antimaster.statusmention.blocked', {
        sessionId, sender: senderNumber
      });

      const sharedGroup = await findSharedGroup(sock, senderJid);
      if (sharedGroup) {
        try {
          const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
          rich.addText(
            `${SYM.cross} *User Blocked*\n\n` +
            `${SYM.arrow} @${senderNumber}\n` +
            `${SYM.arrow} reason · status mention`,
            { id: 'block' }
          );
          rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
          rich.setFooter(config.msg.footer);
          await rich.send(sharedGroup, { mentions: [senderJid] });
        } catch {}
      }
    } catch (err) {
      log.warn(`status block failed: ${err.message}`);
    }
  }
}

async function handleParticipantUpdate(sock, sessionId, update) {
  const { id: chatId, participants, action } = update;
  if (!chatId || !chatId.endsWith('@g.us')) return;
  if (action !== 'remove' && action !== 'leave') return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antileave || 'off';
  if (mode === 'off') return;

  const list = Array.isArray(participants) ? participants : [participants];
  const numbers = list.map((j) => normalizeNumber(j)).filter(Boolean);

  log.event('antimaster.leave', {
    sessionId, chatId, action, count: numbers.length, mode
  });

  if (mode === 'notify') {
    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.info} *Member Left*\n\n` +
        numbers.map((n) => `   ${SYM.arrow} @${n}`).join('\n') +
        `\n\n${SYM.info} action · ${action}`,
        { id: 'leave' }
      );
      rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions: list });
    } catch (err) {
      log.warn(`leave notice failed: ${err.message}`);
    }
  } else if (mode === 'readd' && action === 'remove') {
    try {
      await sock.groupParticipantsUpdate(chatId, list, 'add');
      invalidateMetadata(chatId);
      log.event('antimaster.leave.readded', { sessionId, chatId, count: numbers.length });
    } catch (err) {
      log.warn(`readd failed: ${err.message}`);
    }
  }
}

function attachAntimasterHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        const chatId = msg.key?.remoteJid || '';
        if (chatId === 'status@broadcast') {
          await handleStatusBroadcast(sock, sessionId, msg);
        } else {
          await handleGroupMessage(sock, sessionId, msg);
        }
      } catch (err) {
        log.error(`antimaster crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleParticipantUpdate(sock, sessionId, update);
    } catch (err) {
      log.error(`antimaster leave crashed for ${sessionId}: ${err.message}`);
    }
  });

  log.debug(`Antimaster handler attached to ${sessionId}`);
}

function cleanup() {
  metadataCache.clear();
  warnings.clear();
}

export {
  attachAntimasterHandler,
  handleGroupMessage,
  handleStatusBroadcast,
  handleParticipantUpdate,
  getWarnings,
  clearWarnings,
  detectMediaType,
  isForwarded,
  getAction,
  findSharedGroup,
  cleanup,
  MEDIA_TYPES,
  MAX_WARNINGS,
  WARN_TTL_MS
};

export default {
  attachAntimasterHandler
};