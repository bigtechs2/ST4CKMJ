import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';

const log = logger.child('cmd:antispam');

const SYM = brand.SYM;

const MODES = ['delete', 'warn', 'kick', 'off'];

const MESSAGE_FEATURES = [
  'text', 'media', 'sticker', 'audio', 'video', 'document',
  'contact', 'location', 'poll', 'vcard', 'forward', 'broadcast',
  'mention', 'caps', 'emoji', 'viewonce'
];

const PRESENCE_FEATURES = [
  'typing', 'recording', 'online'
];

const ALL_FEATURES = [...MESSAGE_FEATURES, ...PRESENCE_FEATURES];

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

function getFeatures(cfg) {
  const sp = cfg.antispamFeatures || {};
  return ALL_FEATURES.reduce((acc, f) => {
    acc[f] = sp[f] !== false;
    return acc;
  }, {});
}

function buildStatusCard(sock, cfg, prefix) {
  const mode = cfg.antispamMode || (cfg.antispam ? 'delete' : 'off');
  const features = getFeatures(cfg);

  const enabledMsg = MESSAGE_FEATURES.filter((f) => features[f]);
  const enabledPrs = PRESENCE_FEATURES.filter((f) => features[f]);
  const disabledMsg = MESSAGE_FEATURES.filter((f) => !features[f]);
  const disabledPrs = PRESENCE_FEATURES.filter((f) => !features[f]);

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Antispam Status*\n\n` +
    `${SYM.arrow} mode · *${mode}*\n` +
    `${SYM.arrow} on   · ${enabledMsg.length + enabledPrs.length} features\n` +
    `${SYM.arrow} off  · ${disabledMsg.length + disabledPrs.length} features`
  );

  rich.addText(
    `${SYM.diamond} *Message features*\n\n` +
    (enabledMsg.length
      ? enabledMsg.map((f) => `   ${SYM.check} ${f}`).join('\n')
      : `   ${SYM.info} all disabled`)
  );

  rich.addText(
    `${SYM.diamond} *Presence features*\n\n` +
    `   ${features.typing    ? SYM.check : SYM.cross} typing flood\n` +
    `   ${features.recording ? SYM.check : SYM.cross} recording flood\n` +
    `   ${features.online    ? SYM.check : SYM.cross} online toggling\n\n` +
    `${SYM.info} presence features warn/kick only — no delete possible`
  );

  if (disabledMsg.length) {
    rich.addText(
      `${SYM.diamond} *Disabled*\n\n` +
      disabledMsg.map((f) => `   ${SYM.cross} ${f}`).join('\n') +
      (disabledPrs.length
        ? '\n' + disabledPrs.map((f) => `   ${SYM.cross} ${f}`).join('\n')
        : '')
    );
  }

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}antispam delete|warn|kick|off\n` +
    `   ${SYM.arrow} ${prefix}antispam toggle <feature>\n` +
    `   ${SYM.arrow} ${prefix}antispam on <feature>\n` +
    `   ${SYM.arrow} ${prefix}antispam off <feature>\n` +
    `   ${SYM.arrow} ${prefix}antispam reset\n` +
    `   ${SYM.arrow} ${prefix}antispam status`
  );

  rich.addSuggest([
    `${prefix}antispam warn`,
    `${prefix}antispam toggle typing`,
    `${prefix}antispam status`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'antispam',
  aliases: ['spamguard', 'antispams', 'spamfilter'],
  category: 'group',
  description: 'Block spam in the group',
  emoji: '▣',
  usage: 'delete | warn | kick | off | toggle <feature> | status',

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
    const feature = String(args?.[1] || '').toLowerCase();

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
              `${SYM.cross} I need to be admin to enforce antispam\n` +
              `${SYM.arrow} promote me and try again\n\n` +
              footer()
          }, { quoted: msg });
        }
      }

      cfg.antispamMode = sub;
      cfg.antispam     = sub !== 'off';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (sub === 'off') {
        rich.addText(
          `${SYM.check} *Antispam disabled*\n` +
          `${SYM.arrow} spam will not be blocked anymore`,
          { id: 'set' }
        );
      } else {
        const action = {
          delete: 'silently handled',
          warn:   'handled + sender warned',
          kick:   'handled + warned + sender removed'
        }[sub];

        rich.addText(
          `${SYM.check} *Antispam enabled*\n` +
          `${SYM.arrow} mode · *${sub}*\n` +
          `${SYM.arrow} spam will be ${action}`,
          { id: 'set' }
        );
      }

      rich.addSuggest([
        `${prefix}antispam status`,
        `${prefix}antispam off`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antispam.set', { sessionId, chatId, mode: sub });
      return;
    }

    if (sub === 'toggle' || sub === 'on' || sub === 'off') {
      if (!feature || !ALL_FEATURES.includes(feature)) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Unknown feature · \`${feature || 'none'}\`\n\n` +
            `${SYM.diamond} *Message*\n   ${MESSAGE_FEATURES.join(', ')}\n\n` +
            `${SYM.diamond} *Presence*\n   ${PRESENCE_FEATURES.join(', ')}\n\n` +
            footer()
        }, { quoted: msg });
      }

      if (!cfg.antispamFeatures) cfg.antispamFeatures = {};

      let newState;

      if (sub === 'toggle') {
        const current = cfg.antispamFeatures[feature];
        newState = current === false ? true : false;
      } else {
        newState = sub === 'on';
      }

      cfg.antispamFeatures[feature] = newState;
      cfg.markModified('antispamFeatures');
      await cfg.save();

      const isPresence = PRESENCE_FEATURES.includes(feature);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${newState ? SYM.check : SYM.cross} *${feature}* ${newState ? 'enabled' : 'disabled'}\n` +
        `${SYM.arrow} type · ${isPresence ? 'presence' : 'message'}\n` +
        `${SYM.arrow} mode · ${cfg.antispamMode || 'off'}` +
        (isPresence
          ? `\n\n${SYM.info} presence features warn/kick only`
          : ''),
        { id: 'set' }
      );

      rich.addSuggest([
        `${prefix}antispam status`,
        `${prefix}antispam toggle ${feature}`
      ]);

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antispam.feature', { sessionId, chatId, feature, newState });
      return;
    }

    if (sub === 'reset') {
      cfg.antispamFeatures = {};
      cfg.markModified('antispamFeatures');
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Antispam features reset*\n` +
        `${SYM.arrow} all features restored to default (on)`,
        { id: 'reset' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('antispam.reset', { sessionId, chatId });
      return;
    }

    return sock.sendMessage(chatId, {
      text:
        `${SYM.cross} Unknown subcommand · \`${sub}\`\n` +
        `${SYM.arrow} use: delete, warn, kick, off, toggle, on, off, reset, status\n\n` +
        footer()
    }, { quoted: msg });
  }
};