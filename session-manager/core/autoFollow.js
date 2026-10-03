import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { Session } from '../database/index.js';
import socketManager from './socketManager.js';

const log = logger.child('autoFollow');

function extractChannelJid() {
  const raw = config.links.whatsappChannelJid || '';
  if (!raw) return null;

  if (raw.includes('@newsletter')) return raw;

  const clean = raw.replace(/[^0-9]/g, '');
  if (!clean) return null;

  return `${clean}@newsletter`;
}

async function followChannel(sock, channelJid) {
  if (!sock) throw new Error('NO_SOCKET');
  if (!channelJid) throw new Error('NO_CHANNEL_JID');

  if (typeof sock.newsletterFollow !== 'function') {
    throw new Error('newsletterFollow-not-supported');
  }

  await sock.newsletterFollow(channelJid);
}

async function verifyFollow(sock, channelJid) {
  if (!sock) return false;
  if (!channelJid) return false;

  if (typeof sock.newsletterMetadata !== 'function') return false;

  try {
    const meta = await sock.newsletterMetadata('jid', channelJid);

    if (!meta) return false;

    if (meta.viewer_metadata) {
      return meta.viewer_metadata.suspended !== true;
    }

    return false;
  } catch (err) {
    log.debug(`verifyFollow failed: ${err.message}`);
    return false;
  }
}

async function autoFollow(sessionId, { force = false } = {}) {
  if (!config.features.autoFollowChannel) {
    log.debug(`Auto-follow disabled — skipping ${sessionId}`);
    return { ok: false, reason: 'disabled' };
  }

  const channelJid = extractChannelJid();

  if (!channelJid) {
    log.warn('No WhatsApp channel JID configured — skipping');
    return { ok: false, reason: 'no-jid' };
  }

  const session = await Session.findOne({ sessionId, deletedAt: null });

  if (!session) {
    log.warn(`No session found for ${sessionId}`);
    return { ok: false, reason: 'no-session' };
  }

  if (session.followedChannel && !force) {
    log.debug(`Already following channel — ${sessionId}`);
    return { ok: true, reason: 'already-following' };
  }

  if (session.status !== C.SESSION_STATE.connected) {
    log.debug(`Session ${sessionId} not connected — deferring follow`);
    return { ok: false, reason: 'not-connected' };
  }

  const sock = socketManager.getSocket(sessionId);

  if (!sock) {
    log.warn(`No active socket for ${sessionId}`);
    return { ok: false, reason: 'no-socket' };
  }

  try {
    const already = await verifyFollow(sock, channelJid);

    if (already && !force) {
      await Session.updateOne(
        { sessionId },
        {
          $set: {
            followedChannel: true,
            lastSeenReason:  'connected'
          }
        }
      );

      log.info(`Verified existing follow — ${sessionId}`);
      return { ok: true, reason: 'verified' };
    }

    await followChannel(sock, channelJid);

    await Session.updateOne(
      { sessionId },
      {
        $set: {
          followedChannel: true,
          lastSeenReason:  'connected'
        }
      }
    );

    log.event('channel.followed', {
      sessionId,
      phone:   session.phoneNumber,
      channel: channelJid.slice(0, 20) + '...'
    });

    return { ok: true, reason: 'followed' };

  } catch (err) {
    log.warn(`Auto-follow failed for ${sessionId}: ${err.message}`);

    await Session.updateOne(
      { sessionId },
      {
        $set: {
          'metadata.lastFollowError':   err.message,
          'metadata.lastFollowAttempt': new Date()
        }
      }
    );

    return { ok: false, reason: err.message };
  }
}

async function ensureFollow(sessionId) {
  const session = await Session.findOne({ sessionId, deletedAt: null });

  if (!session) return { ok: false, reason: 'no-session' };

  if (session.followedChannel) {
    return { ok: true, reason: 'already-following' };
  }

  return await autoFollow(sessionId);
}

async function followAllConnected() {
  const sessions = await Session.find({
    status:          C.SESSION_STATE.connected,
    followedChannel: false,
    deletedAt:       null
  });

  if (!sessions.length) {
    log.debug('No pending follows');
    return { total: 0, success: 0, failed: 0 };
  }

  log.info(`Following channel for ${sessions.length} sessions`);

  let success = 0;
  let failed  = 0;

  for (const session of sessions) {
    try {
      const result = await autoFollow(session.sessionId);
      if (result.ok) success += 1;
      else failed += 1;

      await new Promise((r) => setTimeout(r, 800));
    } catch {
      failed += 1;
    }
  }

  log.ready(`Auto-follow sweep — ${success} success, ${failed} failed`);

  return { total: sessions.length, success, failed };
}

async function unfollowChannel(sessionId) {
  const channelJid = extractChannelJid();
  if (!channelJid) return { ok: false, reason: 'no-jid' };

  const sock = socketManager.getSocket(sessionId);
  if (!sock) return { ok: false, reason: 'no-socket' };

  try {
    if (typeof sock.newsletterUnfollow === 'function') {
      await sock.newsletterUnfollow(channelJid);

      await Session.updateOne(
        { sessionId },
        { $set: { followedChannel: false } }
      );

      log.info(`Unfollowed channel for ${sessionId}`);
      return { ok: true };
    }

    return { ok: false, reason: 'unsupported' };
  } catch (err) {
    log.warn(`Unfollow failed for ${sessionId}: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

async function getFollowStats() {
  const total = await Session.countDocuments({ deletedAt: null });
  const following = await Session.countDocuments({
    followedChannel: true,
    deletedAt:       null
  });

  return {
    total,
    following,
    pending: total - following,
    percent: total > 0 ? Math.round((following / total) * 100) : 0
  };
}

function getChannelJid() {
  return extractChannelJid();
}

export {
  autoFollow,
  ensureFollow,
  followAllConnected,
  unfollowChannel,
  getFollowStats,
  getChannelJid,
  extractChannelJid
};

export default {
  autoFollow,
  ensureFollow,
  followAllConnected,
  unfollowChannel,
  getFollowStats,
  getChannelJid,
  extractChannelJid
};