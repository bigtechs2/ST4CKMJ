import C from '../../../shared/constants.js';
import logger from '../../../shared/logger.js';

const log = logger.child('apiError');

const ERROR_MAP = {
  INVALID_NUMBER:      { status: C.HTTP.badRequest,    message: 'Invalid phone number' },
  ALREADY_PAIRED:      { status: C.HTTP.badRequest,    message: 'Number is already paired' },
  COOLDOWN:            { status: C.HTTP.tooManyRequests, message: 'Please wait before requesting again' },
  NO_SESSION:          { status: C.HTTP.notFound,      message: 'Session not found' },
  SESSION_NOT_FOUND:   { status: C.HTTP.notFound,      message: 'Session not found' },
  NO_ACTIVE_PAIRING:   { status: C.HTTP.badRequest,    message: 'No active pairing to refresh' },
  PAIRING_NOT_ACTIVE:  { status: C.HTTP.badRequest,    message: 'Pairing is not active' },
  ALREADY_REGISTERED:  { status: C.HTTP.badRequest,    message: 'Session is already registered' },
  MISSING_PHONE:       { status: C.HTTP.badRequest,    message: 'Phone number is required' },
  NO_SOCKET:           { status: C.HTTP.badRequest,    message: 'No active socket for this session' },
  NO_CHANNEL_JID:      { status: C.HTTP.badRequest,    message: 'Channel JID not configured' },
  UNAUTHORIZED:        { status: C.HTTP.unauthorized,  message: 'Unauthorized' },
  FORBIDDEN:           { status: C.HTTP.forbidden,     message: 'Forbidden' },
  NOT_FOUND:           { status: C.HTTP.notFound,      message: 'Not found' },
  RATE_LIMITED:        { status: C.HTTP.tooManyRequests, message: 'Too many requests' }
};

function classifyError(err) {
  const raw = String(err?.message || '').trim();

  if (ERROR_MAP[raw]) return ERROR_MAP[raw];

  const upper = raw.toUpperCase();

  if (upper.includes('ALREADY_PAIRED')) {
    return ERROR_MAP.ALREADY_PAIRED;
  }
  if (upper.includes('COOLDOWN')) {
    return ERROR_MAP.COOLDOWN;
  }
  if (upper.includes('INVALID') && upper.includes('NUMBER')) {
    return ERROR_MAP.INVALID_NUMBER;
  }
  if (upper.includes('NOT_FOUND') || upper.includes('NOT FOUND')) {
    return ERROR_MAP.NOT_FOUND;
  }
  if (upper.includes('UNAUTHORIZED')) {
    return ERROR_MAP.UNAUTHORIZED;
  }
  if (upper.includes('FORBIDDEN')) {
    return ERROR_MAP.FORBIDDEN;
  }

  return { status: C.HTTP.internalServerError, message: 'Something went wrong' };
}

function buildErrorResponse(err) {
  const mapped = classifyError(err);

  const body = {
    ok:     false,
    error:  mapped.message,
    code:   mapped.status
  };

  if (err.seconds) body.seconds = err.seconds;

  return { status: mapped.status, body };
}

function notFoundHandler(req, res) {
  return res.status(C.HTTP.notFound).json({
    ok:    false,
    error: 'Endpoint not found',
    code:  C.HTTP.notFound,
    path:  req.originalUrl,
    method: req.method
  });
}

function errorHandler(err, req, res, _next) {
  const { status, body } = buildErrorResponse(err);

  const meta = {
    method: req.method,
    path:   req.originalUrl,
    status,
    message: err.message
  };

  if (status >= 500) {
    log.error(`${req.method} ${req.originalUrl} → ${status}`, err.message);
    if (err.stack && process.env.NODE_ENV !== 'production') {
      body.stack = err.stack.split('\n').slice(0, 5);
    }
  } else {
    log.warn(`${req.method} ${req.originalUrl} → ${status} (${err.message})`);
  }

  if (res.headersSent) {
    return;
  }

  return res.status(status).json(body);
}

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function createError(code, message = null) {
  const known = ERROR_MAP[code];
  const err = new Error(message || known?.message || code);
  err.code = code;
  err.statusCode = known?.status || C.HTTP.internalServerError;
  return err;
}

function badRequest(message = 'Bad request') {
  const err = new Error(message);
  err.statusCode = C.HTTP.badRequest;
  return err;
}

function unauthorized(message = 'Unauthorized') {
  const err = new Error(message);
  err.statusCode = C.HTTP.unauthorized;
  return err;
}

function notFound(message = 'Not found') {
  const err = new Error(message);
  err.statusCode = C.HTTP.notFound;
  return err;
}

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createError,
  badRequest,
  unauthorized,
  notFound,
  classifyError,
  buildErrorResponse,
  ERROR_MAP
};

export default errorHandler;