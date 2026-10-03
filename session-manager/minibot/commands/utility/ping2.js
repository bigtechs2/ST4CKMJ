import os from 'node:os';
import process from 'node:process';

import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';
import format from '../../../utils/format.js';
import { buildFooterBlock } from '../../../utils/reply.js';

const log = logger.child('cmd:ping2');

const SYM = brand.SYM;

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

function ramLabel(p) {
  if (p < 50) return 'Healthy';
  if (p < 75) return 'Moderate';
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

export default {
  name: 'ping2',
  aliases: ['p2', 'speed2', 'speedtest2'],
  category: 'information',
  description: 'Full server specs with native flow card',
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
    const { sock, msg, chatId } = ctx;

    try {
      const t0 = performance.now();

      await sock.sendMessage(chatId, {
        text: `${SYM.info} Reading server info...`
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

      const pingBadge = pingLabel(Number(responseTime));
      const ramBadge  = ramLabel(ramPercent);
      const cpuBadge  = cpuLabel(cpuLoad);

      const ownerNumber = config.owners.whatsapp.id;
      const groupLink   = config.bot.groupLink || config.links.whatsappChannel;
      const channelLink = config.bot.channelLink || config.links.whatsappChannel;
      const footerText  = config.msg.footer;

      const bodyText =
        `${SYM.heart} *${brand.BOT_NAME}*\n` +
        `${SYM.arrow} server performance\n\n` +
        `${SYM.pointer} Response · ${responseTime} ms — ${pingBadge}\n` +
        `${SYM.pointer} API Ping · ${apiLatency ? `${apiLatency} ms` : '—'}\n` +
        `${SYM.pointer} RAM · ${fmtRam(usedRam)} / ${fmtRam(totalRam)} (${ramPercent}%)\n` +
        `${SYM.pointer} CPU Load · ${cpuLoad}% — ${cpuBadge}\n` +
        `${SYM.pointer} Bot Uptime · ${format.formatUptime(botUp)}\n\n` +
        `[View channel](${channelLink})\n` +
        `${footerText}`;

      await sock.relayMessage(
        chatId,
        {
          messageContextInfo: {
            threadId: [],
            deviceListMetadata: {
              senderKeyIndexes: [],
              recipientKeyIndexes: []
            },
            deviceListMetadataVersion: 2
          },
          interactiveMessage: {
            header: {
              title: 'Server Performance',
              hasMediaAttachment: false
            },
            body: {
              text: bodyText
            },
            footer: {
              text: footerText
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: 'booking_confirmation',
                  buttonParamsJson: JSON.stringify({
                    start_datetime: new Date().toISOString(),
                    end_datetime: new Date(Date.now() + 600000).toISOString(),
                    location: 'Tanzania',
                    booking_url: groupLink,
                    phone_number: ownerNumber,
                    booking_management_url: groupLink,
                    description:
                      `${SYM.pointer} CPU · ${cpuModel}\n` +
                      `${SYM.pointer} Cores · ${cpuCores} @ ${cpuSpeed} MHz\n` +
                      `${SYM.pointer} Platform · ${platform}\n` +
                      `${SYM.pointer} Node.js · ${nodeVer}\n` +
                      `${SYM.pointer} Server Up · ${format.formatUptime(serverUp)}`,
                    email: '',
                    display_text: 'Full Specs',
                    display_content: {
                      display_language: 'en',
                      display_meeting_type: 'Server Information',
                      display_bottom_sheet_header: 'Server Details',
                      display_add_to_calendar_cta_text: 'SERVER',
                      display_view_on_maps_cta_text: 'Server Location',
                      display_manage_booking_cta_text: 'Join Group',
                      display_manage_booking_not_supported_text: 'Server Info',
                      display_read_more: 'View Details'
                    }
                  })
                }
              ],
              messageParamsJson: '{}'
            },
            contextInfo: {
              mentionedJid: [],
              groupMentions: [],
              statusAttributions: [],
              stanzaId: 'StatusBiz',
              participant: '0@s.whatsapp.net',
              quotedMessage: {
                contactMessage: {
                  displayName: brand.BOT_NAME,
                  vcard:
                    'BEGIN:VCARD\n' +
                    'VERSION:3.0\n' +
                    `N:${brand.BOT_NAME}\n` +
                    `FN:${brand.BOT_NAME}\n` +
                    `ORG:${brand.BOT_NAME};\n` +
                    `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}\n` +
                    'END:VCARD'
                }
              },
              remoteJid: 'status@broadcast'
            }
          }
        },
        {
          additionalNodes: [
            {
              tag: 'biz',
              attrs: {},
              content: [
                {
                  tag: 'interactive',
                  attrs: { type: 'native_flow', v: '1' },
                  content: [
                    {
                      tag: 'native_flow',
                      attrs: { v: '9', name: 'mixed' }
                    }
                  ]
                }
              ]
            }
          ]
        }
      );

      log.event('command.ping2', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber,
        ms:        Number(responseTime)
      });

    } catch (err) {
      log.error(`ping2 failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} ping2 failed\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            buildFooterBlock()
        }, { quoted: msg });
      } catch {}
    }
  }
};