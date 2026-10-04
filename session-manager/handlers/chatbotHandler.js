import axios from 'axios';
import FormData from 'form-data';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

import config from '../config.js';
import C from '../../shared/constants.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';
import ai from '../../shared/aiEndpoints.js';
import {
  Session,
  SessionConfig,
  ChatHistory,
  Stats
} from '../database/index.js';

const log = logger.child('chatbot');

const COOLDOWN_MS     = 3000;
const MAX_HISTORY     = 8;
const TRIM_KEEP       = 40;
const MAX_REPLY_LEN   = 800;
const RATE_LIMIT_DAY  = 100;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const lastReplyAt = new Map();
const dailyCount  = new Map();

const SWAHILI_WORDS = [
  'habari', 'jambo', 'vipi', 'sasa', 'mambo', 'poa', 'nzuri',
  'asante', 'karibu', 'tafadhali', 'ndiyo', 'hapana', 'kwaheri',
  'nini', 'nani', 'wapi', 'lini', 'kwa nini', 'jinsi', 'naomba',
  'nataka', 'nahitaji', 'sijui', 'sijaelewa', 'eleza', 'saidia',
  'tafuta', 'niambie', 'nifanye', 'je', 'unaweza', 'ninaweza'
];

const IMAGE_INTENT = /(create|generate|make|draw|design|paint|imagine|render)\s.*?(image|picture|photo|art|illustration|logo|poster)|(image|picture|photo|art|illustration)\s.*?(of|about|showing)/i;

const SYSTEM_PROMPTS = {
  en:
    `You are ${brand.BOT_NAME}, an AI assistant on WhatsApp by bigmanjtech™. ` +
    `Reply in English. Be helpful, clear, and concise. Keep replies under 800 characters. ` +
    `If you cannot answer, say "check bigmanjtech™ t.me/bigmanj09".`,
  sw:
    `Wewe ni ${brand.BOT_NAME}, msaidizi wa AI kwenye WhatsApp na bigmanjtech™. ` +
    `Jibu kwa Kiswahili. Kuwa msaidizi, wazi, na mfupi. Jibu chini ya herufi 800. ` +
    `Kama huwezi kujibu, sema "wasiliana bigmanjtech™ t.me/bigmanj09".`
};

function detectLanguage(text, cfg) {
  if (cfg.chatbotLanguage === 'sw') return 'sw';
  if (cfg.chatbotLanguage === 'en') return 'en';

  const t = String(text || '').toLowerCase();
  for (const w of SWAHILI_WORDS) {
    if (t.includes(w)) return 'sw';
  }
  return 'en';
}

function getTextContent(msg) {
  const m = msg.message;
  if (!m) return null;

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return null;
}

function hasAudio(msg) {
  return !!(msg.message?.audioMessage);
}

