import config from '../config.js';
import C from '../../shared/constants.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('antispam');

const SYM = brand.SYM;

const WINDOW_MS    = 8000;
const TYPOING_WINDOW_MS = 15000;
const MAX_TRACK    = 5000;

const spamBuckets    = new Map();
const typingTracker  = new Map();
const recordingTracker = new Map();
const reactionTracker  = new Map();
const onlineTracker    = new Map();

const metadataCache = new Map();
const METADATA_TTL  = 60000;

const LIMITS = {
  text:      6,
  media:     3,
  sticker:   4,
  audio:     3,
  video:     3,
  document:  3,
  contact:   3,
  location:  3,
  poll:      2,
  vcard:     3,
  forward:   4,
  broadcast: 2,
  mention:   5,
  caps:      3,
  emoji:     8,
  reaction:  8,
  typing:    10,
  recording: 8,
  online:    10,
  viewonce:  3
};

const CAPS_REGEX = /^[A-Z\s\d!?.,]{20,}$/;
const EMOJI_REGEX = /(\p{Extended_Pictographic})/gu;

function bucketKey(chatId, sender) {
  return `${chatId}:${sender}`;
}

function bucketFor(chatId, sender) {
  const key = bucketKey(chatId, sender);

  let bucket = spamBuckets.get(key);

  if (!bucket) {
    bucket = {
      windowStart: Date.now(),
      counts: {
        text: 0, media: 0, sticker: 0, audio: 0, video: 0, document: 0,
        contact: 0, location: 0, poll: 0, vcard: 0, forward: 0,
        broadcast: 0, mention: 0, caps: 0, emoji: 0, viewonce: 0
      },
      warns: 0,
      lastContent: '',
      repeatCount: 0
    };
    spamBuckets.set(key, bucket);

    if (spamBuckets.size > MAX_TRACK) {
      const oldest = spamBuckets.keys().next().value;
      spamBuckets.delete(oldest);
    }
  }

  const now = Date.now();
  if (now - bucket.windowStart > WINDOW_MS) {
    bucket.windowStart = now;
    for (const k of Object.keys(bucket.counts)) {
      bucket.counts[k] = 0;
    }
  }

  return bucket;
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

function detectContentType(msg) {
  const m = msg.message;
  if (!m) return null;

  if (m.imageMessage)         return 'media';
  if (m.videoMessage)         return 'video';
  if (m.audioMessage)         return 'audio';
  if (m.stickerMessage)       return 'sticker';
  if (m.documentMessage)      return 'document';
  if (m.contactMessage)       return 'contact';
  if (m.contactsArrayMessage) return 'contact';
  if (m.locationMessage)      return 'location';
  if (m.liveLocationMessage)  return 'location';
  if (m.pollCreationMessage)  return 'poll';
  if (m.pollCreationMessageV2)return 'poll';
  if (m.pollCreationMessageV3)return 'poll';

  if (
    m.extendedTextMessage?.contextInfo?.isForwarded ||
    m.imageMessage?.contextInfo?.isForwarded ||
    m.videoMessage?.contextInfo?.isForwarded ||
    m.audioMessage?.contextInfo?.isForwarded ||
    m.documentMessage?.contextInfo?.isForwarded ||
    m.stickerMessage?.contextInfo?.isForwarded
  ) {
    return 'forward';
  }

  if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) {
    return 'viewonce';
  }

  if (m.conversation || m.extendedTextMessage?.text) return 'text';

  return null;
}

function countEmoji(text) {
  try {
    const matches = String(text || '').match(EMOJI_REGEX);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

function getMentionCount(msg) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    {};

  return (ctx.mentionedJid || []).length;
}

async function deleteMessage(sock, chatId, msg) {
  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    log.warn(`delete failed: ${err.message}`);
  }
}

