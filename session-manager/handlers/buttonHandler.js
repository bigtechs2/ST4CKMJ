import { AIRich } from '../lib/NIXCODE.js';
import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';

const log = logger.child('buttonHandler');

const SYM = brand.SYM;

const pending = new Map();
const TTL_MS  = 5 * 60 * 1000;

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function getSenderNumber(msg) {
  const jid = msg.key?.participant || msg.key?.remoteJid || '';
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

function extractButtonId(msg) {
  const m = msg.message;
  if (!m) return null;

  if (m.buttonsResponseMessage?.selectedButtonId) {
    return m.buttonsResponseMessage.selectedButtonId;
  }

  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  }

  if (m.templateButtonReplyMessage?.selectedId) {
    return m.templateButtonReplyMessage.selectedId;
  }

  if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const raw = m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
      const parsed = JSON.parse(raw);
      return parsed.id || parsed.buttonId || parsed.selectedId || null;
    } catch {
      return null;
    }
  }

  return null;
}

function registerMarriage(proposer, target, meta = {}) {
  const key = `${proposer}:${target}`;

  const entry = {
    proposer,
    target,
    meta,
    createdAt: Date.now()
  };

  pending.set(key, entry);

  setTimeout(() => {
    if (pending.has(key)) {
      pending.delete(key);
      log.debug(`marriage expired: ${key}`);
    }
  }, TTL_MS);

  return key;
}

function getMarriage(proposer, target) {
  return pending.get(`${proposer}:${target}`) || null;
}

function removeMarriage(proposer, target) {
  pending.delete(`${proposer}:${target}`);
}

async function sendMarryAccepted(sock, chatId, proposer, target) {
  const proposerJid = `${proposer}@s.whatsapp.net`;
  const targetJid   = `${target}@s.whatsapp.net`;

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.heart} *They said YES!*\n\n` +
    `${SYM.arrow} @${proposer} + @${target}\n` +
    `${SYM.arrow} just got married\n\n` +
    `${SYM.info} _congratulations_ 💍`,
    { id: 'msg' }
  );

  rich.addSuggest([
    `${config.prefixes.whatsappDefault}marry`,
    `${config.prefixes.whatsappDefault}menu funny`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  await rich.send(chatId, { mentions: [proposerJid, targetJid] });
}

async function sendMarryDeclined(sock, chatId, proposer, target) {
  const proposerJid = `${proposer}@s.whatsapp.net`;
  const targetJid   = `${target}@s.whatsapp.net`;

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.cross} *Proposal declined*\n\n` +
    `${SYM.arrow} @${target} said no to @${proposer}\n` +
    `${SYM.arrow} _maybe next time_`,
    { id: 'msg' }
  );

  rich.addSuggest([
    `${config.prefixes.whatsappDefault}marry`,
    `${config.prefixes.whatsappDefault}menu funny`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  await rich.send(chatId, { mentions: [proposerJid, targetJid] });
}

async function handleMarryButton(sock, msg, { action, proposer, target }) {
  const chatId = msg.key?.remoteJid;
  if (!chatId) return true;

  const senderNumber = getSenderNumber(msg);

  if (senderNumber !== target) {
    log.debug(`ignored marry tap from ${senderNumber} (target=${target})`);
    return true;
  }

  const entry = getMarriage(proposer, target);

  if (!entry) {
    log.debug(`no pending marriage: ${proposer}:${target}`);
    return true;
  }

  removeMarriage(proposer, target);

  if (action === 'accept') {
    await sendMarryAccepted(sock, chatId, proposer, target);
    log.event('marry.accept', { proposer, target, chatId });
  } else if (action === 'decline') {
    await sendMarryDeclined(sock, chatId, proposer, target);
    log.event('marry.decline', { proposer, target, chatId });
  }

  return true;
}

async function handleButtonResponse(sock, sessionId, msg) {
  if (!msg?.message) return false;

  const buttonId = extractButtonId(msg);
  if (!buttonId) return false;

  if (!buttonId.startsWith('marry:')) return false;

  const parts = buttonId.split(':');
  if (parts.length < 4) return false;

  const [, action, proposer, target] = parts;

  try {
    await handleMarryButton(sock, msg, { action, proposer, target });
  } catch (err) {
    log.error(`marry button failed: ${err.message}`);
  }

  return true;
}

function cleanup() {
  pending.clear();
  log.info('pending marriages cleared');
}

function count() {
  return pending.size;
}

export {
  handleButtonResponse,
  registerMarriage,
  getMarriage,
  removeMarriage,
  cleanup,
  count,
  TTL_MS
};

export default {
  handleButtonResponse,
  registerMarriage,
  getMarriage,
  removeMarriage,
  cleanup,
  count
};