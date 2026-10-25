import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { AIRich } from '../lib/NIXCODE.js';
import { Session, SessionConfig } from '../database/index.js';

const log = logger.child('anticall');

const SYM = brand.SYM;

const metadataCache = new Map();
const METADATA_TTL  = 60000;

const WARN_TTL_MS  = 24 * 60 * 60 * 1000;
const MAX_WARNINGS = 3;
const MAX_TRACK    = 5000;

const warnings = new Map();

function warnKey(callerNumber) {
  return `anticall:${callerNumber}`;
}

function getWarnings(callerNumber) {
  const entry = warnings.get(warnKey(callerNumber));
  if (!entry) return 0;
  if (Date.now() - entry.at > WARN_TTL_MS) {
    warnings.delete(warnKey(callerNumber));
    return 0;
  }
  return entry.count;
}

function addWarning(callerNumber) {
  const key = warnKey(callerNumber);
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

function clearWarnings(callerNumber) {
  warnings.delete(warnKey(callerNumber));
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

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
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

async function rejectCall(sock, callId, callerJid) {
  try {
    await sock.rejectCall(callId, callerJid);
    return true;
  } catch (err) {
    log.warn(`rejectCall failed: ${err.message}`);
    return false;
  }
}

async function blockCaller(sock, callerJid) {
  try {
    await sock.updateBlockStatus(callerJid, 'block');
    return true;
  } catch (err) {
    log.warn(`block failed: ${err.message}`);
    return false;
  }
}

async function sendCallWarn(sock, callerJid, callerNumber, isVideo) {
  try {
    const kind = isVideo ? 'video call' : 'voice call';

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.timer} *Anticall Warning*\n\n` +
      `${SYM.arrow} @${callerNumber}\n` +
      `${SYM.arrow} reason · incoming ${kind}\n\n` +
      `${SYM.info} calls are not allowed · use text instead`,
      { id: 'warn' }
    );

    rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
    rich.setFooter(config.msg.footer);

    await rich.send(callerJid, { mentions: [callerJid] });
  } catch (err) {
    log.warn(`warn send failed: ${err.message}`);
  }
}

async function sendStrikeWarn(sock, chatId, callerJid, callerNumber, strike, reason) {
  try {
    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    rich.addText(
      `${SYM.timer} *Anticall Warning*\n\n` +
      `${SYM.arrow} @${callerNumber}\n` +
      `${SYM.arrow} strike · ${strike}/${MAX_WARNINGS}\n` +
      `${SYM.arrow} reason · ${reason}\n\n` +
      `${SYM.info} ${
        strike >= MAX_WARNINGS
          ? 'final warning — next call will remove you'
          : `${MAX_WARNINGS - strike} more call${MAX_WARNINGS - strike === 1 ? '' : 's'} before removal`
      }`,
      { id: 'warn' }
    );

    rich.addText(`[View channel](${config.bot.channelLink || config.links.whatsappChannel})`);
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { mentions: [callerJid] });
  } catch (err) {
    log.warn(`strike warn failed: ${err.message}`);
  }
}

async function kickFromGroups(sock, sessionId, callerJid, callerNumber) {
  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return 0;

  const groups = [];

  try {
    const allChats = await sock.groupFetchAllParticipating();

    for (const [chatId, meta] of Object.entries(allChats || {})) {
      const isMember = (meta.participants || []).some(
        (p) => p.id === callerJid || normalizeNumber(p.id) === callerNumber
      );

      if (isMember) groups.push(chatId);
    }
  } catch (err) {
    log.warn(`groupFetchAllParticipating failed: ${err.message}`);
    return 0;
  }

  let kicked = 0;

  for (const chatId of groups) {
    try {
      const metadata = await getGroupMetadata(sock, chatId);
      if (!metadata) continue;

      const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
      const botNumber = normalizeNumber(botJid);

      const me = metadata.participants?.find(
        (p) => normalizeNumber(p.id) === botNumber
      );
      const botIsAdmin = me?.admin === 'admin' || me?.admin === 'superadmin';

      if (!botIsAdmin) continue;

      const callerInGroup = metadata.participants?.find(
        (p) => normalizeNumber(p.id) === callerNumber
      );

      if (!callerInGroup) continue;

      if (callerInGroup.admin === 'admin' || callerInGroup.admin === 'superadmin') {
        log.debug(`skipping admin caller in ${chatId}`);
        continue;
      }

      await sock.groupParticipantsUpdate(chatId, [callerJid], 'remove');
      invalidateMetadata(chatId);
      kicked += 1;

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} @${callerNumber} was removed\n` +
            `${SYM.arrow} reason · anticall violations\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`,
          mentions: [callerJid]
        });
      } catch {}

    } catch (err) {
      log.debug(`kick failed in ${chatId}: ${err.message}`);
    }
  }

  return kicked;
}

async function handleCall(sock, sessionId, callEvent) {
  const { chats, from, id, status } = callEvent;

  if (status !== 'offer') return;

  const callerJid = from;
  if (!callerJid) return;

  const callerNumber = normalizeNumber(callerJid);
  if (!callerNumber) return;

  if (isSuperOwner(callerNumber)) {
    log.debug('ignoring super owner call');
    return;
  }

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;

  const mode = cfg.anticallMode || (cfg.anticall ? 'reject' : 'off');
  if (mode === 'off') return;

  const isVideo = chats?.includes('video') || false;

  log.event('anticall.triggered', {
    sessionId,
    caller: callerNumber,
    isVideo,
    mode
  });

  const rejected = await rejectCall(sock, id, callerJid);

  if (mode === 'reject') {
    return;
  }

  if (mode === 'warn') {
    if (rejected) {
      await sendCallWarn(sock, callerJid, callerNumber, isVideo);
    }
    return;
  }

  if (mode === 'kick') {
    const strike = addWarning(callerNumber);

    if (rejected) {
      await sendCallWarn(sock, callerJid, callerNumber, isVideo);
    }

    if (strike >= MAX_WARNINGS) {
      await kickFromGroups(sock, sessionId, callerJid, callerNumber);
      clearWarnings(callerNumber);
    }

    try {
      await SessionConfig.updateOne(
        { sessionId },
        { $inc: { 'stats.anticallTriggers': 1 } }
      );
    } catch {}
    return;
  }

  if (mode === 'block') {
    if (rejected) {
      await sendCallWarn(sock, callerJid, callerNumber, isVideo);
      await blockCaller(sock, callerJid);
    }
    return;
  }
}

function attachAnticallHandler(sock, sessionId) {
  sock.ev.on('call', async (calls) => {
    if (!Array.isArray(calls)) calls = [calls];

    for (const call of calls) {
      try {
        await handleCall(sock, sessionId, call);
      } catch (err) {
        log.error(`anticall crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Anticall handler attached to ${sessionId}`);
}

function cleanup() {
  metadataCache.clear();
  warnings.clear();
}

export {
  attachAnticallHandler,
  handleCall,
  getWarnings,
  clearWarnings,
  cleanup,
  MAX_WARNINGS,
  WARN_TTL_MS
};

export default {
  attachAnticallHandler,
  handleCall
};