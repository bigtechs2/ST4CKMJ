import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:instagramdl');

const SYM = brand.SYM;

const IG_URL = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'instagramdl',
  aliases: ['ig', 'igdl', 'instagram'],
  category: 'downloader',
  description: 'Download Instagram media',
  emoji: '▸',
  usage: '<instagram url>',

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

    const url = args?.[0] || ctx.quoted?.message?.extendedTextMessage?.text;

    if (!url) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *Instagram Downloader*\n\n` +
          `${SYM.arrow} Usage: ${prefix}ig <url>\n` +
          `${SYM.arrow} Example: ${prefix}ig https://instagram.com/p/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    if (!IG_URL.test(url)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Invalid Instagram URL\n\n${footer(channelLink)}`
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *Instagram Media*\n` +
        `${SYM.arrow} fetching…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.nexray.eu.cc/downloader/instagram',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Could not fetch media\n\n${footer(channelLink)}`
        }, { quoted: msg });
      }

      const result = data.result;
      const items  = Array.isArray(result) ? result : [result];

      if (!items.length) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} No media found\n\n${footer(channelLink)}`
        }, { quoted: msg });
      }

      let first = true;

      for (const item of items) {
        const type  = item?.type || 'image';
        const mediaUrl = item?.url;
        if (!mediaUrl) continue;

        const rich2 = new AIRich(sock).setTitle(brand.BOT_NAME);

        if (type === 'video') {
          rich2.addVideo(mediaUrl, { autoFill: true });
        } else {
          rich2.addImage(mediaUrl, { width: 512, height: 512, id: 'media' });
        }

        rich2.addText(
          `${SYM.heart} *Instagram Post*\n` +
          `${SYM.arrow} type · ${type}`,
          { id: 'info' }
        );

        rich2.addSuggest([
          `${prefix}ig`,
          `${prefix}fb`,
          `${prefix}tt`,
          `${prefix}menu downloader`
        ]);

        rich2.addText(footer(channelLink));
        rich2.setFooter(config.msg.footer);

        const built = await rich2.build(chatId);

        if (first) {
          await rich2.sendEdit(chatId, msgId, { msg: built.message });
          first = false;
        } else {
          await rich2.send(chatId, { quoted: msg });
        }
      }

      log.event('command.instagramdl', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        count:     items.length
      });

    } catch (err) {
      log.error(`instagramdl failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Instagram download failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};