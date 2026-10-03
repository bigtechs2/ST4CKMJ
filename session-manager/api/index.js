import express from 'express';

import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';

import { internalKeyMiddleware } from './middleware/internalKey.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes.js';

const log = logger.child('api');

let server = null;
let startedAt = null;

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'debug';

    const msg = `${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`;

    if (level === 'error') log.error(msg);
    else if (level === 'warn') log.warn(msg);
    else log.debug(msg);
  });

  next();
}

function applyCors(req, res, next) {
  res.setHeader('X-Powered-By', 'MINIST4CK');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function buildApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(applyCors);
  app.use(requestLogger);

  app.use(config.api.prefix, internalKeyMiddleware, routes);

  app.get('/', (_req, res) => {
    res.json({
      ok:      true,
      service: C.PROCESS.sessionManager,
      version: config.brand.BOT_VERSION
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function start({ port = config.port, host = config.host } = {}) {
  if (server) {
    log.warn('API already running');
    return server;
  }

  const app = buildApp();

  return new Promise((resolve, reject) => {
    try {
      server = app.listen(port, host, () => {
        startedAt = Date.now();

        log.ready(`Internal API listening on http://${host}:${port}`);
        log.info(`Guard: header "${C.API.internalHeader}"`);

        if (host !== '127.0.0.1' && host !== 'localhost') {
          log.warn(`API bound to ${host} — make sure firewall blocks external access`);
        }

        resolve(server);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          log.error(`Port ${port} is already in use`);
        } else {
          log.error('Server error:', err.message);
        }
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function stop() {
  if (!server) return;

  return new Promise((resolve) => {
    server.close(() => {
      log.info('Internal API stopped');
      server = null;
      startedAt = null;
      resolve();
    });

    setTimeout(() => {
      log.warn('Forcing API close after timeout');
      server = null;
      startedAt = null;
      resolve();
    }, 5000);
  });
}

function getServer() {
  return server;
}

function isRunning() {
  return server !== null && server.listening === true;
}

function uptime() {
  if (!startedAt) return 0;
  return Math.floor((Date.now() - startedAt) / 1000);
}

export {
  start,
  stop,
  getServer,
  isRunning,
  uptime,
  buildApp
};

export default {
  start,
  stop,
  getServer,
  isRunning,
  uptime
};