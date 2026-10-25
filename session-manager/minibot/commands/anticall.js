import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';
import { getWarnings, clearWarnings, MAX_WARNINGS } from '../../../handlers/anticallHandler.js';

const log = logger.child('cmd:anticall');

const SYM = brand.SYM;

const MODES = ['reject', 'warn', 'kick', 'block', 'off'];

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function buildStatusCard(sock, cfg, prefix) {
  const mode = cfg.anticallMode || (cfg.anticall ? 'reject' : 'off');

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Anticall Status*\n\n` +
    `${SYM.arrow} mode · *${mode}*`
  );

  rich.addText(
    `${SYM.diamond} *Modes*\n\n` +
    `   ${SYM.arrow} reject  · decline call\n` +
    `   ${SYM.arrow} warn    · decline + warn DM\n` +
    `   ${SYM.arrow} kick    · decline + ${MAX_WARNINGS} warnings → remove\n` +
    `   ${SYM.arrow} block   · decline + block caller\n` +
    `   ${SYM.arrow} off     · disabled`
  );

  rich.addText(
    `${SYM.info} *Protection*\n` +
    `   ${SYM.bullet} applies to all voice calls\n` +
    `   ${SYM.bullet} applies to all video calls\n` +
    `   ${SYM.bullet} super owners bypass\n` +
    `   ${SYM.bullet} kick mode removes from all groups`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}anticall reject|warn|kick|block|off\n` +
    `   ${SYM.arrow} ${prefix}anticall warnings @user\n` +
    `   ${SYM.arrow} ${prefix}anticall clearwarnings @user\n` +
    `   ${SYM.arrow} ${prefix}anticall status`
  );

  rich.addSuggest([
    `${prefix}anticall kick`,
    `${prefix}anticall warn`,
    `${prefix}anticall status`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'anticall',
  aliases: ['anticalls', 'callguard', 'nocalls', 'antivoicecall'],
  category: 'group',
  description: 'Block incoming voice and video calls',
  emoji: '▣',
  usage: 'reject | warn | kick | block | off | status',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   true,
    premium: false,
    group:   true,
    private: false
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sessionCfg, mentionedJids } = ctx;
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

    if (sub === 'warnings' || sub === 'strikes') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Check warnings*\n\n` +
            `${SYM.arrow} usage: ${prefix}anticall warnings @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const jid = mentions[0];
      const num = normalizeNumber(jid);
      const count = getWarnings(num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Call Warning Count*\n\n` +
        `${SYM.arrow} user   · @${num}\n` +
        `${SYM.arrow} strikes · ${count}/${MAX_WARNINGS}\n\n` +
        (count >= MAX_WARNINGS
          ? `${SYM.info} next call → removal`
          : `${SYM.info} ${MAX_WARNINGS - count} more calls before removal`),
        { id: 'info' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions: [jid], quoted: msg });
      return;
    }

    if (sub === 'clearwarnings' || sub === 'resetwarnings') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Reset warnings*\n\n` +
            `${SYM.arrow} usage: ${prefix}anticall clearwarnings @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const jid = mentions[0];
      const num = normalizeNumber(jid);
      clearWarnings(num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Call warnings reset*\n` +
        `${SYM.arrow} user · @${num}\n` +
        `${SYM.arrow} strikes · 0/${MAX_WARNINGS}`,
        { id: 'reset' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions: [jid], quoted: msg });

      log.event('anticall.clearwarnings', { sessionId, chatId, user: num });
      return;
    }

    if (!MODES.includes(sub)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} Unknown mode · \`${sub}\`\n` +
          `${SYM.arrow} use: reject, warn, kick, block, off, warnings, clearwarnings, status\n\n` +
          footer()
      }, { quoted: msg });
    }

    cfg.anticallMode = sub;
    cfg.anticall     = sub !== 'off';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    if (sub === 'off') {
      rich.addText(
        `${SYM.check} *Anticall disabled*\n` +
        `${SYM.arrow} calls will not be blocked`,
        { id: 'set' }
      );
    } else if (sub === 'reject') {
      rich.addText(
        `${SYM.check} *Anticall · reject mode*\n\n` +
        `${SYM.arrow} incoming calls are declined\n` +
        `${SYM.arrow} no message sent to caller`,
        { id: 'set' }
      );
    } else if (sub === 'warn') {
      rich.addText(
        `${SYM.check} *Anticall · warn mode*\n\n` +
        `${SYM.arrow} calls declined\n` +
        `${SYM.arrow} caller gets a warning DM`,
        { id: 'set' }
      );
    } else if (sub === 'kick') {
      rich.addText(
        `${SYM.check} *Anticall · kick mode*\n\n` +
        `${SYM.arrow} warning 1/${MAX_WARNINGS} · decline + warn\n` +
        `${SYM.arrow} warning 2/${MAX_WARNINGS} · decline + warn\n` +
        `${SYM.arrow} warning ${MAX_WARNINGS}/${MAX_WARNINGS} · remove from all groups\n\n` +
        `${SYM.info} warnings reset after 24h of good behavior`,
        { id: 'set' }
      );
    } else if (sub === 'block') {
      rich.addText(
        `${SYM.check} *Anticall · block mode*\n\n` +
        `${SYM.arrow} calls declined\n` +
        `${SYM.arrow} caller blocked permanently\n\n` +
        `${SYM.info} use ${prefix}unblock in private to reverse`,
        { id: 'set' }
      );
    }

    rich.addSuggest([
      `${prefix}anticall status`,
      `${prefix}anticall off`
    ]);

    rich.addText(footer());
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { quoted: msg });

    log.event('anticall.set', { sessionId, chatId, mode: sub });
  }
};