import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:tagall');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export default {
  name: 'tagall',
  aliases: ['everyone', 'allmembers', 'mentionall'],
  category: 'group',
  description: 'Tag every member in the group',
  emoji: '▣',
  usage: '[message]',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    try {
      const meta = await sock.groupMetadata(chatId);
      const members = (meta.participants || []).filter((p) => !p.admin);
      if (!members.length) {
        return sock.sendMessage(chatId, { text: `${SYM.info} No members to tag\n\n${footer()}` }, { quoted: msg });
      }

      const mentions = members.map((m) => `${normalize(m.id)}@s.whatsapp.net`);
      const customText = (args || []).join(' ').trim();
      const header = customText || `Attention everyone`;
      const memberList = mentions.map((m) => `@${m.split('@')[0]}`).join(' ');

      const body =
        `${SYM.square} *Announcement*\n\n` +
        `${SYM.arrow} ${header}\n` +
        `${SYM.arrow} by @${normalize(msg.key.participant)}` +
        `\n\n${memberList}`;

      await sock.sendMessage(chatId, {
        text: `${body}\n\n${footer()}`,
        mentions: [...mentions, msg.key.participant]
      });

      log.event('cmd.tagall', { sessionId: ctx.sessionId, chatId, count: members.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};