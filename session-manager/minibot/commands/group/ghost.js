import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { MessageCounter } from '../../../database/index.js';

const log = logger.child('cmd:ghost');

const SYM = brand.SYM;

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

export default {
  name: 'ghost',
  aliases: ['ghosts', 'inactive', 'silent', 'lurkers'],
  category: 'group',
  description: 'Show members with very few messages',
  emoji: '▣',
  usage: '[threshold]',

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

    const threshold = Math.max(1, Math.min(Number(args?.[0]) || 5, 100));

    try {
      const ghosts = await MessageCounter.ghostMembers(chatId, threshold, 50);

      if (!ghosts.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *No ghosts found*\n` +
            `${SYM.arrow} every counted member has ${threshold}+ messages\n\n` +
            footer()
        }, { quoted: msg });
      }

      const mentions = ghosts.map((g) => `${g.userId}@s.whatsapp.net`);

      const lines = ghosts
        .map((g, i) => {
          const n = brand.NUM.normal[i] || `(${i + 1})`;
          const name = g.userName || g.userId;
          return `   ${n} @${g.userId} · ${g.count} msg${g.count === 1 ? '' : 's'}`;
        })
        .join('\n');

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Ghost Members*\n\n` +
        `${SYM.arrow} threshold · below ${threshold} messages\n` +
        `${SYM.arrow} found · ${ghosts.length} silent member${ghosts.length === 1 ? '' : 's'}`
      );

      rich.addText(
        `${SYM.diamond} *Silent Members*\n\n` + lines,
        { id: 'list' }
      );

      rich.addSuggest([
        `${prefix}topmembers`,
        `${prefix}ghost ${threshold + 5}`,
        `${prefix}ghost 1`
      ]);

      rich.addTip(`use ${prefix}ghost <number> to change threshold`);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions, quoted: msg });

      log.event('command.ghost', { sessionId, chatId, threshold, count: ghosts.length });

    } catch (err) {
      log.error(`ghost failed: ${err.message}`);
      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}`
        }, { quoted: msg });
      } catch {}
    }
  }
};