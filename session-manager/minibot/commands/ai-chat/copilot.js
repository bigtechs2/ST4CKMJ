import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:copilot');

const SYM = brand.SYM;

const AI_ENDPOINT =
  config.ai?.copilotEndpoint || 'https://api.nexray.eu.cc/ai/copilot';

const AI_TIMEOUT = 30000;

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

async function askAI(prompt) {
  const { data } = await axios.get(AI_ENDPOINT, {
    params:  { text: prompt },
    timeout: AI_TIMEOUT
  });

  return (
    data?.data?.reply ||
    data?.reply ||
    data?.result ||
    data?.message ||
    'No answer received.'
  );
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
  name: 'copilot',
  aliases: ['cop', 'githubai', 'ghcopilot'],
  category: 'ai-chat',
  description: 'Ask GitHub Copilot anything — free, with code and table support',
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
          `${SYM.info} *GitHub Copilot*\n\n` +
          `${SYM.arrow} Ask any question — free for everyone\n\n` +
          `${SYM.arrow} Usage: ${prefix}copilot <question>\n` +
          `${SYM.arrow} Example: ${prefix}copilot write a debounce function in typescript\n\n` +
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
        `${prefix}copilot`,
        `${prefix}claude`,
        `${prefix}menu ai-chat`
      ]);

      rich.addText(`[View channel](${channelLink})`);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.copilot', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        blocks:    blocks.length,
        tables:    tables.length
      });

    } catch (err) {
      log.error(`copilot failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Copilot request failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})\n` +
            `${config.msg.footer}`
        }, { quoted: msg });
      } catch {}
    }
  }
};