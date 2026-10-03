import crypto from 'crypto';

import config from '../../config.js';
import C from '../../../shared/constants.js';
import logger from '../../../shared/logger.js';

const log = logger.child('internalKey');

const HEADER = C.API.internalHeader;
const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));

  if (bufA.length !== bufB.length) return false;

  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function getClientIp(req) {
  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    ''
  );
}

function isLocalRequest(req) {
  const ip = getClientIp(req);
  if (!ip) return false;
  if (LOCAL_IPS.has(ip)) return true;
  if (ip.startsWith('::ffff:127.')) return true;
  return false;
}

function reject(res, reason, code = C.HTTP.unauthorized) {
  return res.status(code).json({
    ok:     false,
    error:  reason,
    code
  });
}

function internalKeyMiddleware(req, res, next) {
  const provided = req.headers[HEADER] || req.headers[HEADER.toLowerCase()];

  if (!config.internalKey) {
    log.error('INTERNAL_KEY not set — rejecting all requests');
    return reject(res, 'Server misconfigured', C.HTTP.internalServerError);
  }

  if (!provided) {
    const ip = getClientIp(req);

    if (!isLocalRequest(req)) {
      log.warn(`Missing key from non-local IP: ${ip} → ${req.method} ${req.originalUrl}`);
    }

    return reject(res, 'Missing internal key');
  }

  if (!safeCompare(provided, config.internalKey)) {
    log.warn(`Invalid key attempt from ${getClientIp(req)} → ${req.method} ${req.originalUrl}`);
    return reject(res, 'Invalid internal key');
  }

  req.isInternal = true;
  return next();
}

export {
  internalKeyMiddleware,
  safeCompare,
  isLocalRequest,
  getClientIp
};

export default internalKeyMiddleware;