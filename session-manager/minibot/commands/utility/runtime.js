import process from 'node:process';

import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:runtime');

const SYM = brand.SYM;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;
const WEEK   = 7 * DAY;
const MONTH  = 30 * DAY;
const YEAR   = 365 * DAY;

function breakdown(ms) {
  let remaining = Math.max(0, Math.floor(ms));

  const years = Math.floor(remaining / YEAR);
  remaining -= years * YEAR;

  const months = Math.floor(remaining / MONTH);
  remaining -= months * MONTH;

  const weeks = Math.floor(remaining / WEEK);
  remaining -= weeks * WEEK;

  const days = Math.floor(remaining / DAY);
  remaining -= days * DAY;

  const hours = Math.floor(remaining / HOUR);
  remaining -= hours * HOUR;

  const minutes = Math.floor(remaining / MINUTE);
  remaining -= minutes * MINUTE;

  const seconds = Math.floor(remaining / SECOND);

  return { years, months, weeks, days, hours, minutes, seconds };
}

function plural(n, word) {
  return `${n} ${n === 1 ? word : word + 's'}`;
}

function buildUnitList(parts) {
  const order = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
  const labels = {
    years:   'Years',
    months:  'Months',
    weeks:   'Weeks',
    days:    'Days',
    hours:   'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds'
  };

  const list = [];

  for (const key of order) {
    if (parts[key] > 0) {
      list.push({
        key,
        label: labels[key],
        value: parts[key]
      });
    }
  }

  if (!list.length) {
    list.push({ key: 'seconds', label: 'Seconds', value: 0 });
  }

  return list;
}

function buildLongLine(parts) {
  const order = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
  const words = {
    years:   'year',
    months:  'month',
    weeks:   'week',
    days:    'day',
    hours:   'hour',
    minutes: 'minute',
    seconds: 'second'
  };

  const active = order.filter((k) => parts[k] > 0);

  if (!active.length) return '0 seconds';

  return active.map((k) => plural(parts[k], words[k])).join(', ');
}

function buildShortLine(parts) {
  const order = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];
  const labels = {
    years:   'y',
    months:  'mo',
    weeks:   'w',
    days:    'd',
    hours:   'h',
    minutes: 'm',
    seconds: 's'
  };

  const active = order.filter((k) => parts[k] > 0);

  if (!active.length) return '0s';

  return active.map((k) => `${parts[k]}${labels[k]}`).join(' · ');
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

function footerBlock() {
  const url  = config.bot?.channelLink || config.links.whatsappChannel;
  const text = config.msg.footer;

  return `[View channel](${url})\n${text}`;
}

export default {
  name: 'runtime',
  aliases: ['uptime', 'up'],
  category: 'utility',
  description: 'Show how long the bot has been running',
  emoji: '⏱',
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
    const { sock, msg, chatId, config: sessionCfg } = ctx;
    const prefix = sessionCfg?.prefix || config.prefixes.whatsappDefault;

    try {
      const uptimeMs = process.uptime() * 1000;
      const parts    = breakdown(uptimeMs);
      const units    = buildUnitList(parts);
      const long     = buildLongLine(parts);
      const short    = buildShortLine(parts);

      const startedAt = new Date(Date.now() - uptimeMs);

      const thumbnail = await getThumbnail(sock);

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      if (thumbnail) {
        rich.addProduct({
          title:       brand.BOT_NAME,
          brand:       'uptime monitor',
          price:       short,
          sale_price:  'online',
          url:         config.bot.channelLink || config.links.whatsappChannel,
          image:       thumbnail,
          icon:        thumbnail
        });
      } else {
        rich.addText(
          `${SYM.heart} *${brand.BOT_NAME}*\n` +
          `${SYM.arrow} uptime monitor\n` +
          `${SYM.arrow} ${short}`
        );
      }

      rich.addText(
        `${SYM.diamond} *Runtime*\n\n` +
        `   ${SYM.arrow} Uptime · *${short}*\n` +
        `   ${SYM.arrow} Since  · ${startedAt.toLocaleString('en-GB', { hour12: false })}`
      );

      const breakdownLines = units
        .map((u) => `   ${SYM.arrow} ${u.label.padEnd(8)} · ${u.value}`)
        .join('\n');

      rich.addText(
        `${SYM.diamond} *Breakdown*\n\n` +
        breakdownLines
      );

      rich.addTip(long);

      rich.addSuggest([
        `${prefix}menu`,
        `${prefix}ping`,
        `${prefix}ping2`
      ]);

      rich.addText(footerBlock());

      await rich.send(chatId, { quoted: msg });

      log.event('command.runtime', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        ms:        Math.floor(uptimeMs)
      });

    } catch (err) {
      log.error(`runtime failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Runtime check failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            footerBlock()
        }, { quoted: msg });
      } catch {}
    }
  }
};