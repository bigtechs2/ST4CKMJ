import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:demote');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export default {
  name: 'demote',
  aliases: ['unadmin', 'removeadmin'],
  category: 'group',
  description: 'Demote admins to members',
  emoji: '▣',
  usage: '@user',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, mentionedJids, quoted, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const targets = [...(mentionedJids || [])];
    if (!targets.length && quoted?.participant) targets.push(quoted.participant);

    if (!targets.length) {
      return sock.sendMessage(chatId, {
        text: `${SYM.info} Tag or reply to a user\n${SYM.arrow} ${prefix}demote @user\n\n${footer()}`
      }, { quoted: msg });
    }

    try {
      await sock.groupParticipantsUpdate(chatId, targets, 'demote');

      const mentions = targets.map((t) => `${normalize(t)}@s.whatsapp.net`);
      const list = mentions.map((m) => `   ${SYM.arrow} @${m.split('@')[0]}`).join('\n');

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(`${SYM.check} *Demoted to member*\n\n${list}`, { id: 'info' });
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions, quoted: msg });

      log.event('cmd.demote', { sessionId: ctx.sessionId, chatId, count: targets.length });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};