async function sendWarn(sock, chatId, senderJid, senderNumber, reason) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.timer} *Antispam Warning*\n\n` +
      `${SYM.arrow} @${senderNumber}\n` +
      `${SYM.arrow} reason · ${reason}\n\n` +
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

function getEnabledFeatures(cfg) {
  const sp = cfg.antispamFeatures || {};

  return {
    text:      sp.text      !== false,
    media:     sp.media     !== false,
    sticker:   sp.sticker   !== false,
    audio:     sp.audio     !== false,
    video:     sp.video     !== false,
    document:  sp.document  !== false,
    contact:   sp.contact   !== false,
    location:  sp.location  !== false,
    poll:      sp.poll      !== false,
    vcard:     sp.vcard     !== false,
    forward:   sp.forward   !== false,
    broadcast: sp.broadcast !== false,
    mention:   sp.mention   !== false,
    caps:      sp.caps      !== false,
    emoji:     sp.emoji     !== false,
    reaction:  sp.reaction  !== false,
    typing:    sp.typing    !== false,
    recording: sp.recording !== false,
    online:    sp.online    !== false,
    viewonce:  sp.viewonce  !== false
  };
}

async function applyAction(sock, sessionId, chatId, msg, cfg, reason) {
  const mode = cfg.antispamMode || (cfg.antispam ? 'delete' : 'off');
  if (mode === 'off') return;

  const senderJid    = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);

  await deleteMessage(sock, chatId, msg);

  if (mode === 'warn' || mode === 'kick') {
    await sendWarn(sock, chatId, senderJid, senderNumber, reason);
  }

  if (mode === 'kick') {
    await kickUser(sock, chatId, senderJid);
  }

  try {
    await SessionConfig.updateOne(
      { sessionId },
      { $inc: { 'stats.antispamTriggers': 1 } }
    );
  } catch {}

  log.event('antispam.triggered', {
    sessionId,
    chatId,
    sender: senderNumber,
    mode,
    reason
  });
}

async function handleAntispam(sock, sessionId, msg) {
  const chatId = msg.key?.remoteJid || '';

  if (!chatId.endsWith('@g.us')) return;
  if (msg.key?.fromMe) return;
  if (!msg.message) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antispamMode || (cfg.antispam ? 'delete' : 'off');
  if (mode === 'off') return;

  const senderJid    = getSenderJid(msg);
  const senderNumber = getSenderNumber(msg);
  if (!senderJid || !senderNumber) return;

  if (isSuperOwner(senderNumber)) return;

  const metadata = await getGroupMetadata(sock, chatId);
  if (metadata && isAdminInGroup(metadata, senderJid)) return;

  const enabled   = getEnabledFeatures(cfg);
  const contentType = detectContentType(msg);
  const text      = getTextBody(msg);
  const mentions  = getMentionCount(msg);

  const bucket = bucketFor(chatId, senderNumber);

  let violation = null;

  if (contentType && bucket.counts[contentType] !== undefined) {
    bucket.counts[contentType] += 1;

    if (enabled[contentType] && bucket.counts[contentType] === LIMITS[contentType] + 1) {
      violation = `${contentType} flood`;
    }
  }

  if (!violation && enabled.text && text) {
    bucket.counts.text += 1;

    if (text === bucket.lastContent) {
      bucket.repeatCount += 1;
      if (bucket.repeatCount >= 3) {
        violation = 'repeated message';
      }
    } else {
      bucket.repeatCount = 0;
      bucket.lastContent = text;
    }

    if (!violation && bucket.counts.text === LIMITS.text + 1) {
      violation = 'text flood';
    }
  }

  if (!violation && enabled.caps && text && CAPS_REGEX.test(text)) {
    bucket.counts.caps += 1;
    if (bucket.counts.caps === LIMITS.caps + 1) {
      violation = 'excessive caps';
    }
  }

  if (!violation && enabled.emoji && text) {
    const emojiCount = countEmoji(text);
    if (emojiCount >= 20) {
      violation = 'emoji flood';
    }
  }

  if (!violation && enabled.mention && mentions > 0) {
    bucket.counts.mention += 1;
    if (mentions >= 10) {
      violation = 'mass mention';
    }
  }

  if (!violation && enabled.broadcast) {
    const isBroadcast = msg.message?.extendedTextMessage?.contextInfo?.isForwarded &&
                        bucket.counts.forward > 0;
    if (isBroadcast && bucket.counts.broadcast === LIMITS.broadcast) {
      violation = 'broadcast spam';
    }
    bucket.counts.broadcast += 1;
  }

  if (!violation && enabled.forward && contentType === 'forward') {
    bucket.counts.forward += 1;
    if (bucket.counts.forward === LIMITS.forward + 1) {
      violation = 'forward flood';
    }
  }

  if (violation) {
    await applyAction(sock, sessionId, chatId, msg, cfg, violation);
  }
}

function attachAntispamHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleAntispam(sock, sessionId, msg);
      } catch (err) {
        log.error(`antispam crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        if (update.update?.status === 4) {
          log.debug('message read update');
        }
      } catch {}
    }
  });

  sock.ev.on('presence.update', async ({ id, presences }) => {
    if (!id || !id.endsWith('@g.us')) return;

    try {
      const cfg = await SessionConfig.findBySessionId(sessionId);
      if (!cfg) return;

      const mode = cfg.antispamMode || (cfg.antispam ? 'delete' : 'off');
      if (mode === 'off') return;

      const enabled = getEnabledFeatures(cfg);
      if (!enabled.online) return;

      for (const [jid, data] of Object.entries(presences || {})) {
        if (data?.lastKnownPresence === 'composing' || data?.lastKnownPresence === 'recording') {
          const now = Date.now();
          const key = `${id}:${jid}`;
          const last = typingTracker.get(key) || [];
          last.push(now);
          const recent = last.filter((t) => now - t < TYPOING_WINDOW_MS);
          typingTracker.set(key, recent);

          if (recent.length > 20) {
            log.debug(`typing spam detected: ${jid}`);
          }
        }
      }
    } catch (err) {
      log.debug(`presence handler failed: ${err.message}`);
    }
  });

  log.debug(`Antispam handler attached to ${sessionId}`);
}

function cleanup() {
  spamBuckets.clear();
  typingTracker.clear();
  recordingTracker.clear();
  reactionTracker.clear();
  onlineTracker.clear();
  metadataCache.clear();
}

export {
  attachAntispamHandler,
  handleAntispam,
  cleanup,
  LIMITS,
  WINDOW_MS
};

export default {
  attachAntispamHandler,
  handleAntispam
};