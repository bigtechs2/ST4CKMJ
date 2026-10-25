import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';
import { getWarnings, clearWarnings, MAX_WARNINGS } from '../../../handlers/antibotHandler.js';

const log = logger.child('cmd:antibot');

const SYM = brand.SYM;

const MODES = ['mute', 'delete', 'warn', 'kick', 'off'];

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function normalizeNumber(input) {
  return String(input || '').replace(/\D/g, '');
}

async function isBotAdmin(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);
    const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
    const botNumber = botJid.split('@')[0].split(':')[0];

    const me = metadata.participants.find((p) => {
      const pNum = p.id.split('@')[0].split(':')[0];
      return pNum === botNumber;
    });

    return me?.admin === 'admin' || me?.admin === 'superadmin';
  } catch {
    return false;
  }
}

function buildStatusCard(sock, cfg, prefix) {
  const mode       = cfg.antibotMode || (cfg.antibot ? 'mute' : 'off');
  const blacklist  = Array.isArray(cfg.antibotBlacklist) ? cfg.antibotBlacklist : [];
  const strict     = cfg.antibotStrict === true;
  const detectCmds = cfg.antibotDetectCommands === true;

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antibot Status*\n\n` +
    `${SYM.arrow} mode              · *${mode}*\n` +
    `${SYM.arrow} blacklist         · ${blacklist.length} numbers\n` +
    `${SYM.arrow} strict mode       · ${strict ? '✅ on' : '❌ off'}\n` +
    `${SYM.arrow} detect commands   · ${detectCmds ? '✅ on' : '❌ off'}`
  );

  rich.addText(
    `${SYM.diamond} *Detection layers*\n\n` +
    `   ${SYM.arrow} meta AI bots (@bot JID)\n` +
    `   ${SYM.arrow} ai bot metadata\n` +
    `   ${SYM.arrow} interactive bot messages\n` +
    `   ${SYM.arrow} blacklisted numbers\n` +
    `   ${SYM.arrow} other bot commands · ${detectCmds ? 'on' : 'off'}\n` +
    `   ${SYM.arrow} signature text · ${strict ? 'on' : 'off'}`
  );

  rich.addText(
    `${SYM.diamond} *Modes*\n\n` +
    `   ${SYM.arrow} mute    · silent delete\n` +
    `   ${SYM.arrow} delete  · silent delete\n` +
    `   ${SYM.arrow} warn    · delete + warning\n` +
    `   ${SYM.arrow} kick    · delete + 3 warnings → kick\n` +
    `   ${SYM.arrow} off     · disabled`
  );

  rich.addTip(`kick mode · ${MAX_WARNINGS} strikes before removal · warnings reset in 24h`);

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antibot on|off\n` +
    `   ${SYM.arrow} ${prefix}antibot mute|delete|warn|kick\n` +
    `   ${SYM.arrow} ${prefix}antibot add <number>\n` +
    `   ${SYM.arrow} ${prefix}antibot remove <number>\n` +
    `   ${SYM.arrow} ${prefix}antibot list\n` +
    `   ${SYM.arrow} ${prefix}antibot clear\n` +
    `   ${SYM.arrow} ${prefix}antibot warnings @user\n` +
    `   ${SYM.arrow} ${prefix}antibot clearwarnings @user\n` +
    `   ${SYM.arrow} ${prefix}antibot strict on|off\n` +
    `   ${SYM.arrow} ${prefix}antibot detectcommands on|off\n` +
    `   ${SYM.arrow} ${prefix}antibot status`
  );

  rich.addSuggest([
    `${prefix}antibot on`,
    `${prefix}antibot status`,
    `${prefix}antibot off`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'antibot',
  aliases: ['antibotz', 'botguard', 'nobots', 'antiaibot', 'mutebot'],
  category: 'group',
  description: 'Mute/delete/kick bot messages · 3 warnings then kick',
  emoji: '▣',
  usage: 'on | off | mute | delete | warn | kick | add | remove | list | clear | warnings | status',

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
    const rest = args.slice(1).join(' ').trim();

    if (!cfg.antibotBlacklist) cfg.antibotBlacklist = [];

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
            `${SYM.arrow} usage: ${prefix}antibot warnings @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const jid = mentions[0];
      const num = normalizeNumber(jid);
      const count = getWarnings(chatId, num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Warning Count*\n\n` +
        `${SYM.arrow} user   · @${num}\n` +
        `${SYM.arrow} strikes · ${count}/${MAX_WARNINGS}\n\n` +
        (count >= MAX_WARNINGS
          ? `${SYM.info} next violation → kick`
          : `${SYM.info} ${MAX_WARNINGS - count} more before kick`),
        { id: 'info' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions: [jid], quoted: msg });
      return;
    }

    if (sub === 'clearwarnings' || sub === 'resetwarnings' || sub === 'clearstrikes') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Reset warnings*\n\n` +
            `${SYM.arrow} usage: ${prefix}antibot clearwarnings @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const jid = mentions[0];
      const num = normalizeNumber(jid);
      clearWarnings(chatId, num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Warnings reset*\n` +
        `${SYM.arrow} user · @${num}\n` +
        `${SYM.arrow} strikes · 0/${MAX_WARNINGS}`,
        { id: 'reset' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions: [jid], quoted: msg });

      log.event('antibot.clearwarnings', { sessionId, chatId, user: num });
      return;
    }

    if (sub === 'on') {
      const admin = await isBotAdmin(sock, chatId);
      if (!admin) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} I need to be admin to enforce antibot\n` +
            `${SYM.arrow} promote me and try again\n\n` +
            footer()
        }, { quoted: msg });
      }

      cfg.antibotMode = 'mute';
      cfg.antibot     = true;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Antibot enabled*\n\n` +
        `${SYM.arrow} mode · *mute* (silent)\n` +
        `${SYM.arrow} bot messages deleted quietly\n` +
        `${SYM.arrow} group stays clean · no notices`,
        { id: 'set' }
      );

      rich.addSuggest([
        `${prefix}antibot status`,
        `${prefix}antibot off`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibot.on', { sessionId, chatId });
      return;
    }

    if (sub === 'add') {
      const num = normalizeNumber(rest);

      if (!num || num.length < 8) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Add bot to blacklist*\n\n` +
            `${SYM.arrow} usage: ${prefix}antibot add <number>\n` +
            `${SYM.arrow} example: ${prefix}antibot add 255712345678\n\n` +
            footer()
        }, { quoted: msg });
      }

      if (cfg.antibotBlacklist.includes(num)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} *${num}* is already blacklisted\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.antibotBlacklist.push(num);
      cfg.markModified('antibotBlacklist');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Bot blacklisted*\n` +
        `${SYM.arrow} number · ${num}\n` +
        `${SYM.arrow} total  · ${cfg.antibotBlacklist.length}`,
        { id: 'add' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibot.add', { sessionId, chatId, number: num });
      return;
    }

    if (sub === 'remove' || sub === 'rm') {
      const num = normalizeNumber(rest);

      if (!num) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}antibot remove <number>\n\n${footer()}`
        }, { quoted: msg });
      }

      const before = cfg.antibotBlacklist.length;
      cfg.antibotBlacklist = cfg.antibotBlacklist.filter((n) => n !== num);

      if (cfg.antibotBlacklist.length === before) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} *${num}* not in blacklist\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.markModified('antibotBlacklist');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Bot removed*\n` +
        `${SYM.arrow} number · ${num}\n` +
        `${SYM.arrow} total  · ${cfg.antibotBlacklist.length}`,
        { id: 'remove' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibot.remove', { sessionId, chatId, number: num });
      return;
    }

    if (sub === 'list') {
      const list = cfg.antibotBlacklist || [];

      if (!list.length) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} *Blacklist empty*\n\n${footer()}`
        }, { quoted: msg });
      }

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Blacklisted bots*\n\n` +
        list.map((n) => `   ${SYM.arrow} ${n}`).join('\n') +
        `\n\n${SYM.info} total · ${list.length}`,
        { id: 'list' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });
      return;
    }

    if (sub === 'clear') {
      const count = (cfg.antibotBlacklist || []).length;
      cfg.antibotBlacklist = [];
      cfg.markModified('antibotBlacklist');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Blacklist cleared*\n` +
        `${SYM.arrow} ${count} numbers removed`,
        { id: 'clear' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });
      return;
    }

    if (sub === 'strict') {
      const state = String(args?.[1] || '').toLowerCase();
      if (!['on', 'off'].includes(state)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}antibot strict on|off\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.antibotStrict = state === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Strict mode ${state}*\n` +
        `${SYM.arrow} signature text detection · ${state === 'on' ? '✅ on' : '❌ off'}`,
        { id: 'set' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });
      return;
    }

    if (sub === 'detectcommands' || sub === 'detectcmd') {
      const state = String(args?.[1] || '').toLowerCase();
      if (!['on', 'off'].includes(state)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}antibot detectcommands on|off\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.antibotDetectCommands = state === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Command detection ${state}*\n` +
        (state === 'on'
          ? `${SYM.info} \`.script\` \`.menu\` \`/start\` will be caught`
          : `${SYM.info} other bot commands will pass through`),
        { id: 'set' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });
      return;
    }

    if (!MODES.includes(sub)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} Unknown mode · \`${sub}\`\n` +
          `${SYM.arrow} use: on, off, mute, delete, warn, kick, add, remove, list, clear, warnings, clearwarnings, strict, detectcommands, status\n\n` +
          footer()
      }, { quoted: msg });
    }

    if (sub !== 'off') {
      const admin = await isBotAdmin(sock, chatId);
      if (!admin) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} I need to be admin to enforce antibot\n` +
            `${SYM.arrow} promote me and try again\n\n` +
            footer()
        }, { quoted: msg });
      }
    }

    cfg.antibotMode = sub;
    cfg.antibot     = sub !== 'off';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    if (sub === 'off') {
      rich.addText(
        `${SYM.check} *Antibot disabled*\n` +
        `${SYM.arrow} bot messages will not be blocked`,
        { id: 'set' }
      );
    } else if (sub === 'mute' || sub === 'delete') {
      rich.addText(
        `${SYM.check} *Antibot · ${sub} mode*\n\n` +
        `${SYM.arrow} bot messages deleted silently\n` +
        `${SYM.info} group stays clean · no notices`,
        { id: 'set' }
      );
    } else if (sub === 'kick') {
      rich.addText(
        `${SYM.check} *Antibot · kick mode*\n\n` +
        `${SYM.arrow} warning 1/3 · tag sender\n` +
        `${SYM.arrow} warning 2/3 · tag sender\n` +
        `${SYM.arrow} warning 3/3 · remove from group\n\n` +
        `${SYM.info} warnings reset after 24h of good behavior`,
        { id: 'set' }
      );
    } else {
      rich.addText(
        `${SYM.check} *Antibot enabled*\n` +
        `${SYM.arrow} mode · *${sub}*\n` +
        `${SYM.arrow} bot messages deleted + sender warned`,
        { id: 'set' }
      );
    }

    rich.addSuggest([
      `${prefix}antibot status`,
      `${prefix}antibot off`
    ]);

    rich.addText(footer());
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { quoted: msg });

    log.event('antibot.set', { sessionId, chatId, mode: sub });
  }
};