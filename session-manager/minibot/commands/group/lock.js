import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:lock');

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

async function isBotAdmin(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);
    const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
    const botNumber = normalizeNumber(botJid);
    const me = metadata.participants.find((p) => normalizeNumber(p.id) === botNumber);
    return me?.admin === 'admin' || me?.admin === 'superadmin';
  } catch {
    return false;
  }
}

async function getCurrentSetting(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);
    return metadata.announce === true ? 'locked' : 'unlocked';
  } catch {
    return 'unknown';
  }
}

export default {
  name: 'lock',
  aliases: ['lockgroup', 'gclock', 'lockinfo'],
  category: 'group',
  description: 'Lock group info (name, description, photo) to admins only',
  emoji: '▣',
  usage: 'on | off | status',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   true,
    premium: false,
    group:   true,
    private: false
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} This command only works in groups\n\n${footer()}`
      }, { quoted: msg });
    }

    const admin = await isBotAdmin(sock, chatId);
    if (!admin) {
      return sock.sendMessage(chatId, {
        text: `${SYM.cross} I need to be admin to lock the group\n${SYM.arrow} promote me first\n\n${footer()}`
      }, { quoted: msg });
    }

    const sub = String(args?.[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
      const current = await getCurrentSetting(sock, chatId);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Group Lock Status*\n\n` +
        `${SYM.arrow} info editing · *${current === 'locked' ? '🔒 locked' : '🔓 unlocked'}*`
      );
      rich.addText(
        `${SYM.diamond} *What lock does*\n\n` +
        `   ${SYM.bullet} locks group name\n` +
        `   ${SYM.bullet} locks group description\n` +
        `   ${SYM.bullet} locks group photo\n` +
        `   ${SYM.bullet} only admins can edit\n` +
        `   ${SYM.bullet} members restricted`
      );
      rich.addText(
        `${SYM.diamond} *Commands*\n\n` +
        `   ${SYM.arrow} ${prefix}lock on     · lock info\n` +
        `   ${SYM.arrow} ${prefix}lock off    · unlock\n` +
        `   ${SYM.arrow} ${prefix}lock status`
      );
      rich.addSuggest([`${prefix}lock on`, `${prefix}lock off`]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'on' || sub === 'off') {
      const target = sub === 'on' ? 'locked' : 'unlocked';

      try {
        await sock.groupSettingUpdate(chatId, target);
      } catch (err) {
        log.error(`groupSettingUpdate failed: ${err.message}`);
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Failed to ${sub === 'on' ? 'lock' : 'unlock'}\n${SYM.arrow} ${err.message.slice(0, 100)}\n\n${footer()}`
        }, { quoted: msg });
      }

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (sub === 'on') {
        rich.addText(
          `${SYM.check} *Group locked 🔒*\n\n` +
          `${SYM.arrow} name · admins only\n` +
          `${SYM.arrow} description · admins only\n` +
          `${SYM.arrow} photo · admins only\n\n` +
          `${SYM.info} members can no longer edit group info`,
          { id: 'set' }
        );
      } else {
        rich.addText(
          `${SYM.check} *Group unlocked 🔓*\n\n` +
          `${SYM.arrow} members can edit group info again\n` +
          `${SYM.info} use ${prefix}lock on to re-lock`,
          { id: 'set' }
        );
      }

      rich.addSuggest([
        `${prefix}lock ${sub === 'on' ? 'off' : 'on'}`,
        `${prefix}lock status`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('lock.set', { sessionId: ctx.sessionId, chatId, action: sub });
      return;
    }

    return sock.sendMessage(chatId, {
      text: `${SYM.cross} Invalid option · \`${sub}\`\n${SYM.arrow} use: on, off, status\n\n${footer()}`
    }, { quoted: msg });
  }
};