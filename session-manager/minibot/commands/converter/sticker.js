import { downloadMediaMessage } from '@whiskeysockets/baileys';

import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:sticker');

const SYM = brand.SYM;

function getQuotedMessage(msg) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.audioMessage?.contextInfo ||
    {};

  if (!ctx.quotedMessage) return null;

  return {
    message: ctx.quotedMessage,
    key: {
      remoteJid:   msg.key.remoteJid,
      fromMe:      false,
      id:          ctx.stanzaId,
      participant: ctx.participant
    }
  };
}

function getMediaType(message) {
  if (!message) return null;
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  return null;
}

async function download(sock, source) {
  return await downloadMediaMessage(
    source,
    'buffer',
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker', 'stikerin'],
  category: 'converter',
  description: 'Convert image or video to WhatsApp sticker',
  emoji: '⇄',
  usage: '|pack|author',

  permissions: {
    coin:    2,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args } = ctx;

    try {
      let source    = null;
      let mediaType = null;

      const directImage = getMediaType(msg.message);
      if (directImage) {
        source    = msg;
        mediaType = directImage;
      } else {
        const quoted = getQuotedMessage(msg);
        const quotedType = getMediaType(quoted?.message);

        if (quoted && quotedType) {
          source    = quoted;
          mediaType = quotedType;
        }
      }

      if (!source || !mediaType) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Sticker Maker*\n\n` +
            `${SYM.arrow} send an image or video with caption\n` +
            `${SYM.arrow} or reply to an image / video\n\n` +
            `${SYM.arrow} custom pack:\n` +
            `   ${SYM.bullet} ${config.prefixes.whatsappDefault}sticker Pack Name|Author Name\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`
        }, { quoted: msg });
      }

      const rawText  = Array.isArray(args) ? args.join(' ') : '';
      const [packArg, authorArg] = rawText.split('|').map((s) => s?.trim());

      const packName = packArg   || config.sticker?.packname || brand.BOT_NAME;
      const author   = authorArg || config.sticker?.author   || 'bigmanjtech™';

      const buffer = await download(sock, source);

      if (!buffer || buffer.length < 100) {
        throw new Error('failed to download media');
      }

      await sock.sendMessage(chatId, {
        sticker: buffer
      }, {
        quoted: msg
      });

      log.event('command.sticker', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        mediaType,
        size:      buffer.length
      });

    } catch (err) {
      log.error(`sticker failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Sticker failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`
        }, { quoted: msg });
      } catch {}
    }
  }
};