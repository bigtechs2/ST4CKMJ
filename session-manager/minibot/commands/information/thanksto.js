import { AIRich } from '../../../lib/NIXCODE.js';
import config from '../../../config.js';
import brand from '../../../../shared/brand.js';
import logger from '../../../../shared/logger.js';

const log = logger.child('cmd:thankto');

const SYM = brand.SYM;

function footerBlock() {
  const url  = config.bot?.channelLink || config.links.whatsappChannel;
  const text = config.msg.footer;

  return `[View channel](${url})\n${text}`;
}

const CREDITS = [
  {
    label: 'bigtechs2',
    value: 'github.com/bigtechs2'
  },
  {
    label: 'bigtechs1',
    value: 'github.com/bigtechs1'
  },
  {
    label: 'bigtechs3',
    value: 'github.com/bigtechs3'
  },
  {
    label: 'bigmanj tech™',
    value: 'with ♡'
  }
];

export default {
  name: 'thankto',
  aliases: ['thanksto', 'credits'],
  category: 'information',
  description: 'Credits and contributors',
  emoji: '♡',
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
      const creditLines = CREDITS
        .map((c) => `   ${SYM.arrow} ${c.label}  ·  ${c.value}`)
        .join('\n');

      const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

      rich.addText(
        `${SYM.heart} *Thank You*\n` +
        `${SYM.arrow} to everyone who made ${brand.BOT_NAME} possible`
      );

      rich.addText(
        `${SYM.diamond} *Contributors*\n\n` +
        creditLines
      );

      rich.addText(
        `${SYM.diamond} *Community*\n\n` +
        `   ${SYM.arrow} And to everyone who has helped in the\n` +
        `   ${SYM.arrow} development of this bot.\n` +
        `   ${SYM.arrow} Too many to list one by one.`
      );

      rich.addTip(
        `${brand.PROJECT_NAME} · ${brand.GITHUB_USER}/${brand.GITHUB_REPO}`
      );

      rich.addSuggest([
        `${prefix}menu`,
        `${prefix}ping`,
        `${prefix}runtime`
      ]);

      rich.addText(footerBlock());

      await rich.send(chatId, { quoted: msg });

      log.event('command.thankto', {
        sessionId: ctx.sessionId,
        sender:    ctx.senderNumber
      });

    } catch (err) {
      log.error(`thankto failed: ${err.message}`);

      try {
        await sock.sendMessage(chatId, {
          text:
            `${SYM.cross} Failed to load credits\n` +
            `${SYM.arrow} ${err.message.slice(0, 100)}\n\n` +
            footerBlock()
        }, { quoted: msg });
      } catch {}
    }
  }
};