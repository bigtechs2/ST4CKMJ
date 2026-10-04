import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:video');

const SYM = brand.SYM;

const DC_KEY =
  process.env.DAVIDCYRIL_KEY ||
  'dc_live__QTnLsE1YSVTzwpNmWqTA1VilR2bP8WX';

const VIDEO_ENDPOINTS = [
  {
    name: 'dc-txt2vid',
    url:  'https://apis.davidcyriltech.my.id/ai/txt2vid'
  }
];

const VALID_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

function parseArgs(args) {
  const list = Array.isArray(args) ? args.slice() : [];

  let aspectRatio = '16:9';
  let aiSound     = false;

  const ratioIndex = list.findIndex((a) => a === '--ratio' || a === '-r');
  if (ratioIndex !== -1) {
    const val = list[ratioIndex + 1];
    if (val && VALID_RATIOS.includes(val)) aspectRatio = val;
    list.splice(ratioIndex, 2);
  }

  const soundIndex = list.findIndex((a) => a === '--sound' || a === '-s');
  if (soundIndex !== -1) {
    aiSound = true;
    list.splice(soundIndex, 1);
  }

  const prompt = list.join(' ').trim();
  return { prompt, aspectRatio, aiSound };
}

async function tryEndpoint(endpoint, { prompt, aspectRatio, aiSound }) {
  const { data } = await axios.post(
    endpoint.url,
    {
      prompt,
      aspect_ratio: aspectRatio,
      ai_sound:     aiSound
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    DC_KEY
      },
      timeout: 120000
    }
  );

  if (!data) throw new Error('empty response');

  const url =
    data?.result?.url ||
    data?.result?.video ||
    data?.result ||
    data?.url ||
    data?.video ||
    data?.data?.url ||
    null;

  if (!url || typeof url !== 'string') throw new Error('no video URL');

  return { url, model: endpoint.name };
}

async function generateVideo(payload) {
  const errors = [];

  for (const endpoint of VIDEO_ENDPOINTS) {
    try {
      return await tryEndpoint(endpoint, payload);
    } catch (err) {
      errors.push(`${endpoint.name}: ${err.message}`);
      log.warn(`${endpoint.name} failed: ${err.message}`);
    }
  }

  throw new Error('all providers failed');
}

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
  name: 'videogen',
  aliases: ['vid', 't2v', 'txt2vid', 'aivideo'],
  category: 'ai-generator',
  description: 'Generate a short video from a text prompt',
  emoji: '✧',
  usage: '<prompt> [--ratio 16:9] [--sound]',

  permissions: {
    coin:    25,
    owner:   false,
    admin:   false,
    premium: true,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const { prompt, aspectRatio, aiSound } = parseArgs(args);

    if (!prompt) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *AI Video Generator*\n\n` +
          `${SYM.arrow} Usage: ${prefix}video <prompt>\n` +
          `${SYM.arrow} Flags:\n` +
          `   ${SYM.bullet} \`--ratio 16:9\`  aspect ratio\n` +
          `   ${SYM.bullet} \`--sound\`       AI audio\n\n` +
          `${SYM.arrow} Ratios: ${VALID_RATIOS.join(' · ')}\n` +
          `${SYM.arrow} Example: ${prefix}video a cat surfing a wave --ratio 16:9 --sound\n\n` +
          `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`
      }, { quoted: msg });
    }

    const channelLink = config.bot.channelLink || config.links.whatsappChannel;

    try {
      await sock.sendMessage(chatId, {
        text:
          `${SYM.info} generating video…\n` +
          `${SYM.arrow} _${prompt.slice(0, 80)}_\n` +
          `${SYM.arrow} ratio · ${aspectRatio}\n` +
          `${SYM.arrow} sound · ${aiSound ? 'yes' : 'no'}\n` +
          `${SYM.arrow} may take up to 2 minutes`
      }, { quoted: msg });

      const result    = await generateVideo({ prompt, aspectRatio, aiSound });
      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addProduct({
          title:       'AI Video Generator',
          brand:       'bigmanjtech™',
          price:       prompt.slice(0, 40),
          sale_price:  'generated',
          url:         channelLink,
          image:       thumbnail,
          icon:        thumbnail
        });
      }

      rich.addText(
        `${SYM.heart} *${prompt.slice(0, 200)}*\n` +
        `${SYM.arrow} ratio · ${aspectRatio}\n` +
        `${SYM.arrow} sound · ${aiSound ? 'yes' : 'no'}\n` +
        `${SYM.arrow} model · ${result.model}`
      );

      rich.addVideo(result.url, { autoFill: false });

      rich.addSuggest([
        `${prefix}video`,
        `${prefix}imagine`,
        `${prefix}menu ai-generator`
      ]);

      rich.addText(`[View channel](${channelLink})`);
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.video', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        model:     result.model,
        ratio:     aspectRatio
      });

    } catch (err) {
      log.error(`video failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Video generation failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 120)}\n\n` +
            `[View channel](${channelLink})\n` +
            `${config.msg.footer}`
        }, { quoted: msg });
      } catch {}
    }
  }
};