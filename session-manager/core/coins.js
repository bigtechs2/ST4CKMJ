import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { User } from '../database/index.js';
import { normalizePhone, canBypassCoins } from './tier.js';

const log = logger.child('coins');

function getCommandCost(commandName, commandPermissions = {}) {
  if (!config.coins.enabled) return 0;

  if (commandPermissions && typeof commandPermissions.coin === 'number') {
    return Math.max(0, commandPermissions.coin);
  }

  const fromConfig = config.coins.cost[commandName];
  if (typeof fromConfig === 'number') return Math.max(0, fromConfig);

  return 0;
}

function isFreeCommand(commandName) {
  if (!commandName) return false;
  return config.coins.freeCommands.includes(commandName);
}

async function getBalance(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return 0;

  try {
    const user = await User.findOne({ phoneNumber: phone });
    return user ? user.coins : config.coins.startingBalance;
  } catch (err) {
    log.error('getBalance failed:', err.message);
    return 0;
  }
}

async function hasEnough(phoneNumber, amount) {
  if (!config.coins.enabled) return true;

  const balance = await getBalance(phoneNumber);
  return balance >= Number(amount || 0);
}

async function canRun(phoneNumber, commandName, commandPermissions = {}, tier = null) {
  if (!config.coins.enabled) {
    return { allowed: true, cost: 0, balance: 0, reason: 'coins-disabled' };
  }

  if (tier && canBypassCoins(tier)) {
    const balance = await getBalance(phoneNumber);
    return { allowed: true, cost: 0, balance, reason: 'bypass' };
  }

  const cost = getCommandCost(commandName, commandPermissions);

  if (cost === 0) {
    const balance = await getBalance(phoneNumber);
    return { allowed: true, cost: 0, balance, reason: 'free' };
  }

  const balance = await getBalance(phoneNumber);

  if (balance < cost) {
    return {
      allowed: false,
      cost,
      balance,
      short:  cost - balance,
      reason: 'insufficient'
    };
  }

  return { allowed: true, cost, balance, reason: 'ok' };
}

async function charge(phoneNumber, amount, reason = '') {
  if (!config.coins.enabled) return { ok: true, skipped: true };

  const n = Math.max(0, Number(amount) || 0);
  if (n === 0) return { ok: true, skipped: true };

  const phone = normalizePhone(phoneNumber);
  if (!phone) return { ok: false, reason: 'invalid-phone' };

  try {
    const user = await User.findOne({ phoneNumber: phone });

    if (!user) {
      return { ok: false, reason: 'user-not-found' };
    }

    if (user.coins < n) {
      return {
        ok:      false,
        reason:  'insufficient',
        balance: user.coins,
        needed:  n
      };
    }

    await user.spendCoins(n, reason);

    log.event('coins.charged', {
      phone,
      amount: n,
      reason,
      balance: user.coins
    });

    return {
      ok:      true,
      charged: n,
      balance: user.coins
    };

  } catch (err) {
    log.error('charge failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

async function credit(phoneNumber, amount, reason = '') {
  const n = Math.max(0, Number(amount) || 0);
  if (n === 0) return { ok: true, skipped: true };

  const phone = normalizePhone(phoneNumber);
  if (!phone) return { ok: false, reason: 'invalid-phone' };

  try {
    const user = await User.findOne({ phoneNumber: phone });

    if (!user) {
      return { ok: false, reason: 'user-not-found' };
    }

    await user.addCoins(n, reason);

    log.event('coins.credited', {
      phone,
      amount: n,
      reason,
      balance: user.coins
    });

    return {
      ok:      true,
      credited: n,
      balance: user.coins
    };

  } catch (err) {
    log.error('credit failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

async function claimDaily(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return { ok: false, reason: 'invalid-phone' };

  try {
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return { ok: false, reason: 'user-not-found' };

    if (!user.canClaimDailyBonus()) {
      return {
        ok:       false,
        reason:   'already-claimed',
        lastClaim: user.lastDailyBonus
      };
    }

    const result = user.claimDailyBonus();

    if (!result) {
      return { ok: false, reason: 'already-claimed' };
    }

    log.event('coins.daily', {
      phone,
      coins:  result.coins,
      streak: result.streak
    });

    return {
      ok:     true,
      coins:  result.coins,
      streak: result.streak,
      balance: user.coins
    };

  } catch (err) {
    log.error('claimDaily failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

async function canClaimDaily(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  try {
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return false;
    return user.canClaimDailyBonus();
  } catch {
    return false;
  }
}

async function getStats(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;

  try {
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return null;

    return {
      balance:          user.coins,
      totalEarned:      user.totalCoinsEarned,
      totalSpent:       user.totalCoinsSpent,
      dailyStreak:      user.dailyStreak,
      lastDailyBonus:   user.lastDailyBonus,
      canClaimDaily:    user.canClaimDailyBonus(),
      recentHistory:    (user.metadata?.coinHistory || []).slice(-10).reverse()
    };
  } catch (err) {
    log.error('getStats failed:', err.message);
    return null;
  }
}

function formatCost(commandName, commandPermissions = {}) {
  const cost = getCommandCost(commandName, commandPermissions);

  if (cost === 0) return 'free';
  return `${cost} coins`;
}

function getCostList() {
  return Object.entries(config.coins.cost).map(([cmd, cost]) => ({
    command: cmd,
    cost
  }));
}

export {
  getCommandCost,
  isFreeCommand,
  getBalance,
  hasEnough,
  canRun,
  charge,
  credit,
  claimDaily,
  canClaimDaily,
  getStats,
  formatCost,
  getCostList
};

export default {
  getCommandCost,
  isFreeCommand,
  getBalance,
  hasEnough,
  canRun,
  charge,
  credit,
  claimDaily,
  canClaimDaily,
  getStats,
  formatCost,
  getCostList
};