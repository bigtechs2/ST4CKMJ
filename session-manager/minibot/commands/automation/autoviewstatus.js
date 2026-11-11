import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:autoviewstatus');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'autoviewstatus',
  aliases: ['autoview', 'viewstatus', 'autoviewstatuses', 'alwaysviewstatus'],
  category: 'automation',
  description: 'Auto-view all incoming status updates',
  emoji: '⌁',
  usage: 'on | off | status',
  permissions: { coin: 0, owner: false, admin: false, premium: true, group: true, private: true },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;
    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();
    const current = cfg.autoView === true;

    if (!sub || sub === 'status') {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Auto View Status*\n\n` +
        `${SYM.arrow} mode · *${current ? 'enabled' : 'disabled'}*\n\n` +
        `${SYM.diamond} *What it does*\n\n` +
        `   ${SYM.bullet} marks every status as seen\n` +
        `   ${SYM.bullet} no blue ring left for contacts\n` +
        `   ${SYM.bullet} works silently in background\n\n` +
        `${SYM.diamond} *Commands*\n\n` +
        `   ${SYM.arrow} ${prefix}autoviewstatus on\n` +
        `   ${SYM.arrow} ${prefix}autoviewstatus off`,
        { id: 'info' }
      );
      rich.addSuggest([`${prefix}autoviewstatus on`, `${prefix}autoviewstatus off`]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      return rich.send(chatId, { quoted: msg });
    }

    if (!['on', 'off'].includes(sub)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Use: on, off, status\n\n${footer()}`
      }, { quoted: msg });
    }

    cfg.autoView = sub === 'on';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
    rich.addText(
      `${sub === 'on' ? SYM.check : SYM.cross} *Auto view status · ${sub}*\n\n` +
      (sub === 'on'
        ? `${SYM.info} statuses will be auto-viewed`
        : `${SYM.info} statuses will remain unviewed`),
      { id: 'ok' }
    );
    rich.addText(footer());
    rich.setFooter(config.msg.footer);
    await rich.send(chatId, { quoted: msg });

    log.event('cmd.autoviewstatus', { sessionId, chatId, state: sub });
  }
};