import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:antitag');

const SYM = brand.SYM;

const MODES = ['delete', 'warn', 'kick', 'off'];

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

async function getAdminList(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);

    return (metadata.participants || [])
      .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
      .map((p) => normalizeNumber(p.id));
  } catch {
    return [];
  }
}

function buildStatusCard(sock, cfg, prefix, adminList) {
  const mode      = cfg.antitagMode || (cfg.antitag ? 'delete' : 'off');
  const threshold = Number(cfg.antitagThreshold) || 5;
  const protectedList = Array.isArray(cfg.antitagProtected) ? cfg.antitagProtected : [];

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antitag Status*\n\n` +
    `${SYM.arrow} mode       · *${mode}*\n` +
    `${SYM.arrow} threshold  · ${threshold} mentions\n` +
    `${SYM.arrow} protected  · ${protectedList.length} manual + ${adminList.length} admins`
  );

  rich.addText(
    `${SYM.diamond} *Auto-protected*\n\n` +
    `   ${SYM.arrow} super owners (config)\n` +
    `   ${SYM.arrow} group admins (${adminList.length})\n` +
    `   ${SYM.arrow} manual list (${protectedList.length})`
  );

  rich.addText(
    `${SYM.diamond} *Rules*\n\n` +
    `   ${SYM.check} admin/owner tagging  · allowed\n` +
    `   ${SYM.cross} member tagging admin · deleted\n` +
    `   ${SYM.cross} member mass-tagging  · deleted\n` +
    `   ${SYM.cross} @all / @everyone     · deleted`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antitag delete|warn|kick|off\n` +
    `   ${SYM.arrow} ${prefix}antitag threshold <n>\n` +
    `   ${SYM.arrow} ${prefix}antitag protect @user\n` +
    `   ${SYM.arrow} ${prefix}antitag unprotect @user\n` +
    `   ${SYM.arrow} ${prefix}antitag protected\n` +
    `   ${SYM.arrow} ${prefix}antitag clearprotected\n` +
    `   ${SYM.arrow} ${prefix}antitag status`
  );

  rich.addSuggest([
    `${prefix}antitag delete`,
    `${prefix}antitag protect`,
    `${prefix}antitag status`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'antitag',
  aliases: ['antitags', 'antimention', 'tagguard', 'antimassmention'],
  category: 'group',
  description: 'Block mass mentions and protect admins/owners',
  emoji: '▣',
  usage: 'delete | warn | kick | off | threshold <n> | protect @user | status',

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

    if (!cfg.antitagProtected) cfg.antitagProtected = [];

    if (!sub || sub === 'status') {
      const adminList = await getAdminList(sock, chatId);
      const rich = buildStatusCard(sock, cfg, prefix, adminList);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'protect') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Protect a user*\n\n` +
            `${SYM.arrow} tag a user to protect them\n` +
            `${SYM.arrow} example: ${prefix}antitag protect @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const added = [];

      for (const jid of mentions) {
        const num = normalizeNumber(jid);
        if (!num) continue;
        if (cfg.antitagProtected.includes(num)) continue;

        cfg.antitagProtected.push(num);
        added.push(num);
      }

      if (!added.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Already protected*\n` +
            `${SYM.arrow} these users are already on the list\n\n` +
            footer()
        }, { quoted: msg });
      }

      cfg.markModified('antitagProtected');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Protected users added*\n\n` +
        added.map((n) => `   ${SYM.arrow} @${n}`).join('\n') +
        `\n\n${SYM.info} total · ${cfg.antitagProtected.length}`,
        { id: 'add' }
      );

      rich.addSuggest([
        `${prefix}antitag protected`,
        `${prefix}antitag status`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, {
        mentions: mentions,
        quoted:   msg
      });

      log.event('antitag.protect', { sessionId, chatId, added });
      return;
    }

    if (sub === 'unprotect') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Unprotect a user*\n\n` +
            `${SYM.arrow} tag a user to remove them\n` +
            `${SYM.arrow} example: ${prefix}antitag unprotect @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const removed = [];

      for (const jid of mentions) {
        const num = normalizeNumber(jid);
        if (!num) continue;

        const before = cfg.antitagProtected.length;
        cfg.antitagProtected = cfg.antitagProtected.filter((n) => n !== num);

        if (cfg.antitagProtected.length < before) {
          removed.push(num);
        }
      }

      if (!removed.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Not protected*\n` +
            `${SYM.arrow} these users were not on the list\n\n` +
            footer()
        }, { quoted: msg });
      }

      cfg.markModified('antitagProtected');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Protected users removed*\n\n` +
        removed.map((n) => `   ${SYM.arrow} @${n}`).join('\n') +
        `\n\n${SYM.info} total · ${cfg.antitagProtected.length}`,
        { id: 'remove' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, {
        mentions: mentions,
        quoted:   msg
      });

      log.event('antitag.unprotect', { sessionId, chatId, removed });
      return;
    }

    if (sub === 'protected') {
      const list = cfg.antitagProtected || [];
      const adminList = await getAdminList(sock, chatId);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Protection Overview*\n\n` +
        `${SYM.arrow} manual list · ${list.length}\n` +
        `${SYM.arrow} auto admins · ${adminList.length}`
      );

      if (list.length) {
        rich.addText(
          `${SYM.diamond} *Manual list*\n\n` +
          list.map((n) => `   ${SYM.arrow} @${n}`).join('\n'),
          { id: 'manual' }
        );
      }

      if (adminList.length) {
        rich.addText(
          `${SYM.diamond} *Auto-protected admins*\n\n` +
          adminList.map((n) => `   ${SYM.arrow} @${n}`).join('\n'),
          { id: 'admins' }
        );
      }

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, {
        mentions: [
          ...list.map((n) => `${n}@s.whatsapp.net`),
          ...adminList.map((n) => `${n}@s.whatsapp.net`)
        ],
        quoted: msg
      });

      return;
    }

    if (sub === 'clearprotected') {
      const count = (cfg.antitagProtected || []).length;
      cfg.antitagProtected = [];
      cfg.markModified('antitagProtected');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Manual list cleared*\n` +
        `${SYM.arrow} ${count} users removed\n` +
        `${SYM.info} admins are still auto-protected`,
        { id: 'clear' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antitag.clearprotected', { sessionId, chatId, count });
      return;
    }

    if (sub === 'threshold') {
      const n = Number(args?.[1]);

      if (!Number.isInteger(n) || n < 2 || n > 50) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Invalid threshold\n` +
            `${SYM.arrow} use a number between 2 and 50\n\n` +
            footer()
        }, { quoted: msg });
      }

      cfg.antitagThreshold = n;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Threshold updated*\n` +
        `${SYM.arrow} mentions required · ${n}`,
        { id: 'set' }
      );

      rich.addSuggest([
        `${prefix}antitag status`,
        `${prefix}antitag delete`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antitag.threshold', { sessionId, chatId, threshold: n });
      return;
    }

    if (!MODES.includes(sub)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} Unknown mode · \`${sub}\`\n` +
          `${SYM.arrow} use: delete, warn, kick, off, threshold, protect, unprotect, protected, clearprotected, status\n\n` +
          footer()
      }, { quoted: msg });
    }

    if (sub !== 'off') {
      const admin = await isBotAdmin(sock, chatId);
      if (!admin) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} I need to be admin to enforce antitag\n` +
            `${SYM.arrow} promote me and try again\n\n` +
            footer()
        }, { quoted: msg });
      }
    }

    cfg.antitagMode = sub;
    cfg.antitag     = sub !== 'off';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    if (sub === 'off') {
      rich.addText(
        `${SYM.check} *Antitag disabled*\n` +
        `${SYM.arrow} tag protection is off`,
        { id: 'set' }
      );
    } else {
      const action = {
        delete: 'silently deleted',
        warn:   'deleted + sender warned',
        kick:   'deleted + warned + sender removed'
      }[sub];

      rich.addText(
        `${SYM.check} *Antitag enabled*\n` +
        `${SYM.arrow} mode · *${sub}*\n` +
        `${SYM.arrow} violations will be ${action}\n\n` +
        `${SYM.info} admin/owner tags are always allowed`,
        { id: 'set' }
      );
    }

    rich.addSuggest([
      `${prefix}antitag status`,
      `${prefix}antitag off`
    ]);

    rich.addText(footer());
    rich.setFooter(config.msg.footer);

    await rich.send(chatId, { quoted: msg });

    log.event('antitag.set', { sessionId, chatId, mode: sub });
  }
};