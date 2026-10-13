import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('antitag');

const SYM = brand.SYM;

const DEFAULT_THRESHOLD = 5;

const metadataCache = new Map();
const METADATA_TTL  = 60000;

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

function getContextInfo(msg) {
  const m = msg.message;
  if (!m) return null;

  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    null
  );
}

function getMentions(msg) {
  const ctx = getContextInfo(msg);
  if (!ctx) return [];
  return ctx.mentionedJid || [];
}

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function getTextBody(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

function getSenderJid(msg) {
  return msg.key?.participant || msg.key?.remoteJid || '';
}

function getSenderNumber(msg) {
  const jid = getSenderJid(msg);
  if (!jid) return '';
  return normalizeNumber(jid);
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

function isAdminNumberInGroup(metadata, number) {
  if (!metadata?.participants) return false;

  return metadata.participants.some((p) => {
    const pNum = normalizeNumber(p.id);
    if (pNum !== number) return false;
    return p.admin === 'admin' || p.admin === 'superadmin';
  });
}

function isSenderPrivileged(senderJid, senderNumber, metadata) {
  if (isSuperOwner(senderNumber)) return true;
  if (isAdminInGroup(metadata, senderJid)) return true;
  if (isAdminNumberInGroup(metadata, senderNumber)) return true;
  return false;
}

function findProtectedMention(mentions, cfg, metadata) {
  if (!mentions.length) return null;

  const manualList = Array.isArray(cfg.antitagProtected) ? cfg.antitagProtected : [];
  const manualSet  = new Set(manualList.map((n) => String(n).replace(/\D/g, '')));

  for (const jid of mentions) {
    const num = normalizeNumber(jid);
    if (!num) continue;

    if (isSuperOwner(num)) {
      return { jid, number: num, kind: 'super owner' };
    }

    if (manualSet.has(num)) {
      return { jid, number: num, kind: 'protected' };
    }

    if (isAdminNumberInGroup(metadata, num)) {
      return { jid, number: num, kind: 'admin' };
    }
  }

  return null;
}

function isWholeGroupTag(text, mentions, groupSize) {
  const hasTagAll = /@(all|everyone|here)\b/i.test(text);
  if (hasTagAll) return true;

  if (groupSize >= 20 && mentions.length >= Math.floor(groupSize * 0.7)) {
    return true;
  }

  return false;
}

async function deleteMessage(sock, chatId, msg) {
  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    log.warn(`delete failed: ${err.message}`);
  }
}

async function sendWarn(sock, chatId, senderJid, senderNumber, reason, details = '') {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.timer} *Antitag Warning*\n\n` +
      `${SYM.arrow} @${senderNumber}\n` +
      `${SYM.arrow} reason · ${reason}` +
      (details ? `\n${SYM.arrow} details · ${details}` : '') +
      `\n\n${SYM.info} tagging is restricted in this group`,
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
  } catch (err) {
    log.warn(`kick failed: ${err.message}`);
  }
}

async function handleAntitag(sock, sessionId, msg) {
  const chatId = msg.key?.remoteJid || '';

  if (!chatId.endsWith('@g.us')) return;
  if (msg.key?.fromMe) return;
  if (!msg.message) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antitagMode || (cfg.antitag ? 'delete' : 'off');
  if (mode === 'off') return;

  const mentions = getMentions(msg);
  if (!mentions.length) return;

  const senderJid    = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);
  if (!senderJid || !senderNumber) return;

  const metadata = await getGroupMetadata(sock, chatId);

  const senderIsPrivileged = isSenderPrivileged(senderJid, senderNumber, metadata);

  const protectedMatch = findProtectedMention(mentions, cfg, metadata);
  const threshold      = Number(cfg.antitagThreshold) || DEFAULT_THRESHOLD;
  const groupSize      = metadata?.participants?.length || 0;
  const text           = getTextBody(msg);
  const wholeTag       = isWholeGroupTag(text, mentions, groupSize);

  let reason = '';
  let details = '';
  let shouldDelete = false;

  if (protectedMatch) {
    if (senderIsPrivileged) {
      log.debug(`sender privileged — allowed to tag ${protectedMatch.kind}`);
      return;
    }

    reason       = `tagged ${protectedMatch.kind}`;
    details      = `@${protectedMatch.number}`;
    shouldDelete = true;
  } else if (wholeTag) {
    if (senderIsPrivileged) {
      log.debug('sender privileged — allowed whole-group tag');
      return;
    }

    reason       = 'group-wide tag';
    shouldDelete = true;
  } else if (mentions.length >= threshold) {
    if (senderIsPrivileged) {
      log.debug('sender privileged — allowed mass mention');
      return;
    }

    reason       = 'mass mention';
    details      = `${mentions.length} users`;
    shouldDelete = true;
  }

  if (!shouldDelete) return;

  log.event('antitag.triggered', {
    sessionId,
    chatId,
    sender: senderNumber,
    count:  mentions.length,
    reason,
    mode
  });

  await deleteMessage(sock, chatId, msg);

  if (mode === 'warn') {
    await sendWarn(sock, chatId, senderJid, senderNumber, reason, details);
  } else if (mode === 'kick') {
    await sendWarn(sock, chatId, senderJid, senderNumber, reason, details);
    await kickUser(sock, chatId, senderJid);
  }

  try {
    await SessionConfig.updateOne(
      { sessionId },
      { $inc: { 'stats.antitagTriggers': 1 } }
    );
  } catch {}
}

function attachAntitagHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleAntitag(sock, sessionId, msg);
      } catch (err) {
        log.error(`antitag crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Antitag handler attached to ${sessionId}`);
}

function cleanup() {
  metadataCache.clear();
}

export {
  attachAntitagHandler,
  handleAntitag,
  getMentions,
  isWholeGroupTag,
  findProtectedMention,
  isSenderPrivileged,
  cleanup,
  DEFAULT_THRESHOLD
};

export default {
  attachAntitagHandler,
  handleAntitag
};