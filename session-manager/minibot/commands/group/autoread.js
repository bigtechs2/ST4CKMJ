import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:autoread');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'autoread',
  aliases: ['autoreadmsg', 'autoreadmessages', 'readall'],
  category: 'automation',
  description: 'Auto-mark messages as read (blue ticks)',
  emoji: '⌁',
  usage: 'on | off | status',
  permissions: { coin: 0, owner: false, admin: false, premium: true, group: true, private: true },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;
    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();
    const current = cfg.autoRead === true;
    const delay = config.automation.read.readDelayMs / 1000;

    if (!sub || sub === 'status') {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Auto Read Status*\n\n` +
        `${SYM.arrow} mode · *${current ? 'enabled' : 'disabled'}*\n\n` +
        `${SYM.diamond} *Behavior*\n\n` +
        `   ${SYM.bullet} marks incoming messages as read\n` +
        `   ${SYM.bullet} ${delay}s delay before read (looks human)\n` +
        `   ${SYM.bullet} shows blue ticks to sender\n\n` +
        `${SYM.diamond} *Commands*\n\n` +
        `   ${SYM.arrow} ${prefix}autoread on\n` +
        `   ${SYM.arrow} ${prefix}autoread off`,
        { id: 'info' }
      );
      rich.addSuggest([`${prefix}autoread on`, `${prefix}autoread off`]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      return rich.send(chatId, { quoted: msg });
    }

    if (!['on', 'off'].includes(sub)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Use: on, off, status\n\n${footer()}`
      }, { quoted: msg });
    }

    cfg.autoRead = sub === 'on';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
    rich.addText(
      `${sub === 'on' ? SYM.check : SYM.cross} *Auto read · ${sub}*\n\n` +
      (sub === 'on'
        ? `${SYM.info} messages will be marked read after ${delay}s`
        : `${SYM.info} messages will stay unread`),
      { id: 'ok' }
    );
    rich.addText(footer());
    rich.setFooter(config.msg.footer);
    await rich.send(chatId, { quoted: msg });

    log.event('cmd.autoread', { sessionId, chatId, state: sub });
  }
};