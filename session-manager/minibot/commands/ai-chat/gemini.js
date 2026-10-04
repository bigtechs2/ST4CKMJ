import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:gemini');

const SYM = brand.SYM;

const AI_ENDPOINT =
  config.ai?.geminiEndpoint || 'https://api.siputzx.my.id/api/ai/gemini';

const AI_TIMEOUT = 30000;

const DEFAULT_SYSTEM_PROMPT =
  `You are Gemini, an AI assistant from bigmanjtech™. ` +
  `Reply in the user's language. Be clear and helpful. ` +
  `If you cannot answer, do not say "error" — instead say: "check bigmanjtech™ t.me/bigmanj09".`;

function getCookie() {
  return process.env.GEMINI_COOKIE || config.ai?.geminiCookie || '';
}

async function getThumbnail(sock) {
  const fallback = config.bot?.thumbnail || '';

  try {
    const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
    if (!botJid) return fallback;

    const pp = await sock.profilePictureUrl(botJid, 'image');
    return pp || fallback;
  } catch {
    return fallback;
  }
}

async function askAI(question) {
  const params = {
    text:          question,
    promptSystem:  DEFAULT_SYSTEM_PROMPT
  };

  const cookie = getCookie();
  if (cookie) params.cookie = cookie;

  const { data } = await axios.get(AI_ENDPOINT, {
    params,
    timeout: AI_TIMEOUT
  });

  let result =
    data?.result ||
    data?.message ||
    data?.answer ||
    data?.response ||
    data?.data?.reply ||
    data?.reply;

  if (!result) {
    result = 'No answer received.';
  }

  if (typeof result === 'object') {
    result = JSON.stringify(result);
  }

  return String(result);
}

function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  let cleaned = text;

  while ((match = regex.exec(text)) !== null) {
    const language = (match[1] || 'javascript').toLowerCase();
    const code     = match[2].trim();

    if (code) {
      blocks.push({ language, code, raw: match[0] });
    }
  }

  for (const b of blocks) {
    cleaned = cleaned.replace(b.raw, '');
  }

  return { blocks, cleaned: cleaned.trim() };
}

function extractTables(text) {
  const tables = [];
  const regex = /\|(.+)\|\n\|[-: ]+\|\n((?:\|.+\|\n?)+)/g;
  let match;
  let cleaned = text;

  while ((match = regex.exec(text)) !== null) {
    const headerLine = match[1];
    const bodyLines  = match[2].trim().split('\n');

    const header = headerLine
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');

    const rows = bodyLines.map((line) =>
      line
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c !== '')
    );

    if (header.length && rows.length) {
      tables.push({
        data: [header, ...rows],
        raw:  match[0]
      });
    }
  }

  for (const t of tables) {
    cleaned = cleaned.replace(t.raw, '');
  }

  return { tables, cleaned: cleaned.trim() };
}

export default {
  name: 'gemini',
  aliases: ['gm', 'googlegemini', 'bard'],
  category: 'ai-chat',
  description: 'Ask Google Gemini anything — free, with code and table support',
  emoji: '✧',
  usage: '<question>',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const question = (Array.isArray(args) ? args : []).join(' ').trim();

    if (!question) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *Google Gemini*\n\n` +
          `${SYM.arrow} Ask any question — free for everyone\n\n` +
          `${SYM.arrow} Usage: ${prefix}gemini <question>\n` +
          `${SYM.arrow} Example: ${prefix}gemini explain transformer models in AI\n\n` +
          `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} thinking about: _${question.slice(0, 80)}${question.length > 80 ? '…' : ''}_`,
        { id: 'intro' }
      );

      const rawReply = await askAI(question);

      const { blocks, cleaned: afterCode } = extractCodeBlocks(rawReply);
      const { tables, cleaned: finalText }  = extractTables(afterCode);

      rich.addText(
        `${SYM.heart} *Q:* ${question}\n\n` +
        `${SYM.diamond} *A:* ${finalText || rawReply}`,
        { insertAt: 'intro', id: 'answer' }
      );

      let codeIndex = 0;
      for (const b of blocks) {
        rich.addCode(b.language, b.code, {
          insertAt: 'answer',
          id:       `code_${codeIndex++}`
        });
      }

      let tableIndex = 0;
      for (const t of tables) {
        rich.addTable(t.data, {
          insertAt: 'answer',
          id:       `table_${tableIndex++}`
        });
      }

      const thumbnail   = await getThumbnail(sock);
      const channelLink = config.bot.channelLink || config.links.whatsappChannel;

      rich.addSource([
        {
          icon:     thumbnail,
          url:      channelLink,
          title:    brand.BOT_NAME,
          subtitle: 'powered by bigmanjtech™ AI'
        }
      ]);

      rich.addSuggest([
        `${prefix}chatgpt`,
        `${prefix}gemini`,
        `${prefix}claude`,
        `${prefix}menu ai-chat`
      ]);

      rich.addText(`[View channel](${channelLink})`);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.gemini', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        blocks:    blocks.length,
        tables:    tables.length
      });

    } catch (err) {
      log.error(`gemini failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Gemini request failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})\n` +
            `${config.msg.footer}`
        }, { quoted: msg });
      } catch {}
    }
  }
};