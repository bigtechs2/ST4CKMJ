import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:facebookdl');

const SYM = brand.SYM;

const FB_URL = /^https?:\/\/(www\.)?(facebook|fb)\.(com|watch)/i;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

async function editStatus(sock, chatId, msgId, { title, lines, thumb, channelLink }) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  if (thumb) {
    rich.addImage(thumb, { width: 360, height: 360, id: 'thumb' });
  }

  rich.addText(
    `${SYM.heart} *${title}*\n\n` + lines.filter(Boolean).join('\n'),
    { id: 'status' }
  );

  rich.addText(footer(channelLink));
  rich.setFooter(config.msg.footer);

  const built = await rich.build(chatId);
  await rich.sendEdit(chatId, msgId, { msg: built.message });
}

export default {
  name: 'facebookdl',
  aliases: ['facebook', 'fb', 'fbdl'],
  category: 'downloader',
  description: 'Download Facebook videos',
  emoji: '▸',
  usage: '<facebook url>',

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
          `${SYM.info} *Facebook Downloader*\n\n` +
          `${SYM.arrow} Usage: ${prefix}fb <url>\n` +
          `${SYM.arrow} Example: ${prefix}fb https://fb.watch/xxx\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }

    if (!FB_URL.test(url)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Invalid Facebook URL\n\n${footer(channelLink)}`
      }, { quoted: msg });
    }

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *Facebook Video*\n` +
        `${SYM.arrow} fetching…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(
        'https://api.nexray.eu.cc/downloader/facebook',
        { params: { url }, timeout: 30000 }
      );

      if (!data?.status || !data?.result) {
        return editStatus(sock, chatId, msgId, {
          title: 'Facebook Video',
          lines: [
            `${SYM.cross} could not fetch video`,
            `${SYM.arrow} try a different URL`
          ],
          channelLink
        });
      }

      const result = data.result;
      const videoUrl = result.video_hd || result.video_sd || result.video;
      const desc     = (result.description || result.caption || result.title || 'Facebook Video').slice(0, 200);
      const author   = result.author || result.username || 'Unknown';
      const thumb    = result.thumbnail || config.bot.thumbnail;

      if (!videoUrl) {
        return editStatus(sock, chatId, msgId, {
          title: 'Facebook Video',
          lines: [`${SYM.cross} no downloadable video found`],
          channelLink
        });
      }

      await editStatus(sock, chatId, msgId, {
        title: 'Facebook Video',
        lines: [
          `${SYM.arrow} title  · ${desc}`,
          `${SYM.arrow} author · ${author}`,
          '',
          `${SYM.pointer} sending video…`
        ],
        thumb,
        channelLink
      });

      const finalRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      finalRich.addVideo(videoUrl, { autoFill: true });

      finalRich.addText(
        `${SYM.heart} *${desc}*\n` +
        `${SYM.arrow} author · ${author}`,
        { id: 'final' }
      );

      finalRich.addSuggest([
        `${prefix}fb`,
        `${prefix}ig`,
        `${prefix}tt`,
        `${prefix}menu downloader`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const built = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: built.message });

      log.event('command.facebookdl', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`facebookdl failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Facebook download failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};