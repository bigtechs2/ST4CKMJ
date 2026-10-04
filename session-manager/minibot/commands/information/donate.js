import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:donate');

const SYM = brand.SYM;

const DONATION_LINKS = [
  {
    label: 'Render Free',
    url:   'https://bigdonate-1wgo.onrender.com'
  },
  {
    label: 'Render Backup',
    url:   'https://bigdonate.onrender.com'
  }
];

async function getThumbnail(sock) {
  const fallback = config.bot?.thumbnail || '';

  try {
    const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
    if (!botJid) return fallback;

    const pp = await sock.profilePictureUrl(botJid, 'image');
    return pp || fallback;
  } catch {
    return fallback;
  }
}

export default {
  name: 'donate',
  aliases: ['support', 'tip'],
  category: 'information',
  description: 'Support the bot with a donation',
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
      const thumbnail = await getThumbnail(sock);
      const primary   = DONATION_LINKS[0];
      const secondary = DONATION_LINKS[1];
      const channelLink = config.bot?.channelLink || config.links.whatsappChannel;

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addProduct({
          title:       'Support MINIST4CK',
          brand:       'by bigmanjtech™',
          price:       'Free tier',
          sale_price:  'Any amount',
          url:         primary.url,
          image:       thumbnail,
          icon:        thumbnail
        });
      } else {
        rich.addText(
          `${SYM.heart} *Support MINIST4CK*\n` +
          `${SYM.arrow} by bigmanjtech™`
        );
      }

      rich.addText(
        `${SYM.heart} *Keep MINIST4CK alive*\n` +
        `${SYM.arrow} your donation powers the servers 24/7`
      );

      rich.addText(
        `${SYM.diamond} *Why donate*\n\n` +
        `   ${SYM.arrow} server hosting costs\n` +
        `   ${SYM.arrow} API subscriptions\n` +
        `   ${SYM.arrow} new commands and features\n` +
        `   ${SYM.arrow} keep it free for everyone`
      );

      rich.addText(
        `${SYM.diamond} *Ways to give*\n\n` +
        `   ${SYM.arrow} ${primary.label}  ·  primary\n` +
        `   ${SYM.arrow} ${secondary.label}  ·  backup`
      );

      if (primary.url) {
        rich.addFooterAction({
          text: primary.label,
          url:  primary.url
        });
      }

      if (secondary.url) {
        rich.addFooterAction({
          text: secondary.label,
          url:  secondary.url
        });
      }

      rich.addSuggest([
        `${prefix}menu`,
        `${prefix}about`,
        `${prefix}owner`
      ]);

      rich.addText(`[View channel](${channelLink})`);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.donate', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`donate failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Failed to load donate\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${config.bot?.channelLink || config.links.whatsappChannel})`
        }, { quoted: msg });
      } catch {}
    }
  }
};