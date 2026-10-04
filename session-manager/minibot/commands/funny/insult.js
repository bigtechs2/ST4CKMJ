import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:insult');

const SYM = brand.SYM;

const FALLBACK_INSULTS = [
  "you're proof that evolution can go in reverse",
  "your brain has too many tabs open and none of them are loading",
  "you're like a cloud — when you disappear, it's a beautiful day",
  "if ignorance is bliss, you must be the happiest person alive",
  "you're not the dumbest person on earth, but you better hope they don't die",
  "you have the perfect face for radio",
  "I'm jealous of everyone who hasn't met you",
  "you're not stupid, you're just allergic to smart"
];

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

async function fetchInsult() {
  try {
    const { data } = await axios.get(
      'https://evilinsult.com/generate_insult.php?lang=en&type=json',
      { timeout: 10000 }
    );
    if (data?.insult) return data.insult;
  } catch {}

  return FALLBACK_INSULTS[Math.floor(Math.random() * FALLBACK_INSULTS.length)];
}

export default {
  name: 'insult',
  aliases: ['insults', 'burn'],
  category: 'funny',
  description: 'Random insult generator',
  emoji: '☺',
  usage: '',

  permissions: {
    coin:    1,
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
      const insult = await fetchInsult();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *Insult*\n\n` +
        `${SYM.arrow} _${insult}_`,
        { id: 'insult' }
      );

      rich.addSuggest([
        `${prefix}insult`,
        `${prefix}roast`,
        `${prefix}menu funny`
      ]);

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.insult', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`insult failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Insult failed\n${SYM.arrow} ${err.message.slice(0, 80)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};