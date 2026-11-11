import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:autorecording');
const SYM = brand.SYM;

const channelLink = () => config.bot.channelLink || config.links.whatsappChannel;
const footer = () => `[View channel](${channelLink()})`;

export default {
  name: 'autorecording',
  aliases: ['autorecord', 'recordingalways', 'autorecordindicator'],
  category: 'automation',
  description: 'Show recording indicator automatically',
  emoji: '⌁',
  usage: 'on | off | status',
  permissions: { coin: 0, owner: false, admin: false, premium: true, group: true, private: true },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sc } = ctx;
    const prefix = sc?.prefix || config.prefixes.whatsappDefault;
    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();
    const current = cfg.autoRecording === true;
    const timings = config.automation.recording;

    if (!sub || sub === 'status') {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Auto Recording Status*\n\n` +
        `${SYM.arrow} mode · *${current ? 'enabled' : 'disabled'}*\n\n` +
        `${SYM.diamond} *Behavior*\n\n` +
        `   ${SYM.bullet} records ${timings.recordingMinMs / 1000}–${timings.recordingMaxMs / 1000}s\n` +
        `   ${SYM.bullet} pauses ${timings.pausedMinMs / 1000}–${timings.pausedMaxMs / 1000}s\n` +
        `   ${SYM.bullet} repeats naturally\n` +
        `   ${SYM.bullet} max ${timings.maxConcurrentChats} chats at once\n\n` +
        `${SYM.diamond} *Commands*\n\n` +
        `   ${SYM.arrow} ${prefix}autorecording on\n` +
        `   ${SYM.arrow} ${prefix}autorecording off`,
        { id: 'info' }
      );
      rich.addSuggest([`${prefix}autorecording on`, `${prefix}autorecording off`]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      return rich.send(chatId, { quoted: msg });
    }

    if (!['on', 'off'].includes(sub)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Use: on, off, status\n\n${footer()}`
      }, { quoted: msg });
    }

    cfg.autoRecording = sub === 'on';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
    rich.addText(
      `${sub === 'on' ? SYM.check : SYM.cross} *Auto recording · ${sub}*\n\n` +
      (sub === 'on'
        ? `${SYM.info} recording indicator active on incoming messages`
        : `${SYM.info} recording indicator stopped`),
      { id: 'ok' }
    );
    rich.addText(footer());
    rich.setFooter(config.msg.footer);
    await rich.send(chatId, { quoted: msg });

    log.event('cmd.autorecording', { sessionId, chatId, state: sub });
  }
};