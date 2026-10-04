import config from '../config.js';
import C from '../../shared/constants.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('antilink');

const SYM = brand.SYM;

const LINK_REGEX = /(https?:\/\/[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|whatsapp\.com\/channel\/[^\s]+|t\.me\/[^\s]+|discord\.(?:gg|com\/invite)\/[^\s]+|(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rb\.gy|cutt\.ly|shorturl\.at|rebrand\.ly|shorte\.st|s\.id|v\.gd|qr\.ae|adf\.ly|bc\.vc|j\.mp|soo\.gd)\/[^\s]+|(?:www\.)?[\w-]+\.(?:com|net|org|io|co|me|tv|xyz|info|biz|online|site|app|dev|gg|to|cc|link|click|ly|sh|us|uk|in|ru|de|fr|it|ca|au|br|za|ke|tz|ug|ng)(?:\/[^\s]*)?)/i;

const metadataCache = new Map();
const METADATA_TTL = 60000;

async function getGroupMetadata(sock, chatId) {
  const cached = metadataCache.get(chatId);

  if (cached && Date.now() - cached.at < METADATA_TTL) {
    return cached.data;
  }

  try {
    const data = await sock.groupMetadata(chatId);
    metadataCache.set(chatId, { data, at: Date.now() });
    return data;
  } catch (err) {
    log.warn(`groupMetadata failed for ${chatId}: ${err.message}`);
    return null;
  }
}

function invalidateMetadata(chatId) {
  metadataCache.delete(chatId);
}

function getMessageText(msg) {
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
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
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

async function deleteMessage(sock, chatId, msg) {
  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    log.warn(`delete failed: ${err.message}`);
  }
}

async function sendWarn(sock, chatId, senderNumber, senderJid) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.cross} *Antilink Warning*\n\n` +
      `${SYM.arrow} @${senderNumber}\n` +
      `${SYM.arrow} links are not allowed in this group\n\n` +
      `${SYM.info} next time you will be removed`,
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

async function handleAntilink(sock, sessionId, msg) {
  const chatId = msg.key?.remoteJid || '';

  if (!chatId.endsWith('@g.us')) return;
  if (msg.key?.fromMe) return;
  if (!msg.message) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antilinkMode || (cfg.antilink ? 'delete' : 'off');
  if (mode === 'off') return;

  const text = getMessageText(msg);
  if (!text) return;
  if (!LINK_REGEX.test(text)) return;

  const senderJid    = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);
  if (!senderJid || !senderNumber) return;

  if (isSuperOwner(senderNumber)) return;

  const metadata = await getGroupMetadata(sock, chatId);
  if (metadata && isAdminInGroup(metadata, senderJid)) return;

  log.event('antilink.triggered', {
    sessionId,
    chatId,
    sender: senderNumber,
    mode
  });

  await deleteMessage(sock, chatId, msg);

  if (mode === 'warn') {
    await sendWarn(sock, chatId, senderNumber, senderJid);
  } else if (mode === 'kick') {
    await sendWarn(sock, chatId, senderNumber, senderJid);
    await kickUser(sock, chatId, senderJid);
  }
}

function attachAntilinkHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleAntilink(sock, sessionId, msg);
      } catch (err) {
        log.error(`antilink crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Antilink handler attached to ${sessionId}`);
}

export {
  attachAntilinkHandler,
  handleAntilink,
  LINK_REGEX,
  getGroupMetadata,
  invalidateMetadata
};

export default {
  attachAntilinkHandler,
  handleAntilink
};