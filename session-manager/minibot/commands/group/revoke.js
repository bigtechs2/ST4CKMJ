import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:revoke');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'revoke',
  aliases: ['resetlink', 'newlink', 'newinvite', 'resetinvite'],
  category: 'group',
  description: 'Reset the group invite link',
  emoji: '▣',
  usage: '',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId } = ctx;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    try {
      const newCode = await sock.groupRevokeInvite(chatId);
      const newLink = `https://chat.whatsapp.com/${newCode}`;

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Invite link reset*\n\n` +
        `${SYM.arrow} old link · revoked\n` +
        `${SYM.arrow} new link · below\n\n` +
        `\`${newLink}\``,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.revoke', { sessionId: ctx.sessionId, chatId });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};