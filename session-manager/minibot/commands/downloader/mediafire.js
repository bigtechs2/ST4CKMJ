import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:mediafire');

const SYM = brand.SYM;

const MF_URL = /^(https?:\/\/)?(www\.)?mediafire\.com\/(file|download)\/.+/;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'mediafire',
  aliases: ['mf', 'dlmediafire'],
  category: 'downloader',
  description: 'Download files from MediaFire',
  emoji: '▸',
  usage: '<mediafire url>',

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

    if (!url || !MF_URL.test(url)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *MediaFire Downloader*\n\n` +
          `${SYM.arrow} Usage: ${prefix}mf <url>\n` +
          `${SYM.arrow} Example: ${prefix}mf https://mediafire.com/file/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *MediaFire*\n` +
        `${SYM.arrow} fetching file…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.azbry.com/api/download/mediafire',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.data) {
        throw new Error('API returned no data');
      }

      const result = data.data;
      const name   = result.name || 'Unknown File';
      const ext    = (result.ext || 'bin').toLowerCase();
      const size   = result.size || 'Unknown';
      const uploaded = result.uploaded || 'Unknown';
      const link   = result.link || '';

      if (!link) throw new Error('no download link');

      const loadingRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      loadingRich.addText(
        `${SYM.heart} *${name}*\n\n` +
        `${SYM.arrow} type     · ${result.filetype || ext.toUpperCase()}\n` +
        `${SYM.arrow} size     · ${size}\n` +
        `${SYM.arrow} uploaded · ${uploaded}\n\n` +
        `${SYM.pointer} downloading file…`,
        { id: 'status' }
      );

      loadingRich.addText(footer(channelLink));
      loadingRich.setFooter(config.msg.footer);

      const loadingBuilt = await loadingRich.build(chatId);
      await loadingRich.sendEdit(chatId, msgId, { msg: loadingBuilt.message });

      const fileRes = await axios.get(link, {
        responseType: 'arraybuffer',
        timeout:      90000,
        maxBodyLength: Infinity
      });

      const buffer = Buffer.from(fileRes.data);

      await sock.sendMessage(chatId, {
        document: buffer,
        mimetype: 'application/octet-stream',
        fileName: name,
        caption:
          `${SYM.heart} *${name}*\n` +
          `${SYM.arrow} ${size}\n\n` +
          footer(channelLink)
      }, { quoted: msg });

      const finalRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      finalRich.addText(
        `${SYM.check} *File sent*\n` +
        `${SYM.arrow} ${name}\n` +
        `${SYM.arrow} ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
        { id: 'final' }
      );

      finalRich.addSuggest([
        `${prefix}mf`,
        `${prefix}apkdl`,
        `${prefix}menu downloader`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const finalBuilt = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: finalBuilt.message });

      log.event('command.mediafire', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        size:      buffer.length
      });

    } catch (err) {
      log.error(`mediafire failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} MediaFire failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};