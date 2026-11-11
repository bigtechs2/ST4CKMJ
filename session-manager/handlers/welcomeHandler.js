import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('welcome');

const SYM = brand.SYM;

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function renderTemplate(text, { user, group, count }) {
  return String(text || '')
    .replace(/{user}/g, `@${user}`)
    .replace(/{group}/g, group || '')
    .replace(/{count}/g, String(count || ''));
}

async function sendWelcome(sock, chatId, users, cfg) {
  if (!cfg.welcomeEnabled) return;

  const groupMeta = await sock.groupMetadata(chatId).catch(() => null);
  const groupName = groupMeta?.subject || 'the group';
  const count = groupMeta?.participants?.length || 0;

  for (const jid of users) {
    const num = normalizeNumber(jid);
    if (!num) continue;

    const template = cfg.welcomeText ||
      `${SYM.heart} Welcome @{user}\n\n` +
      `${SYM.arrow} to *${groupName}*\n` +
      `${SYM.arrow} member #{count}\n\n` +
      `${SYM.info} say hi to everyone`;

    const body = renderTemplate(template, { user: num, group: groupName, count });

    try {
      await sock.sendMessage(chatId, {
        text: `${body}\n\n[View channel](${config.bot.channelLink || config.links.whatsappChannel})`,
        mentions: [jid]
      });
    } catch (err) {
      log.warn(`welcome send failed: ${err.message}`);
    }
  }
}

async function sendGoodbye(sock, chatId, users, cfg) {
  if (!cfg.goodbyeEnabled) return;

  const groupMeta = await sock.groupMetadata(chatId).catch(() => null);
  const groupName = groupMeta?.subject || 'the group';

  for (const jid of users) {
    const num = normalizeNumber(jid);
    if (!num) continue;

    const template = cfg.goodbyeText ||
      `${SYM.cross} Goodbye @{user}\n\n` +
      `${SYM.arrow} left *${groupName}*`;

    const body = renderTemplate(template, { user: num, group: groupName });

    try {
      await sock.sendMessage(chatId, {
        text: `${body}\n\n[View channel](${config.bot.channelLink || config.links.whatsappChannel})`,
        mentions: [jid]
      });
    } catch (err) {
      log.warn(`goodbye send failed: ${err.message}`);
    }
  }
}

function attachWelcomeHandler(sock, sessionId) {
  sock.ev.on('group-participants.update', async (update) => {
    const { id: chatId, participants, action } = update;
    if (!chatId || !chatId.endsWith('@g.us')) return;

    const cfg = await SessionConfig.findBySessionId(sessionId);
    if (!cfg) return;

    const users = Array.isArray(participants) ? participants : [participants];

    try {
      if (action === 'add') {
        await sendWelcome(sock, chatId, users, cfg);
      } else if (action === 'remove' || action === 'leave') {
        await sendGoodbye(sock, chatId, users, cfg);
      }
    } catch (err) {
      log.error(`welcome handler failed: ${err.message}`);
    }
  });

  log.debug(`Welcome handler attached to ${sessionId}`);
}

export { attachWelcomeHandler };
export default { attachWelcomeHandler };