import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import {
  Stats,
  Session,
  User,
  Account,
  Payment,
  CommandLog
} from '../database/index.js';
import socketManager from './socketManager.js';
import pairingFlow from './pairingFlow.js';

const log = logger.child('stats');

let flushTimer = null;
let startedAt = Date.now();

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getLiveSnapshot() {
  const [
    sessionsConnected,
    sessionsTotal,
    sessionsPremium,
    sessionsBanned,
    usersTotal,
    usersPremium,
    accountsTotal,
    pairingActive
  ] = await Promise.all([
    Session.countActive(),
    Session.countDocuments({ deletedAt: null }),
    Session.countPremium(),
    Session.countBanned(),
    User.countDocuments(),
    User.countPremium(),
    Account.countDocuments({ isActive: true }),
    Promise.resolve(pairingFlow.countActive())
  ]);

  return {
    sessions: {
      total:  sessionsTotal,
      active: sessionsConnected,
      premium: sessionsPremium,
      banned: sessionsBanned,
      pairing: pairingActive
    },
    users: {
      total: usersTotal,
      premium: usersPremium
    },
    accounts: {
      total: accountsTotal
    }
  };
}

async function flush() {
  if (!config.stats.enabled) return;

  const date = today();

  try {
    const stats = await Stats.todayOrCreate();
    const live = await getLiveSnapshot();

    stats.sessions.active = live.sessions.active;
    stats.sessions.total = live.sessions.total;
    stats.sessions.banned = live.sessions.banned;

    stats.users.total = live.users.total;
    stats.users.premium = live.users.premium;
    stats.accounts.total = live.accounts.total;

    stats.uptime.seconds = Math.floor((Date.now() - startedAt) / 1000);

    const commandsToday = await CommandLog.countSince(24 * 60 * 60 * 1000);
    stats.commands.total = commandsToday;

    const paymentsToday = await Payment.find({
      status: C.PAYMENT_STATE.completed,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    stats.payments.completed = paymentsToday.length;
    stats.payments.revenue = paymentsToday.reduce((sum, p) => sum + (p.amount || 0), 0);

    stats.markModified('sessions');
    stats.markModified('users');
    stats.markModified('accounts');
    stats.markModified('commands');
    stats.markModified('payments');
    stats.markModified('uptime');

    await stats.save();

    log.debug(`Flushed stats for ${date}`);
  } catch (err) {
    log.error('Flush failed:', err.message);
  }
}

function start() {
  if (flushTimer) return;

  startedAt = Date.now();

  flushTimer = setInterval(async () => {
    await flush();
  }, config.stats.flushInterval);

  log.info(`Stats flusher started — every ${config.stats.flushInterval / 1000}s`);

  flush().catch(() => {});
}

function stop() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
    log.info('Stats flusher stopped');
  }
}

async function getTodaySummary() {
  const stats = await Stats.todayOrCreate();
  const live = await getLiveSnapshot();

  return {
    date: stats.date,
    sessions: {
      ...stats.sessions.toObject?.() ?? stats.sessions,
      active: live.sessions.active
    },
    users: live.users,
    accounts: live.accounts,
    commands: stats.commands,
    payments: stats.payments,
    uptime: {
      seconds: Math.floor((Date.now() - startedAt) / 1000),
      startedAt
    },
    sockets: {
      active: socketManager.activeCount(),
      pairing: socketManager.pairingCount()
    }
  };
}

async function getLast7Days() {
  const rows = await Stats.lastDays(7);

  return rows.map((s) => ({
    date: s.date,
    sessions: {
      active: s.sessions.active,
      total: s.sessions.total
    },
    commands: s.commands.total,
    payments: s.payments.completed,
    revenue: s.payments.revenue,
    users: s.users.total
  }));
}

async function getLast30DaysRevenue() {
  return await Stats.sumRevenue(30);
}

async function getTopCommands(days = 7, limit = 10) {
  try {
    return await CommandLog.topCommands(days, limit);
  } catch (err) {
    log.error('Top commands failed:', err.message);
    return [];
  }
}

async function getTopCategories(days = 7) {
  try {
    return await CommandLog.topCategories(days);
  } catch (err) {
    log.error('Top categories failed:', err.message);
    return [];
  }
}

async function getRevenueReport(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await Payment.aggregate([
    {
      $match: {
        status: C.PAYMENT_STATE.completed,
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt'
          }
        },
        revenue: { $sum: '$amount' },
        count:   { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return result.map((r) => ({
    date: r._id,
    revenue: r.revenue,
    count: r.count
  }));
}

async function getDashboard() {
  const [
    today,
    last7,
    topCommands,
    topCategories,
    revenue30,
    socketCounts,
    statusCounts
  ] = await Promise.all([
    getTodaySummary(),
    getLast7Days(),
    getTopCommands(7, 5),
    getTopCategories(7),
    getLast30DaysRevenue(),
    Promise.resolve({
      active: socketManager.activeCount(),
      pairing: socketManager.pairingCount()
    }),
    Session.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  const byStatus = {};
  for (const state of Object.values(C.SESSION_STATE)) {
    byStatus[state] = 0;
  }
  for (const row of statusCounts) {
    byStatus[row._id] = row.count;
  }

  return {
    today,
    last7,
    topCommands,
    topCategories,
    revenue: {
      last30: revenue30[0] || { revenue: 0, count: 0 }
    },
    sockets: socketCounts,
    sessionsByStatus: byStatus,
    uptime: {
      seconds: Math.floor((Date.now() - startedAt) / 1000),
      startedAt
    }
  };
}

async function getHealth() {
  const today = await Stats.todayOrCreate();

  return {
    ok: true,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    sockets: {
      active: socketManager.activeCount(),
      pairing: socketManager.pairingCount()
    },
    pairingFlows: pairingFlow.countActive(),
    statsDate: today.date,
    flushInterval: config.stats.flushInterval
  };
}

async function forceFlush() {
  await flush();
  return getTodaySummary();
}

async function cleanupOld(days = config.stats.keepDays) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const result = await Stats.deleteMany({
      date: { $lt: cutoff }
    });

    if (result.deletedCount) {
      log.info(`Cleaned up ${result.deletedCount} old stats records`);
    }

    return result.deletedCount || 0;
  } catch (err) {
    log.error('Cleanup failed:', err.message);
    return 0;
  }
}

function uptime() {
  return Math.floor((Date.now() - startedAt) / 1000);
}

export {
  start,
  stop,
  flush,
  forceFlush,
  getTodaySummary,
  getLast7Days,
  getLast30DaysRevenue,
  getTopCommands,
  getTopCategories,
  getRevenueReport,
  getDashboard,
  getHealth,
  getLiveSnapshot,
  cleanupOld,
  uptime
};

export default {
  start,
  stop,
  flush,
  forceFlush,
  getTodaySummary,
  getLast7Days,
  getLast30DaysRevenue,
  getTopCommands,
  getTopCategories,
  getRevenueReport,
  getDashboard,
  getHealth,
  getLiveSnapshot,
  cleanupOld,
  uptime
};