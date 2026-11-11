import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:adminlist');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export default {
  name: 'adminlist',
  aliases: ['admins', 'listadmin', 'staff'],
  category: 'group',
  description: 'List all group admins',
  emoji: '▣',
  usage: '',
  permissions: { coin: 0, owner: false, admin: false, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId } = ctx;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    try {
      const meta = await sock.groupMetadata(chatId);
      const admins = (meta.participants || []).filter(
        (p) => p.admin === 'admin' || p.admin === 'superadmin'
      );

      if (!admins.length) {
        return sock.sendMessage(chatId, { text: `${SYM.info} No admins found\n\n${footer()}` }, { quoted: msg });
      }

      const mentions = admins.map((a) => `${normalize(a.id)}@s.whatsapp.net`);
      const lines = admins
        .map((a, i) => {
          const n = brand.NUM.normal[i + 1] || `(${i + 1})`;
          const label = a.admin === 'superadmin' ? '· owner' : '· admin';
          return `   ${n} @${normalize(a.id)} ${label}`;
        })
        .join('\n');

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *${meta.subject || 'Group'} · Admins*\n\n` +
        `${SYM.arrow} total · ${admins.length}\n\n` +
        `${SYM.diamond} *List*\n\n${lines}`,
        { id: 'list' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions, quoted: msg });

      log.event('cmd.adminlist', { sessionId: ctx.sessionId, chatId, count: admins.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n\n${footer()}` }, { quoted: msg });
    }
  }
};