import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { User, Session } from '../database/index.js';

const log = logger.child('tier');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isSuperOwner(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  if (phone === normalizePhone(config.owners.whatsapp.id)) return true;

  return (config.owners.whatsapp.co || []).some(
    (co) => normalizePhone(co.id) === phone
  );
}

function isCoOwner(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  return (config.owners.whatsapp.co || []).some(
    (co) => normalizePhone(co.id) === phone
  );
}

function isOwnerTelegram(telegramId) {
  const id = String(telegramId || '');
  if (!id) return false;
  return config.owners.telegram.includes(id);
}

async function isSessionOwner(phoneNumber, sessionId = null) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  try {
    if (sessionId) {
      const session = await Session.findOne({ sessionId, deletedAt: null });
      if (session) {
        return normalizePhone(session.phoneNumber) === phone;
      }
    }

    const exists = await Session.exists({
      phoneNumber: phone,
      deletedAt:   null
    });

    return !!exists;
  } catch (err) {
    log.error('isSessionOwner check failed:', err.message);
    return false;
  }
}

async function isPremiumUser(phoneNumber, sessionId = null) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  try {
    if (sessionId) {
      const session = await Session.findOne({ sessionId, deletedAt: null });
      if (session && session.isPremiumActive) return true;
    }

    const user = await User.findOne({ phoneNumber: phone });
    if (user && user.isPremiumActive) return true;

    const session = await Session.findOne({
      phoneNumber: phone,
      deletedAt:   null
    });

    return !!(session && session.isPremiumActive);
  } catch (err) {
    log.error('isPremiumUser check failed:', err.message);
    return false;
  }
}

async function getTier(phoneNumber, sessionId = null) {
  const phone = normalizePhone(phoneNumber);

  if (isSuperOwner(phone)) {
    return C.TIER.superOwner;
  }

  if (await isSessionOwner(phone, sessionId)) {
    return C.TIER.sessionOwner;
  }

  if (await isPremiumUser(phone, sessionId)) {
    return C.TIER.premiumUser;
  }

  return C.TIER.freeUser;
}

function getTierConfig(tier) {
  return config.tiers[tier] || config.tiers.freeUser;
}

function canBypassCoins(tier) {
  const t = getTierConfig(tier);
  return t.bypassCoins === true;
}

function canBypassPremium(tier) {
  const t = getTierConfig(tier);
  return t.bypassPremium === true;
}

function canBypassRateLimit(tier) {
  const t = getTierConfig(tier);
  return t.bypassRateLimit === true;
}

function canBypassForceJoin(tier) {
  const t = getTierConfig(tier);
  return t.bypassForceJoin === true;
}

function canRunOwnerCommands(tier) {
  const t = getTierConfig(tier);
  return t.canRunOwnerCmds === true;
}

function canAddPremium(tier) {
  const t = getTierConfig(tier);
  return t.canAddPremium === true;
}

function canAddCoin(tier) {
  const t = getTierConfig(tier);
  return t.canAddCoin === true;
}

function canBroadcast(tier) {
  const t = getTierConfig(tier);
  return t.canBroadcast === true;
}

function canAccessAdmin(tier) {
  const t = getTierConfig(tier);
  return t.canAccessAdmin === true;
}

function canKillSessions(tier) {
  const t = getTierConfig(tier);
  return t.canKillSessions === true;
}

function canRestart(tier) {
  const t = getTierConfig(tier);
  return t.canRestart === true;
}

function canEval(tier) {
  const t = getTierConfig(tier);
  return t.canEval === true;
}

function tierRank(tier) {
  const ranks = {
    [C.TIER.superOwner]:   4,
    [C.TIER.sessionOwner]: 3,
    [C.TIER.premiumUser]:  2,
    [C.TIER.freeUser]:     1
  };
  return ranks[tier] || 0;
}

function isAtLeast(tier, minimum) {
  return tierRank(tier) >= tierRank(minimum);
}

async function getTierLabel(phoneNumber, sessionId = null) {
  const tier = await getTier(phoneNumber, sessionId);
  return C.TIER_LABEL[tier] || tier;
}

async function getPrivilegeSummary(phoneNumber, sessionId = null) {
  const tier = await getTier(phoneNumber, sessionId);

  return {
    tier,
    label:            C.TIER_LABEL[tier] || tier,
    isSuperOwner:     tier === C.TIER.superOwner,
    isCoOwner:        tier === C.TIER.superOwner && isCoOwner(phoneNumber),
    isSessionOwner:   tier === C.TIER.sessionOwner,
    isPremium:        tier === C.TIER.premiumUser || tier === C.TIER.superOwner,
    bypassCoins:      canBypassCoins(tier),
    bypassPremium:    canBypassPremium(tier),
    bypassRateLimit:  canBypassRateLimit(tier),
    bypassForceJoin:  canBypassForceJoin(tier),
    canRunOwnerCmds:  canRunOwnerCommands(tier),
    canAddPremium:    canAddPremium(tier),
    canAddCoin:       canAddCoin(tier),
    canBroadcast:     canBroadcast(tier),
    canAccessAdmin:   canAccessAdmin(tier),
    canKillSessions:  canKillSessions(tier),
    canRestart:       canRestart(tier),
    canEval:          canEval(tier)
  };
}

export {
  normalizePhone,
  isSuperOwner,
  isCoOwner,
  isOwnerTelegram,
  isSessionOwner,
  isPremiumUser,

  getTier,
  getTierConfig,
  getTierLabel,
  getPrivilegeSummary,

  canBypassCoins,
  canBypassPremium,
  canBypassRateLimit,
  canBypassForceJoin,
  canRunOwnerCommands,
  canAddPremium,
  canAddCoin,
  canBroadcast,
  canAccessAdmin,
  canKillSessions,
  canRestart,
  canEval,

  tierRank,
  isAtLeast
};

export default {
  normalizePhone,
  isSuperOwner,
  isCoOwner,
  isOwnerTelegram,
  isSessionOwner,
  isPremiumUser,
  getTier,
  getTierConfig,
  getTierLabel,
  getPrivilegeSummary,
  canBypassCoins,
  canBypassPremium,
  canBypassRateLimit,
  canBypassForceJoin,
  canRunOwnerCommands,
  canAddPremium,
  canAddCoin,
  canBroadcast,
  canAccessAdmin,
  canKillSessions,
  canRestart,
  canEval,
  tierRank,
  isAtLeast
};