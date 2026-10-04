import axios from 'axios';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:apkdl');

const SYM = brand.SYM;

const API_URL = 'https://apis.davidcyriltech.my.id/download/apk';

function buildFooter(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'apkdl',
  aliases: ['apkdownload', 'apkget', 'apk'],
  category: 'downloader',
  description: 'Download Android APK files by name',
  emoji: '▸',
  usage: '<app name>',

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
    const channelLink = config.bot.channelLink || config.links.whatsappChannel;

    const query = (Array.isArray(args) ? args : []).join(' ').trim();

    if (!query) {
      return sock.sendMessage(chatId, {
        text:
          `${SYM.info} *APK Downloader*\n\n` +
          `${SYM.arrow} Usage: ${prefix}apkdl <app name>\n` +
          `${SYM.arrow} Example: ${prefix}apkdl whatsapp\n\n` +
          buildFooter(channelLink)
      }, { quoted: msg });
    }

    const startedAt = Date.now();

    try {
      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.info} *APK Downloader*\n` +
        `${SYM.arrow} searching · _${query}_\n\n` +
        `${SYM.timer} please wait…`,
        { id: 'status' }
      );

      rich.addText(buildFooter(channelLink));
      rich.setFooter(config.msg.footer);

      const sentMsg = await rich.send(chatId, { quoted: msg });
      const msgId   = sentMsg.key.id;

      const { data } = await axios.get(API_URL, {
        params:  { text: query },
        timeout: 30000
      });

      if (!data?.status || !data?.apk) {
        return editFinal(sock, chatId, msgId, {
          title: 'APK Not Found',
          body: `${SYM.arrow} no APK found for _${query}_`,
          channelLink
        });
      }

      const apk = data.apk;

      const name        = apk.name        || 'Unknown App';
      const packageName = apk.package     || 'Unknown';
      const version     = apk.lastUpdated || 'Unknown';
      const icon        = apk.icon        || config.bot.thumbnail;
      const size        = apk.size        || '';
      const downloadUrl = apk.downloadLink || '';

      if (!downloadUrl) {
        return editFinal(sock, chatId, msgId, {
          title: 'Download Unavailable',
          body: `${SYM.arrow} no download link returned`,
          channelLink
        });
      }

      await editStatus(sock, chatId, msgId, {
        title: 'App Found',
        lines: [
          `${SYM.arrow} name    · ${name}`,
          `${SYM.arrow} package · ${packageName}`,
          `${SYM.arrow} version · ${version}`,
          size ? `${SYM.arrow} size    · ${size}` : null,
          '',
          `${SYM.pointer} downloading APK…`
        ].filter(Boolean),
        icon,
        channelLink
      });

      const apkResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout:      90000,
        maxBodyLength: Infinity,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const apkBuffer = Buffer.from(apkResponse.data);

      if (!apkBuffer || apkBuffer.length < 100) {
        throw new Error('empty APK download');
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const sizeMb  = (apkBuffer.length / 1024 / 1024).toFixed(2);

      await editStatus(sock, chatId, msgId, {
        title: name,
        lines: [
          `${SYM.arrow} package · ${packageName}`,
          `${SYM.arrow} version · ${version}`,
          `${SYM.arrow} size    · ${sizeMb} MB`,
          `${SYM.arrow} ready   · ${elapsed}s`,
          '',
          `${SYM.pointer} sending APK below…`
        ],
        icon,
        channelLink
      });

      await sock.sendMessage(chatId, {
        document: apkBuffer,
        mimetype: 'application/vnd.android.package-archive',
        fileName: `${name.replace(/[^\w\s.-]/g, '').slice(0, 60) || 'app'}.apk`,
        caption:
          `${SYM.heart} *${name}*\n` +
          `${SYM.arrow} ${packageName}\n` +
          `${SYM.arrow} ${sizeMb} MB\n\n` +
          buildFooter(channelLink)
      }, { quoted: msg });

      await editFinal(sock, chatId, msgId, {
        title: name,
        body:
          `${SYM.check} APK sent successfully\n` +
          `${SYM.arrow} ${sizeMb} MB · ${elapsed}s`,
        channelLink
      });

      log.event('command.apkdl', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        query,
        size:      apkBuffer.length
      });

    } catch (err) {
      log.error(`apkdl failed: ${err.message}`);

      let userMsg = err.message.slice(0, 100);

      if (err.response?.status === 429) userMsg = 'rate limited · try again later';
      else if (err.response?.status === 404) userMsg = 'APK not found';
      else if (err.code === 'ECONNABORTED') userMsg = 'download timeout';

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} APK download failed\n` +
            `${SYM.arrow} ${userMsg}\n\n` +
            buildFooter(channelLink)
        }, { quoted: msg });
      } catch {}
    }
  }
};

async function editStatus(sock, chatId, msgId, { title, lines, icon, channelLink }) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  if (icon) {
    rich.addImage(icon, { width: 360, height: 360, id: 'icon' });
  }

  rich.addText(
    `${SYM.heart} *${title}*\n\n` +
    lines.join('\n'),
    { id: 'status' }
  );

  rich.addText(buildFooter(channelLink));
  rich.setFooter(config.msg.footer);

  const built = await rich.build(chatId);

  await rich.sendEdit(chatId, msgId, { msg: built.message });
}

async function editFinal(sock, chatId, msgId, { title, body, channelLink }) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  rich.addText(
    `${SYM.heart} *${title}*\n` +
    `${body}`,
    { id: 'status' }
  );

  rich.addSuggest([
    `${config.prefixes.whatsappDefault}apkdl`,
    `${config.prefixes.whatsappDefault}menu downloader`
  ]);

  rich.addText(buildFooter(channelLink));
  rich.setFooter(config.msg.footer);

  const built = await rich.build(chatId);

  await rich.sendEdit(chatId, msgId, { msg: built.message });
}