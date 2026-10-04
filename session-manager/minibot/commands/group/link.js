import { AIRich, Button } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:link');

const SYM = brand.SYM;

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function isGroup(chatId) {
  return String(chatId || '').endsWith('@g.us');
}

async function getBotAdminStatus(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);

    const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
    const botNumber = botJid.split('@')[0].split(':')[0];

    const me = metadata.participants.find((p) => {
      const pNumber = p.id.split('@')[0].split(':')[0];
      return pNumber === botNumber;
    });

    if (!me) return { isAdmin: false, metadata };

    return {
      isAdmin: me.admin === 'admin' || me.admin === 'superadmin',
      metadata
    };
  } catch (err) {
    log.warn(`groupMetadata failed: ${err.message}`);
    return { isAdmin: false, metadata: null };
  }
}

export default {
  name: 'link',
  aliases: ['gclink', 'grouplink', 'invite', 'gcinvite'],
  category: 'group',
  description: 'Get the group invite link',
  emoji: '▣',
  usage: '(in group)',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: false,
    group:   true,
    private: false
  },

  code: async (ctx) => {
    const { sock, msg, chatId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    if (!isGroup(chatId)) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.cross} This command only works in groups\n\n` +
          footer()
      }, { quoted: msg });
    }

    try {
      const { isAdmin } = await getBotAdminStatus(sock, chatId);

      if (!isAdmin) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} I need to be an admin to get the invite link\n` +
            `${SYM.arrow} promote me and try again\n\n` +
            footer()
        }, { quoted: msg });
      }

      const code = await sock.groupInviteCode(chatId);

      if (!code) {
        throw new Error('no invite code returned');
      }

      const inviteLink = `https://chat.whatsapp.com/${code}`;

      const btn = new Button(sock)
        .setTitle(brand.BOT_NAME)
        .setBody(
          `${SYM.heart} *Group Invite Link*\n\n` +
          `${SYM.arrow} link · below\n` +
          `${SYM.arrow} tap COPY to grab it\n\n` +
          `${SYM.info} share with people you trust`
        )
        .setFooter(config.msg.footer)
        .addCopy('Copy Link', inviteLink)
        .addUrl('Open Group', inviteLink, false);

      await btn.send(chatId);

      log.event('command.link', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        chatId
      });

    } catch (err) {
      log.error(`link failed: ${err.message}`);

      let userMsg = err.message.slice(0, 100);

      if (err.message.includes('not-authorized') || err.message.includes('401')) {
        userMsg = 'bot is not authorized · promote me to admin';
      } else if (err.message.includes('not-found') || err.message.includes('404')) {
        userMsg = 'group not found';
      }

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Could not get invite link\n` +
            `${SYM.arrow} ${userMsg}\n\n` +
            footer()
        }, { quoted: msg });
      } catch {}
    }
  }
};