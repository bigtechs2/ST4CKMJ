#!/usr/bin/env node

import 'dotenv/config';

import mongoose from 'mongoose';

import config from './config.js';
import C from '../shared/constants.js';
import brand from '../shared/brand.js';
import logger from '../shared/logger.js';

import db from './database/index.js';
import socketManager from './core/socketManager.js';
import sessionLoader from './core/sessionLoader.js';
import pairingFlow from './core/pairingFlow.js';
import autoFollow from './core/autoFollow.js';
import commandLoader from './core/commandLoader.js';
import stats from './core/stats.js';

import api from './api/index.js';

const log = logger.child('main');

const BANNER = `
   ███╗   ███╗██╗███╗   ██╗██╗███████╗████████╗██╗  ██╗
   ████╗ ████║██║████╗  ██║██║██╔════╝╚══██╔══╝██║  ██║
   ██╔████╔██║██║██╔██╗ ██║██║███████╗   ██║   ███████║
   ██║╚██╔╝██║██║██║╚██╗██║██║╚════██║   ██║   ╚════██║
   ██║ ╚═╝ ██║██║██║ ╚████║██║███████║   ██║        ██║
   ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝╚══════╝   ╚═╝        ╚═╝
`;

const COLORS = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  bCyan:   '\x1b[96m',
  white:   '\x1b[37m',
  bWhite:  '\x1b[97m',
  grey:    '\x1b[90m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m'
};

function printBanner() {
  const line = '─'.repeat(68);

  console.log('');
  console.log(`${COLORS.grey}${line}${COLORS.reset}`);
  console.log(`${COLORS.bCyan}${COLORS.bold}${BANNER}${COLORS.reset}`);
  console.log(`${COLORS.grey}${line}${COLORS.reset}`);
  console.log(
    `  ${COLORS.bWhite}${COLORS.bold}${brand.BOT_NAME}${COLORS.reset}` +
    `  ${COLORS.grey}·${COLORS.reset}  ` +
    `${COLORS.dim}${brand.BOT_TAGLINE}${COLORS.reset}`
  );
  console.log(
    `  ${COLORS.grey}version${COLORS.reset}  ` +
    `${COLORS.white}${brand.BOT_VERSION}${COLORS.reset}` +
    `     ${COLORS.grey}author${COLORS.reset}  ` +
    `${COLORS.white}${brand.AUTHOR_NAME}${COLORS.reset}`
  );
  console.log(
    `  ${COLORS.grey}project${COLORS.reset}  ` +
    `${COLORS.white}${brand.PROJECT_NAME}${COLORS.reset}` +
    `     ${COLORS.grey}repo${COLORS.reset}  ` +
    `${COLORS.dim}${brand.GITHUB_USER}/${brand.GITHUB_REPO}${COLORS.reset}`
  );
  console.log(`${COLORS.grey}${line}${COLORS.reset}`);
  console.log('');
}

function printEnv() {
  const env = config.isProd
    ? `${COLORS.green}production${COLORS.reset}`
    : `${COLORS.yellow}development${COLORS.reset}`;

  const apiUrl = `http://${config.host}:${config.port}`;

  console.log(`${COLORS.grey}┌─ environment ─────────────────────────────────────────────┐${COLORS.reset}`);
  console.log(`${COLORS.grey}│${COLORS.reset}  env      ${env}`);
  console.log(`${COLORS.grey}│${COLORS.reset}  api      ${COLORS.white}${apiUrl}${COLORS.reset}  ${COLORS.grey}(localhost only)${COLORS.reset}`);
  console.log(`${COLORS.grey}│${COLORS.reset}  prefix   ${COLORS.white}${config.prefixes.whatsappDefault}${COLORS.reset}`);
  console.log(`${COLORS.grey}│${COLORS.reset}  owner    ${COLORS.white}${config.owners.telegram[0] || 'not set'}${COLORS.reset}`);
  console.log(`${COLORS.grey}└───────────────────────────────────────────────────────────┘${COLORS.reset}`);
  console.log('');
}

let shuttingDown = false;

async function boot() {
  printBanner();
  printEnv();

  log.info(`Starting ${brand.BOT_NAME} Session Manager...`);

  try {
    log.info('Step 1/6 — connecting to MongoDB...');
    await db.mongo.connect();
  } catch (err) {
    log.error('MongoDB connection failed — aborting startup');
    log.error(err.message);
    process.exit(1);
  }

  try {
    log.info('Step 2/6 — loading commands...');
    await commandLoader.loadAll();
  } catch (err) {
    log.error('Command loader failed:', err.message);
    log.warn('Continuing without commands');
  }

  try {
    log.info('Step 3/6 — starting internal API...');
    await api.start();
  } catch (err) {
    log.error('API startup failed — aborting');
    log.error(err.message);
    process.exit(1);
  }

  try {
    log.info('Step 4/6 — starting pairing timer...');
    socketManager.pairingLoop().catch((err) => {
      log.warn('Pairing loop warning:', err.message);
    });
  } catch (err) {
    log.warn('Pairing timer warning:', err.message);
  }

  try {
    log.info('Step 5/6 — loading sessions from DB...');
    const result = await sessionLoader.loadAll({ autoReconnect: true });
    log.info(`Sessions loaded — ${result.reconnectable || 0} reconnectable`);
  } catch (err) {
    log.error('Session load failed:', err.message);
  }

  try {
    log.info('Step 6/6 — starting stats flusher...');
    stats.start();
  } catch (err) {
    log.warn('Stats flusher warning:', err.message);
  }

  log.divider();

  console.log(
    `  ${COLORS.green}${COLORS.bold}✓ MINIST4CK is online${COLORS.reset}` +
    `  ${COLORS.grey}·  waiting for commands${COLORS.reset}`
  );
  console.log('');

  log.ready(`Session Manager ready — ${socketManager.activeCount()} sockets active`);
  log.info('Uptime counter started — press Ctrl+C to stop');
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('');
  log.warn(`Received ${signal} — starting graceful shutdown...`);

  try {
    log.info('Stopping stats flusher...');
    stats.stop();
  } catch {}

  try {
    log.info('Closing pairing flows...');
    pairingFlow.cleanup();
  } catch {}

  try {
    log.info('Closing all sockets...');
    for (const sock of socketManager.listActive()) {
      try {
        await socketManager.closeSession(sock.sessionId, 'shutdown');
      } catch {}
    }
  } catch (err) {
    log.warn('Socket cleanup warning:', err.message);
  }

  try {
    log.info('Stopping API...');
    await api.stop();
  } catch (err) {
    log.warn('API stop warning:', err.message);
  }

  try {
    log.info('Disconnecting MongoDB...');
    await db.mongo.disconnect();
  } catch (err) {
    log.warn('MongoDB disconnect warning:', err.message);
  }

  log.ready('Shutdown complete');
  console.log('');

  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason?.message || String(reason));
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err.message);
  log.error(err.stack);
  setTimeout(() => shutdown('uncaughtException'), 200);
});

process.on('exit', (code) => {
  if (!shuttingDown) {
    log.warn(`Process exited with code ${code}`);
  }
});

boot().catch((err) => {
  log.error('Boot failed:', err.message);
  log.error(err.stack);
  process.exit(1);
});