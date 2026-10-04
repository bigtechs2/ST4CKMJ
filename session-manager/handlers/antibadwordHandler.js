import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('antibadword');

const SYM = brand.SYM;

const DEFAULT_BADWORDS = [
  'fuck', 'fucking', 'fucker', 'fucked', 'fck', 'fuk', 'fuq',
  'shit', 'shitty', 'sh1t', 'bullshit',
  'bitch', 'bitches', 'b1tch', 'btch',
  'asshole', 'asshat', 'dumbass', 'bastard', 'bitchass',
  'dick', 'dickhead', 'd1ck', 'cock', 'cocksucker',
  'pussy', 'pussies',
  'cunt', 'cunts',
  'whore', 'whores', 'slut', 'sluts',
  'nigger', 'nigga', 'n1gger', 'n1gga',
  'faggot', 'fag', 'faggots',
  'retard', 'retarded',
  'motherfucker', 'mf', 'mfkr',
  'son of a bitch', 'sob',
  'stfu', 'gtfo', 'kys', 'kms',
  'idiot', 'imbecile', 'moron',
  'damn', 'goddamn',
  'crap', 'crapper',
  'wanker', 'twat', 'tw4t',
  'piss', 'pissed',
  'screw you', 'screw off',

  'malaya', 'malaya wewe',
  'shenzi', 'shenzi wewe',
  'mjinga', 'mjinga wewe', 'majinga',
  'pumbavu', 'pumbavu wewe', 'wapumbavu',
  'mavi', 'kuma', 'kumamake',
  'mboro', 'mb0ro', 'bor0',
  'shenzi', 'shenzi type',
  'mavi', 'maviyako',
  'fala', 'falaa', 'falawe',
  'jinga', 'jinga wewe',
  'h*e', 'b*tch', 'f*ck', 'sh*t'
];

const LINK_BYPASS_REGEX = /(?:[\w]?\*[\w]?)/;

const metadataCache = new Map();
const METADATA_TTL  = 60000;

const userStrikes = new Map();
const MAX_TRACK   = 5000;

function strikeKey(chatId, sender) {
  return `${chatId}:${sender}`;
}

function addStrike(chatId, sender) {
  const key = strikeKey(chatId, sender);
  const count = (userStrikes.get(key) || 0) + 1;
  userStrikes.set(key, count);

  if (userStrikes.size > MAX_TRACK) {
    const first = userStrikes.keys().next().value;
    userStrikes.delete(first);
  }

  return count;
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

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildBadwordIndex(cfg) {
  const custom = Array.isArray(cfg.badwords) ? cfg.badwords : [];
  const useDefault = cfg.badwordsUseDefault !== false;

  const words = [];

  if (useDefault) {
    for (const w of DEFAULT_BADWORDS) words.push(w.toLowerCase());
  }

  for (const w of custom) {
    if (typeof w === 'string' && w.trim()) words.push(w.toLowerCase().trim());
  }

  return [...new Set(words)];
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectBadword(text, cfg) {
  const clean = normalizeText(text);
  if (!clean) return null;

  const words = buildBadwordIndex(cfg);

  for (const word of words) {
    if (!word) continue;

    if (word.includes(' ') || word.includes('*')) {
      const loose = escapeRegex(word).replace(/\\\*/g, '\\w*');
      const regex = new RegExp(`\\b${loose}\\b`, 'i');
      if (regex.test(clean)) return word;
    } else {
      const pattern = new RegExp(`(?:^|[\\s\\W])${escapeRegex(word)}(?:$|[\\s\\W])`, 'i');
      if (pattern.test(clean)) return word;
    }
  }

  const customRegex = Array.isArray(cfg.badwordRegex) ? cfg.badwordRegex : [];

  for (const rx of customRegex) {
    try {
      const regex = new RegExp(rx, 'i');
      if (regex.test(clean)) return `pattern:${rx}`;
    } catch (err) {
      log.warn(`invalid regex: ${rx}`);
    }
  }

  return null;
}

async function deleteMessage(sock, chatId, msg) {
  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    log.warn(`delete failed: ${err.message}`);
  }
}

async function sendWarn(sock, chatId, senderJid, senderNumber, word, strike) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.cross} *Badword Warning*\n\n` +
      `${SYM.arrow} @${senderNumber}\n` +
      `${SYM.arrow} strike · ${strike}\n` +
      `${SYM.arrow} reason · bad language\n\n` +
      `${SYM.info} keep the group clean`,
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

async function handleAntibadword(sock, sessionId, msg) {
  const chatId = msg.key?.remoteJid || '';

  if (!chatId.endsWith('@g.us')) return;
  if (msg.key?.fromMe) return;
  if (!msg.message) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antibadwordMode || (cfg.antibadword ? 'delete' : 'off');
  if (mode === 'off') return;

  const text = getTextBody(msg);
  if (!text) return;

  const matched = detectBadword(text, cfg);
  if (!matched) return;

  const senderJid    = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);
  if (!senderJid || !senderNumber) return;

  if (isSuperOwner(senderNumber)) return;

  const metadata = await getGroupMetadata(sock, chatId);
  if (metadata && isAdminInGroup(metadata, senderJid)) return;

  log.event('antibadword.triggered', {
    sessionId,
    chatId,
    sender: senderNumber,
    word:   matched.slice(0, 20),
    mode
  });

  await deleteMessage(sock, chatId, msg);

  const strike = addStrike(chatId, senderNumber);

  if (mode === 'warn') {
    await sendWarn(sock, chatId, senderJid, senderNumber, matched, strike);
  } else if (mode === 'kick') {
    await sendWarn(sock, chatId, senderJid, senderNumber, matched, strike);
    await kickUser(sock, chatId, senderJid);
  }

  try {
    await SessionConfig.updateOne(
      { sessionId },
      { $inc: { 'stats.antibadwordTriggers': 1 } }
    );
  } catch {}
}

function attachAntibadwordHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleAntibadword(sock, sessionId, msg);
      } catch (err) {
        log.error(`antibadword crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Antibadword handler attached to ${sessionId}`);
}

function cleanup() {
  metadataCache.clear();
  userStrikes.clear();
}

function getStrikeCount(chatId, sender) {
  return userStrikes.get(strikeKey(chatId, sender)) || 0;
}

function resetStrike(chatId, sender) {
  userStrikes.delete(strikeKey(chatId, sender));
}

export {
  attachAntibadwordHandler,
  handleAntibadword,
  detectBadword,
  getStrikeCount,
  resetStrike,
  cleanup,
  DEFAULT_BADWORDS
};

export default {
  attachAntibadwordHandler,
  handleAntibadword
};