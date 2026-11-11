import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { MessageCounter } from '../../../database/index.js';

const log = logger.child('cmd:topmembers');

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

function getRankBadge(index) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return brand.NUM.normal[index + 1] || `(${index + 1})`;
}

export default {
  name: 'topmembers',
  aliases: ['top', 'topactive', 'topusers', 'leaderboard'],
  category: 'group',
  description: 'Show top 20 most active members',
  emoji: '▣',
  usage: '',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: false
  },

  code: async (ctx) => {
    const { sock, msg, chatId, sessionId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} This command only works in groups\n\n${footer()}`
      }, { quoted: msg });
    }

    try {
      const members = await MessageCounter.topMembers(chatId, 20);

      if (!members.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *No messages counted yet*\n` +
            `${SYM.arrow} start chatting to populate leaderboard\n\n` +
            footer()
        }, { quoted: msg });
      }

      const mentions = members.map((m) => `${m.userId}@s.whatsapp.net`);

      const lines = members
        .map((m, i) => {
          const badge = getRankBadge(i);
          const name = m.userName || m.userId;
          return `   ${badge} @${m.userId} · ${m.count} msgs`;
        })
        .join('\n');

      const stats = await MessageCounter.groupStats(chatId);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Top Members*\n\n` +
        `${SYM.arrow} total · ${stats.totalMembers} members\n` +
        `${SYM.arrow} messages · ${stats.totalMessages}\n` +
        `${SYM.arrow} average · ${Math.round(stats.avgMessages || 0)}/member`
      );

      rich.addText(
        `${SYM.diamond} *Leaderboard (top ${members.length})*\n\n` + lines,
        { id: 'list' }
      );

      rich.addSuggest([
        `${prefix}ghost`,
        `${prefix}topmembers`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions, quoted: msg });

      log.event('command.topmembers', { sessionId, chatId, count: members.length });

    } catch (err) {
      log.error(`topmembers failed: ${err.message}`);
      try {
        await sock.sendMessage(chatId, {
          text: `${SYM.cross} Failed\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}`
        }, { quoted: msg });
      } catch {}
    }
  }
};