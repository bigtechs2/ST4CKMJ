import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:setpp');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'setpp',
  aliases: ['gpp', 'grouppic', 'setgroupicon'],
  category: 'group',
  description: 'Change the group profile picture',
  emoji: '▣',
  usage: '(reply to image)',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, quoted, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const direct = msg.message?.imageMessage;
    const replyImg = quoted?.message?.imageMessage;

    if (!direct && !replyImg) {
      return sock.sendMessage(chatId, {
        text: `${SYM.info} Reply to an image with ${prefix}setpp\n\n${footer()}`
      }, { quoted: msg });
    }

    try {
      const buffer = await downloadMediaMessage(
        direct ? msg : quoted,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      );

      await sock.updateProfilePicture(chatId, buffer);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(`${SYM.check} *Group picture updated*`, { id: 'ok' });
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.setpp', { sessionId: ctx.sessionId, chatId, size: buffer.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};