import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:owner');

const SYM = brand.SYM;

function buildContact(entry) {
  const number = String(entry.id || '').replace(/\D/g, '');
  if (!number) return null;

  const name = entry.name || brand.AUTHOR_NAME;
  const org  = entry.organization || brand.PROJECT_NAME;

  const vcard =
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `N:${name}\n` +
    `FN:${name}\n` +
    `ORG:${org};\n` +
    `TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n` +
    'END:VCARD';

  return {
    displayName: name,
    vcard
  };
}

export default {
  name: 'owner',
  aliases: ['creator', 'developer'],
  category: 'information',
  description: 'Contact the bot owners',
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
    const { sock, msg, chatId } = ctx;

    try {
      const contacts = [];

      const main = buildContact(config.owners.whatsapp);
      if (main) contacts.push(main);

      const coList = config.owners.whatsapp.co || [];
      for (const co of coList) {
        if (co.invisible === true) continue;
        const built = buildContact(co);
        if (built) contacts.push(built);
      }

      if (!contacts.length) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} No owner contacts configured.\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})\n` +
            `${config.msg.footer}`
        }, { quoted: msg });
      }

      await sock.sendMessage(chatId, {
        contacts: {
          displayName: `${brand.BOT_NAME} Owners`,
          contacts
        }
      }, { quoted: msg });

      log.event('command.owner', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        count:     contacts.length
      });

    } catch (err) {
      log.error(`owner failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Failed to load owner contacts\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${config.bot.channelLink || config.links.whatsappChannel})\n` +
            `${config.msg.footer}`
        }, { quoted: msg });
      } catch {}
    }
  }
};