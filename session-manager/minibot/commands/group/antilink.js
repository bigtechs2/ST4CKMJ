import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:antilink');

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

export default {
  name: 'antilink',
  aliases: ['linkguard', 'antilinks', 'antilinkgc'],
  category: 'group',
  description: 'Block links in the group',
  emoji: '▣',
  usage: 'delete | warn | kick | off | status',

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
    const current = cfg.antilinkMode || (cfg.antilink ? 'delete' : 'off');

    if (!sub || sub === 'status') {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Antilink Status*\n\n` +
        `${SYM.arrow} mode · *${current}*\n\n` +
        `${SYM.diamond} *Available Modes*\n\n` +
        `   ${SYM.arrow} ${prefix}antilink delete · silently delete\n` +
        `   ${SYM.arrow} ${prefix}antilink warn   · delete + warn\n` +
        `   ${SYM.arrow} ${prefix}antilink kick   · delete + warn + kick\n` +
        `   ${SYM.arrow} ${prefix}antilink off    · disable`
      );

      rich.addText(
        `${SYM.info} *Detects every kind of link*\n` +
        `   ${SYM.bullet} http / https URLs\n` +
        `   ${SYM.bullet} wa.me · chat.whatsapp.com\n` +
        `   ${SYM.bullet} whatsapp channel links\n` +
        `   ${SYM.bullet} t.me · discord.gg\n` +
        `   ${SYM.bullet} shorteners (bit.ly, tinyurl, etc)\n` +
        `   ${SYM.bullet} bare domains (.com, .net, …)`
      );

      rich.addSuggest([
        `${prefix}antilink delete`,
        `${prefix}antilink warn`,
        `${prefix}antilink kick`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      return rich.send(chatId, { quoted: msg });
    }

    if (!MODES.includes(sub)) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} Unknown mode · \`${sub}\`\n${SYM.arrow} use: delete, warn, kick, off, status\n\n${footer()}`
      }, { quoted: msg });
    }

    if (sub !== 'off') {
      const admin = await isBotAdmin(sock, chatId);

      if (!admin) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} I need to be admin to enforce antilink\n` +
            `${SYM.arrow} promote me and try again\n\n` +
            footer()
        }, { quoted: msg });
      }
    }

    cfg.antilinkMode = sub;
    cfg.antilink     = sub !== 'off';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    if (sub === 'off') {
      rich.addText(
        `${SYM.check} *Antilink disabled*\n` +
        `${SYM.arrow} links will not be blocked anymore`,
        { id: 'set' }
      );
    } else {
      const actionLine = {
        delete: 'silently deleted',
        warn:   'deleted + sender warned',
        kick:   'deleted + warned + sender removed'
      }[sub];

      rich.addText(
        `${SYM.check} *Antilink enabled*\n` +
        `${SYM.arrow} mode · *${sub}*\n` +
        `${SYM.arrow} links will be ${actionLine}`,
        { id: 'set' }
      );
    }

    rich.addSuggest([
      `${prefix}antilink status`,
      `${prefix}antilink off`
    ]);

    rich.addText(footer());
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { quoted: msg });

    log.event('antilink.set', {
      sessionId,
      chatId,
      mode: sub
    });
  }
};