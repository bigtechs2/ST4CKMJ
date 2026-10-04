import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { downloadMediaMessage } from '@whiskeysockets/baileys';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const execFileAsync = promisify(execFile);

const log = logger.child('cmd:audio');

const SYM = brand.SYM;

const EFFECTS = {
  bass: {
    label: 'Bass Boost',
    desc:  'deep low-end punch',
    args:  ['-af', 'bass=g=12,dynaudnorm=f=200']
  },
  nightcore: {
    label: 'Nightcore',
    desc:  'faster, higher pitch',
    args:  ['-af', 'asetrate=48000*1.25,aresample=48000,atempo=1.0']
  },
  reverb: {
    label: 'Reverb',
    desc:  'echo, wide space',
    args:  ['-af', 'aecho=0.8:0.88:60:0.4']
  },
  slowed: {
    label: 'Slowed',
    desc:  'slower, dreamy pace',
    args:  ['-af', 'atempo=0.85,asetrate=48000*0.9,aresample=48000']
  },
  slowedreverb: {
    label: 'Slowed + Reverb',
    desc:  'slowed with echo',
    args:  ['-af', 'atempo=0.85,asetrate=48000*0.9,aresample=48000,aecho=0.8:0.88:60:0.4']
  }
};

function getQuotedMessage(msg) {
  const ctx =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.audioMessage?.contextInfo ||
    {};

  if (!ctx.quotedMessage) return null;

  return {
    message: ctx.quotedMessage,
    key: {
      remoteJid:   msg.key.remoteJid,
      fromMe:      false,
      id:          ctx.stanzaId,
      participant: ctx.participant
    }
  };
}

function getQuotedAudioType(quoted) {
  if (!quoted?.message) return null;
  if (quoted.message.audioMessage) return 'audio';
  if (quoted.message.videoMessage) return 'video';
  return null;
}

async function downloadQuoted(sock, quoted) {
  return await downloadMediaMessage(
    quoted,
    'buffer',
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );
}

