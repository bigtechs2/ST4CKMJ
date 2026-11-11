import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:groupinfo');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;
const normalize = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function fmtDate(d) {
  if (!d) return '—';
  const ts = typeof d === 'number' ? d * 1000 : new Date(d).getTime();
  return new Date(ts).toLocaleString('en-GB', { hour12: false });
}

export default {
  name: 'groupinfo',
  aliases: ['ginfo', 'infogroup', 'gcstats'],
  category: 'group',
  description: 'Show full group information',
  emoji: '▣',
  usage: '',
  permissions: { coin: 0, owner: false, admin: false, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    try {
      const meta = await sock.groupMetadata(chatId);
      const admins = (meta.participants || []).filter((p) => p.admin);
      const owner = admins.find((a) => a.admin === 'superadmin');

      let inviteCode = '—';
      try {
        inviteCode = await sock.groupInviteCode(chatId);
      } catch {}

      const lines = [
        `   ${SYM.arrow} name      · ${meta.subject || '—'}`,
        `   ${SYM.arrow} id        · ${chatId}`,
        `   ${SYM.arrow} owner     · ${owner ? '@' + normalize(owner.id) : '—'}`,
        `   ${SYM.arrow} members   · ${meta.participants?.length || 0}`,
        `   ${SYM.arrow} admins    · ${admins.length}`,
        `   ${SYM.arrow} created   · ${fmtDate(meta.creation)}`,
        `   ${SYM.arrow} announce  · ${meta.announce ? '🔒 locked' : '🔓 open'}`,
        `   ${SYM.arrow} restrict  · ${meta.restrict ? '🔒 yes' : '🔓 no'}`,
        `   ${SYM.arrow} invite    · ${inviteCode !== '—' ? `https://chat.whatsapp.com/${inviteCode}` : '—'}`,
        meta.desc ? `   ${SYM.arrow} desc      · ${meta.desc.slice(0, 100)}${meta.desc.length > 100 ? '…' : ''}` : ''
      ].filter(Boolean).join('\n');

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(`${SYM.square} *Group Info*\n\n${lines}`, { id: 'info' });
      rich.addSuggest([`${prefix}adminlist`, `${prefix}topmembers`]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      const mentions = owner ? [`${normalize(owner.id)}@s.whatsapp.net`] : [];
      await rich.send(chatId, { mentions, quoted: msg });

      log.event('cmd.groupinfo', { sessionId: ctx.sessionId, chatId });
    } catch (err) {
      await sock.sendMessage(chatId, { text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}` }, { quoted: msg });
    }
  }
};