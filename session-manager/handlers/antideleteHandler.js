import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig, DeletedMessage } from '../database/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const log = logger.child('antidelete');

const SYM = brand.SYM;

const TMP_ROOT     = path.join(config.paths?.tmp || path.join(__dirname, '..', '..', 'tmp'), 'antidelete');
const MAX_FILE_MB  = 40;
const KEEP_HOURS   = 6;

if (!fs.existsSync(TMP_ROOT)) {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
}

const mediaCache = new Map();

function sessionTmpDir(sessionId) {
  const dir = path.join(TMP_ROOT, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function messageKey(sessionId, messageId) {
  return `${sessionId}:${messageId}`;
}

function getSenderJid(msg) {
  return msg.key?.participant || msg.key?.remoteJid || '';
}

function getSenderNumber(msg) {
  const jid = getSenderJid(msg);
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isGroup(chatId) {
  return String(chatId || '').endsWith('@g.us');
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

function getOwnerJid(sock) {
  const id = config.owners.whatsapp.id || '';
  const clean = String(id).replace(/\D/g, '');
  if (clean) return `${clean}@s.whatsapp.net`;

  const sockId = sock.user?.id || '';
  return sockId.replace(/:\d+@/, '@');
}

function detectContent(msg) {
  const m = msg.message;
  if (!m) return null;

  const viewOnce =
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2Extension?.message;

  if (viewOnce) {
    if (viewOnce.imageMessage) {
      return { type: 'image', message: viewOnce.imageMessage, isViewOnce: true, caption: viewOnce.imageMessage.caption || '' };
    }
    if (viewOnce.videoMessage) {
      return { type: 'video', message: viewOnce.videoMessage, isViewOnce: true, caption: viewOnce.videoMessage.caption || '' };
    }
  }

  if (m.conversation)                       return { type: 'text', text: m.conversation };
  if (m.extendedTextMessage?.text)          return { type: 'text', text: m.extendedTextMessage.text };
  if (m.imageMessage)                       return { type: 'image', message: m.imageMessage, caption: m.imageMessage.caption || '' };
  if (m.videoMessage)                       return { type: 'video', message: m.videoMessage, caption: m.videoMessage.caption || '' };
  if (m.stickerMessage)                     return { type: 'sticker', message: m.stickerMessage };
  if (m.documentMessage)                    return { type: 'document', message: m.documentMessage, caption: m.documentMessage.fileName || '' };

  if (m.audioMessage) {
    const isVoice = m.audioMessage.ptt === true;
    return { type: isVoice ? 'voicenote' : 'audio', message: m.audioMessage };
  }

  return { type: 'other' };
}

async function saveMedia(sessionId, messageId, type, mediaMessage) {
  const ext = {
    image:     'jpg',
    video:     'mp4',
    sticker:   'webp',
    audio:     'mp3',
    voicenote: 'ogg',
    document:  'bin'
  }[type] || 'bin';

  const dir  = sessionTmpDir(sessionId);
  const file = path.join(dir, `${messageId}.${ext}`);

  try {
    const stream = await downloadContentFromMessage(mediaMessage, type === 'voicenote' ? 'audio' : type);

    const chunks = [];
    let size = 0;

    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error('media too large');
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length < 100) throw new Error('empty media');

    await fsp.writeFile(file, buffer);

    return { path: file, size: buffer.length };
  } catch (err) {
    log.warn(`saveMedia failed for ${messageId}: ${err.message}`);
    return null;
  }
}

async function storeMessage(sock, sessionId, msg) {
  if (msg.key?.fromMe) return;
  if (!msg.message) return;
  if (!msg.key?.id) return;

  const chatId = msg.key?.remoteJid || '';
  if (!chatId) return;
  if (chatId === 'status@broadcast') return;
  if (chatId.endsWith('@broadcast')) return;
  if (chatId.endsWith('@newsletter')) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antideleteMode || (cfg.antidelete ? 'forward' : 'off');
  if (mode === 'off') return;

  const senderNumber = getSenderNumber(msg);
  if (isSuperOwner(senderNumber)) return;

  const content = detectContent(msg);
  if (!content) return;

  const messageId = msg.key.id;

  let mediaPath = '';
  let mediaMime = '';

  if (content.message && ['image', 'video', 'sticker', 'audio', 'voicenote', 'document'].includes(content.type)) {
    const saved = await saveMedia(sessionId, messageId, content.type, content.message);
    if (saved) {
      mediaPath = saved.path;
      mediaMime = content.message.mimetype || '';
      mediaCache.set(messageKey(sessionId, messageId), Date.now());
    }
  }

  const senderName = msg.pushName || '';

  try {
    await DeletedMessage.create({
      messageId,
      sessionId,
      chatId,
      chatType:        isGroup(chatId) ? 'group' : 'private',
      senderJid:       getSenderJid(msg),
      senderNumber,
      senderName,
      contentType:     content.type,
      textContent:     content.text || content.caption || '',
      mediaPath,
      mediaMime,
      wasViewOnce:     content.isViewOnce === true
    });
  } catch (err) {
    if (!err.message.includes('E11000')) {
      log.warn(`store failed for ${messageId}: ${err.message}`);
    }
  }
}

async function buildReportText(record, deletedByNumber, groupName) {
  const time = new Date().toLocaleString('en-GB', {
    timeZone: config.timezone || 'Africa/Dar_es_Salaam',
    hour12:   false
  });

  const lines = [
    `${SYM.heart} *Deleted Message Report*`,
    '',
    `${SYM.arrow} deleted by · @${deletedByNumber}`,
    `${SYM.arrow} from       · @${record.senderNumber}`,
    `${SYM.arrow} number     · ${record.senderNumber}`
  ];

  if (record.chatType === 'group' && groupName) {
    lines.push(`${SYM.arrow} group      · ${groupName}`);
  }

  lines.push(`${SYM.arrow} time       · ${time}`);

  return lines.join('\n');
}

async function reportToOwner(sock, record, deletedByNumber, deletedByJid, groupName) {
  const ownerJid = getOwnerJid(sock);

  const reportText = await buildReportText(record, deletedByNumber, groupName);

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(reportText, { id: 'report' });

  if (record.textContent) {
    rich.addText(
      `${SYM.diamond} *Content*\n\n` +
      `${SYM.arrow} _${record.textContent.slice(0, 500)}_`,
      { id: 'content' }
    );
  }

  rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
  rich.setFooter(config.msg.footer);

  await rich.send(ownerJid, {
    mentions: [deletedByJid, record.senderJid].filter(Boolean)
  });

  if (record.mediaPath && fs.existsSync(record.mediaPath)) {
    try {
      const mediaOptions = {
        caption:
          `${SYM.heart} *Deleted ${record.contentType}*\n` +
          `${SYM.arrow} from · @${record.senderNumber}\n\n` +
          `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`,
        mentions: [record.senderJid]
      };

      if (record.contentType === 'image') {
        await sock.sendMessage(ownerJid, {
          image: { url: record.mediaPath },
          ...mediaOptions
        });
      } else if (record.contentType === 'sticker') {
        await sock.sendMessage(ownerJid, {
          sticker: { url: record.mediaPath },
          ...mediaOptions
        });
      } else if (record.contentType === 'video') {
        await sock.sendMessage(ownerJid, {
          video: { url: record.mediaPath },
          mimetype: record.mediaMime || 'video/mp4',
          ...mediaOptions
        });
      } else if (record.contentType === 'audio' || record.contentType === 'voicenote') {
        await sock.sendMessage(ownerJid, {
          audio:    { url: record.mediaPath },
          mimetype: record.mediaMime || 'audio/mpeg',
          ptt:      record.contentType === 'voicenote',
          ...mediaOptions
        });
      } else if (record.contentType === 'document') {
        await sock.sendMessage(ownerJid, {
          document: { url: record.mediaPath },
          mimetype: record.mediaMime || 'application/octet-stream',
          fileName: record.textContent || 'file',
          ...mediaOptions
        });
      }

      await fsp.unlink(record.mediaPath).catch(() => {});
      mediaCache.delete(messageKey(record.sessionId, record.messageId));
    } catch (err) {
      log.warn(`media forward failed: ${err.message}`);
    }
  }
}

async function notifyGroup(sock, chatId, record, deletedByJid, deletedByNumber) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.timer} *Message deleted*\n\n` +
      `${SYM.arrow} by · @${deletedByNumber}\n` +
      `${SYM.arrow} original sender · @${record.senderNumber}\n\n` +
      `${SYM.info} _antidelete is on_`,
      { id: 'notify' }
    );

    rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, {
      mentions: [deletedByJid, record.senderJid].filter(Boolean)
    });
  } catch (err) {
    log.warn(`group notify failed: ${err.message}`);
  }
}

async function handleRevoke(sock, sessionId, msg) {
  const protocol = msg.message?.protocolMessage;
  if (!protocol) return false;
  if (protocol.type !== 0) return false;

  const originalId = protocol.key?.id;
  if (!originalId) return false;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return false;

  const mode = cfg.antideleteMode || (cfg.antidelete ? 'forward' : 'off');
  if (mode === 'off') return false;

  const record = await DeletedMessage.findByMessageId(originalId);
  if (!record) return false;
  if (record.sessionId !== sessionId) return false;

  const deletedByJid = getSenderJid(msg);
  const deletedByNumber = getSenderNumber(msg);
  const chatId = msg.key?.remoteJid || record.chatId;

  if (isSuperOwner(deletedByNumber)) return true;
  if (deletedByNumber === record.senderNumber) {
    // user deleted their own message — still report
  }

  let groupName = '';
  if (isGroup(chatId)) {
    try {
      const metadata = await sock.groupMetadata(chatId);
      groupName = metadata?.subject || '';
    } catch {}
  }

  log.event('antidelete.revoke', {
    sessionId,
    chatId,
    originalId,
    deletedBy: deletedByNumber,
    contentType: record.contentType
  });

  await reportToOwner(sock, record, deletedByNumber, deletedByJid, groupName);

  if (mode === 'notify' && isGroup(chatId)) {
    await notifyGroup(sock, chatId, record, deletedByJid, deletedByNumber);
  }

  try {
    record.reported = true;
    await record.save();
  } catch {}

  return true;
}

async function processIncoming(sock, sessionId, msg) {
  if (msg.message?.protocolMessage) {
    return await handleRevoke(sock, sessionId, msg);
  }

  await storeMessage(sock, sessionId, msg);
  return false;
}

async function cleanup() {
  try {
    const now = Date.now();
    const cutoff = now - KEEP_HOURS * 60 * 60 * 1000;

    for (const [key, at] of mediaCache.entries()) {
      if (at < cutoff) mediaCache.delete(key);
    }

    if (!fs.existsSync(TMP_ROOT)) return;

    const dirs = fs.readdirSync(TMP_ROOT);
    let removed = 0;

    for (const dir of dirs) {
      const full = path.join(TMP_ROOT, dir);
      if (!fs.statSync(full).isDirectory()) continue;

      const files = fs.readdirSync(full);
      for (const file of files) {
        const fp = path.join(full, file);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          removed += 1;
        }
      }
    }

    if (removed) log.debug(`cleaned ${removed} antidelete media files`);
  } catch (err) {
    log.warn(`cleanup failed: ${err.message}`);
  }
}

const cleanupInterval = setInterval(cleanup, 10 * 60 * 1000);

function attachAntideleteHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await processIncoming(sock, sessionId, msg);
      } catch (err) {
        log.error(`antidelete crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Antidelete handler attached to ${sessionId}`);
}

export {
  attachAntideleteHandler,
  storeMessage,
  handleRevoke,
  processIncoming,
  cleanup,
  TMP_ROOT,
  KEEP_HOURS
};

export default {
  attachAntideleteHandler,
  storeMessage,
  handleRevoke,
  processIncoming
};