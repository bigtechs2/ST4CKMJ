import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:welcome');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'welcome',
  aliases: ['setwelcome', 'welcomemsg'],
  category: 'group',
  description: 'Configure welcome messages',
  emoji: '▣',
  usage: 'on | off | set <text> | status',
  permissions: { coin: 0, owner: false, admin: true, premium: false, group: true, private: false },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, { text: `${SYM.cross} Groups only\n\n${footer()}` }, { quoted: msg });
    }

    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
      const enabled = cfg.welcomeEnabled === true;
      const text = cfg.welcomeText || '(default)';

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Welcome Status*\n\n` +
        `${SYM.arrow} enabled · ${enabled ? '✅ yes' : '❌ no'}\n\n` +
        `${SYM.diamond} *Current Text*\n\n_${text.slice(0, 300)}_`,
        { id: 'info' }
      );
      rich.addText(
        `${SYM.info} *Placeholders*\n` +
        `   ${SYM.bullet} {user}  — mentions new member\n` +
        `   ${SYM.bullet} {group} — group name\n` +
        `   ${SYM.bullet} {count} — member count`
      );
      rich.addText(
        `${SYM.diamond} *Commands*\n\n` +
        `   ${SYM.arrow} ${prefix}welcome on|off\n` +
        `   ${SYM.arrow} ${prefix}welcome set <text>`
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'on' || sub === 'off') {
      cfg.welcomeEnabled = sub === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Welcome ${sub === 'on' ? 'enabled' : 'disabled'}*`,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.welcome', { sessionId, chatId, state: sub });
      return;
    }

    if (sub === 'set') {
      const text = args.slice(1).join(' ').trim();
      if (!text) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}welcome set <text>\n${SYM.arrow} use {user} {group} {count}\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.welcomeText = text.slice(0, 1000);
      cfg.welcomeEnabled = true;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Welcome text updated*\n\n_${text.slice(0, 300)}_`,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.welcome.set', { sessionId, chatId });
      return;
    }

    return sock.sendMessage(chatId, {
      text: `${SYM.cross} Unknown · \`${sub}\`\n${SYM.arrow} use: on, off, set, status\n\n${footer()}`
    }, { quoted: msg });
  }
};