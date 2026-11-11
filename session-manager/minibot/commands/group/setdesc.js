import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:setdesc');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'setdesc',
  aliases: ['gdesc', 'groupdesc', 'setdescription'],
  category: 'group',
  description: 'Change the group description',
  emoji: '▣',
  usage: '<text>',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const text = (args || []).join(' ').trim().slice(0, 512);
    if (!text) {
      return sock.sendMessage(chatId, {
        text: `${SYM.info} Usage: ${prefix}setdesc <text>\n${SYM.arrow} max 512 chars\n\n${footer()}`
      }, { quoted: msg });
    }

    try {
      await sock.groupUpdateDescription(chatId, text);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(`${SYM.check} *Description updated*\n\n${SYM.arrow} ${text.slice(0, 200)}`, { id: 'ok' });
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.setdesc', { sessionId: ctx.sessionId, chatId });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};