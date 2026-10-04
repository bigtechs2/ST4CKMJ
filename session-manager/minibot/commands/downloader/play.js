import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:play');

const SYM = brand.SYM;

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
  name: 'play',
  aliases: ['ytplay', 'music'],
  category: 'downloader',
  description: 'Search and download YouTube audio',
  emoji: '▸',
  usage: '<song name>',

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

    const query = (Array.isArray(args) ? args : []).join(' ').trim();

    if (!query) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *Play Music*\n\n` +
          `${SYM.arrow} Usage: ${prefix}play <song>\n` +
          `${SYM.arrow} Example: ${prefix}play faded\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *Play*\n` +
        `${SYM.arrow} searching · _${query}_\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.azbry.com/api/download/ytplay',
        { params: { q: query }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        throw new Error('no results');
      }

      const result    = data.result;
      const title     = result.title || 'Unknown';
      const channel   = result.channel || 'Unknown';
      const thumbnail = result.thumbnail || config.bot.thumbnail;
      const duration  = result.duration || 'N/A';
      const videoUrl  = result.url || '';
      const audioUrl  = result.download || '';

      if (!audioUrl) throw new Error('no audio URL');

      const downloading = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        downloading.addImage(thumbnail, { width: 360, height: 360, id: 'thumb' });
      }

      downloading.addText(
        `${SYM.heart} *${title.slice(0, 80)}*\n` +
        `${SYM.arrow} artist · ${channel}\n` +
        `${SYM.arrow} duration · ${fmtDur(duration)}\n\n` +
        `${SYM.pointer} downloading audio…`,
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
        `${SYM.arrow} duration · ${fmtDur(duration)}\n` +
        `${SYM.arrow} sent · ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
        { id: 'final' }
      );

      finalRich.addSuggest([
        `${prefix}play`,
        `${prefix}ytmp3`,
        `${prefix}menu downloader`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const finalBuilt = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: finalBuilt.message });

      log.event('command.play', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        query,
        size:      buffer.length
      });

    } catch (err) {
      log.error(`play failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Play failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};