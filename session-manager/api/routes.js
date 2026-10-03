import express from 'express';

import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';
import { Session, SessionConfig, User, Stats } from '../database/index.js';

import socketManager from '../core/socketManager.js';
import sessionLoader from '../core/sessionLoader.js';
import pairingFlow from '../core/pairingFlow.js';
import autoFollow from '../core/autoFollow.js';
import stats from '../core/stats.js';
import tier from '../core/tier.js';
import coins from '../core/coins.js';
import commandLoader from '../core/commandLoader.js';

import { asyncHandler, badRequest, notFound } from './middleware/errorHandler.js';

const log = logger.child('apiRoutes');

const router = express.Router();

function ok(res, data = {}) {
  return res.status(C.HTTP.ok).json({ ok: true, ...data });
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || v === '';
  });

  if (missing.length) {
    throw badRequest(`Missing fields: ${missing.join(', ')}`);
  }
}

function normalizePhone(input) {
  return String(input || '').replace(/\D/g, '');
}

router.get(
  config.api.routes.health,
  asyncHandler(async (req, res) => {
    const health = await stats.getHealth();

    return ok(res, {
      service:  C.PROCESS.sessionManager,
      uptime:   health.uptime,
      sockets:  health.sockets,
      pairing:  health.pairingFlows,
      date:     health.statsDate
    });
  })
);

router.get(
  config.api.routes.stats,
  asyncHandler(async (req, res) => {
    const summary = await stats.getTodaySummary();
    return ok(res, { stats: summary });
  })
);

router.get(
  '/stats/dashboard',
  asyncHandler(async (req, res) => {
    const dashboard = await stats.getDashboard();
    return ok(res, { dashboard });
  })
);

router.get(
  '/stats/revenue',
  asyncHandler(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const rows = await stats.getRevenueReport(days);
    const total = await stats.getLast30DaysRevenue();

    return ok(res, {
      days,
      rows,
      total: total[0] || { revenue: 0, count: 0 }
    });
  })
);

router.get(
  '/stats/commands',
  asyncHandler(async (req, res) => {
    const days  = Math.min(Number(req.query.days) || 7, 90);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const top    = await stats.getTopCommands(days, limit);
    const cats   = await stats.getTopCategories(days);

    return ok(res, { days, top, categories: cats });
  })
);

router.get(
  '/stats/commands-meta',
  asyncHandler(async (req, res) => {
    const meta = commandLoader.stats();
    return ok(res, { commands: meta });
  })
);

router.post(
  config.api.routes.pair,
  asyncHandler(async (req, res) => {
    const {
      phoneNumber,
      userName,
      source = C.SOURCE.website,
      accountId = null,
      label = ''
    } = req.body || {};

    requireFields(req.body, ['phoneNumber']);

    const clean = normalizePhone(phoneNumber);

    const result = await pairingFlow.begin({
      phoneNumber: clean,
      userName:    userName || 'User',
      source,
      accountId,
      label
    });

    log.event('api.pair', {
      phone:  clean,
      source,
      isNew:  result.isNew
    });

    return ok(res, {
      sessionId:    result.sessionId,
      code:         result.code,
      isNew:        result.isNew,
      expiresIn:    result.expiresIn,
      refreshEvery: result.refreshEvery
    });
  })
);

router.post(
  '/pair/cancel',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body || {};
    requireFields(req.body, ['sessionId']);

    const result = await pairingFlow.cancel(sessionId, 'api-cancel');

    if (!result.ok) {
      throw notFound('Pairing not found');
    }

    return ok(res, { cancelled: true, sessionId });
  })
);

router.post(
  `${config.api.routes.refresh}/:sessionId`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const result = await pairingFlow.forceRefresh(sessionId);

    log.event('api.refresh', { sessionId, count: result.refreshCount });

    return ok(res, {
      code:         result.code,
      expiresIn:    result.expiresIn,
      refreshCount: result.refreshCount
    });
  })
);

