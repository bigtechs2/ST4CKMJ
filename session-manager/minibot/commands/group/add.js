import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:add');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'add',
  aliases: ['adduser', 'invitemember'],
  category: 'group',
  description: 'Add a user to the group',
  emoji: '▣',
  usage: '<number>',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const raw = String(args?.[0] || '').replace(/\D/g, '');

    if (!raw || raw.length < 8 || raw.length > 15) {
      return sock.sendMessage(chatId, {
        text: `${SYM.info} Usage: ${prefix}add <number>\n${SYM.arrow} example: ${prefix}add 255712345678\n\n${footer()}`
      }, { quoted: msg });
    }

    const jid = `${raw}@s.whatsapp.net`;

    try {
      const result = await sock.groupParticipantsUpdate(chatId, [jid], 'add');
      const status = result?.[0]?.status;

      const statusMap = {
        '200': 'added successfully',
        '403': 'privacy prevents adding · invite sent',
        '408': 'invite sent · user must accept',
        '409': 'already in group',
        '500': 'not on WhatsApp'
      };

      const msgText = statusMap[status] || 'request sent';

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${status === '200' ? SYM.check : SYM.info} *${status === '200' ? 'Added' : 'Request sent'}*\n\n` +
        `${SYM.arrow} number · ${raw}\n` +
        `${SYM.arrow} status · ${msgText}`,
        { id: 'info' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions: [jid], quoted: msg });

      log.event('cmd.add', { sessionId: ctx.sessionId, chatId, status });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};