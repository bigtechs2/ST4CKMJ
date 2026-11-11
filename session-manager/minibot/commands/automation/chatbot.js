import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import { SessionConfig, ChatHistory } from '../../../database/index.js';
import ai from '../../../../shared/aiEndpoints.js';

const log = logger.child('cmd:chatbot');

const SYM = brand.SYM;

function channelLink() {
  return config.bot.channelLink || config.links.whatsappChannel;
}

function footer() {
  return `[View channel](${channelLink()})`;
}

function normalizeNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function buildStatusCard(sock, cfg, prefix) {
  const privateOn    = cfg.chatbotPrivate === true;
  const groupOn      = cfg.chatbotGroup === true;
  const voiceReply   = cfg.chatbotVoiceReply === true;
  const imageGen     = cfg.chatbotImageGen === true;
  const transcribe   = cfg.chatbotTranscribe === true;
  const language     = cfg.chatbotLanguage || 'auto';
  const model        = cfg.chatbotModel || 'auto';

  const activeCount = [privateOn, groupOn, voiceReply, imageGen, transcribe]
    .filter(Boolean).length;

  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.square} *AI Chatbot*\n\n` +
    `${SYM.arrow} active · ${activeCount} of 5 features\n` +
    `${SYM.arrow} model · *${model}*`
  );

  rich.addText(
    `${SYM.diamond} *Modes*\n\n` +
    `   ${privateOn  ? SYM.check : SYM.cross} private DM replies\n` +
    `   ${groupOn    ? SYM.check : SYM.cross} group replies (tag only)`
  );

  rich.addText(
    `${SYM.diamond} *Features*\n\n` +
    `   ${voiceReply ? SYM.check : SYM.cross} voice replies (TTS)\n` +
    `   ${transcribe ? SYM.check : SYM.cross} transcribe voice notes (STT)\n` +
    `   ${imageGen   ? SYM.check : SYM.cross} AI image generation\n` +
    `   ${SYM.arrow} language · *${language}*`
  );

  rich.addText(
    `${SYM.diamond} *Commands*\n\n` +
    `   ${SYM.arrow} ${prefix}chatbot on       · enable both modes\n` +
    `   ${SYM.arrow} ${prefix}chatbot off      · disable everything\n` +
    `   ${SYM.arrow} ${prefix}chatbot private on|off\n` +
    `   ${SYM.arrow} ${prefix}chatbot group on|off\n` +
    `   ${SYM.arrow} ${prefix}chatbot voice on|off\n` +
    `   ${SYM.arrow} ${prefix}chatbot image on|off\n` +
    `   ${SYM.arrow} ${prefix}chatbot transcribe on|off\n` +
    `   ${SYM.arrow} ${prefix}chatbot language auto|sw|en\n` +
    `   ${SYM.arrow} ${prefix}chatbot model <name>\n` +
    `   ${SYM.arrow} ${prefix}chatbot reset       · clear history`
  );

  const providerCount = ai.getEnabled('chat').length;
  const providerNames = ai.getEnabled('chat').slice(0, 3).map((e) => e.name).join(', ');

  rich.addText(
    `${SYM.info} *AI Providers*\n` +
    `   ${SYM.bullet} ${providerCount} chat endpoints active\n` +
    `   ${SYM.bullet} best · ${providerNames}…\n` +
    `   ${SYM.bullet} all free · no API key needed`
  );

  rich.addTip('voice notes → AI transcription → reply (voice or text)');

  rich.addSuggest([
    `${prefix}chatbot on`,
    `${prefix}chatbot private on`,
    `${prefix}chatbot off`
  ]);

  rich.addText(footer());
  rich.setFooter(config.msg.footer);

  return rich;
}

export default {
  name: 'chatbot',
  aliases: ['ai', 'ai-chat', 'botchat'],
  category: 'automation',
  description: 'AI chatbot — replies to DMs and groups',
  emoji: '⌁',
  usage: 'on | off | private | group | voice | image | language | model | reset | status',

  permissions: {
    coin:    0,
    owner:   false,
    admin:   false,
    premium: true,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, sessionId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const cfg = await SessionConfig.getOrCreate(sessionId, ctx.session.phoneNumber);

    if (!cfg.chatbotBlacklist) cfg.chatbotBlacklist = [];

    const sub   = String(args?.[0] || '').toLowerCase();
    const sub2  = String(args?.[1] || '').toLowerCase();
    const rest  = args.slice(2).join(' ').trim();

    if (!sub || sub === 'status' || sub === 'info') {
      const rich = buildStatusCard(sock, cfg, prefix);
      return rich.send(chatId, { quoted: msg });
    }

    if (sub === 'on') {
      cfg.chatbotPrivate = true;
      cfg.chatbotGroup   = true;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *AI Chatbot enabled*\n\n` +
        `${SYM.arrow} private DM · ${SYM.check}\n` +
        `${SYM.arrow} group (tag) · ${SYM.check}\n\n` +
        `${SYM.info} I reply to DMs + when tagged in groups\n` +
        `${SYM.info} language auto-detects sw/en\n` +
        `${SYM.info} no API key · all free`,
        { id: 'ok' }
      );
      rich.addSuggest([
        `${prefix}chatbot settings`,
        `${prefix}chatbot voice on`,
        `${prefix}chatbot off`
      ]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.on', { sessionId, chatId });
      return;
    }

    if (sub === 'off') {
      cfg.chatbotPrivate = false;
      cfg.chatbotGroup   = false;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *AI Chatbot disabled*\n\n` +
        `${SYM.arrow} I will not reply to messages anymore\n` +
        `${SYM.info} existing chat history kept · use reset to clear`,
        { id: 'off' }
      );
      rich.addSuggest([
        `${prefix}chatbot on`,
        `${prefix}chatbot status`
      ]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.off', { sessionId, chatId });
      return;
    }

    if (sub === 'private' || sub === 'group') {
      if (!['on', 'off'].includes(sub2)) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *${sub} mode*\n\n` +
            `${SYM.arrow} ${prefix}chatbot ${sub} on\n` +
            `${SYM.arrow} ${prefix}chatbot ${sub} off\n\n` +
            footer()
        }, { quoted: msg });
      }

      if (sub === 'private') cfg.chatbotPrivate = sub2 === 'on';
      else                   cfg.chatbotGroup   = sub2 === 'on';
      await cfg.save();

      const label = sub === 'private' ? 'Private DM' : 'Group';

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${sub2 === 'on' ? SYM.check : SYM.cross} *${label} · ${sub2}*\n\n` +
        (sub === 'group'
          ? `${SYM.info} I reply in groups only when tagged`
          : `${SYM.info} I reply to every DM automatically`),
        { id: 'ok' }
      );
      rich.addSuggest([
        `${prefix}chatbot status`,
        `${prefix}chatbot on`
      ]);
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.mode', { sessionId, chatId, mode: sub, state: sub2 });
      return;
    }

    if (sub === 'voice') {
      if (!['on', 'off'].includes(sub2)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}chatbot voice on|off\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.chatbotVoiceReply = sub2 === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${sub2 === 'on' ? SYM.check : SYM.cross} *Voice replies · ${sub2}*\n\n` +
        (sub2 === 'on'
          ? `${SYM.info} I reply to voice notes with voice`
          : `${SYM.info} I reply to voice notes with text`),
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.voice', { sessionId, chatId, state: sub2 });
      return;
    }

    if (sub === 'image' || sub === 'img') {
      if (!['on', 'off'].includes(sub2)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}chatbot image on|off\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.chatbotImageGen = sub2 === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${sub2 === 'on' ? SYM.check : SYM.cross} *Image generation · ${sub2}*\n\n` +
        (sub2 === 'on'
          ? `${SYM.info} say "create an image of…" and I'll draw it`
          : `${SYM.info} image requests will be ignored`),
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.image', { sessionId, chatId, state: sub2 });
      return;
    }

    if (sub === 'transcribe' || sub === 'stt') {
      if (!['on', 'off'].includes(sub2)) {
        return sock.sendMessage(chatId, {
          text: `${SYM.info} Usage: ${prefix}chatbot transcribe on|off\n\n${footer()}`
        }, { quoted: msg });
      }

      cfg.chatbotTranscribe = sub2 === 'on';
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${sub2 === 'on' ? SYM.check : SYM.cross} *Voice transcription · ${sub2}*\n\n` +
        (sub2 === 'on'
          ? `${SYM.info} I convert voice notes to text before replying`
          : `${SYM.info} voice notes will be ignored`),
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.transcribe', { sessionId, chatId, state: sub2 });
      return;
    }

    if (sub === 'language' || sub === 'lang') {
      const lang = sub2;

      if (!['auto', 'sw', 'en'].includes(lang)) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.info} *Language*\n\n` +
            `${SYM.arrow} ${prefix}chatbot language auto  · detect\n` +
            `${SYM.arrow} ${prefix}chatbot language sw    · Kiswahili\n` +
            `${SYM.arrow} ${prefix}chatbot language en    · English\n\n` +
            footer()
        }, { quoted: msg });
      }

      cfg.chatbotLanguage = lang;
      await cfg.save();

      const langName = { auto: 'auto-detect', sw: 'Kiswahili', en: 'English' }[lang];

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Language · ${langName}*\n\n` +
        (lang === 'auto'
          ? `${SYM.info} I detect the language from your message`
          : `${SYM.info} I always reply in ${langName}`),
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.language', { sessionId, chatId, lang });
      return;
    }

    if (sub === 'model') {
      const modelName = args.slice(1).join(' ').trim().toLowerCase();

      if (!modelName) {
        const providers = ai.getEnabled('chat').map((e) => `   ${SYM.arrow} ${e.name}`).join('\n');

        const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
        rich.addText(
          `${SYM.square} *Available Models*\n\n` +
          `${SYM.arrow} current · *${cfg.chatbotModel || 'auto'}*\n\n` +
          `${SYM.diamond} *Providers*\n\n${providers}\n\n` +
          `${SYM.info} use \`auto\` to let the bot pick the best`,
          { id: 'list' }
        );
        rich.addText(footer());
        rich.setFooter(config.msg.footer);
        return rich.send(chatId, { quoted: msg });
      }

      if (modelName === 'auto' || modelName === 'reset') {
        cfg.chatbotModel = '';
        await cfg.save();

        const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
        rich.addText(
          `${SYM.check} *Model set to auto*\n\n` +
          `${SYM.info} bot picks the best available provider`,
          { id: 'ok' }
        );
        rich.addText(footer());
        rich.setFooter(config.msg.footer);
        return rich.send(chatId, { quoted: msg });
      }

      const provider = ai.getByName('chat', modelName);
      if (!provider) {
        return sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Unknown model · \`${modelName}\`\n` +
            `${SYM.arrow} use ${prefix}chatbot model to see list\n\n` +
            footer()
        }, { quoted: msg });
      }

      cfg.chatbotModel = modelName;
      await cfg.save();

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Model locked*\n\n` +
        `${SYM.arrow} provider · *${modelName}*\n` +
        `${SYM.arrow} tier · ${provider.tier || 'N/A'}`,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.model', { sessionId, chatId, model: modelName });
      return;
    }

    if (sub === 'reset') {
      const result = await ChatHistory.clear(sessionId, chatId);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);
      rich.addText(
        `${SYM.check} *Chat history cleared*\n\n` +
        `${SYM.arrow} removed · ${result.deletedCount || 0} messages\n` +
        `${SYM.info} bot has no memory of this chat now`,
        { id: 'ok' }
      );
      rich.addText(footer());
      rich.setFooter(config.msg.footer);
      await rich.send(chatId, { quoted: msg });

      log.event('chatbot.reset', { sessionId, chatId, count: result.deletedCount });
      return;
    }

    return sock.sendMessage(chatId, {
      text:
        `${SYM.cross} Unknown subcommand · \`${sub}\`\n\n` +
        `${SYM.arrow} use: on, off, private, group, voice, image, transcribe, language, model, reset, status\n\n` +
        footer()
    }, { quoted: msg });
  }
};