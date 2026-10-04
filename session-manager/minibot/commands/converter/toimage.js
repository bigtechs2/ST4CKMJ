import sharp from 'sharp';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:toimage');

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

function isSticker(message) {
  if (!message) return false;
  return !!message.stickerMessage;
}

function isAnimatedSticker(message) {
  if (!message?.stickerMessage) return false;
  return message.stickerMessage.isAnimated === true;
}

async function downloadSticker(sock, source) {
  return await downloadMediaMessage(
    source,
    'buffer',
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );
}

async function convertToPng(buffer) {
  return await sharp(buffer, { animated: false })
    .png({ quality: 100 })
    .toBuffer();
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

export default {
  name: 'toimage',
  aliases: ['toimg', 'topng', 'sticker2img'],
  category: 'converter',
  description: 'Convert a sticker to a PNG image',
  emoji: '⇄',
  usage: '(reply to sticker)',

  permissions: {
    coin:    10,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;
    const channelLink = config.bot.channelLink || config.links.whatsappChannel;

    const quoted = getQuotedMessage(msg);

    if (!quoted || !isSticker(quoted.message)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *Sticker → Image*\n\n` +
          `${SYM.arrow} reply to a sticker with:\n` +
          `   ${SYM.bullet} ${prefix}toimage\n\n` +
          `${SYM.arrow} converts webp sticker → png image\n\n` +
          `[View channel](${channelLink})`
      }, { quoted: msg });
    }

    const animated = isAnimatedSticker(quoted.message);

    try {
      const buffer = await downloadSticker(sock, quoted);

      if (!buffer || buffer.length < 100) {
        throw new Error('failed to download sticker');
      }

      const png = await convertToPng(buffer);

      if (!png || png.length < 100) {
        throw new Error('conversion produced empty output');
      }

      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *Sticker → Image*\n` +
        `${SYM.arrow} status · converted\n` +
        `${SYM.arrow} format · png\n` +
        `${SYM.arrow} size   · ${(png.length / 1024).toFixed(1)} KB` +
        (animated ? `\n${SYM.arrow} note   · animated sticker → static PNG` : '')
      );

      rich.addImage(png, {
        width:  512,
        height: 512,
        id:     'result'
      });

      rich.addSuggest([
        `${prefix}toimage`,
        `${prefix}sticker`,
        `${prefix}menu converter`
      ]);

      rich.addText(`[View channel](${channelLink})`);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.toimage', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        animated,
        size:      png.length
      });

    } catch (err) {
      log.error(`toimage failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Sticker conversion failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${channelLink})`
        }, { quoted: msg });
      } catch {}
    }
  }
};