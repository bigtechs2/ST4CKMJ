import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig } from '../../../database/index.js';
import { getCount, clearCount, MAX_CALLS } from '../../../handlers/anticallHandler.js';

const log = logger.child('cmd:anticall');

const SYM = brand.SYM;

const MODES = ['on', 'off'];

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

function isGroupAdmin(metadata, jid) {
  if (!metadata?.participants) return false;
  const me = metadata.participants.find((p) => p.id === jid);
  if (!me) return false;
  return me.admin === 'admin' || me.admin === 'superadmin';
}

function isSessionOwner(senderNumber, session) {
  if (!senderNumber || !session) return false;
  const ownerNum = String(session.phoneNumber || '').replace(/\D/g, '');
  return ownerNum && ownerNum === senderNumber;
}

async function canUseCommand({ sock, chatId, senderJid, senderNumber, session }) {
  if (isSuperOwner(senderNumber)) return { ok: true, by: 'super-owner' };
  if (isSessionOwner(senderNumber, session)) return { ok: true, by: 'session-owner' };

  if (chatId.endsWith('@g.us')) {
    try {
      const metadata = await sock.groupMetadata(chatId);
      if (isGroupAdmin(metadata, senderJid)) return { ok: true, by: 'group-admin' };
    } catch (err) {
      log.warn(`groupMetadata failed: ${err.message}`);
    }
  }

  return { ok: false };
}

function buildStatusCard(sock, cfg, prefix) {
  const mode = cfg.anticallMode || (cfg.anticall ? 'on' : 'off');

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *Anticall Status*\n\n` +
    `${SYM.arrow} mode · *${mode}*\n` +
    `${SYM.arrow} scope · whole session`
  );

  rich.addText(
    `${SYM.diamond} *How it works*\n\n` +
    `   ${SYM.arrow} call 1 · silent reject\n` +
    `   ${SYM.arrow} call 2 · silent reject\n` +
    `   ${SYM.arrow} call 3 · silent reject + block\n\n` +
    `${SYM.info} no messages sent · no warnings · pure silence`
  );

  rich.addText(
    `${SYM.diamond} *Scope*\n\n` +
    `   ${SYM.bullet} voice calls\n` +
    `   ${SYM.bullet} video calls\n` +
    `   ${SYM.bullet} all incoming calls\n` +
    `   ${SYM.bullet} super owners bypass`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}anticall on\n` +
    `   ${SYM.arrow} ${prefix}anticall off\n` +
    `   ${SYM.arrow} ${prefix}anticall counts @user\n` +
    `   ${SYM.arrow} ${prefix}anticall reset @user\n` +
    `   ${SYM.arrow} ${prefix}anticall status`
  );

  rich.addSuggest([
    `${prefix}anticall on`,
    `${prefix}anticall status`,
    `${prefix}anticall off`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'anticall',
  aliases: ['anticalls', 'callguard', 'nocalls', 'antivoicecall'],
  category: 'group',
  description: 'Silent reject calls · block after 3 attempts',
  emoji: '▣',
  usage: 'on | off | counts @user | reset @user | status',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sessionCfg, mentionedJids, senderJid, senderNumber, session } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const auth = await canUseCommand({ sock, chatId, senderJid, senderNumber, session });

    if (!auth.ok) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} You cannot use this command\n` +
          `${SYM.arrow} only super owners, session owner, or group admins\n\n` +
          footer()
      }, { quoted: msg });
    }

    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);
    const sub = String(args?.[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
      const rich = buildStatusCard(sock, cfg, prefix);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'counts' || sub === 'count') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Check call count*\n\n` +
            `${SYM.arrow} usage: ${prefix}anticall counts @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const jid = mentions[0];
      const num = normalizeNumber(jid);
      const count = getCount(num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.square} *Call Count*\n\n` +
        `${SYM.arrow} user   · @${num}\n` +
        `${SYM.arrow} calls  · ${count}/${MAX_CALLS}\n\n` +
        (count >= MAX_CALLS
          ? `${SYM.info} next call → block`
          : `${SYM.info} ${MAX_CALLS - count} more call${MAX_CALLS - count === 1 ? '' : 's'} before block`),
        { id: 'info' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions: [jid], quoted: msg });
      return;
    }

    if (sub === 'reset' || sub === 'clear') {
      const mentions = Array.isArray(mentionedJids) ? mentionedJids : [];

      if (!mentions.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Reset call count*\n\n` +
            `${SYM.arrow} usage: ${prefix}anticall reset @user\n\n` +
            footer()
        }, { quoted: msg });
      }

      const jid = mentions[0];
      const num = normalizeNumber(jid);
      clearCount(num);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.check} *Call count reset*\n` +
        `${SYM.arrow} user  · @${num}\n` +
        `${SYM.arrow} calls · 0/${MAX_CALLS}`,
        { id: 'reset' }
      );

      rich.addText(footer());
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { mentions: [jid], quoted: msg });

      log.event('anticall.reset', { sessionId, chatId, user: num });
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} Unknown option · \`${sub}\`\n` +
          `${SYM.arrow} use: on, off, counts, reset, status\n\n` +
          footer()
      }, { quoted: msg });
    }

    cfg.anticallMode = sub;
    cfg.anticall     = sub === 'on';
    await cfg.save();

    const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

    if (sub === 'off') {
      rich.addText(
        `${SYM.check} *Anticall disabled*\n` +
        `${SYM.arrow} calls will ring normally`,
        { id: 'set' }
      );
    } else {
      rich.addText(
        `${SYM.check} *Anticall enabled*\n\n` +
        `${SYM.arrow} call 1 · silent reject\n` +
        `${SYM.arrow} call 2 · silent reject\n` +
        `${SYM.arrow} call 3 · silent reject + block\n\n` +
        `${SYM.info} no messages · no warnings · pure silence`,
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

    log.event('anticall.set', { sessionId, chatId, mode: sub, by: auth.by });
  }
};