import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import { SessionConfig } from '../database/index.js';

const log = logger.child('presence');

const typingLoops    = new Map();   // chatId → { running, timer, cycles }
const recordingLoops = new Map();
const readTimers     = new Map();

const MAX_AUTOREAD_TRACK = 5000;

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isGroupChat(chatId) {
  return String(chatId || '').endsWith('@g.us');
}

function isStatusOrBroadcast(chatId) {
  if (!chatId) return true;
  if (chatId === 'status@broadcast') return true;
  if (chatId.endsWith('@broadcast')) return true;
  if (chatId.endsWith('@newsletter')) return true;
  return false;
}

function isSelfMessage(msg) {
  return msg.key?.fromMe === true;
}

function stopTypingLoop(chatId) {
  const loop = typingLoops.get(chatId);
  if (!loop) return;

  if (loop.timer) clearTimeout(loop.timer);
  typingLoops.delete(chatId);
}

function stopRecordingLoop(chatId) {
  const loop = recordingLoops.get(chatId);
  if (!loop) return;

  if (loop.timer) clearTimeout(loop.timer);
  recordingLoops.delete(chatId);
}

function startTypingLoop(sock, sessionId, chatId, cfg) {
  if (typingLoops.has(chatId)) return;

  const timings = config.automation.typing;
  const maxChats = timings.maxConcurrentChats || 5;

  if (typingLoops.size >= maxChats) {
    log.debug(`typing limit reached (${maxChats}) — skipping ${chatId}`);
    return;
  }

  const state = { timer: null, cycles: 0, running: true };
  typingLoops.set(chatId, state);

  const cycle = async () => {
    if (!state.running) return;

    const currentCfg = await SessionConfig.findBySessionId(sessionId);

    if (!currentCfg || !currentCfg.autoTyping) {
      stopTypingLoop(chatId);
      return;
    }

    try {
      await sock.sendPresenceUpdate('composing', chatId);
    } catch (err) {
      log.debug(`composing failed for ${chatId}: ${err.message}`);
      stopTypingLoop(chatId);
      return;
    }

    const duration = randomBetween(timings.composingMinMs, timings.composingMaxMs);
    state.cycles += 1;

    state.timer = setTimeout(async () => {
      if (!state.running) return;

      try {
        await sock.sendPresenceUpdate('paused', chatId);
      } catch {}

      const pause = randomBetween(timings.pausedMinMs, timings.pausedMaxMs);

      state.timer = setTimeout(() => {
        if (!state.running) return;
        cycle();
      }, pause + (timings.cycleDelayMs || 0));
    }, duration);
  };

  cycle();
}

function startRecordingLoop(sock, sessionId, chatId, cfg) {
  if (recordingLoops.has(chatId)) return;

  const timings = config.automation.recording;
  const maxChats = timings.maxConcurrentChats || 3;

  if (recordingLoops.size >= maxChats) {
    log.debug(`recording limit reached (${maxChats}) — skipping ${chatId}`);
    return;
  }

  const state = { timer: null, cycles: 0, running: true };
  recordingLoops.set(chatId, state);

  const cycle = async () => {
    if (!state.running) return;

    const currentCfg = await SessionConfig.findBySessionId(sessionId);

    if (!currentCfg || !currentCfg.autoRecording) {
      stopRecordingLoop(chatId);
      return;
    }

    try {
      await sock.sendPresenceUpdate('recording', chatId);
    } catch (err) {
      log.debug(`recording failed for ${chatId}: ${err.message}`);
      stopRecordingLoop(chatId);
      return;
    }

    const duration = randomBetween(timings.recordingMinMs, timings.recordingMaxMs);
    state.cycles += 1;

    state.timer = setTimeout(async () => {
      if (!state.running) return;

      try {
        await sock.sendPresenceUpdate('paused', chatId);
      } catch {}

      const pause = randomBetween(timings.pausedMinMs, timings.pausedMaxMs);

      state.timer = setTimeout(() => {
        if (!state.running) return;
        cycle();
      }, pause + (timings.cycleDelayMs || 0));
    }, duration);
  };

  cycle();
}

async function handleAutoRead(sock, sessionId, msg) {
  if (isSelfMessage(msg)) return;
  if (!msg.key?.id) return;

  const chatId = msg.key?.remoteJid || '';
  if (!chatId) return;
  if (isStatusOrBroadcast(chatId)) return;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return;
  if (cfg.autoRead !== true) return;

  const delay = config.automation.read.readDelayMs || 1500;

  const key = `${sessionId}:${msg.key.id}`;

  if (readTimers.has(key)) return;

  const timer = setTimeout(async () => {
    readTimers.delete(key);

    try {
      await sock.readMessages([msg.key]);
      log.debug(`auto-read ${msg.key.id}`);
    } catch (err) {
      log.debug(`auto-read failed: ${err.message}`);
    }
  }, delay);

  readTimers.set(key, timer);

  if (readTimers.size > MAX_AUTOREAD_TRACK) {
    const first = readTimers.keys().next().value;
    clearTimeout(readTimers.get(first));
    readTimers.delete(first);
  }
}

function attachPresenceHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const cfg = await SessionConfig.findBySessionId(sessionId);
    if (!cfg) return;

    for (const msg of messages) {
      if (isSelfMessage(msg)) continue;

      const chatId = msg.key?.remoteJid || '';
      if (!chatId) continue;
      if (isStatusOrBroadcast(chatId)) continue;

      try {
        if (cfg.autoRead === true) {
          await handleAutoRead(sock, sessionId, msg);
        }

        if (cfg.autoTyping === true) {
          if (!typingLoops.has(chatId)) {
            startTypingLoop(sock, sessionId, chatId, cfg);
          }
        } else {
          stopTypingLoop(chatId);
        }

        if (cfg.autoRecording === true) {
          if (!recordingLoops.has(chatId)) {
            startRecordingLoop(sock, sessionId, chatId, cfg);
          }
        } else {
          stopRecordingLoop(chatId);
        }
      } catch (err) {
        log.debug(`presence cycle failed: ${err.message}`);
      }
    }
  });

  log.debug(`Presence handler attached to ${sessionId}`);
}

function stopAllForChat(chatId) {
  stopTypingLoop(chatId);
  stopRecordingLoop(chatId);
}

function stopAll() {
  for (const chatId of typingLoops.keys()) stopTypingLoop(chatId);
  for (const chatId of recordingLoops.keys()) stopRecordingLoop(chatId);
  for (const timer of readTimers.values()) clearTimeout(timer);
  readTimers.clear();
}

function stats() {
  return {
    typingChats:    typingLoops.size,
    recordingChats: recordingLoops.size,
    pendingReads:   readTimers.size
  };
}

export {
  attachPresenceHandler,
  handleAutoRead,
  startTypingLoop,
  startRecordingLoop,
  stopTypingLoop,
  stopRecordingLoop,
  stopAllForChat,
  stopAll,
  stats
};

export default {
  attachPresenceHandler
};