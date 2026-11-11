import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:setname');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'setname',
  aliases: ['gname', 'groupname', 'renamegroup'],
  category: 'group',
  description: 'Change the group name',
  emoji: '▣',
  usage: '<new name>',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const newName = (args || []).join(' ').trim().slice(0, 25);
    if (!newName) {
      return sock.sendMessage(chatId, {
        text: `${SYM.info} Usage: ${prefix}setname <new name>\n${SYM.arrow} max 25 chars\n\n${footer()}`
      }, { quoted: msg });
    }

    try {
      await sock.groupUpdateSubject(chatId, newName);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(`${SYM.check} *Group renamed*\n\n${SYM.arrow} new name · *${newName}*`, { id: 'ok' });
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.setname', { sessionId: ctx.sessionId, chatId });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};