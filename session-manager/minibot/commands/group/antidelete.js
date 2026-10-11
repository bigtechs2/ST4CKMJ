import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig, DeletedMessage } from '../../../database/index.js';

const log = logger.child('cmd:antidelete');

const SYM = brand.SYM;

const MODES = ['off', 'notify', 'forward'];

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function buildStatusCard(sock, cfg, prefix) {
  const mode = cfg.antideleteMode || (cfg.antidelete ? 'forward' : 'off');

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antidelete Status*\n\n` +
    `${SYM.arrow} mode · *${mode}*`
  );

  rich.addText(
    `${SYM.diamond} *Modes*\n\n` +
    `   ${SYM.arrow} off      · disabled\n` +
    `   ${SYM.arrow} notify   · warn group only\n` +
    `   ${SYM.arrow} forward  · send full copy to owner`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antidelete off\n` +
    `   ${SYM.arrow} ${prefix}antidelete notify\n` +
    `   ${SYM.arrow} ${prefix}antidelete forward\n` +
    `   ${SYM.arrow} ${prefix}antidelete status`
  );

  rich.addTip('media (image, video, audio, sticker, document) is captured too');

  rich.addSuggest([
    `${prefix}antidelete forward`,
    `${prefix}antidelete notify`,
    `${prefix}antidelete off`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'antidelete',
  aliases: ['antidel', 'antirevoke', 'nodelete', 'antideleted'],
  category: 'group',
  description: 'Capture deleted messages and report them',
  emoji: '▣',
  usage: 'off | notify | forward | status',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   true,
    premium: false,
    group:   true,
    private: false
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} This command only works in groups\n\n${footer()}`
      }, { quoted: msg });
    }

    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
      const rich = buildStatusCard(sock, cfg, prefix);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'clear' || sub === 'reset') {
      const result = await DeletedMessage.deleteMany({ chatId, sessionId });

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Records cleared*\n` +
        `${SYM.arrow} ${result.deletedCount || 0} entries removed`,
        { id: 'clear' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      return rich.send(chatId, { quoted: msg });
    }

    if (!MODES.includes(sub)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} Unknown mode · \`${sub}\`\n` +
          `${SYM.arrow} use: off, notify, forward, status, clear\n\n` +
          footer()
      }, { quoted: msg });
    }

    cfg.antideleteMode = sub;
    cfg.antidelete     = sub !== 'off';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    if (sub === 'off') {
      rich.addText(
        `${SYM.check} *Antidelete disabled*\n` +
        `${SYM.arrow} deleted messages will not be captured`,
        { id: 'set' }
      );
    } else if (sub === 'notify') {
      rich.addText(
        `${SYM.check} *Antidelete enabled*\n` +
        `${SYM.arrow} mode · *notify*\n` +
        `${SYM.arrow} group will be told when a message is deleted\n` +
        `${SYM.arrow} owner gets the full report in DM`,
        { id: 'set' }
      );
    } else if (sub === 'forward') {
      rich.addText(
        `${SYM.check} *Antidelete enabled*\n` +
        `${SYM.arrow} mode · *forward*\n` +
        `${SYM.arrow} full deleted content sent to owner in DM\n` +
        `${SYM.arrow} includes text, media, and who deleted`,
        { id: 'set' }
      );
    }

    rich.addSuggest([
      `${prefix}antidelete status`,
      `${prefix}antidelete off`
    ]);

    rich.addText(footer());
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { quoted: msg });

    log.event('antidelete.set', { sessionId, chatId, mode: sub });
  }
};