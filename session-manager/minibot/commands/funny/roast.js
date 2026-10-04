import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:roast');

const SYM = brand.SYM;

const FALLBACK_ROASTS = [
  "you're the reason shampoo bottles have instructions",
  "you bring everyone so much joy... when you leave the room",
  "I'd agree with you but then we'd both be wrong",
  "you're not stupid, you just have bad luck when you think",
  "somewhere a tree is working hard to produce your oxygen",
  "you're the human version of a pop-up ad",
  "your secrets are safe with me — I never listen anyway",
  "if laziness was an Olympic sport, you'd come in fourth so you didn't have to walk to the podium"
];

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

async function fetchRoast() {
  try {
    const { data } = await axios.get(
      'https://evilinsult.com/generate_insult.php?lang=en&type=json',
      { timeout: 10000 }
    );
    if (data?.insult) return data.insult;
  } catch {}

  return FALLBACK_ROASTS[Math.floor(Math.random() * FALLBACK_ROASTS.length)];
}

export default {
  name: 'roast',
  aliases: ['roasts', 'burn'],
  category: 'funny',
  description: 'Roast a user (fun)',
  emoji: '☺',
  usage: '@user (or reply)',

  permissions: {
    coin:    2,
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

    try {
      const mentions = getMentions(msg);
      const target   = getTarget(ctx, mentions);

      if (!target) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Roast*\n\n` +
            `${SYM.arrow} tag someone or reply to their message\n` +
            `${SYM.arrow} example: ${prefix}roast @user\n\n` +
            footer(channelLink)
        }, { quoted: msg });
      }

      const roast = await fetchRoast();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *Roast for @${target}*\n\n` +
        `${SYM.arrow} _${roast}_`,
        { id: 'roast' }
      );

      rich.addSuggest([
        `${prefix}roast`,
        `${prefix}insult`,
        `${prefix}menu funny`
      ]);

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, {
        quoted:   msg,
        mentions: [`${target}@s.whatsapp.net`]
      });

      log.event('command.roast', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        target
      });

    } catch (err) {
      log.error(`roast failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Roast failed\n${SYM.arrow} ${err.message.slice(0, 80)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};