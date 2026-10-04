import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:tiktokdl');

const SYM = brand.SYM;

const TT_URL = /^https?:\/\/(www\.)?(tiktok|vt)\.(com|tiktok)/i;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

function extractUrls(result) {
  const urls = [];

  if (typeof result === 'string') {
    if (result.startsWith('http')) urls.push(result);
  } else if (Array.isArray(result)) {
    for (const item of result) {
      if (typeof item === 'string' && item.startsWith('http')) urls.push(item);
    }
  } else if (result && typeof result === 'object') {
    if (Array.isArray(result.data)) {
      for (const item of result.data) {
        if (typeof item === 'string' && item.startsWith('http')) urls.push(item);
      }
    } else if (typeof result.data === 'string' && result.data.startsWith('http')) {
      urls.push(result.data);
    } else if (typeof result.video === 'string') {
      urls.push(result.video);
    } else if (typeof result.url === 'string') {
      urls.push(result.url);
    }
  }

  return [...new Set(urls)];
}

export default {
  name: 'tiktokdl',
  aliases: ['tiktok', 'tt', 'ttdl', 'vt', 'vtdl'],
  category: 'downloader',
  description: 'Download TikTok videos',
  emoji: '▸',
  usage: '<tiktok url>',

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
          `${SYM.info} *TikTok Downloader*\n\n` +
          `${SYM.arrow} Usage: ${prefix}tt <url>\n` +
          `${SYM.arrow} Example: ${prefix}tt https://tiktok.com/@user/video/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    if (!TT_URL.test(url)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Invalid TikTok URL\n\n${footer(channelLink)}`
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *TikTok Video*\n` +
        `${SYM.arrow} fetching…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.nexray.eu.cc/downloader/tiktok',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        throw new Error('no data');
      }

      const result = data.result;
      const videoUrls = extractUrls(result);

      if (!videoUrls.length) {
        throw new Error('no video URL');
      }

      const author = result.author || result.username || 'Unknown';
      const title  = (result.title || result.description || result.caption || 'TikTok Video').slice(0, 120);
      const thumb  = result.thumbnail || config.bot.thumbnail;

      let first = true;

      for (const videoUrl of videoUrls) {
        const rich2 = new AIRich(sock).setTitle(brand.BOT_NAME);

        rich2.addVideo(videoUrl, { autoFill: true });

        rich2.addText(
          `${SYM.heart} *${title}*\n` +
          `${SYM.arrow} author · ${author}`,
          { id: 'info' }
        );

        rich2.addSuggest([
          `${prefix}tt`,
          `${prefix}ig`,
          `${prefix}fb`,
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

      log.event('command.tiktokdl', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        count:     videoUrls.length
      });

    } catch (err) {
      log.error(`tiktokdl failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} TikTok download failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};