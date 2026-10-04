import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { downloadMediaMessage } from '@whiskeysockets/baileys';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const execFileAsync = promisify(execFile);

const log = logger.child('cmd:tovideo');

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

async function convertToMp4(buffer, { animated }) {
  const tmpDir = os.tmpdir();
  const id     = crypto.randomBytes(6).toString('hex');

  const inputPath  = path.join(tmpDir, `sticker_in_${id}.webp`);
  const outputPath = path.join(tmpDir, `sticker_out_${id}.mp4`);

  try {
    await fs.writeFile(inputPath, buffer);

    const args = animated
      ? [
          '-y',
          '-i', inputPath,
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v', 'libx264',
          '-crf', '23',
          '-preset', 'fast',
          '-an',
          outputPath
        ]
      : [
          '-y',
          '-loop', '1',
          '-i', inputPath,
          '-t', '3',
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v', 'libx264',
          '-crf', '23',
          '-preset', 'fast',
          '-an',
          outputPath
        ];

    await execFileAsync('ffmpeg', args, { timeout: 60000 });

    const output = await fs.readFile(outputPath);

    if (!output || output.length < 100) {
      throw new Error('empty output');
    }

    return output;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
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
  name: 'tovideo',
  aliases: ['tomp4', 'tovid', 'sticker2vid'],
  category: 'converter',
  description: 'Convert a sticker to a short MP4 video',
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
          `${SYM.info} *Sticker → Video*\n\n` +
          `${SYM.arrow} reply to a sticker with:\n` +
          `   ${SYM.bullet} ${prefix}tovideo\n\n` +
          `${SYM.arrow} converts webp sticker → mp4 video\n` +
          `${SYM.arrow} animated stickers · keep motion\n` +
          `${SYM.arrow} static stickers  · 3s clip\n\n` +
          `[View channel](${channelLink})`
      }, { quoted: msg });
    }

    const animated = isAnimatedSticker(quoted.message);

    try {
      await sock.sendMessage(chatId, {
        text: `${SYM.info} converting sticker → video…`
      }, { quoted: msg });

      const buffer = await downloadSticker(sock, quoted);

      if (!buffer || buffer.length < 100) {
        throw new Error('failed to download sticker');
      }

      const mp4 = await convertToMp4(buffer, { animated });

      if (!mp4 || mp4.length < 100) {
        throw new Error('conversion produced empty output');
      }

      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *Sticker → Video*\n` +
        `${SYM.arrow} status · converted\n` +
        `${SYM.arrow} format · mp4\n` +
        `${SYM.arrow} size   · ${(mp4.length / 1024).toFixed(1)} KB\n` +
        `${SYM.arrow} type   · ${animated ? 'animated' : 'static · 3s'}`
      );

      rich.addVideo(mp4, {
        autoFill:   false,
        mimetype:   'video/mp4',
        fileName:   'sticker.mp4',
        id:         'result'
      });

      rich.addSuggest([
        `${prefix}tovideo`,
        `${prefix}toimage`,
        `${prefix}sticker`,
        `${prefix}menu converter`
      ]);

      rich.addText(`[View channel](${channelLink})`);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.tovideo', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        animated,
        size:      mp4.length
      });

    } catch (err) {
      log.error(`tovideo failed: ${err.message}`);

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