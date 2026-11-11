import crypto from 'crypto';

import config from '../config.js';
import brand from '../../shared/brand.js';

const CATALOG_STANZA = 'minist4ck:catalog';

const CATALOG_MESSAGE = {
  productMessage: {
    product: {
      title:       config.bot?.catalogTitle || brand.BOT_NAME,
      description: config.bot?.catalogDescription || 'Premium WhatsApp Bot',
      currencyCode: config.bot?.catalogCurrency || 'TZS',
      priceAmount1000: (config.bot?.catalogPrice || 500) * 1000,
      retailerId:   config.bot?.catalogRetailerId || brand.BOT_NAME,
      productImageCount: 1
    },
    businessOwnerJid: '0@s.whatsapp.net'
  }
};

export const CATALOG = {
  key: {
    remoteJid:   '0@s.whatsapp.net',
    fromMe:      false,
    id:          CATALOG_STANZA,
    participant: '0@s.whatsapp.net'
  },
  message: CATALOG_MESSAGE
};

export function buildCatalogContext(options = {}) {
  return {
    stanzaId:      options.stanzaId      || CATALOG.key.id,
    participant:   options.participant   || CATALOG.key.participant,
    remoteJid:     options.remoteJid     || CATALOG.key.remoteJid,
    quotedMessage: options.quotedMessage || CATALOG_MESSAGE,
    ...(options.mentionedJid ? { mentionedJid: options.mentionedJid } : {}),
    ...(options.extra || {})
  };
}

export function newStanzaId() {
  return 'AC' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

export async function sendWithCatalog(sock, chatId, content, options = {}) {
  const payload = {
    ...content,
    contextInfo: buildCatalogContext({
      stanzaId: options.stanzaId,
      mentionedJid: options.mentionedJid,
      extra: options.extra
    })
  };

  const sendOpts = options.quoted ? { quoted: options.quoted } : {};

  return sock.sendMessage(chatId, payload, sendOpts);
}

export async function sendAudioWithCatalog(sock, chatId, audioUrl, options = {}) {
  const url = audioUrl || config.bot?.catalogAudio;

  if (!url) return null;

  return sendWithCatalog(sock, chatId, {
    audio:    { url },
    mimetype: options.mimetype || 'audio/mpeg',
    ptt:      options.ptt === true
  }, options);
}

export async function sendImageWithCatalog(sock, chatId, imageUrl, options = {}) {
  const url = imageUrl || config.bot?.catalogImage;

  if (!url) return null;

  return sendWithCatalog(sock, chatId, {
    image:   { url },
    caption: options.caption || ''
  }, options);
}

export async function sendTextWithCatalog(sock, chatId, text, options = {}) {
  return sendWithCatalog(sock, chatId, { text }, options);
}

export async function sendBannerWithAudio(sock, chatId, options = {}) {
  const results = {};

  if (options.sendImage !== false) {
    try {
      results.image = await sendImageWithCatalog(sock, chatId, options.imageUrl, {
        caption:  options.imageCaption || '',
        stanzaId: options.stanzaId,
        quoted:   options.quoted
      });
    } catch (err) {
      results.imageError = err.message;
    }
  }

  if (options.sendAudio !== false) {
    try {
      results.audio = await sendAudioWithCatalog(sock, chatId, options.audioUrl, {
        stanzaId: options.stanzaId,
        quoted:   options.quoted
      });
    } catch (err) {
      results.audioError = err.message;
    }
  }

  return results;
}

export default {
  CATALOG,
  buildCatalogContext,
  newStanzaId,
  sendWithCatalog,
  sendAudioWithCatalog,
  sendImageWithCatalog,
  sendTextWithCatalog,
  sendBannerWithAudio
};