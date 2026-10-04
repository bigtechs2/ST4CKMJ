import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:ytmp3');

const SYM = brand.SYM;

const YT_URL = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'ytmp3',
  aliases: ['ytmp3', 'downloadmp3'],
  category: 'downloader',
  description: 'Download YouTube audio as MP3',
  emoji: '▸',
  usage: '<youtube url>',

  permissions: {
    coin:    10,
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
          `${SYM.info} *YT MP3*\n\n` +
          `${SYM.arrow} Usage: ${prefix}ytmp3 <url>\n` +
          `${SYM.arrow} Example: ${prefix}ytmp3 https://youtu.be/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *YT MP3*\n` +
        `${SYM.arrow} fetching…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.azbry.com/api/download/ytmp3',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        throw new Error('no data');
      }

      const result    = data.result;
      const title     = result.title || 'Unknown';
      const channel   = result.channel || 'Unknown';
      const thumbnail = result.thumbnail || config.bot.thumbnail;
      const audioUrl  = result.download || '';

      if (!audioUrl) throw new Error('no audio URL');

      const downloading = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        downloading.addImage(thumbnail, { width: 360, height: 360, id: 'thumb' });
      }

      downloading.addText(
        `${SYM.heart} *${title.slice(0, 80)}*\n` +
        `${SYM.arrow} artist · ${channel}\n\n` +
        `${SYM.pointer} downloading MP3…`,
        { id: 'status' }
      );

      downloading.addText(footer(channelLink));
      downloading.setFooter(config.msg.footer);

      const dlBuilt = await downloading.build(chatId);
      await downloading.sendEdit(chatId, msgId, { msg: dlBuilt.message });

      const audioRes = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout:      90000,
        maxBodyLength: Infinity
      });

      const buffer = Buffer.from(audioRes.data);

      await sock.sendMessage(chatId, {
        audio:    buffer,
        mimetype: 'audio/mpeg',
        fileName: `${title.slice(0, 60)}.mp3`,
        ptt:      false
      }, { quoted: msg });

      const finalRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        finalRich.addImage(thumbnail, { width: 360, height: 360, id: 'thumb' });
      }

      finalRich.addText(
        `${SYM.check} *${title.slice(0, 80)}*\n` +
        `${SYM.arrow} artist · ${channel}\n` +
        `${SYM.arrow} sent · ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
        { id: 'final' }
      );

      finalRich.addSuggest([
        `${prefix}ytmp3`,
        `${prefix}ytmp4`,
        `${prefix}play`,
        `${prefix}menu downloader`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const finalBuilt = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: finalBuilt.message });

      log.event('command.ytmp3', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        size:      buffer.length
      });

    } catch (err) {
      log.error(`ytmp3 failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} YT MP3 failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};