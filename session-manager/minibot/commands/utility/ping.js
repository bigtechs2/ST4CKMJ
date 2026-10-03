import os from 'node:os';
import process from 'node:process';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import format from '../../../utils/format.js';

const log = logger.child('cmd:ping');

function bar(percent, size = 10) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((p / 100) * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function fmtRam(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024
    ? `${(mb / 1024).toFixed(2)} GB`
    : `${mb.toFixed(0)} MB`;
}

function pingLabel(ms) {
  if (ms < 500)  return 'Excellent';
  if (ms < 1000) return 'Good';
  if (ms < 2000) return 'Average';
  return 'Poor';
}

function ramLabel(percent) {
  if (percent < 50) return 'Healthy';
  if (percent < 75) return 'Moderate';
  return 'Critical';
}

function cpuLabel(load) {
  if (load < 30) return 'Idle';
  if (load < 60) return 'Normal';
  if (load < 85) return 'Busy';
  return 'Overload';
}

async function measureApiLatency() {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);

    await fetch('https://httpbin.org/get', { signal: ctrl.signal });
    clearTimeout(timer);

    return Date.now() - start;
  } catch {
    return null;
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

export default {
  name: 'ping',
  aliases: ['p', 'speed', 'speedtest'],
  category: 'utility',
  description: 'Check bot response time and system status',
  emoji: '⌘',
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
    const {
      sock,
      msg,
      chatId,
      config: sessionCfg
    } = ctx;

    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    try {
      const t0 = performance.now();

      await sock.sendMessage(chatId, {
        text: `${brand.SYM.info} Measuring performance...`
      }, { quoted: msg });

      const responseTime = (performance.now() - t0).toFixed(0);
      const apiLatency   = await measureApiLatency();

      const totalRam   = os.totalmem();
      const freeRam    = os.freemem();
      const usedRam    = totalRam - freeRam;
      const ramPercent = Number(((usedRam / totalRam) * 100).toFixed(1));

      const cpus     = os.cpus();
      const cpuModel = cpus[0]?.model?.trim() || 'Unknown';
      const cpuCores = cpus.length;
      const cpuSpeed = cpus[0]?.speed || 0;
      const loadAvg  = os.loadavg()[0];
      const cpuLoad  = Number(Math.min((loadAvg / cpuCores) * 100, 100).toFixed(1));

      const platform = `${os.type()} ${os.arch()}`;
      const nodeVer  = process.version;
      const botUp    = process.uptime();
      const serverUp = os.uptime();

      const pingBadge = pingLabel(responseTime);
      const ramBadge  = ramLabel(ramPercent);
      const cpuBadge  = cpuLabel(cpuLoad);

      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addProduct({
          title:       brand.BOT_NAME,
          brand:       'system monitor',
          price:       `${responseTime} ms`,
          sale_price:  pingBadge,
          url:         config.bot?.channelLink || config.links.whatsappChannel,
          image:       thumbnail,
          icon:        thumbnail
        });
      } else {
        rich.addText(
          `${brand.SYM.heart} *${brand.BOT_NAME}*\n` +
          `${brand.SYM.arrow} system monitor\n` +
          `${brand.SYM.arrow} ${responseTime} ms — ${pingBadge}`
        );
      }

      rich.addText(
        `${brand.SYM.diamond} *Latency*\n\n` +
        `   ${brand.SYM.arrow} Response   ·  *${responseTime} ms*  —  ${pingBadge}\n` +
        `   ${brand.SYM.arrow} API Ping   ·  ${apiLatency ? `*${apiLatency} ms*` : '—'}\n` +
        `   ${brand.SYM.arrow} Bot Uptime ·  ${format.formatUptime(botUp)}`
      );

      rich.addText(
        `${brand.SYM.diamond} *Memory*\n\n` +
        `   ${brand.SYM.arrow} Used  ·  *${fmtRam(usedRam)}* / ${fmtRam(totalRam)}\n` +
        `   ${brand.SYM.arrow} Free  ·  ${fmtRam(freeRam)}\n` +
        `   ${brand.SYM.arrow} Load  ·  \`${bar(ramPercent)}\`  ${ramPercent}%  —  ${ramBadge}`
      );

      rich.addText(
        `${brand.SYM.diamond} *Processor*\n\n` +
        `   ${brand.SYM.arrow} Model ·  ${cpuModel}\n` +
        `   ${brand.SYM.arrow} Cores ·  ${cpuCores} @ ${cpuSpeed} MHz\n` +
        `   ${brand.SYM.arrow} Load  ·  \`${bar(cpuLoad)}\`  ${cpuLoad}%  —  ${cpuBadge}`
      );

      rich.addTip(
        `Platform · ${platform}  ·  Node ${nodeVer}  ·  Server up ${format.formatUptime(serverUp)}`
      );

      rich.addSuggest([
        `${prefix}menu`,
        `${prefix}ping`,
        `${prefix}donate`
      ]);

      rich.setFooter(config.msg.footer);

      await rich.send(chatId, { quoted: msg });

      log.event('command.ping', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        ms:        Number(responseTime)
      });

    } catch (err) {
      log.error(`ping failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text: `${brand.SYM.cross} Ping failed\n${brand.SYM.arrow} ${err.message.slice(0, 100)}`
        }, { quoted: msg });
      } catch {}
    }
  }
};