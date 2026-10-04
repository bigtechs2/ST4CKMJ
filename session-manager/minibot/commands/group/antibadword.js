import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:antibadword');

const SYM = brand.SYM;

const MODES = ['delete', 'warn', 'kick', 'off'];

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
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
  const mode        = cfg.antibadwordMode || (cfg.antibadword ? 'delete' : 'off');
  const custom      = Array.isArray(cfg.badwords) ? cfg.badwords : [];
  const regex       = Array.isArray(cfg.badwordRegex) ? cfg.badwordRegex : [];
  const useDefault  = cfg.badwordsUseDefault !== false;

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antibadword Status*\n\n` +
    `${SYM.arrow} mode          · *${mode}*\n` +
    `${SYM.arrow} default list  · ${useDefault ? '✅ on' : '❌ off'}\n` +
    `${SYM.arrow} custom words  · ${custom.length}\n` +
    `${SYM.arrow} regex rules   · ${regex.length}`
  );

  if (custom.length) {
    const preview = custom.slice(0, 8).join(', ');
    rich.addText(
      `${SYM.diamond} *Custom words*\n\n` +
      `   ${SYM.arrow} ${preview}${custom.length > 8 ? ` …+${custom.length - 8}` : ''}`
    );
  }

  if (regex.length) {
    const preview = regex.slice(0, 3).join(' · ');
    rich.addText(
      `${SYM.diamond} *Regex rules*\n\n` +
      `   ${SYM.arrow} ${preview}${regex.length > 3 ? ` …+${regex.length - 3}` : ''}`
    );
  }

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antibadword delete|warn|kick|off\n` +
    `   ${SYM.arrow} ${prefix}antibadword add <word>\n` +
    `   ${SYM.arrow} ${prefix}antibadword remove <word>\n` +
    `   ${SYM.arrow} ${prefix}antibadword addregex <pattern>\n` +
    `   ${SYM.arrow} ${prefix}antibadword delregex <pattern>\n` +
    `   ${SYM.arrow} ${prefix}antibadword list\n` +
    `   ${SYM.arrow} ${prefix}antibadword clear\n` +
    `   ${SYM.arrow} ${prefix}antibadword default on|off\n` +
    `   ${SYM.arrow} ${prefix}antibadword status`
  );

  rich.addSuggest([
    `${prefix}antibadword delete`,
    `${prefix}antibadword warn`,
    `${prefix}antibadword status`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'antibadword',
  aliases: ['antibadwords', 'badwordguard', 'antitoxic', 'swearfilter'],
  category: 'group',
  description: 'Block bad words in the group',
  emoji: '▣',
  usage: 'delete | warn | kick | off | add | remove | list | clear | status',

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
    const rest = args.slice(1).join(' ').trim();

    if (!sub || sub === 'status') {
      const rich = buildStatusCard(sock, cfg, prefix);
      return rich.send(chatId, { quoted: msg });
    }

    if (MODES.includes(sub)) {
      if (sub !== 'off') {
        const admin = await isBotAdmin(sock, chatId);
        if (!admin) {
          return sock.sendMessage(chatId, {
            text:
              `${SYM.cross} I need to be admin to enforce antibadword\n` +
              `${SYM.arrow} promote me and try again\n\n` +
              footer()
          }, { quoted: msg });
        }
      }

      cfg.antibadwordMode = sub;
      cfg.antibadword     = sub !== 'off';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (sub === 'off') {
        rich.addText(
          `${SYM.check} *Antibadword disabled*\n` +
          `${SYM.arrow} bad words will not be blocked anymore`,
          { id: 'set' }
        );
      } else {
        const action = {
          delete: 'silently deleted',
          warn:   'deleted + sender warned',
          kick:   'deleted + warned + sender removed'
        }[sub];

        rich.addText(
          `${SYM.check} *Antibadword enabled*\n` +
          `${SYM.arrow} mode · *${sub}*\n` +
          `${SYM.arrow} bad words will be ${action}`,
          { id: 'set' }
        );
      }

      rich.addSuggest([
        `${prefix}antibadword status`,
        `${prefix}antibadword off`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.set', { sessionId, chatId, mode: sub });
      return;
    }

    if (sub === 'add') {
      if (!rest) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Usage: ${prefix}antibadword add <word>\n\n${footer()}`
        }, { quoted: msg });
      }

      const word = rest.toLowerCase().trim();
      if (!Array.isArray(cfg.badwords)) cfg.badwords = [];

      if (cfg.badwords.includes(word)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} *${word}* is already in the list\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.badwords.push(word);
      cfg.markModified('badwords');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Word added*\n` +
        `${SYM.arrow} \`${word}\`\n` +
        `${SYM.arrow} total · ${cfg.badwords.length}`,
        { id: 'add' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.add', { sessionId, chatId, word });
      return;
    }

    if (sub === 'remove' || sub === 'rm') {
      if (!rest) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Usage: ${prefix}antibadword remove <word>\n\n${footer()}`
        }, { quoted: msg });
      }

      const word = rest.toLowerCase().trim();
      if (!Array.isArray(cfg.badwords)) cfg.badwords = [];

      const before = cfg.badwords.length;
      cfg.badwords = cfg.badwords.filter((w) => w !== word);

      if (cfg.badwords.length === before) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} *${word}* is not in the list\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.markModified('badwords');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Word removed*\n` +
        `${SYM.arrow} \`${word}\`\n` +
        `${SYM.arrow} total · ${cfg.badwords.length}`,
        { id: 'remove' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.remove', { sessionId, chatId, word });
      return;
    }

    if (sub === 'addregex') {
      if (!rest) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Usage: ${prefix}antibadword addregex <pattern>\n\n${footer()}`
        }, { quoted: msg });
      }

      try {
        new RegExp(rest, 'i');
      } catch (err) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid regex · ${err.message.slice(0, 80)}\n\n${footer()}`
        }, { quoted: msg });
      }

      if (!Array.isArray(cfg.badwordRegex)) cfg.badwordRegex = [];

      if (cfg.badwordRegex.includes(rest)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} regex already exists\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.badwordRegex.push(rest);
      cfg.markModified('badwordRegex');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Regex added*\n` +
        `${SYM.arrow} \`${rest}\`\n` +
        `${SYM.arrow} total · ${cfg.badwordRegex.length}`,
        { id: 'add' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.addregex', { sessionId, chatId });
      return;
    }

    if (sub === 'delregex' || sub === 'rmregex') {
      if (!rest) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Usage: ${prefix}antibadword delregex <pattern>\n\n${footer()}`
        }, { quoted: msg });
      }

      if (!Array.isArray(cfg.badwordRegex)) cfg.badwordRegex = [];

      const before = cfg.badwordRegex.length;
      cfg.badwordRegex = cfg.badwordRegex.filter((r) => r !== rest);

      if (cfg.badwordRegex.length === before) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} regex not found\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.markModified('badwordRegex');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Regex removed*\n` +
        `${SYM.arrow} total · ${cfg.badwordRegex.length}`,
        { id: 'remove' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.delregex', { sessionId, chatId });
      return;
    }

    if (sub === 'list') {
      const custom = Array.isArray(cfg.badwords) ? cfg.badwords : [];
      const regex  = Array.isArray(cfg.badwordRegex) ? cfg.badwordRegex : [];

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Antibadword List*\n\n` +
        `${SYM.arrow} default list · ${cfg.badwordsUseDefault !== false ? '✅ on' : '❌ off'}\n` +
        `${SYM.arrow} custom words · ${custom.length}\n` +
        `${SYM.arrow} regex rules  · ${regex.length}`
      );

      if (custom.length) {
        rich.addText(
          `${SYM.diamond} *Custom words*\n\n` +
          custom.map((w) => `   ${SYM.bullet} ${w}`).join('\n')
        );
      }

      if (regex.length) {
        rich.addText(
          `${SYM.diamond} *Regex rules*\n\n` +
          regex.map((r) => `   ${SYM.bullet} \`${r}\``).join('\n')
        );
      }

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });
      return;
    }

    if (sub === 'clear') {
      cfg.badwords = [];
      cfg.badwordRegex = [];
      cfg.markModified('badwords');
      cfg.markModified('badwordRegex');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *List cleared*\n` +
        `${SYM.arrow} all custom words and regex removed`,
        { id: 'clear' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.clear', { sessionId, chatId });
      return;
    }

    if (sub === 'default') {
      const state = args?.[1]?.toLowerCase();

      if (!['on', 'off'].includes(state)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}antibadword default on|off\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.badwordsUseDefault = state === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Default list ${state}*\n` +
        `${SYM.arrow} built-in badwords · ${state === 'on' ? '✅ enabled' : '❌ disabled'}`,
        { id: 'set' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antibadword.default', { sessionId, chatId, state });
      return;
    }

    return sock.sendMessage(chatId, {
      text:
        `${SYM.cross} Unknown subcommand · \`${sub}\`\n` +
        `${SYM.arrow} use: delete, warn, kick, off, add, remove, addregex, delregex, list, clear, default, status\n\n` +
        footer()
    }, { quoted: msg });
  }
};