async function applyEffect(inputBuffer, effectKey) {
  const effect = EFFECTS[effectKey];
  if (!effect) throw new Error('unknown effect');

  const tmpDir = os.tmpdir();
  const id     = crypto.randomBytes(6).toString('hex');

  const inputPath  = path.join(tmpDir, `audio_in_${id}.ogg`);
  const outputPath = path.join(tmpDir, `audio_out_${id}.ogg`);

  try {
    await fs.writeFile(inputPath, inputBuffer);

    const args = [
      '-y',
      '-i', inputPath,
      ...effect.args,
      '-c:a', 'libopus',
      '-b:a',  '128k',
      '-vn',
      outputPath
    ];

    await execFileAsync('ffmpeg', args, { timeout: 60000 });

    const output = await fs.readFile(outputPath);

    if (!output || output.length < 100) throw new Error('empty output');

    return output;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
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

function footerBlock(channelLink) {
  return `[View channel](${channelLink})`;
}

export default {
  name: 'audio',
  aliases: ['effect', 'ae'],
  category: 'tools',
  description: 'Apply audio effects to a voice note or audio file',
  emoji: '⚙',
  usage: '<effect> (reply to audio)',

  permissions: {
    coin:    5,
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

    const effectKey = String(args?.[0] || '').toLowerCase().trim();
    const effect    = EFFECTS[effectKey];

    if (!effectKey) {
      return showHelp(sock, chatId, msg, prefix, channelLink);
    }

    if (!effect) {
      await sock.sendMessage(chatId, {
        text:
          `${SYM.cross} Unknown effect · \`${effectKey}\`\n` +
          `${SYM.arrow} available · ${Object.keys(EFFECTS).join(', ')}\n\n` +
          footerBlock(channelLink)
      }, { quoted: msg });
      return;
    }

    const quoted = getQuotedMessage(msg);
    const audioType = getQuotedAudioType(quoted);

    if (!quoted || !audioType) {
      await sock.sendMessage(chatId, {
        text:
          `${SYM.info} Reply to an audio or voice note\n` +
          `${SYM.arrow} Usage: ${prefix}audio ${effectKey}\n\n` +
          footerBlock(channelLink)
      }, { quoted: msg });
      return;
    }

    try {
      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addImage(thumbnail, { width: 360, height: 360, id: 'banner' });
      }

      rich.addText(
        `${SYM.info} *${effect.label}*\n` +
        `${SYM.arrow} _${effect.desc}_\n\n` +
        `${SYM.timer} processing…`,
        { id: 'status' }
      );

      const sentMsg = await rich.send(chatId, { quoted: msg });

      await rich.sendEdit(chatId, sentMsg.key.id, {
        msg: await (async () => {
          const editRich = new AIRich(sock).setTitle(brand.BOT_NAME);

          if (thumbnail) {
            editRich.addImage(thumbnail, { width: 360, height: 360, id: 'banner' });
          }

          editRich.addText(
            `${SYM.info} *${effect.label}*\n` +
            `${SYM.arrow} _${effect.desc}_\n\n` +
            `${SYM.pointer} downloading audio…`,
            { id: 'status' }
          );

          return (await editRich.build(chatId)).message;
        })()
      });

      const inputBuffer = await downloadQuoted(sock, quoted);

      if (!inputBuffer || inputBuffer.length < 100) {
        throw new Error('empty download');
      }

      const editRich2 = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        editRich2.addImage(thumbnail, { width: 360, height: 360, id: 'banner' });
      }

      editRich2.addText(
        `${SYM.info} *${effect.label}*\n` +
        `${SYM.arrow} _${effect.desc}_\n\n` +
        `${SYM.gear} applying effect…\n` +
        `${SYM.arrow} input · ${(inputBuffer.length / 1024).toFixed(0)} KB`,
        { id: 'status' }
      );

      await rich.sendEdit(chatId, sentMsg.key.id, {
        msg: (await editRich2.build(chatId)).message
      });

      const outputBuffer = await applyEffect(inputBuffer, effectKey);

      const editRich3 = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        editRich3.addImage(thumbnail, { width: 360, height: 360, id: 'banner' });
      }

      editRich3.addText(
        `${SYM.heart} *${effect.label}*\n` +
        `${SYM.arrow} _${effect.desc}_\n\n` +
        `${SYM.check} effect applied\n` +
        `${SYM.arrow} input  · ${(inputBuffer.length / 1024).toFixed(0)} KB\n` +
        `${SYM.arrow} output · ${(outputBuffer.length / 1024).toFixed(0)} KB\n\n` +
        `${SYM.pointer} sending audio…`,
        { id: 'status' }
      );

      editRich3.addSuggest([
        `${prefix}audio nightcore`,
        `${prefix}audio slowed`,
        `${prefix}audio reverb`
      ]);

      editRich3.addText(footerBlock(channelLink));
      editRich3.setFooter(config.msg.footer);

      await rich.sendEdit(chatId, sentMsg.key.id, {
        msg: (await editRich3.build(chatId)).message
      });

      await sock.sendMessage(chatId, {
        audio:    outputBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt:      true
      }, { quoted: msg });

      const editRich4 = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        editRich4.addImage(thumbnail, { width: 360, height: 360, id: 'banner' });
      }

      editRich4.addText(
        `${SYM.heart} *${effect.label}*\n` +
        `${SYM.arrow} _${effect.desc}_\n\n` +
        `${SYM.check} done · audio sent below\n` +
        `${SYM.arrow} input  · ${(inputBuffer.length / 1024).toFixed(0)} KB\n` +
        `${SYM.arrow} output · ${(outputBuffer.length / 1024).toFixed(0)} KB`,
        { id: 'status' }
      );

      editRich4.addSuggest([
        `${prefix}audio nightcore`,
        `${prefix}audio slowed`,
        `${prefix}audio reverb`
      ]);

      editRich4.addText(footerBlock(channelLink));
      editRich4.setFooter(config.msg.footer);

      await rich.sendEdit(chatId, sentMsg.key.id, {
        msg: (await editRich4.build(chatId)).message
      });

      log.event('command.audio', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        effect:    effectKey,
        inSize:    inputBuffer.length,
        outSize:   outputBuffer.length
      });

    } catch (err) {
      log.error(`audio ${effectKey} failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Audio processing failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            footerBlock(channelLink)
        }, { quoted: msg });
      } catch {}
    }
  }
};

async function showHelp(sock, chatId, msg, prefix, channelLink) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  const effectLines = Object.entries(EFFECTS)
    .map(([key, e]) => `   ${SYM.arrow} ${prefix}audio ${key.padEnd(15)} · ${e.desc}`)
    .join('\n');

  rich.addText(
    `${SYM.gear} *Audio Effects*\n` +
    `${SYM.arrow} reply to a voice note or audio and pick an effect`
  );

  rich.addText(
    `${SYM.diamond} *Available*\n\n` +
    effectLines
  );

  rich.addText(
    `${SYM.diamond} *How to use*\n\n` +
    `   ${SYM.arrow} 1 · reply to any audio / voice note\n` +
    `   ${SYM.arrow} 2 · send ${prefix}audio <effect>\n` +
    `   ${SYM.arrow} 3 · get processed audio back`
  );

  rich.addTip('powered by ffmpeg · works on any ogg, mp3, m4a, opus');

  rich.addSuggest([
    `${prefix}audio nightcore`,
    `${prefix}audio slowed`,
    `${prefix}audio reverb`
  ]);

  rich.addText(footerBlock(channelLink));
  rich.setFooter(config.msg.footer);

  await rich.send(chatId, { quoted: msg });
}