function getSenderNumber(msg) {
  const jid = msg.key?.participant || msg.key?.remoteJid || '';
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
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

function isBotMentioned(msg, sock) {
  const botJid    = sock.user?.id?.replace(/:\d+@/, '@') || '';
  const botNumber = botJid.split('@')[0].split(':')[0];

  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.audioMessage?.contextInfo ||
    {};

  if ((ctx.mentionedJid || []).some((j) => j.split('@')[0].split(':')[0] === botNumber)) {
    return true;
  }

  if (ctx.participant?.split('@')[0]?.split(':')[0] === botNumber) return true;

  const text = getTextContent(msg) || '';
  if (text.includes(`@${botNumber}`)) return true;

  return false;
}

function canReply(chatId) {
  const now  = Date.now();
  const last = lastReplyAt.get(chatId) || 0;
  if (now - last < COOLDOWN_MS) return false;

  const today = new Date().toISOString().slice(0, 10);
  const key = `${chatId}:${today}`;
  if ((dailyCount.get(key) || 0) >= RATE_LIMIT_DAY) return false;

  return true;
}

function markReply(chatId) {
  lastReplyAt.set(chatId, Date.now());
  const today = new Date().toISOString().slice(0, 10);
  const key = `${chatId}:${today}`;
  dailyCount.set(key, (dailyCount.get(key) || 0) + 1);
}

async function buildContext(sessionId, chatId) {
  const history = await ChatHistory.getRecent(sessionId, chatId, MAX_HISTORY);
  const ordered = history.reverse();

  const lines = [];
  for (const h of ordered) {
    if (h.userMessage) lines.push(`User: ${h.userMessage}`);
    if (h.botReply)    lines.push(`Assistant: ${h.botReply}`);
  }

  return lines.join('\n');
}

async function askTextAI(prompt) {
  const endpoint = ai.getBest('chat') || ai.getFirstEnabled('chat');
  if (!endpoint) throw new Error('no chat endpoint');

  const { data } = await axios.get(endpoint.url, {
    params:  ai.buildParams(endpoint, prompt),
    headers: ai.getHeaders(endpoint),
    timeout: endpoint.timeout
  });

  const reply = ai.parseShape(endpoint.shape, data);
  return { reply: reply || 'No answer received.', model: endpoint.name };
}

async function generateImage(prompt) {
  const endpoint = ai.getBest('image') || ai.getFirstEnabled('image');
  if (!endpoint) throw new Error('no image endpoint');

  const { data } = await axios.get(endpoint.url, {
    params:  ai.buildParams(endpoint, prompt),
    headers: ai.getHeaders(endpoint),
    timeout: endpoint.timeout
  });

  const url = ai.parseShape(endpoint.shape, data);
  if (!url) throw new Error('no image URL in response');

  return { url, model: endpoint.name };
}

async function transcribeAudio(sock, msg) {
  const audio = msg.message?.audioMessage;
  if (!audio) throw new Error('no audio');

  if ((audio.fileLength || 0) > MAX_AUDIO_BYTES) {
    throw new Error('audio too large');
  }

  const buffer = await downloadMediaMessage(
    msg,
    'buffer',
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );

  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey) throw new Error('GROQ_API_KEY not set');

  const form = new FormData();
  form.append('file', buffer, {
    filename:    'audio.ogg',
    contentType: 'audio/ogg'
  });
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');

  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${groqKey}`
      },
      timeout: 40000,
      maxBodyLength: Infinity
    }
  );

  const text = data?.text?.trim();
  if (!text) throw new Error('empty transcription');

  return text;
}

async function synthesizeVoice(text) {
  const endpoint = ai.getBest('tts') || ai.getFirstEnabled('tts');
  if (!endpoint) throw new Error('no TTS endpoint');

  const { data } = await axios.get(endpoint.url, {
    params:  ai.buildParams(endpoint, text),
    headers: ai.getHeaders(endpoint),
    timeout: endpoint.timeout
  });

  const url = ai.parseShape(endpoint.shape, data);
  if (!url) throw new Error('no TTS URL in response');

  return url;
}

function truncateReply(text) {
  const s = String(text || '').trim();
  if (s.length <= MAX_REPLY_LEN) return s;
  return s.slice(0, MAX_REPLY_LEN - 3) + '…';
}

async function tryImageGeneration(prompt, sock, chatId, msg) {
  try {
    const { url, model } = await generateImage(prompt);

    await sock.sendMessage(chatId, {
      image: { url },
      caption:
        `✧ ${prompt.slice(0, 120)}\n` +
        `➩ model · ${model}`
    }, { quoted: msg });

    return { ok: true, model };
  } catch (err) {
    log.warn(`image gen failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function handleChatbotMessage(sock, sessionId, msg) {
  if (!msg?.message) return false;
  if (isSelfMessage(msg)) return false;

  const chatId = msg.key?.remoteJid || '';
  if (!chatId) return false;
  if (isStatusOrBroadcast(chatId)) return false;

  const session = await Session.findOne({ sessionId, deletedAt: null });
  if (!session) return false;

  const cfg = await SessionConfig.findBySessionId(sessionId);
  if (!cfg) return false;

  const isGroup = isGroupChat(chatId);
  const prefix  = cfg.prefix || config.prefixes.whatsappDefault;
  const text    = getTextContent(msg) || '';
  const isAudio = hasAudio(msg);

  if (text.startsWith(prefix)) return false;

  if (isGroup && !cfg.chatbotGroup) return false;
  if (!isGroup && !cfg.chatbotPrivate) return false;
  if (isGroup && !isBotMentioned(msg, sock)) return false;

  if (!text && !isAudio) return false;
  if (text && text.length < 2 && !isAudio) return false;

  if (!canReply(chatId)) {
    log.debug(`rate limited ${chatId}`);
    return false;
  }

  const senderNumber = getSenderNumber(msg);
  const senderName   = msg.pushName || '';

  if (cfg.chatbotBlacklist?.includes(senderNumber)) return false;

  const t0 = Date.now();
  let workingText = text;
  let fromVoice   = false;

  try {
    if (isAudio) {
      if (!cfg.chatbotTranscribe) return false;

      try {
        workingText = await transcribeAudio(sock, msg);
        fromVoice   = true;
      } catch (err) {
        log.warn(`STT failed: ${err.message}`);

        await sock.sendMessage(chatId, {
          text: `✗ Could not transcribe that audio\n➩ ${err.message.slice(0, 80)}`
        }, { quoted: msg });

        return false;
      }
    }

    if (workingText.startsWith(prefix)) return false;

    if (cfg.chatbotImageGen && IMAGE_INTENT.test(workingText)) {
      const result = await tryImageGeneration(workingText, sock, chatId, msg);

      if (result.ok) {
        markReply(chatId);

        await ChatHistory.record({
          sessionId,
          chatId,
          chatType:     isGroup ? 'group' : 'private',
          senderNumber,
          senderName,
          userMessage:  workingText,
          botReply:     `[image: ${result.model}]`,
          language:     detectLanguage(workingText, cfg),
          model:        result.model,
          latencyMs:    Date.now() - t0,
          success:      true
        });

        await ChatHistory.trim(sessionId, chatId, TRIM_KEEP);

        log.event('chatbot.image', { sessionId, chatId, model: result.model });
        return true;
      }
    }

    const lang         = detectLanguage(workingText, cfg);
    const systemPrompt = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.en;

    const context = await buildContext(sessionId, chatId);

    const prefixLine = fromVoice ? `[voice note] ` : '';
    const fullPrompt = context
      ? `${context}\nUser: ${prefixLine}${workingText}`
      : `User: ${prefixLine}${workingText}`;

    const finalPrompt = `${systemPrompt}\n\n${fullPrompt}\nAssistant:`;

    const { reply, model } = await askTextAI(finalPrompt);
    const clean = truncateReply(reply);

    markReply(chatId);

    if (cfg.chatbotVoiceReply && fromVoice) {
      try {
        const audioUrl = await synthesizeVoice(clean);

        await sock.sendMessage(chatId, {
          audio:    { url: audioUrl },
          mimetype: 'audio/mpeg',
          ptt:      true
        }, { quoted: msg });

      } catch (err) {
        log.warn(`TTS failed: ${err.message}`);

        await sock.sendMessage(chatId, {
          text: clean
        }, { quoted: msg });
      }
    } else {
      await sock.sendMessage(chatId, { text: clean }, { quoted: msg });
    }

    await ChatHistory.record({
      sessionId,
      chatId,
      chatType:     isGroup ? 'group' : 'private',
      senderNumber,
      senderName,
      userMessage:  fromVoice ? `[voice] ${workingText}` : workingText,
      botReply:     clean,
      language:     lang,
      model,
      latencyMs:    Date.now() - t0,
      success:      true
    });

    await ChatHistory.trim(sessionId, chatId, TRIM_KEEP);

    try {
      const stats = await Stats.todayOrCreate();
      await stats.incrementMessage('sent');
    } catch {}

    log.event('chatbot.reply', {
      sessionId,
      chatId,
      lang,
      model,
      fromVoice,
      ms: Date.now() - t0
    });

    return true;

  } catch (err) {
    log.error(`chatbot failed: ${err.message}`);

    await ChatHistory.record({
      sessionId,
      chatId,
      chatType:    isGroup ? 'group' : 'private',
      senderNumber,
      senderName,
      userMessage: workingText || '[audio]',
      latencyMs:   Date.now() - t0,
      success:     false,
      errorReason: err.message.slice(0, 200)
    }).catch(() => {});

    return false;
  }
}

function attachChatbotHandler(sock, sessionId) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleChatbotMessage(sock, sessionId, msg);
      } catch (err) {
        log.error(`chatbot crashed for ${sessionId}: ${err.message}`);
      }
    }
  });

  log.debug(`Chatbot handler attached to ${sessionId}`);
}

export {
  attachChatbotHandler,
  handleChatbotMessage,
  detectLanguage,
  isBotMentioned,
  IMAGE_INTENT
};

export default {
  attachChatbotHandler,
  handleChatbotMessage
};