import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig, ChatHistory } from '../../../database/index.js';

const log = logger.child('cmd:ai');

const SYM = brand.SYM;

function footer(channelLink) {
  return `[View channel](${channelLink})`;
}

function parseArgs(args) {
  const a = (Array.isArray(args) ? args : []).map((x) => String(x).toLowerCase());
  return {
    scope:  a[0] || '',
    action: a[1] || ''
  };
}

async function sendCard(sock, chatId, msg, { title, lines, suggestions, prefix, channelLink, footerText }) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(`${SYM.heart} *${title}*\n\n${lines.join('\n')}`);

  if (suggestions?.length) {
    rich.addSuggest(suggestions);
  }

  rich.addText(footer(channelLink));
  rich.setFooter(footerText);

  await rich.send(chatId, { quoted: msg });
}

export default {
  name: 'ai',
  aliases: ['chatbot', 'botchat'],
  category: 'premium',
  description: 'AI chatbot — text, voice, and image replies',
  emoji: '✧',
  usage: 'on|off|settings|private|group|voice|image|reset',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: true,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sessionCfg, session } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;
    const channelLink = config.bot.channelLink || config.links.whatsappChannel;
    const footerText  = config.msg.footer;

    const cfg = await SessionConfig.getOrCreate(sessionId, session.phoneNumber);

    const { scope, action } = parseArgs(args);

    try {

      if (!scope) {
        return showSettings(sock, chatId, msg, cfg, prefix, channelLink, footerText);
      }

      if (scope === 'settings') {
        return showSettings(sock, chatId, msg, cfg, prefix, channelLink, footerText);
      }

      if (scope === 'on') {
        cfg.chatbotPrivate = true;
        cfg.chatbotGroup   = true;
        await cfg.save();

        return sendCard(sock, chatId, msg, {
          title: 'AI Chatbot Enabled',
          lines: [
            `${SYM.arrow} Private DM   · ✅ on`,
            `${SYM.arrow} Group (tag)  · ✅ on`,
            `${SYM.arrow} Voice notes  · ${cfg.chatbotTranscribe ? '✅' : '❌'}`,
            `${SYM.arrow} Voice reply  · ${cfg.chatbotVoiceReply ? '✅' : '❌'}`,
            `${SYM.arrow} Image gen    · ${cfg.chatbotImageGen ? '✅' : '❌'}`,
            `${SYM.arrow} Language     · ${cfg.chatbotLanguage}`
          ],
          suggestions: [`${prefix}ai settings`, `${prefix}ai off`, `${prefix}menu premium`],
          prefix,
          channelLink,
          footerText
        });
      }

      if (scope === 'off') {
        cfg.chatbotPrivate = false;
        cfg.chatbotGroup   = false;
        await cfg.save();

        return sendCard(sock, chatId, msg, {
          title: 'AI Chatbot Disabled',
          lines: [
            `${SYM.arrow} Private DM   · ❌ off`,
            `${SYM.arrow} Group (tag)  · ❌ off`
          ],
          suggestions: [`${prefix}ai on`, `${prefix}ai settings`],
          prefix,
          channelLink,
          footerText
        });
      }

      if (scope === 'private' || scope === 'group') {
        const enabled  = action === 'on';
        const disabled = action === 'off';

        if (!enabled && !disabled) {
          return sendCard(sock, chatId, msg, {
            title: `AI ${scope} — usage`,
            lines: [
              `${SYM.arrow} ${prefix}ai ${scope} on`,
              `${SYM.arrow} ${prefix}ai ${scope} off`
            ],
            suggestions: [`${prefix}ai settings`],
            prefix,
            channelLink,
            footerText
          });
        }

        if (scope === 'private') cfg.chatbotPrivate = enabled;
        else                     cfg.chatbotGroup   = enabled;

        await cfg.save();

        return sendCard(sock, chatId, msg, {
          title: `AI ${scope} updated`,
          lines: [
            `${SYM.arrow} ${scope} · ${enabled ? '✅ on' : '❌ off'}`
          ],
          suggestions: [`${prefix}ai settings`, `${prefix}ai on`, `${prefix}ai off`],
          prefix,
          channelLink,
          footerText
        });
      }

      if (scope === 'voice') {
        const enabled  = action === 'on';
        const disabled = action === 'off';

        if (!enabled && !disabled) {
          return sendCard(sock, chatId, msg, {
            title: 'Voice reply — usage',
            lines: [
              `${SYM.arrow} ${prefix}ai voice on`,
              `${SYM.arrow} ${prefix}ai voice off`
            ],
            suggestions: [`${prefix}ai settings`],
            prefix,
            channelLink,
            footerText
          });
        }

        cfg.chatbotVoiceReply = enabled;
        await cfg.save();

        return sendCard(sock, chatId, msg, {
          title: 'Voice reply updated',
          lines: [
            `${SYM.arrow} voice reply · ${enabled ? '✅ on' : '❌ off'}`,
            `${SYM.info} when on — I reply to voice notes with voice`
          ],
          suggestions: [`${prefix}ai settings`],
          prefix,
          channelLink,
          footerText
        });
      }

      if (scope === 'image') {
        const enabled  = action === 'on';
        const disabled = action === 'off';

        if (!enabled && !disabled) {
          return sendCard(sock, chatId, msg, {
            title: 'Image generation — usage',
            lines: [
              `${SYM.arrow} ${prefix}ai image on`,
              `${SYM.arrow} ${prefix}ai image off`
            ],
            suggestions: [`${prefix}ai settings`],
            prefix,
            channelLink,
            footerText
          });
        }

        cfg.chatbotImageGen = enabled;
        await cfg.save();

        return sendCard(sock, chatId, msg, {
          title: 'Image generation updated',
          lines: [
            `${SYM.arrow} image gen · ${enabled ? '✅ on' : '❌ off'}`,
            `${SYM.info} when on — say "create an image of a lion" and I'll draw it`
          ],
          suggestions: [`${prefix}ai settings`],
          prefix,
          channelLink,
          footerText
        });
      }

      if (scope === 'language') {
        const lang = (action || '').toLowerCase();
        if (!['auto', 'sw', 'en'].includes(lang)) {
          return sendCard(sock, chatId, msg, {
            title: 'Language — usage',
            lines: [
              `${SYM.arrow} ${prefix}ai language auto   · detect sw/en`,
              `${SYM.arrow} ${prefix}ai language sw     · always Swahili`,
              `${SYM.arrow} ${prefix}ai language en     · always English`
            ],
            suggestions: [`${prefix}ai settings`],
            prefix,
            channelLink,
            footerText
          });
        }

        cfg.chatbotLanguage = lang;
        await cfg.save();

        return sendCard(sock, chatId, msg, {
          title: 'Language updated',
          lines: [
            `${SYM.arrow} language · ${lang}`
          ],
          suggestions: [`${prefix}ai settings`],
          prefix,
          channelLink,
          footerText
        });
      }

      if (scope === 'reset') {
        const r = await ChatHistory.clear(sessionId, chatId);

        return sendCard(sock, chatId, msg, {
          title: 'Chat history cleared',
          lines: [
            `${SYM.arrow} ${r.deletedCount || 0} messages removed`
          ],
          suggestions: [`${prefix}ai settings`],
          prefix,
          channelLink,
          footerText
        });
      }

      return showSettings(sock, chatId, msg, cfg, prefix, channelLink, footerText);

    } catch (err) {
      log.error(`ai command failed: ${err.message}`);

      await sock.sendMessage(chatId, {
        text:
          `${SYM.cross} AI command failed\n` +
          `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
          footer(channelLink)
      }, { quoted: msg });
    }
  }
};

async function showSettings(sock, chatId, msg, cfg, prefix, channelLink, footerText) {
  const priv  = cfg.chatbotPrivate    ? '✅ on' : '❌ off';
  const grp   = cfg.chatbotGroup      ? '✅ on' : '❌ off';
  const voice = cfg.chatbotVoiceReply ? '✅ on' : '❌ off';
  const img   = cfg.chatbotImageGen   ? '✅ on' : '❌ off';
  const stt   = cfg.chatbotTranscribe ? '✅ on' : '❌ off';
  const lang  = cfg.chatbotLanguage || 'auto';

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.heart} *AI Chatbot Settings*\n\n` +
    `${SYM.diamond} *Modes*\n` +
    `   ${SYM.arrow} Private DM   · ${priv}\n` +
    `   ${SYM.arrow} Group (tag)  · ${grp}\n\n` +
    `${SYM.diamond} *Features*\n` +
    `   ${SYM.arrow} Voice reply  · ${voice}\n` +
    `   ${SYM.arrow} Transcribe   · ${stt}\n` +
    `   ${SYM.arrow} Image gen    · ${img}\n` +
    `   ${SYM.arrow} Language     · ${lang}`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}ai on / off\n` +
    `   ${SYM.arrow} ${prefix}ai private on|off\n` +
    `   ${SYM.arrow} ${prefix}ai group on|off\n` +
    `   ${SYM.arrow} ${prefix}ai voice on|off\n` +
    `   ${SYM.arrow} ${prefix}ai image on|off\n` +
    `   ${SYM.arrow} ${prefix}ai language auto|sw|en\n` +
    `   ${SYM.arrow} ${prefix}ai reset`
  );

  rich.addTip('tag me in a group to test · DM me privately to chat');

  rich.addSuggest([
    `${prefix}ai on`,
    `${prefix}ai settings`,
    `${prefix}ai voice on`
  ]);

  rich.addText(`[View channel](${channelLink})`);
  rich.setFooter(footerText);

  await rich.send(chatId, { quoted: msg });
}