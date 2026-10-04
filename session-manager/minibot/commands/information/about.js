import os from 'node:os';
import process from 'node:process';

import { ButtonV2 } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import format from '../../../utils/format.js';

const log = logger.child('cmd:about');

const SYM = brand.SYM;

function buildFooterText() {
  const url  = config.bot?.channelLink || config.links.whatsappChannel;
  const text = config.msg.footer;

  return `${url}\n${text}`;
}

function buildStats() {
  const botName   = brand.BOT_NAME;
  const version   = brand.BOT_VERSION;
  const ownerName = config.owners.whatsapp.name || brand.AUTHOR_NAME;
  const mode      = config.features.selfMode ? 'self' : 'public';
  const uptime    = format.formatUptime(process.uptime());
  const platform  = `${os.type()} ${os.arch()}`;
  const nodeVer   = process.version;

  return [
    `${SYM.arrow} Bot      · ${botName}`,
    `${SYM.arrow} Version  · ${version}`,
    `${SYM.arrow} Owner    · ${ownerName}`,
    `${SYM.arrow} Mode     · ${mode}`,
    `${SYM.arrow} Uptime   · ${uptime}`,
    `${SYM.arrow} Platform · ${platform}`,
    `${SYM.arrow} Node.js  · ${nodeVer}`,
    `${SYM.arrow} Library  · Baileys + NIXCODE`
  ].join('\n');
}

export default {
  name: 'about',
  aliases: ['bot', 'infobot'],
  category: 'information',
  description: 'About this bot',
  emoji: '♡',
  usage: '',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    try {
      const botName   = brand.BOT_NAME;
      const ownerName = config.owners.whatsapp.name || brand.AUTHOR_NAME;
      const stats     = buildStats();
      const thumbnail = config.bot?.thumbnail || '';
      const footer    = buildFooterText();

      const body =
        `Hello! I'm *${botName}*, a WhatsApp bot owned by *${ownerName}*.\n` +
        `I can run many commands — downloads, AI tools, stickers, group management, and more.\n\n` +
        `${SYM.diamond} *Info*\n\n` +
        stats;

      if (typeof ButtonV2 === 'function') {
        const btn = new ButtonV2(sock)
          .setTitle(`${SYM.heart} ${botName} by bigmanjtech™`)
          .setBody(body)
          .setFooter(footer);

        if (thumbnail) {
          btn.setThumbnail(thumbnail);
        }

        btn
          .addRawButton({
            buttonText: { displayText: 'dev' },
            buttonId:   `${prefix}owner`,
            type:       1
          })
          .addRawButton({
            buttonText: { displayText: 'dev group' },
            buttonId:   `${prefix}group`,
            type:       1
          });

        await btn.send(chatId, { quoted: msg });
      } else {
        await sock.sendMessage(chatId, {
          text:
            `${body}\n\n` +
            `${SYM.arrow} dev       · ${prefix}owner\n` +
            `${SYM.arrow} dev group · ${prefix}group\n\n` +
            footer
        }, { quoted: msg });
      }

      log.event('command.about', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`about failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Failed to load about\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            buildFooterText()
        }, { quoted: msg });
      } catch {}
    }
  }
};