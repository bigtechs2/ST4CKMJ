import { AIRich } from '../lib/NIXCODE.js';
import config from '../config.js';
import brand from '../../shared/brand.js';
import logger from '../../shared/logger.js';

const log = logger.child('htmlGame');

const SYM = brand.SYM;

function buildGameSection(html, {
  url = null,
  trustedSource = null
} = {}) {
  const gameUrl = url || config.links.website || 'https://minist4ck.dev';
  const source  = trustedSource || gameUrl.replace(/^https?:\/\//, '').split('/')[0];

  return {
    view_model: {
      primitive: {
        __typename: 'GenAIaeacdsnwHtmlPrimitive',
        payload: html,
        url: gameUrl,
        trusted_sources: [source]
      },
      __typename: 'GenAISingleLayoutViewModel'
    }
  };
}

export function createHtmlGameCommand({
  name,
  aliases = [],
  emoji = '⌬',
  description = '',
  category = 'game',
  html,
  submessageText = '',
  displayName = '',
  permissions = {},
  url = null,
  trustedSource = null
}) {
  if (!name)         throw new Error('htmlGameCommand: name required');
  if (!html)         throw new Error(`htmlGameCommand: html required for ${name}`);
  if (!description)  description = `${displayName || name} — play inside WhatsApp`;

  return {
    name,
    aliases,
    category,
    description,
    emoji,
    usage: '',

    permissions: {
      coin:    permissions.coin ?? 0,
      owner:   permissions.owner === true,
      admin:   permissions.admin === true,
      premium: permissions.premium === true,
      group:   permissions.group !== false,
      private: permissions.private !== false
    },

    code: async (ctx) => {
      const { sock, msg, chatId, senderNumber, sessionId, config: sessionCfg } = ctx;
      const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

      try {
        const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

        rich.addText(
          `${SYM.heart} *${displayName || name.toUpperCase()}*\n` +
          `${SYM.arrow} ${description}\n\n` +
          `${SYM.pointer} Tap to open the game\n` +
          `${SYM.pointer} Plays inside WhatsApp`
        );

        rich.addSection(
          buildGameSection(html, { url, trustedSource }),
          { id: 'game' }
        );

        rich.addSuggest([
          `${prefix}menu`,
          `${prefix}ping`
        ]);

        rich.addText(
          `[View channel](${config.bot.channelLink})\n` +
          `${config.msg.footer}`
        );

        await rich.send(chatId, { quoted: msg });

        log.event('game.launched', {
          sessionId,
          sender: senderNumber,
          game:   name
        });

      } catch (err) {
        log.error(`game ${name} failed: ${err.message}`);

        try {
          await sock.sendMessage(chatId, {
            text:
              `${SYM.cross} Game failed to load\n` +
              `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
              `[View channel](${config.bot.channelLink})\n` +
              `${config.msg.footer}`
          }, { quoted: msg });
        } catch {}
      }
    }
  };
}

export default createHtmlGameCommand;