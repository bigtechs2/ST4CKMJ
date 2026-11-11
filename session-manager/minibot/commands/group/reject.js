import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:reject');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export default {
  name: 'reject',
  aliases: ['rejectall', 'decline', 'declineall'],
  category: 'group',
  description: 'Reject pending join requests',
  emoji: '▣',
  usage: '[all | @user]',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, mentionedJids, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

    try {
      if (mentions.length) {
        await sock.groupRequestParticipantsUpdate(chatId, mentions, 'reject');

        const nums = mentions.map((j) => normalize(j));
        const list = nums.map((n) => `   ${SYM.arrow} @${n}`).join('\n');

        const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
        rich.addText(`${SYM.cross} *Rejected*\n\n${list}`, { id: 'ok' });
        rich.addText(footer());
        rich.setFooter(config.msg.footer);
        await rich.send(chatId, { mentions: mentions.map((j) => `${normalize(j)}@s.whatsapp.net`), quoted: msg });

        log.event('cmd.reject.user', { sessionId: ctx.sessionId, chatId, count: mentions.length });
        return;
      }

      const pending = await sock.groupRequestParticipantsList(chatId);
      if (!pending.length) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} *No pending requests*\n\n${footer()}`
        }, { quoted: msg });
      }

      const jids = pending.map((p) => p.jid);
      await sock.groupRequestParticipantsUpdate(chatId, jids, 'reject');

      const nums = jids.map((j) => normalize(j));
      const list = nums.slice(0, 20).map((n) => `   ${SYM.arrow} @${n}`).join('\n');
      const more = nums.length > 20 ? `\n   ${SYM.more} +${nums.length - 20} more` : '';

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.cross} *All requests rejected*\n\n` +
        `${SYM.arrow} total · ${nums.length}\n\n${list}${more}`,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions: jids.slice(0, 20).map((j) => `${normalize(j)}@s.whatsapp.net`), quoted: msg });

      log.event('cmd.reject.all', { sessionId: ctx.sessionId, chatId, count: nums.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};