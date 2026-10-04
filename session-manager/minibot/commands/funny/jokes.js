import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:jokes');

const SYM = brand.SYM;

const FALLBACK_JOKES = [
  { setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything!" },
  { setup: "Why did the scarecrow win an award?", punchline: "Because he was outstanding in his field!" },
  { setup: "I told my wife she was drawing her eyebrows too high.", punchline: "She looked surprised." },
  { setup: "What do you call a fake noodle?", punchline: "An impasta!" },
  { setup: "Why don't eggs tell jokes?", punchline: "They'd crack each other up!" },
  { setup: "I'm reading a book about anti-gravity.", punchline: "It's impossible to put down!" }
];

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

async function fetchJoke() {
  try {
    const { data } = await axios.get(
      'https://official-joke-api.appspot.com/random_joke',
      { timeout: 10000 }
    );

    if (data?.setup && data?.punchline) {
      return { setup: data.setup, punchline: data.punchline };
    }
  } catch {}

  return FALLBACK_JOKES[Math.floor(Math.random() * FALLBACK_JOKES.length)];
}

export default {
  name: 'jokes',
  aliases: ['joke', 'dadjoke', 'dadjokes'],
  category: 'funny',
  description: 'Random joke',
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
      const joke = await fetchJoke();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *Joke*\n\n` +
        `${SYM.arrow} ${joke.setup}\n\n` +
        `${SYM.pointer} _${joke.punchline}_`,
        { id: 'joke' }
      );

      rich.addSuggest([
        `${prefix}jokes`,
        `${prefix}roast`,
        `${prefix}menu funny`
      ]);

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.jokes', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`jokes failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Jokes failed\n${SYM.arrow} ${err.message.slice(0, 80)}\n\n${footer(channelLink)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};