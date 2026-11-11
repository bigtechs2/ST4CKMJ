import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:listrequests');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-GB', { hour12: false });
}

export default {
  name: 'listrequests',
  aliases: ['requests', 'joinrequests', 'pendingrequests', 'listrequest'],
  category: 'group',
  description: 'List pending join requests',
  emoji: '▣',
  usage: '',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    try {
      const pending = await sock.groupRequestParticipantsList(chatId);

      if (!pending.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *No pending requests*\n` +
            `${SYM.arrow} nobody is waiting to join\n\n${footer()}`
        }, { quoted: msg });
      }

      const jids = pending.map((p) => p.jid);
      const mentions = jids.map((j) => `${normalize(j)}@s.whatsapp.net`);

      const lines = pending.slice(0, 30)
        .map((p, i) => {
          const n = brand.NUM.normal[i + 1] || `(${i + 1})`;
          return `   ${n} @${normalize(p.jid)} · ${fmtTime(p.timestamp)}`;
        })
        .join('\n');

      const more = pending.length > 30 ? `\n   ${SYM.more} +${pending.length - 30} more` : '';

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Join Requests*\n\n` +
        `${SYM.arrow} total · ${pending.length}\n\n` +
        `${SYM.diamond} *Pending*\n\n${lines}${more}`,
        { id: 'list' }
      );
      rich.addText(
        `${SYM.info} *Actions*\n\n` +
        `   ${SYM.arrow} ${prefix}approve        · approve all\n` +
        `   ${SYM.arrow} ${prefix}reject         · reject all\n` +
        `   ${SYM.arrow} ${prefix}approve @user · approve one\n` +
        `   ${SYM.arrow} ${prefix}reject @user  · reject one`
      );
      rich.addSuggest([`${prefix}approve`, `${prefix}reject`]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions, quoted: msg });

      log.event('cmd.listrequests', { sessionId: ctx.sessionId, chatId, count: pending.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};