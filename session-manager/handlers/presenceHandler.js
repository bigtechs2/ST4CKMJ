import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('presence');

const SYM = brand.SYM;

const WINDOW_MS          = 15000;
const TYPING_LIMIT       = 12;
const RECORDING_LIMIT    = 8;
const ONLINE_TOGGLE_LIMIT= 10;
const MAX_TRACK          = 5000;
const COOLDOWN_MS        = 30000;

const typingTracker    = new Map();
const recordingTracker = new Map();
const onlineTracker    = new Map();
const lastActionAt     = new Map();

const metadataCache = new Map();
const METADATA_TTL  = 60000;

function key(chatId, jid) {
  return `${chatId}:${jid}`;
}

function recordHit(map, chatId, jid) {
  const k = key(chatId, jid);
  const now = Date.now();
  const arr = map.get(k) || [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  map.set(k, recent);

  if (map.size > MAX_TRACK) {
    const first = map.keys().next().value;
    map.delete(first);
  }

  return recent.length;
}

function isOnCooldown(chatId, jid) {
  const k = key(chatId, jid);
  const last = lastActionAt.get(k) || 0;
  return Date.now() - last < COOLDOWN_MS;
}

function markAction(chatId, jid) {
  lastActionAt.set(key(chatId, jid), Date.now());

  if (lastActionAt.size > MAX_TRACK) {
    const first = lastActionAt.keys().next().value;
    lastActionAt.delete(first);
  }
}

async function getGroupMetadata(sock, chatId) {
  const cached = metadataCache.get(chatId);
  if (cached && Date.now() - cached.at < METADATA_TTL) return cached.data;

  try {
    const data = await sock.groupMetadata(chatId);
    metadataCache.set(chatId, { data, at: Date.now() });
    return data;
  } catch {
    return null;
  }
}

function invalidateMetadata(chatId) {
  metadataCache.delete(chatId);
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

async function sendWarn(sock, chatId, senderJid, senderNumber, reason) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.timer} *Presence Warning*\n\n` +
      `${SYM.arrow} @${senderNumber}\n` +
      `${SYM.arrow} reason · ${reason}\n\n` +
      `${SYM.info} stop or you will be removed`,
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

async function applyPresenceAction(sock, sessionId, chatId, senderJid, cfg, reason) {
  const mode = cfg.antispamMode || (cfg.antispam ? 'delete' : 'off');
  if (mode === 'off') return;
  if (isOnCooldown(chatId, senderJid)) return;

  const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');

  markAction(chatId, senderJid);

  if (mode === 'delete') {
    log.event('presence.spam.silent', { sessionId, chatId, sender: senderNumber, reason });
    return;
  }

  await sendWarn(sock, chatId, senderJid, senderNumber, reason);

  if (mode === 'kick') {
    await kickUser(sock, chatId, senderJid);
  }

  try {
    await SessionConfig.updateOne(
      { sessionId },
      { $inc: { 'stats.antispamTriggers': 1 } }
    );
  } catch {}

  log.event('presence.spam', { sessionId, chatId, sender: senderNumber, mode, reason });
}

function getPresenceFeatures(cfg) {
  const sp = cfg.antispamFeatures || {};

  return {
    typing:    sp.typing    !== false,
    recording: sp.recording !== false,
    online:    sp.online    !== false
  };
}

async function handlePresence(sock, sessionId, { id: chatId, presences }) {
  if (!chatId || !chatId.endsWith('@g.us')) return;
  if (!presences || typeof presences !== 'object') return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.antispamMode || (cfg.antispam ? 'delete' : 'off');
  if (mode === 'off') return;

  const enabled = getPresenceFeatures(cfg);

  if (!enabled.typing && !enabled.recording && !enabled.online) return;

  const metadata = await getGroupMetadata(sock, chatId);

  for (const [jid, data] of Object.entries(presences)) {
    if (!jid || !data) continue;

    const senderNumber = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (!senderNumber) continue;
    if (isSuperOwner(senderNumber)) continue;
    if (metadata && isAdminInGroup(metadata, jid)) continue;

    const presence = data.lastKnownPresence;

    if (enabled.typing && presence === 'composing') {
      const hits = recordHit(typingTracker, chatId, jid);
      if (hits > TYPING_LIMIT) {
        await applyPresenceAction(sock, sessionId, chatId, jid, cfg, 'typing flood');
      }
    }

    if (enabled.recording && presence === 'recording') {
      const hits = recordHit(recordingTracker, chatId, jid);
      if (hits > RECORDING_LIMIT) {
        await applyPresenceAction(sock, sessionId, chatId, jid, cfg, 'recording flood');
      }
    }

    if (enabled.online && presence === 'available') {
      const hits = recordHit(onlineTracker, chatId, jid);
      if (hits > ONLINE_TOGGLE_LIMIT) {
        await applyPresenceAction(sock, sessionId, chatId, jid, cfg, 'online toggling');
      }
    }
  }
}

function attachPresenceHandler(sock, sessionId) {
  sock.ev.on('presence.update', async (payload) => {
    try {
      await handlePresence(sock, sessionId, payload);
    } catch (err) {
      log.error(`presence crashed for ${sessionId}: ${err.message}`);
    }
  });

  log.debug(`Presence handler attached to ${sessionId}`);
}

function cleanup() {
  typingTracker.clear();
  recordingTracker.clear();
  onlineTracker.clear();
  lastActionAt.clear();
  metadataCache.clear();
}

export {
  attachPresenceHandler,
  handlePresence,
  cleanup,
  TYPING_LIMIT,
  RECORDING_LIMIT,
  ONLINE_TOGGLE_LIMIT,
  WINDOW_MS
};

export default {
  attachPresenceHandler,
  handlePresence
};