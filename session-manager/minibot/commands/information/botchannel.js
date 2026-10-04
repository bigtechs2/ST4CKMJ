import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:botchannel');

const SYM = brand.SYM;

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb8VpyiK0IBkFiIslc0Y';
const CHANNEL_LABEL = 'MINIST4CK Channel';

const GROUP_LINK = config.bot?.groupLink || config.links.whatsappGroup || '';
const GROUP_LABEL = 'MINIST4CK Group';

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

function detectTarget(rawText) {
  const first = String(rawText || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/^[!./#$%&+\-~]/, '') || '';

  if (first.includes('group') || first === 'gc' || first === 'botgc') {
    return 'group';
  }

  return 'channel';
}

export default {
  name: 'botchannel',
  aliases: ['channel', 'botgroup', 'group', 'gc', 'botgc'],
  category: 'information',
  description: 'Join our channel or group',
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
    const { sock, msg, chatId, config: sessionCfg, rawText } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const target  = detectTarget(rawText);
    const isGroup = target === 'group';

    const joinUrl = isGroup ? GROUP_LINK : CHANNEL_LINK;
    const label   = isGroup ? GROUP_LABEL : CHANNEL_LABEL;

    const title    = isGroup ? 'Join Our Group' : 'Follow Our Channel';
    const subtitle = isGroup ? 'community chat' : 'updates and news';
    const button   = isGroup ? 'Join Group'      : 'Follow Channel';

    try {
      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addProduct({
          title:       title,
          brand:       `${brand.BOT_NAME} · ${subtitle}`,
          price:       brand.BOT_VERSION,
          sale_price:  'Open',
          url:         joinUrl,
          image:       thumbnail,
          icon:        thumbnail
        });
      } else {
        rich.addText(
          `${SYM.heart} *${title}*\n` +
          `${SYM.arrow} ${brand.BOT_NAME} · ${subtitle}`
        );
      }

      if (isGroup) {
        rich.addText(
          `${SYM.diamond} *${label}*\n\n` +
          `   ${SYM.arrow} chat with other users\n` +
          `   ${SYM.arrow} ask for help and support\n` +
          `   ${SYM.arrow} share feedback and ideas\n` +
          `   ${SYM.arrow} get updates on new features`
        );
      } else {
        rich.addText(
          `${SYM.diamond} *${label}*\n\n` +
          `   ${SYM.arrow} official announcements\n` +
          `   ${SYM.arrow} new commands and updates\n` +
          `   ${SYM.arrow} server status reports\n` +
          `   ${SYM.arrow} early feature previews`
        );
      }

      rich.addText(
        `${SYM.diamond} *How to join*\n\n` +
        `   ${SYM.arrow} tap the button below\n` +
        `   ${SYM.arrow} opens directly in WhatsApp`
      );

      if (joinUrl) {
        rich.addFooterAction({
          text: button,
          url:  joinUrl
        });
      }

      rich.addSuggest([
        `${prefix}menu`,
        `${prefix}about`,
        `${prefix}owner`
      ]);

      rich.addText(`[View channel](${CHANNEL_LINK})`);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.botchannel', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        target
      });

    } catch (err) {
      log.error(`botchannel failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Failed to load ${isGroup ? 'group' : 'channel'}\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            `[View channel](${CHANNEL_LINK})`
        }, { quoted: msg });
      } catch {}
    }
  }
};