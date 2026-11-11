import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:autolistatus');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'autolistatus',
  aliases: ['autoreactstatus', 'autostatusreact', 'reactstatus'],
  category: 'automation',
  description: 'Auto-react to status updates with emojis',
  emoji: '⌁',
  usage: 'on | off | emojis <list> | status',
  permissions: { coin: 0, owner: false, admin: false, premium: true, group: true, private: true },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;
    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();
    const current = cfg.autoReact === true;
    const emojis = Array.isArray(cfg.reactEmojis) && cfg.reactEmojis.length
      ? cfg.reactEmojis
      : ['🖤', '🤎', '🤍', '💜', '💚'];

    if (!sub || sub === 'status') {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Auto React Status*\n\n` +
        `${SYM.arrow} mode · *${current ? 'enabled' : 'disabled'}*\n` +
        `${SYM.arrow} emojis · ${emojis.join(' ')}\n\n` +
        `${SYM.diamond} *What it does*\n\n` +
        `   ${SYM.bullet} auto-reacts to every new status\n` +
        `   ${SYM.bullet} picks a random emoji from the list\n` +
        `   ${SYM.bullet} works silently in background\n\n` +
        `${SYM.diamond} *Commands*\n\n` +
        `   ${SYM.arrow} ${prefix}autolistatus on\n` +
        `   ${SYM.arrow} ${prefix}autolistatus off\n` +
        `   ${SYM.arrow} ${prefix}autolistatus emojis ❤️🔥⚡`,
        { id: 'info' }
      );
      rich.addSuggest([
        `${prefix}autolistatus on`,
        `${prefix}autolistatus emojis ❤️🔥⚡`
      ]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'emojis' || sub === 'emoji') {
      const custom = args.slice(1).filter((e) => e && e.trim());
      if (!custom.length) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}autolistatus emojis ❤️🔥⚡\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.reactEmojis = custom.slice(0, 10);
      cfg.markModified('reactEmojis');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Emojis updated*\n\n` +
        `${SYM.arrow} list · ${custom.join(' ')}\n` +
        `${SYM.arrow} total · ${custom.length}`,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('cmd.autolistatus.emojis', { sessionId, chatId, count: custom.length });
      return;
    }

    if (!['on', 'off'].includes(sub)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Use: on, off, emojis, status\n\n${footer()}`
      }, { quoted: msg });
    }

    cfg.autoReact = sub === 'on';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
    rich.addText(
      `${sub === 'on' ? SYM.check : SYM.cross} *Auto react status · ${sub}*\n\n` +
      (sub === 'on'
        ? `${SYM.info} statuses will get random reactions\n${SYM.arrow} emojis · ${emojis.join(' ')}`
        : `${SYM.info} no more reactions on statuses`),
      { id: 'ok' }
    );
    rich.addText(footer());
    rich.setFooter(config.msg.footer);
    await rich.send(chatId, { quoted: msg });

    log.event('cmd.autolistatus', { sessionId, chatId, state: sub });
  }
};