router.get(
  `${config.api.routes.session}/:sessionId`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const summary = await sessionLoader.getSessionSummary(sessionId);

    if (!summary) throw notFound('Session not found');

    return ok(res, { session: summary });
  })
);

router.delete(
  `${config.api.routes.session}/:sessionId`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const wipeAuth = req.query.wipeAuth !== 'false';

    const session = await Session.findOne({ sessionId, deletedAt: null });
    if (!session) throw notFound('Session not found');

    await socketManager.deleteSession(sessionId, { wipeAuth, soft: false });

    log.event('api.session.delete', {
      sessionId,
      phone: session.phoneNumber
    });

    return ok(res, { deleted: true, sessionId });
  })
);

router.post(
  `${config.api.routes.session}/:sessionId/reconnect`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const sock = await sessionLoader.refreshSession(sessionId);

    if (!sock) throw badRequest('Cannot reconnect this session');

    return ok(res, { reconnected: true, sessionId });
  })
);

router.post(
  `${config.api.routes.session}/:sessionId/follow`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const force = req.body?.force === true;

    const result = await autoFollow.autoFollow(sessionId, { force });

    return ok(res, {
      sessionId,
      followed: result.ok,
      reason:   result.reason || 'ok'
    });
  })
);

router.post(
  `${config.api.routes.session}/:sessionId/premium`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { days = config.payment.premiumDurationDays, source = 'manual' } = req.body || {};

    const session = await Session.findOne({ sessionId, deletedAt: null });
    if (!session) throw notFound('Session not found');

    await session.grantPremium(Number(days), source);

    return ok(res, {
      sessionId,
      premium: true,
      until: session.premiumUntil,
      days:  Number(days)
    });
  })
);

router.delete(
  `${config.api.routes.session}/:sessionId/premium`,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await Session.findOne({ sessionId, deletedAt: null });
    if (!session) throw notFound('Session not found');

    await session.revokePremium();

    return ok(res, { sessionId, premium: false });
  })
);

router.get(
  config.api.routes.sessions,
  asyncHandler(async (req, res) => {
    const {
      status,
      source,
      premium,
      accountId,
      limit = 100,
      skip  = 0,
      sort  = 'createdAt',
      order = 'desc'
    } = req.query;

    const query = { deletedAt: null };

    if (status) query.status = status;
    if (source) query.source = source;
    if (premium === 'true' || premium === 'false') {
      query.premium = premium === 'true';
    }
    if (accountId) query.accountId = accountId;

    const sortDir = order === 'asc' ? 1 : -1;
    const maxLimit = Math.min(Number(limit) || 100, 500);

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .sort({ [sort]: sortDir })
        .skip(Number(skip) || 0)
        .limit(maxLimit),
      Session.countDocuments(query)
    ]);

    const list = sessions.map((s) => ({
      sessionId:      s.sessionId,
      userName:       s.userName,
      phoneNumber:    s.phoneNumber,
      label:          s.label,
      source:         s.source,
      status:         s.status,
      premium:        s.isPremiumActive,
      premiumUntil:   s.premiumUntil,
      followedChannel: s.followedChannel,
      pairedAt:       s.pairedAt,
      lastSeen:       s.lastSeen,
      lastSeenReason: s.lastSeenReason,
      totalCommands:  s.totalCommands,
      isActive:       socketManager.isActive(s.sessionId)
    }));

    return ok(res, {
      total,
      limit:  maxLimit,
      skip:   Number(skip) || 0,
      sessions: list
    });
  })
);

router.get(
  '/sessions/status-counts',
  asyncHandler(async (req, res) => {
    const counts = await sessionLoader.countByStatus();
    const source = await sessionLoader.countBySource();

    return ok(res, { byStatus: counts, bySource: source });
  })
);

router.get(
  '/sessions/pending',
  asyncHandler(async (req, res) => {
    const pending = await sessionLoader.getPendingSessions();

    return ok(res, {
      total: pending.length,
      sessions: pending.map((s) => ({
        sessionId:   s.sessionId,
        userName:    s.userName,
        phoneNumber: s.phoneNumber,
        source:      s.source,
        createdAt:   s.createdAt
      }))
    });
  })
);

