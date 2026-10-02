import mongoose from 'mongoose';
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';

import logger from '../../shared/logger.js';
import config from '../config.js';

const log = logger.child('mongoAuth');

const COLLECTION = config.auth.collection;

let indexReady = false;

function collection() {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB not connected — cannot access auth state collection');
  }
  return mongoose.connection.db.collection(COLLECTION);
}

async function ensureIndexes() {
  if (indexReady) return;

  try {
    await collection().createIndex(
      { sessionId: 1, type: 1, keyId: 1 },
      { unique: true, background: true }
    );
    await collection().createIndex(
      { sessionId: 1, type: 1 },
      { background: true }
    );
    indexReady = true;
    log.info('Auth collection indexes ready');
  } catch (err) {
    log.error('Index creation failed:', err.message);
  }
}

async function useMongoAuthState(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');

  await ensureIndexes();

  const coll = collection();

  let creds;

  try {
    const credsDoc = await coll.findOne({ sessionId, type: 'creds' });

    if (credsDoc && credsDoc.value) {
      creds = JSON.parse(
        JSON.stringify(credsDoc.value),
        BufferJSON.reviver
      );
      log.info(`Loaded existing creds for ${sessionId}`);
    } else {
      creds = initAuthCreds();
      log.info(`Initialized new creds for ${sessionId}`);
    }
  } catch (err) {
    log.error(`Failed to load creds for ${sessionId}:`, err.message);
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    try {
      const value = JSON.parse(
        JSON.stringify(creds),
        BufferJSON.replacer
      );

      await coll.updateOne(
        { sessionId, type: 'creds' },
        {
          $set: {
            sessionId,
            type:      'creds',
            keyId:     'creds',
            value,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
    } catch (err) {
      log.error(`saveCreds failed for ${sessionId}:`, err.message);
    }
  };

  const keys = {

    get: async (type, ids) => {
      const result = {};

      try {
        const docs = await coll
          .find({
            sessionId,
            type,
            keyId: { $in: ids }
          })
          .toArray();

        for (const doc of docs) {
          let value;

          try {
            value = JSON.parse(
              JSON.stringify(doc.value),
              BufferJSON.reviver
            );
          } catch {
            continue;
          }

          if (type === 'app-state-sync-key' && value) {
            try {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            } catch (err) {
              log.warn(`app-state-sync-key parse failed for ${sessionId}:`, err.message);
            }
          }

          result[doc.keyId] = value;
        }
      } catch (err) {
        log.error(`keys.get failed for ${sessionId}:`, err.message);
      }

      for (const id of ids) {
        if (!(id in result)) {
          result[id] = null;
        }
      }

      return result;
    },

    set: async (data) => {
      const ops = [];

      try {
        for (const [type, entries] of Object.entries(data)) {
          if (!entries) continue;

          for (const [keyId, value] of Object.entries(entries)) {
            if (value === null || value === undefined) {
              ops.push({
                deleteOne: {
                  filter: { sessionId, type, keyId }
                }
              });
              continue;
            }

            let serialized;

            try {
              serialized = JSON.parse(
                JSON.stringify(value),
                BufferJSON.replacer
              );
            } catch (err) {
              log.warn(`Failed to serialize ${type}/${keyId}:`, err.message);
              continue;
            }

            ops.push({
              updateOne: {
                filter: { sessionId, type, keyId },
                update: {
                  $set: {
                    sessionId,
                    type,
                    keyId,
                    value:     serialized,
                    updatedAt: new Date()
                  },
                  $setOnInsert: { createdAt: new Date() }
                },
                upsert: true
              }
            });
          }
        }

        if (ops.length) {
          await coll.bulkWrite(ops, { ordered: false });
        }
      } catch (err) {
        log.error(`keys.set failed for ${sessionId}:`, err.message);
      }
    }

  };

  return {
    state: { creds, keys },
    saveCreds
  };
}

async function deleteAuthState(sessionId) {
  if (!sessionId) return false;

  try {
    const result = await collection().deleteMany({ sessionId });
    log.info(`Deleted auth state for ${sessionId} (${result.deletedCount} docs)`);
    return true;
  } catch (err) {
    log.error(`deleteAuthState failed for ${sessionId}:`, err.message);
    return false;
  }
}

async function hasAuthState(sessionId) {
  if (!sessionId) return false;

  try {
    const count = await collection().countDocuments(
      { sessionId, type: 'creds' },
      { limit: 1 }
    );
    return count > 0;
  } catch (err) {
    log.error(`hasAuthState failed for ${sessionId}:`, err.message);
    return false;
  }
}

async function listAuthSessions() {
  try {
    const sessionIds = await collection().distinct('sessionId');
    return sessionIds;
  } catch (err) {
    log.error('listAuthSessions failed:', err.message);
    return [];
  }
}

async function countAuthDocs(sessionId) {
  try {
    return await collection().countDocuments({ sessionId });
  } catch {
    return 0;
  }
}

export {
  useMongoAuthState,
  deleteAuthState,
  hasAuthState,
  listAuthSessions,
  countAuthDocs
};

export default useMongoAuthState;