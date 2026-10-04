import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:ytmp4');

const SYM = brand.SYM;

const YT_URL = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

function fmtDur(v) {
  if (!v || v === 'N/A') return 'N/A';
  const n = parseInt(v);
  if (isNaN(n)) return v;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default {
  name: 'ytmp4',
  aliases: ['ytvideo', 'downloadmp4'],
  category: 'downloader',
  description: 'Download YouTube video as MP4',
  emoji: '▸',
  usage: '<youtube url>',

  permissions: {
    coin:    15,
    owner:   false,
    admin:   false,
    premium: true,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;
    const channelLink = config.bot.channelLink || config.links.whatsappChannel;

    const url = args?.[0];

    if (!url || !YT_URL.test(url)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *YT MP4*\n\n` +
          `${SYM.arrow} Usage: ${prefix}ytmp4 <url>\n` +
          `${SYM.arrow} Example: ${prefix}ytmp4 https://youtu.be/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *YT MP4*\n` +
        `${SYM.arrow} fetching…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.azbry.com/api/download/ytmp4',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        throw new Error('no data');
      }

      const result    = data.result;
      const title     = result.title || 'Unknown';
      const author    = result.author || 'Unknown';
      const thumbnail = result.thumbnail || config.bot.thumbnail;
      const duration  = result.duration || 'N/A';
      const quality   = result.quality || '720p';
      const videoUrl  = result.download || '';

      if (!videoUrl) throw new Error('no video URL');

      const finalRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      finalRich.addVideo(videoUrl, { autoFill: true });

      finalRich.addText(
        `${SYM.heart} *${title.slice(0, 80)}*\n` +
        `${SYM.arrow} artist   · ${author}\n` +
        `${SYM.arrow} duration · ${fmtDur(duration)}\n` +
        `${SYM.arrow} quality  · ${quality}`,
        { id: 'final' }
      );

      finalRich.addSuggest([
        `${prefix}ytmp4`,
        `${prefix}ytmp3`,
        `${prefix}play`,
        `${prefix}menu downloader`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const built = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: built.message });

      log.event('command.ytmp4', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        quality
      });

    } catch (err) {
      log.error(`ytmp4 failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} YT MP4 failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};