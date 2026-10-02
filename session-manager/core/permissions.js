import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { User, Session } from '../database/index.js';

import {
  getTier,
  getTierConfig,
  canBypassRateLimit,
  canBypassPremium,
  canRunOwnerCommands,
  isAtLeast
} from './tier.js';

import { canRun as canRunWithCoins } from './coins.js';
import { normalizePhone } from './tier.js';

const log = logger.child('permissions');

function isGroup(chatId) {
  return String(chatId || '').endsWith('@g.us');
}

function isPrivate(chatId) {
  return String(chatId || '').endsWith('@s.whatsapp.net');
}

function isStatus(chatId) {
  return String(chatId || '') === 'status@broadcast';
}

function getChatType(chatId) {
  if (isGroup(chatId))  return C.CHAT_TYPE.group;
  if (isStatus(chatId)) return C.CHAT_TYPE.status;
  if (isPrivate(chatId)) return C.CHAT_TYPE.private;
  return C.CHAT_TYPE.private;
}

async function checkRateLimit(phoneNumber, tier) {
  if (canBypassRateLimit(tier)) {
    return { allowed: true, reason: 'bypass' };
  }

  const phone = normalizePhone(phoneNumber);
  if (!phone) return { allowed: true };

  try {
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return { allowed: true };

    const result = user.checkRateLimit();

    if (!result.allowed) {
      return {
        allowed: false,
        reason:  'rate-limit',
        resetIn: result.resetIn
      };
    }

    return { allowed: true };
  } catch (err) {
    log.error('rate limit check failed:', err.message);
    return { allowed: true };
  }
}

async function isBlocked(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  try {
    const user = await User.findOne({
      phoneNumber: phone,
      $or: [{ isBlocked: true }, { isBanned: true }]
    });
    return !!user;
  } catch {
    return false;
  }
}

async function checkPermissions({
  command,
  senderNumber,
  chatId,
  sessionId = null,
  isBotOwner = false
}) {
  const commandName        = command?.name || '';
  const commandPermissions = command?.permissions || {};

  const chatType = getChatType(chatId);

  if (await isBlocked(senderNumber)) {
    return {
      allowed: false,
      reason:  'blocked',
      tier:    C.TIER.freeUser
    };
  }

  const tier = await getTier(senderNumber, sessionId);
  const tierCfg = getTierConfig(tier);

  if (commandPermissions.group === true && !isGroup(chatId)) {
    return { allowed: false, reason: 'group-only', tier };
  }

  if (commandPermissions.private === true && !isPrivate(chatId)) {
    return { allowed: false, reason: 'private-only', tier };
  }

  if (commandPermissions.owner === true && !canRunOwnerCommands(tier)) {
    return { allowed: false, reason: 'owner-only', tier };
  }

  if (commandPermissions.admin === true) {
    if (!tierCfg.canAccessAdmin && !tierCfg.canRunOwnerCmds) {
      return { allowed: false, reason: 'admin-only', tier };
    }
  }

  if (commandPermissions.premium === true && !canBypassPremium(tier)) {
    const isPrem = isAtLeast(tier, C.TIER.premiumUser);
    if (!isPrem) {
      return { allowed: false, reason: 'premium-only', tier };
    }
  }

  const rate = await checkRateLimit(senderNumber, tier);
  if (!rate.allowed) {
    return {
      allowed: false,
      reason:  rate.reason,
      resetIn: rate.resetIn,
      tier
    };
  }

  const coins = await canRunWithCoins(
    senderNumber,
    commandName,
    commandPermissions,
    tier
  );

  if (!coins.allowed) {
    return {
      allowed: false,
      reason:  'insufficient-coins',
      cost:    coins.cost,
      balance: coins.balance,
      short:   coins.short,
      tier
    };
  }

  return {
    allowed: true,
    reason:  'ok',
    tier,
    cost:    coins.cost,
    balance: coins.balance
  };
}

async function checkMultiple({
  commands = [],
  senderNumber,
  chatId,
  sessionId = null
}) {
  const results = {};

  for (const cmd of commands) {
    results[cmd.name] = await checkPermissions({
      command: cmd,
      senderNumber,
      chatId,
      sessionId
    });
  }

  return results;
}

function deniedReason(reason, extra = {}) {
  switch (reason) {
    case 'blocked':
      return 'You are blocked from using this bot.';
    case 'owner-only':
      return 'This command is for owners only.';
    case 'admin-only':
      return 'This command is for admins only.';
    case 'premium-only':
      return 'Premium feature. Upgrade to unlock.';
    case 'group-only':
      return 'This command only works in groups.';
    case 'private-only':
      return 'This command only works in private chats.';
    case 'rate-limit':
      return `Too many requests. Wait ${extra.resetIn || 60}s.`;
    case 'insufficient-coins':
      return `Need ${extra.cost || 0} coins. Balance: ${extra.balance || 0}.`;
    default:
      return 'You do not have permission to use this command.';
  }
}

async function getSenderContext(phoneNumber, sessionId = null) {
  const phone = normalizePhone(phoneNumber);
  const tier  = await getTier(phone, sessionId);
  const tierCfg = getTierConfig(tier);

  return {
    tier,
    label: tierCfg.name || C.TIER_LABEL[tier],
    isOwner:      tier === C.TIER.superOwner,
    isSessionOwner: tier === C.TIER.sessionOwner,
    isPremium:    isAtLeast(tier, C.TIER.premiumUser),
    bypassCoins:  tierCfg.bypassCoins,
    bypassRate:   tierCfg.bypassRateLimit,
    bypassPremium: tierCfg.bypassPremium
  };
}

export {
  checkPermissions,
  checkMultiple,
  deniedReason,
  getSenderContext,
  getChatType,
  isGroup,
  isPrivate,
  isStatus,
  isBlocked
};

export default {
  checkPermissions,
  checkMultiple,
  deniedReason,
  getSenderContext,
  getChatType,
  isGroup,
  isPrivate,
  isStatus,
  isBlocked
};