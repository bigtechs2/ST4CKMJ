import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:imagine');

const SYM = brand.SYM;

const DC_KEY =
  process.env.DAVIDCYRIL_KEY ||
  'dc_live__QTnLsE1YSVTzwpNmWqTA1VilR2bP8WX';

const IMAGE_ENDPOINTS = [
  {
    name:         'nexray-magicstudio',
    url:          'https://api.nexray.eu.cc/ai/magicstudio',
    param:        'prompt',
    responseType: 'arraybuffer',
    timeout:      60000
  },
  {
    name:    'dc-fluxv2',
    url:     'https://apis.davidcyriltech.my.id/fluxv2',
    param:   'prompt',
    headers: { 'X-API-Key': DC_KEY },
    timeout: 60000
  },
  {
    name:    'dc-anonymous',
    url:     'https://apis.davidcyriltech.my.id/ai/anonymous/image',
    param:   'prompt',
    headers: { 'X-API-Key': DC_KEY },
    timeout: 60000
  },
  {
    name:    'nexray-ideogram',
    url:     'https://api.nexray.eu.cc/ai/ideogram',
    param:   'prompt',
    timeout: 60000
  },
  {
    name:    'azbry-imagegen',
    url:     'https://api.azbry.com/api/ai/imagegen',
    param:   'prompt',
    timeout: 60000
  }
];

function extractImageUrl(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;

  return (
    data?.result?.image ||
    data?.result?.url ||
    data?.result ||
    data?.image?.url ||
    data?.image ||
    data?.url ||
    data?.data?.result?.url ||
    data?.data?.image ||
    data?.data?.url ||
    data?.data?.[0]?.url ||
    null
  );
}

async function tryEndpoint(endpoint, prompt) {
  const params  = { [endpoint.param || 'prompt']: prompt };
  const headers = endpoint.headers || {};

  if (endpoint.responseType === 'arraybuffer') {
    const response = await axios.get(endpoint.url, {
      params,
      headers,
      timeout:      endpoint.timeout,
      responseType: 'arraybuffer'
    });

    if (!response.data || response.data.byteLength < 100) {
      throw new Error('empty buffer');
    }

    return {
      type:   'buffer',
      buffer: Buffer.from(response.data),
      model:  endpoint.name
    };
  }

  const { data } = await axios.get(endpoint.url, {
    params,
    headers,
    timeout: endpoint.timeout
  });

  const url = extractImageUrl(data);
  if (!url) throw new Error('no image URL');

  return {
    type:  'url',
    url,
    model: endpoint.name
  };
}

async function generateImage(prompt) {
  const errors = [];

  for (const endpoint of IMAGE_ENDPOINTS) {
    try {
      log.debug(`trying ${endpoint.name}`);
      const result = await tryEndpoint(endpoint, prompt);
      log.info(`image via ${endpoint.name}`);
      return result;
    } catch (err) {
      errors.push(`${endpoint.name}: ${err.message}`);
      log.warn(`${endpoint.name} failed: ${err.message}`);
    }
  }

  throw new Error(`all providers failed`);
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
  name: 'imagine',
  aliases: ['img', 'image', 'draw', 'gen', 'aigen'],
  category: 'ai-generator',
  description: 'Generate an image from a text prompt',
  emoji: '✧',
  usage: '<prompt>',

  permissions: {
    coin:    10,
    owner:   false,
    admin:   false,
    premium: true,
    group:   true,
    private: true
  },

  code: async (ctx) => {
    const { sock, msg, chatId, args, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    const prompt = (Array.isArray(args) ? args : []).join(' ').trim();

    if (!prompt) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *AI Image Generator*\n\n` +
          `${SYM.arrow} Usage: ${prefix}imagine <prompt>\n` +
          `${SYM.arrow} Example: ${prefix}imagine a neon cyberpunk lion\n\n` +
          `[View channel](${config.bot.channelLink || config.links.whatsappChannel})`
      }, { quoted: msg });
    }

    const channelLink = config.bot.channelLink || config.links.whatsappChannel;

    try {
      await sock.sendMessage(chatId, {
        text: `${SYM.info} generating image…\n${SYM.arrow} _${prompt.slice(0, 80)}_`
      }, { quoted: msg });

      const result    = await generateImage(prompt);
      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addProduct({
          title:       'AI Image Generator',
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
        `${SYM.arrow} model · ${result.model}\n` +
        `${SYM.arrow} ask nicely, get nice art`
      );

      if (result.type === 'buffer') {
        rich.addImage(result.buffer, { width: 512, height: 512 });
      } else {
        rich.addImage(result.url, { width: 512, height: 512 });
      }

      rich.addSuggest([
        `${prefix}imagine`,
        `${prefix}video`,
        `${prefix}menu ai-generator`
      ]);

      rich.addText(`[View channel](${channelLink})`);
      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.imagine', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        model:     result.model
      });

    } catch (err) {
      log.error(`imagine failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Image generation failed\n` +
            `${SYM.arrow} all providers are down\n` +
            `${SYM.arrow} try again in a minute\n\n` +
            `[View channel](${channelLink})\n` +
            `${config.msg.footer}`
        }, { quoted: msg });
      } catch {}
    }
  }
};