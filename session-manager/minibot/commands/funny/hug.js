import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:hug');

const SYM = brand.SYM;

const API = 'https://api.waifu.pics/sfw/hug';

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

function getMentions(msg) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    {};
  return ctx.mentionedJid || [];
}

function getTarget(ctx, mentions) {
  if (mentions.length) {
    return mentions[0].split('@')[0].split(':')[0].replace(/\D/g, '');
  }

  const quoted = ctx.quoted;
  if (quoted?.sender) return quoted.sender;

  return null;
}

export default {
  name: 'hug',
  aliases: ['hugs', 'cuddle', 'cuddles'],
  category: 'funny',
  description: 'Send a hug to someone',
  emoji: '☺',
  usage: '@user (or reply)',

  permissions: {
    coin:    1,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sessionCfg, senderName } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;
    const channelLink = config.bot.channelLink || config.links.whatsappChannel;

    try {
      const mentions = getMentions(msg);
      const target   = getTarget(ctx, mentions);

      if (!target) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Hug*\n\n` +
            `${SYM.arrow} tag someone or reply to their message\n` +
            `${SYM.arrow} example: ${prefix}hug @user\n\n` +
            footer(channelLink)
        }, { quoted: msg });
      }

      const { data } = await axios.get(API, { timeout: 15000 });
      const gifUrl = data?.url;

      if (!gifUrl) throw new Error('no hug url');

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *${senderName || 'Someone'} hugs @${target}* 🤗`,
        { id: 'msg' }
      );

      rich.addImage(gifUrl, {
        width:     480,
        height:    480,
        insertAt: 'msg',
        id:       'hug'
      });

      rich.addSuggest([
        `${prefix}hug`,
        `${prefix}kiss`,
        `${prefix}menu funny`
      ]);

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, {
        quoted:    msg,
        mentions:  [`${target}@s.whatsapp.net`]
      });

      log.event('command.hug', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        target
      });

    } catch (err) {
      log.error(`hug failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Hug failed\n${SYM.arrow} ${err.message.slice(0, 80)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};