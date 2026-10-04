import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:couplepp');

const SYM = brand.SYM;

const API_URL = 'https://apis.davidcyriltech.my.id/couplepp';

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'couplepp',
  aliases: ['couple', 'couplepfp', 'couplepic'],
  category: 'funny',
  description: 'Fetch a random couple profile picture pair',
  emoji: '☺',
  usage: '',

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
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *Couple PP*\n` +
        `${SYM.arrow} fetching pictures…\n\n` +
        `${SYM.timer} please wait`,
        { id: 'status' }
      );

      rich.addText(footer(channelLink));
      rich.setFooter(config.msg.footer);

      const sent  = await rich.send(chatId, { quoted: msg });
      const msgId = sent.key.id;

      const { data } = await axios.get(API_URL, { timeout: 15000 });

      if (!data?.success || !data?.male || !data?.female) {
        throw new Error('API returned no couple data');
      }

      const finalRich = new AIRich(sock).setTitle(brand.BOT_NAME);

      finalRich.addText(
        `${SYM.heart} *Couple Profile Pictures*\n` +
        `${SYM.arrow} male   · below\n` +
        `${SYM.arrow} female · below\n\n` +
        `${SYM.info} _tap each image to view full size_`,
        { id: 'intro' }
      );

      finalRich.addImage(data.male, {
        width:     512,
        height:    512,
        insertAt: 'intro',
        id:       'male_pic'
      });

      finalRich.addImage(data.female, {
        width:     512,
        height:    512,
        insertAt: 'intro',
        id:       'female_pic'
      });

      finalRich.addSuggest([
        `${prefix}couplepp`,
        `${prefix}menu funny`
      ]);

      finalRich.addText(footer(channelLink));
      finalRich.setFooter(config.msg.footer);

      const built = await finalRich.build(chatId);
      await finalRich.sendEdit(chatId, msgId, { msg: built.message });

      log.event('command.couplepp', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`couplepp failed: ${err.message}`);

      let userMsg = err.message.slice(0, 100);
      if (err.response?.status === 429) userMsg = 'rate limited · try again later';
      else if (err.response?.status === 404) userMsg = 'no couple images found';

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Couple PP failed\n` +
            `${SYM.arrow} ${userMsg}\n\n` +
            footer(channelLink)
        }, { quoted: msg });
      } catch {}
    }
  }
};