import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:pinterestdl');

const SYM = brand.SYM;

const PIN_URL = /^https?:\/\/(www\.)?(pinterest|pin)\.(com|it)/i;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'pinterestdl',
  aliases: ['pindl', 'pinurl'],
  category: 'downloader',
  description: 'Download Pinterest image',
  emoji: '▸',
  usage: '<pinterest url>',

  permissions: {
    coin:    5,
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

    const url = args?.[0] || ctx.quoted?.message?.extendedTextMessage?.text;

    if (!url) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *Pinterest Downloader*\n\n` +
          `${SYM.arrow} Usage: ${prefix}pin <url>\n` +
          `${SYM.arrow} Example: ${prefix}pin https://pin.it/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    if (!PIN_URL.test(url)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Invalid Pinterest URL\n\n${footer(channelLink)}`
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *Pinterest*\n` +
        `${SYM.arrow} fetching image…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.azbry.com/api/download/pinterest',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        throw new Error('API returned no data');
      }

      const result = data.result;
      const images = result.images || [];
      const best   = images.find((i) => i.name === 'orig') || images[images.length - 1] || { url: result.download };
      const imageUrl = best?.url || result.download || result.thumbnail;

      if (!imageUrl) {
        throw new Error('no image URL');
      }

      const title  = result.title || 'Pinterest Image';
      const user   = result.user || {};
      const author = user.fullName || user.username || 'Unknown';
      const stats  = result.stats || {};

      const finalRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      finalRich.addImage(imageUrl, { width: 512, height: 512, id: 'img' });

      finalRich.addText(
        `${SYM.heart} *${title.slice(0, 100)}*\n` +
        `${SYM.arrow} user · ${author}\n` +
        `${SYM.arrow} likes · ${stats.likes || 0}\n` +
        `${SYM.arrow} shares · ${stats.shares || 0}`,
        { id: 'final' }
      );

      finalRich.addSuggest([
        `${prefix}pin`,
        `${prefix}ig`,
        `${prefix}menu downloader`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const built = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: built.message });

      log.event('command.pinterestdl', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`pinterestdl failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Pinterest download failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};