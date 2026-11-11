import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:antighost');

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

function isSuperOwner(number) {
  const clean = String(number || '').replace(/\D/g, '');
  if (!clean) return false;

  const main = String(config.owners.whatsapp.id || '').replace(/\D/g, '');
  if (main && clean === main) return true;

  return (config.owners.whatsapp.co || []).some(
    (co) => String(co.id || '').replace(/\D/g, '') === clean
  );
}

function buildStatusCard(sock, cfg, prefix) {
  const enabled = cfg.antighost === true;
  const delayHours = cfg.antighostDelayHours || 24;

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antighost Status*\n\n` +
    `${SYM.arrow} mode · *${enabled ? 'enabled' : 'disabled'}*\n` +
    `${SYM.arrow} delay · ${delayHours} hours`
  );

  rich.addText(
    `${SYM.diamond} *How it works*\n\n` +
    `   ${SYM.arrow} bot sends DM\n` +
    `   ${SYM.arrow} recipient reads (blue tick)\n` +
    `   ${SYM.arrow} if no reply in ${delayHours}h → block\n` +
    `   ${SYM.arrow} any reply cancels the timer`
  );

  rich.addText(
    `${SYM.info} *Scope*\n` +
    `   ${SYM.bullet} only private DMs\n` +
    `   ${SYM.bullet} only outgoing messages\n` +
    `   ${SYM.bullet} super owners exempt`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antighost on\n` +
    `   ${SYM.arrow} ${prefix}antighost off\n` +
    `   ${SYM.arrow} ${prefix}antighost delay <hours>\n` +
    `   ${SYM.arrow} ${prefix}antighost status`
  );

  rich.addSuggest([
    `${prefix}antighost on`,
    `${prefix}antighost off`,
    `${prefix}antighost status`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'antighost',
  aliases: ['ghostblock', 'antilurker', 'antighosting'],
  category: 'main',
  description: 'Block users who read but do not reply',
  emoji: '⌘',
  usage: 'on | off | delay <hours> | status',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: false,
    group:   false,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sessionCfg, senderNumber } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    if (chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} This command only works in private chat\n${SYM.arrow} DM the bot to use it\n\n${footer()}`
      }, { quoted: msg });
    }

    if (!isSuperOwner(senderNumber)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Only super owners can use this command\n\n${footer()}`
      }, { quoted: msg });
    }

    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
      const rich = buildStatusCard(sock, cfg, prefix);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'on') {
      cfg.antighost = true;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Antighost enabled*\n\n` +
        `${SYM.arrow} read but not replied · ${cfg.antighostDelayHours || 24}h → block\n` +
        `${SYM.info} any reply cancels the timer`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('antighost.on', { sessionId, chatId });
      return;
    }

    if (sub === 'off') {
      cfg.antighost = false;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Antighost disabled*\n${SYM.arrow} read-but-no-reply will not trigger blocks`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('antighost.off', { sessionId, chatId });
      return;
    }

    if (sub === 'delay') {
      const hours = Number(args?.[1]);

      if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid delay\n${SYM.arrow} use 1–168 hours (1h to 7 days)\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.antighostDelayHours = hours;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Delay updated*\n${SYM.arrow} block after · ${hours} hours of silence`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('antighost.delay', { sessionId, hours });
      return;
    }

    return sock.sendMessage(chatId, {
      text: `${SYM.cross} Unknown option · \`${sub}\`\n${SYM.arrow} use: on, off, delay, status\n\n${footer()}`
    }, { quoted: msg });
  }
};