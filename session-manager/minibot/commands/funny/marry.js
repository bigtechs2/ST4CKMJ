import { Button } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { registerMarriage } from '../../../handlers/buttonHandler.js';

const log = logger.child('cmd:marry');

const SYM = brand.SYM;

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function extractTarget(mentionedJids) {
  if (!Array.isArray(mentionedJids) || !mentionedJids.length) return null;

  const jid = mentionedJids[0];
  if (!jid) return null;

  const cleanJid = jid.split('@')[0].split(':')[0] + '@s.whatsapp.net';
  const number   = jid.split('@')[0].split(':')[0].replace(/\D/g, '');

  if (!number) return null;

  return { jid: cleanJid, number };
}

export default {
  name: 'marry',
  aliases: ['propose', 'proposal', 'marryme'],
  category: 'funny',
  description: 'Propose marriage to someone with buttons',
  emoji: '☺',
  usage: '@user',

  permissions: {
    coin:    5,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sessionCfg, senderNumber } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const target = extractTarget(ctx.mentionedJids);

    if (!target) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *Marriage Proposal*\n\n` +
          `${SYM.arrow} tag someone to propose to\n` +
          `${SYM.arrow} example: ${prefix}marry @user\n\n` +
          footer()
      }, { quoted: msg });
    }

    if (target.number === senderNumber) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} you cannot marry yourself\n\n` +
          footer()
      }, { quoted: msg });
    }

    try {
      let targetPP = null;

      try {
        targetPP = await sock.profilePictureUrl(target.jid, 'image');
      } catch {
        targetPP = null;
      }

      if (!targetPP) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} @${target.number} has no profile picture\n` +
            `${SYM.arrow} proposal cannot be sent\n\n` +
            footer(),
          mentions: [target.jid]
        }, { quoted: msg });
      }

      registerMarriage(senderNumber, target.number, {
        sessionId: ctx.sessionId,
        chatId,
        createdAt: Date.now()
      });

      const body =
        `${SYM.heart} *Marriage Proposal*\n\n` +
        `${SYM.arrow} @${senderNumber} is proposing to @${target.number}\n\n` +
        `${SYM.info} only @${target.number} can answer\n` +
        `${SYM.pointer} tap accept or decline below`;

      const btn = new Button(sock)
        .setContextInfo({
          stanzaId:      msg.key.id,
          participant:   msg.key.participant || msg.key.remoteJid,
          quotedMessage: msg.message,
          mentionedJid:  [target.jid]
        })
        .setTitle('Marriage Proposal')
        .setBody(body)
        .setFooter(config.msg.footer)
        .setImage(targetPP)
        .addReply('ACCEPT',  `marry:accept:${senderNumber}:${target.number}`)
        .addReply('DECLINE', `marry:decline:${senderNumber}:${target.number}`);

      await btn.send(chatId);

      log.event('command.marry', {
        sessionId: ctx.sessionId,
        sender:    senderNumber,
        target:    target.number
      });

    } catch (err) {
      log.error(`marry failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Proposal failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            footer()
        }, { quoted: msg });
      } catch {}
    }
  }
};