router.get(
  '/sessions/banned',
  asyncHandler(async (req, res) => {
    const banned = await sessionLoader.getBannedSessions();

    return ok(res, {
      total: banned.length,
      sessions: banned.map((s) => ({
        sessionId:   s.sessionId,
        userName:    s.userName,
        phoneNumber: s.phoneNumber,
        bannedAt:    s.bannedAt,
        reason:      s.bannedReason
      }))
    });
  })
);

router.get(
  '/pairing/active',
  asyncHandler(async (req, res) => {
    const list = pairingFlow.listActive();
    return ok(res, { total: list.length, pairings: list });
  })
);

router.get(
  '/sockets/active',
  asyncHandler(async (req, res) => {
    const list = socketManager.listActive();
    return ok(res, { total: list.length, sockets: list });
  })
);

router.get(
  '/account/:accountId/sessions',
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;

    const sessions = await sessionLoader.getSessionsForAccount(accountId);

    return ok(res, {
      accountId,
      total: sessions.length,
      sessions: sessions.map((s) => ({
        sessionId:   s.sessionId,
        userName:    s.userName,
        phoneNumber: s.phoneNumber,
        label:       s.label,
        status:      s.status,
        premium:     s.isPremiumActive,
        pairedAt:    s.pairedAt,
        lastSeen:    s.lastSeen
      }))
    });
  })
);

router.get(
  '/tier/:phoneNumber',
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.params;
    const { sessionId = null } = req.query;

    const summary = await tier.getPrivilegeSummary(phoneNumber, sessionId);
    const balance = await coins.getBalance(phoneNumber);

    return ok(res, {
      phoneNumber: normalizePhone(phoneNumber),
      ...summary,
      coins: balance
    });
  })
);

router.post(
  '/coins/credit',
  asyncHandler(async (req, res) => {
    const { phoneNumber, amount, reason = 'api' } = req.body || {};

    requireFields(req.body, ['phoneNumber', 'amount']);

    const result = await coins.credit(phoneNumber, Number(amount), reason);

    if (!result.ok) throw badRequest(result.reason || 'Credit failed');

    return ok(res, result);
  })
);

router.post(
  '/coins/debit',
  asyncHandler(async (req, res) => {
    const { phoneNumber, amount, reason = 'api' } = req.body || {};

    requireFields(req.body, ['phoneNumber', 'amount']);

    const result = await coins.charge(phoneNumber, Number(amount), reason);

    if (!result.ok) throw badRequest(result.reason || 'Debit failed');

    return ok(res, result);
  })
);

router.post(
  '/commands/reload',
  asyncHandler(async (req, res) => {
    const result = await commandLoader.reload();
    const meta   = commandLoader.stats();

    log.event('api.commands.reload', { total: meta.total });

    return ok(res, { reloaded: true, commands: meta });
  })
);

router.post(
  '/stats/flush',
  asyncHandler(async (req, res) => {
    const snapshot = await stats.forceFlush();
    return ok(res, { flushed: true, snapshot });
  })
);

router.post(
  '/reconnect-all',
  asyncHandler(async (req, res) => {
    const result = await socketManager.reconnectAll();

    return ok(res, {
      reconnected: result.success,
      failed:      result.failed,
      total:       result.total
    });
  })
);

router.post(
  '/cleanup',
  asyncHandler(async (req, res) => {
    const deletedSessions = await sessionLoader.cleanupDeleted();
    const deletedStats    = await stats.cleanupOld();

    return ok(res, {
      sessionsRemoved: deletedSessions,
      statsRemoved:    deletedStats
    });
  })
);

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    return ok(res, {
      brand: {
        name:    config.brand.BOT_NAME,
        version: config.brand.BOT_VERSION,
        tagline: config.brand.BOT_TAGLINE
      },
      prefixes:    config.prefixes,
      features:    config.features,
      plans:       config.plans,
      limits:      config.limits,
      categories:  config.categories,
      ports:       config.ports
    });
  })
);

export default router;