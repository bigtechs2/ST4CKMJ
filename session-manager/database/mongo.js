import mongoose from 'mongoose';

import config from '../config.js';
import logger from '../../shared/logger.js';

const log = logger.child('mongo');

let connected = false;

mongoose.set('strictQuery', true);

if (!config.isProd) {
  mongoose.set('debug', false);
}

const options = {
  ...config.mongo.options,
  autoIndex: !config.isProd,
  family: 4
};

async function connect() {
  if (connected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!config.mongo.uri) {
    log.error('MONGO_URI is empty — check .env');
    throw new Error('MONGO_URI missing');
  }

  try {
    log.info('Connecting to MongoDB...');

    await mongoose.connect(config.mongo.uri, options);

    connected = true;
    log.ready('MongoDB connected');
    log.info(`Database: ${mongoose.connection.name}`);

    mongoose.connection.on('disconnected', () => {
      connected = false;
      log.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      connected = true;
      log.ready('MongoDB reconnected');
    });

    mongoose.connection.on('error', (err) => {
      log.error('MongoDB error:', err.message);
    });

    return mongoose.connection;
  } catch (err) {
    log.error('MongoDB connection failed:', err.message);
    throw err;
  }
}

async function disconnect() {
  try {
    await mongoose.disconnect();
    connected = false;
    log.info('MongoDB disconnected gracefully');
  } catch (err) {
    log.error('MongoDB disconnect error:', err.message);
  }
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function state() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[mongoose.connection.readyState] || 'unknown';
}

function ping() {
  return new Promise((resolve) => {
    if (!isConnected()) {
      return resolve({ ok: false, state: state(), latency: null });
    }

    const start = Date.now();

    mongoose.connection.db
      .admin()
      .ping()
      .then(() => {
        resolve({
          ok:      true,
          state:   state(),
          latency: Date.now() - start
        });
      })
      .catch(() => {
        resolve({
          ok:      false,
          state:   state(),
          latency: null
        });
      });
  });
}

export default {
  mongoose,
  connect,
  disconnect,
  isConnected,
  state,
  ping
};