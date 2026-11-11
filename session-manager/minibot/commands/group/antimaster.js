import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';
import { getWarnings, clearWarnings, MAX_WARNINGS } from '../../../handlers/antimasterHandler.js';

const log = logger.child('cmd:antimaster');

const SYM = brand.SYM;

const MEDIA_TYPES = ['image', 'video', 'document', 'sticker', 'audio', 'voicenote', 'vcard', 'contact'];
const MEDIA_ACTIONS = ['delete', 'warn', 'kick', 'off'];

const TYPE_LABEL = {
  image:        'Images',
  video:        'Videos',
  document:     'Documents',
  sticker:      'Stickers',
  audio:        'Audio files',
  voicenote:    'Voice notes',
  vcard:        'vCards',
  contact:      'Contacts',
  forward:      'Forwarded',
  statusmention:'Status mentions',
  leave:        'Member leave'
};

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

function getMasterConfig(cfg) {
  return cfg.antimaster || {};
}

function buildStatusCard(sock, cfg, prefix) {
  const master = getMasterConfig(cfg);
  const active = Object.entries(master).filter(([_, v]) => v && v !== 'off').length;

  const lines = [
    ...MEDIA_TYPES.map((t) => {
      const val = master[t] || 'off';
      const badge = val === 'off' ? '❌ off' : `✅ ${val}`;
      return `   ${SYM.arrow} ${TYPE_LABEL[t].padEnd(14)} · ${badge}`;
    }),
    `   ${SYM.arrow} ${TYPE_LABEL.forward.padEnd(14)} · ${master.forward && master.forward !== 'off' ? `✅ ${master.forward}` : '❌ off'}`,
    `   ${SYM.arrow} ${TYPE_LABEL.statusmention.padEnd(14)} · ${master.statusmention && master.statusmention !== 'off' ? `✅ ${master.statusmention}` : '❌ off'}`,
    `   ${SYM.arrow} ${TYPE_LABEL.leave.padEnd(14)} · ${master.leave && master.leave !== 'off' ? `✅ ${master.leave}` : '❌ off'}`
  ].join('\n');

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antimaster Status*\n\n` +
    `${SYM.arrow} active · ${active} of 11`
  );

  rich.addText(
    `${SYM.diamond} *Rules*\n\n` + lines
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antimaster <type> <action>\n` +
    `   ${SYM.arrow} ${prefix}antimaster all <action>\n` +
    `   ${SYM.arrow} ${prefix}antimaster media on|off\n` +
    `   ${SYM.arrow} ${prefix}antimaster off\n\n` +
    `${SYM.info} types · ${MEDIA_TYPES.join(', ')}, forward, statusmention, leave`
  );

  rich.addText(
    `${SYM.info} *Actions per type*\n` +
    `   ${SYM.bullet} media · delete / warn / kick / off\n` +
    `   ${SYM.bullet} forward · delete / warn / kick / off\n` +
    `   ${SYM.bullet} statusmention · warn / block / off\n` +
    `   ${SYM.bullet} leave · notify / readd / off`
  );

  rich.addTip(`all warnings posted in group · no DMs · no ban risk`);

  rich.addSuggest([
    `${prefix}antimaster all delete`,
    `${prefix}antimaster off`,
    `${prefix}antimaster image warn`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

async function setType(cfg, type, action) {
  if (!cfg.antimaster) cfg.antimaster = {};
  cfg.antimaster[type] = action;
  cfg.markModified('antimaster');
  await cfg.save();
}

export default {
  name: 'antimaster',
  aliases: ['am', 'antiall', 'anti-all'],
  category: 'group',
  description: 'Block media, forwards, status mentions, and more',
  emoji: '▣',
  usage: '<type> <action> | all <action> | off | status',

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
    if (!cfg.antimaster) cfg.antimaster = {};

    const sub   = String(args?.[0] || '').toLowerCase();
    const sub2  = String(args?.[1] || '').toLowerCase();

    if (!sub || sub === 'status' || sub === 'info') {
      const rich = buildStatusCard(sock, cfg, prefix);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'warnings' || sub === 'strikes') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];
      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}antimaster warnings @user\n\n${footer()}`
        }, { quoted: msg });
      }
      const jid = mentions[0];
      const num = normalizeNumber(jid);
      const count = getWarnings(chatId, num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.square} *Warning Count*\n\n` +
        `${SYM.arrow} user · @${num}\n` +
        `${SYM.arrow} strikes · ${count}/${MAX_WARNINGS}`,
        { id: 'info' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions: [jid], quoted: msg });
      return;
    }

    if (sub === 'clearwarnings' || sub === 'reset') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];
      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}antimaster clearwarnings @user\n\n${footer()}`
        }, { quoted: msg });
      }
      const jid = mentions[0];
      const num = normalizeNumber(jid);
      clearWarnings(chatId, num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Warnings cleared*\n` +
        `${SYM.arrow} @${num} · 0/${MAX_WARNINGS}`,
        { id: 'reset' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { mentions: [jid], quoted: msg });
      return;
    }

    if (sub === 'off') {
      if (!cfg.antimaster) cfg.antimaster = {};
      for (const t of MEDIA_TYPES) cfg.antimaster[t] = 'off';
      cfg.antimaster.forward = 'off';
      cfg.antimaster.statusmention = 'off';
      cfg.antimaster.leave = 'off';
      cfg.markModified('antimaster');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Antimaster disabled*\n${SYM.arrow} all rules set to off`,
        { id: 'off' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });
      log.event('antimaster.off', { sessionId, chatId });
      return;
    }

    if (sub === 'all' || sub === 'media') {
      const action = sub === 'media' ? (sub2 === 'off' ? 'off' : 'delete') : sub2;

      if (sub === 'all' && !['delete', 'warn', 'kick', 'off'].includes(action)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid action · \`${action}\`\n${SYM.arrow} use: delete, warn, kick, off\n\n${footer()}`
        }, { quoted: msg });
      }

      if (action !== 'off') {
        const admin = await isBotAdmin(sock, chatId);
        if (!admin) {
          return sock.sendMessage(chatId, {
            text: `${SYM.cross} I need to be admin\n${SYM.arrow} promote me first\n\n${footer()}`
          }, { quoted: msg });
        }
      }

      if (!cfg.antimaster) cfg.antimaster = {};
      for (const t of MEDIA_TYPES) cfg.antimaster[t] = action;
      if (sub === 'all') {
        cfg.antimaster.forward = action;
      }
      cfg.markModified('antimaster');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *${sub === 'media' ? 'Media' : 'All'} types ${action === 'off' ? 'disabled' : `set to ${action}`}*\n` +
        `${SYM.arrow} ${sub === 'media' ? MEDIA_TYPES.length : MEDIA_TYPES.length + 1} rules updated`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });
      log.event('antimaster.bulk', { sessionId, chatId, action });
      return;
    }

    if (sub === 'forward') {
      const action = sub2;
      if (!['delete', 'warn', 'kick', 'off'].includes(action)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid action\n${SYM.arrow} use: delete, warn, kick, off\n\n${footer()}`
        }, { quoted: msg });
      }
      if (action !== 'off') {
        const admin = await isBotAdmin(sock, chatId);
        if (!admin) {
          return sock.sendMessage(chatId, {
            text: `${SYM.cross} I need to be admin\n\n${footer()}`
          }, { quoted: msg });
        }
      }
      await setType(cfg, 'forward', action);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Forward blocking · ${action}*\n${SYM.arrow} forwarded messages will be ${action}`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });
      log.event('antimaster.forward', { sessionId, chatId, action });
      return;
    }

    if (sub === 'statusmention') {
      const action = sub2;
      if (!['warn', 'block', 'off'].includes(action)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid action\n${SYM.arrow} use: warn, block, off\n\n${footer()}`
        }, { quoted: msg });
      }
      await setType(cfg, 'statusmention', action);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Status mention · ${action}*\n` +
        `${SYM.arrow} ${
          action === 'warn'  ? 'warn posted in a shared group · no DM'
          : action === 'block' ? 'user blocked + notice in shared group'
          : 'statuses mentioning me will be ignored'
        }`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });
      log.event('antimaster.statusmention', { sessionId, chatId, action });
      return;
    }

    if (sub === 'leave' || sub === 'memberleave') {
      const action = sub2;
      if (!['notify', 'readd', 'off'].includes(action)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid action\n${SYM.arrow} use: notify, readd, off\n\n${footer()}`
        }, { quoted: msg });
      }
      if (action === 'readd') {
        const admin = await isBotAdmin(sock, chatId);
        if (!admin) {
          return sock.sendMessage(chatId, {
            text: `${SYM.cross} I need to be admin for readd mode\n\n${footer()}`
          }, { quoted: msg });
        }
      }
      await setType(cfg, 'leave', action);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Member leave · ${action}*\n${SYM.arrow} ${
          action === 'notify' ? 'admins notified when member leaves' :
          action === 'readd' ? 'members re-added if kicked' :
          'leave events ignored'
        }`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });
      log.event('antimaster.leave', { sessionId, chatId, action });
      return;
    }

    if (MEDIA_TYPES.includes(sub)) {
      const action = sub2;
      if (!MEDIA_ACTIONS.includes(action)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.cross} Invalid action\n${SYM.arrow} use: delete, warn, kick, off\n\n${footer()}`
        }, { quoted: msg });
      }
      if (action !== 'off') {
        const admin = await isBotAdmin(sock, chatId);
        if (!admin) {
          return sock.sendMessage(chatId, {
            text: `${SYM.cross} I need to be admin\n\n${footer()}`
          }, { quoted: msg });
        }
      }
      await setType(cfg, sub, action);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *${TYPE_LABEL[sub]} · ${action}*\n${SYM.arrow} ${sub} will be ${action === 'off' ? 'allowed' : `${action}ed`}`,
        { id: 'set' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });
      log.event('antimaster.set', { sessionId, chatId, type: sub, action });
      return;
    }

    return sock.sendMessage(chatId, {
      text:
        `${SYM.cross} Unknown type · \`${sub}\`\n\n` +
        `${SYM.arrow} media: ${MEDIA_TYPES.join(', ')}\n` +
        `${SYM.arrow} extras: forward, statusmention, leave\n` +
        `${SYM.arrow} shortcuts: all, media, off, status\n\n` +
        footer()
    }, { quoted: msg });
  }
};