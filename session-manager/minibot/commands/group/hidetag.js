import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:hidetag');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export default {
  name: 'hidetag',
  aliases: ['silenttag', 'shadowtag'],
  category: 'group',
  description: 'Tag all members silently (no mention list shown)',
  emoji: '▣',
  usage: '<message>',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const text = (args || []).join(' ').trim();
    if (!text) {
      return sock.sendMessage(chatId, {
        text: `${SYM.info} Usage: ${prefix}hidetag <message>\n\n${footer()}`
      }, { quoted: msg });
    }

    try {
      const meta = await sock.groupMetadata(chatId);
      const mentions = (meta.participants || []).map((p) => `${normalize(p.id)}@s.whatsapp.net`);

      await sock.sendMessage(chatId, {
        text: `${text}\n\n${footer()}`,
        mentions
      });

      log.event('cmd.hidetag', { sessionId: ctx.sessionId, chatId, count: mentions.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n\n${footer()}` }, { quoted: msg });
    }
  }
};