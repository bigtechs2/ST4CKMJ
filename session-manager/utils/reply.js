import { AIRich, Button, ButtonV2, Carousel } from '../lib/NIXCODE.js';

import brand from '../../shared/brand.js';
import config from '../../shared/config.js';
import C from '../../shared/constants.js';
import {
  joinLines,
  joinSpaced,
  truncate,
  formatSessionStatus,
  formatPlan,
  formatMoney,
  formatUptime
} from '../../shared/formatters.js';

const SYM = brand.SYM;
const FOOT = config.msg.footer;

function ensureFooter(text, includeFooter = true) {
  if (!includeFooter) return text;
  if (!FOOT) return text;
  if (String(text).includes(FOOT)) return text;

  return joinSpaced(text, FOOT);
}

async function sendText(sock, jid, text, options = {}) {
  const body = ensureFooter(text, options.footer !== false);

  return sock.sendMessage(jid, { text: body, ...options }, options.quoted ? { quoted: options.quoted } : {});
}

async function sendReply(ctx, text, options = {}) {
  return sendText(ctx.sock, ctx.chatId, text, { quoted: ctx.msg, ...options });
}

async function success(sock, jid, message, options = {}) {
  const body = `${SYM.check} ${message}`;
  return sendText(sock, jid, body, options);
}

async function error(sock, jid, message, options = {}) {
  const body = `${SYM.cross} ${message}`;
  return sendText(sock, jid, body, options);
}

async function warn(sock, jid, message, options = {}) {
  const body = `${SYM.timer} ${message}`;
  return sendText(sock, jid, body, options);
}

async function info(sock, jid, message, options = {}) {
  const body = `${SYM.info} ${message}`;
  return sendText(sock, jid, body, options);
}

async function withTitle(sock, jid, title, lines, options = {}) {
  const body = joinSpaced(
    `${SYM.heart} ${title}`,
    Array.isArray(lines) ? lines.join('\n') : lines
  );

  return sendText(sock, jid, body, options);
}

async function card(sock, jid, { title = '', body = '', lines = [], buttons = [], media = null, footer = true } = {}) {
  const parts = [];

  if (title) parts.push(`${SYM.heart} ${title}`);
  if (body) parts.push(body);
  if (lines.length) parts.push(Array.isArray(lines) ? lines.join('\n') : lines);

  const fullBody = ensureFooter(parts.join('\n\n'), footer);

  if (!buttons.length) {
    return sock.sendMessage(jid, { text: fullBody });
  }

  const btn = new Button(sock);

  if (media) {
    if (media.type === 'image') {
      btn.setImage(media.url, media.options || {});
    } else if (media.type === 'document') {
      btn.setDocument(media.url, media.options || {});
    } else if (media.type === 'video') {
      btn.setMedia({ video: { url: media.url }, ...(media.options || {}) });
    }
  }

  btn.setBody(fullBody);

  if (title) btn.setTitle(title);

  for (const b of buttons) {
    if (b.type === 'url') {
      btn.addUrl(b.text, b.url, b.webview || false);
    } else if (b.type === 'copy') {
      btn.addCopy(b.text, b.value || '');
    } else if (b.type === 'call') {
      btn.addCall(b.text, b.value || '');
    } else {
      btn.addReply(b.text, b.id || b.text);
    }
  }

  return btn.send(jid);
}

async function buttons(sock, jid, { body, options = [], footer = true, title = '' } = {}) {
  const fullBody = ensureFooter(body, footer);

  const btn = new ButtonV2(sock)
    .setBody(fullBody)
    .setFooter('');

  if (title) btn.setTitle(title);

  for (const opt of options) {
    btn.addButton(opt.label, opt.id || opt.label);
  }

  return btn.send(jid);
}

async function carousel(sock, jid, { cards = [], body = '', footer = true } = {}) {
  const car = new Carousel(sock);

  car.setBody(ensureFooter(body, footer));

  const built = [];

  for (const c of cards) {
    const media = c.image
      ? { image: { url: c.image } }
      : c.video
        ? { video: { url: c.video } }
        : null;

    if (!media) continue;

    built.push({
      header: {
        hasMediaAttachment: true,
        ...media
      },
      body: { text: c.body || '' },
      footer: { text: '' },
      nativeFlowMessage: {
        buttons: (c.buttons || []).map((b) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: b.label,
            id:           b.id || b.label
          })
        }))
      }
    });
  }

  car.addCard(built);

  return car.send(jid);
}

async function live(sock, jid, { title = '', initial = '', footer = true } = {}) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  if (initial) {
    rich.addText(initial, { id: 'body' });
  }

  const send = async (extraOptions = {}) => {
    return rich.send(jid, extraOptions);
  };

  const update = async (text) => {
    rich.addText(text, { insertAt: 'body' });
    return rich.sendEdit(jid);
  };

  const replace = async (text) => {
    rich.addText(text, { replace: 'body' });
    return rich.sendEdit(jid);
  };

  const append = async (text, id) => {
    rich.addText(text, { insertAt: id });
    return rich.sendEdit(jid);
  };

  const image = async (url) => {
    rich.addImage(url, { id: 'img' });
    return rich.sendEdit(jid);
  };

  const video = async (url) => {
    rich.addVideo(url, { id: 'vid' });
    return rich.sendEdit(jid);
  };

  const finalize = async (footerText) => {
    if (footer !== false) {
      rich.setFooter(FOOT);
    }
    return rich.sendEdit(jid);
  };

  return {
    rich,
    send,
    update,
    replace,
    append,
    image,
    video,
    finalize
  };
}

async function product(sock, jid, {
  title,
  brandName = 'by bigmanjtech™',
  price = '',
  salePrice = '',
  url = '',
  image = '',
  icon = '',
  body = '',
  footer = true
} = {}) {
  const rich = new AIRich(sock).setTitle(brand.BOT_NAME);

  const productData = {
    title,
    brand:      brandName,
    price,
    sale_price: salePrice,
    url,
    image,
    icon
  };

  rich.addProduct(productData);

  if (body) {
    rich.addText(ensureFooter(body, footer));
  } else {
    rich.setFooter(FOOT);
  }

  return rich.send(jid);
}

async function sessionCard(sock, jid, session) {
  const status = formatSessionStatus(session.status);

  return card(sock, jid, {
    title: session.label || session.userName || 'Session',
    lines: [
      `${SYM.arrow} Phone:   ${session.phoneNumber}`,
      `${SYM.arrow} Status:  ${status}`,
      `${SYM.arrow} Plan:    ${formatPlan(session.premium ? 'premium' : 'free')}`,
      `${SYM.arrow} Paired:  ${new Date(session.pairedAt).toLocaleDateString()}`
    ],
    buttons: [
      { text: 'Manage', type: 'reply', id: 'session:manage' },
      { text: 'Unlink', type: 'reply', id: 'session:unlink' }
    ]
  });
}

async function sessionsList(sock, jid, sessions = []) {
  if (!sessions.length) {
    return sendText(sock, jid,
      `${SYM.info} No sessions linked yet.\n${SYM.arrow} Use the pairing flow to add one.`
    );
  }

  const lines = sessions.map((s, i) => {
    const n = brand.NUM.normal[i] || `(${i + 1})`;
    const status = formatSessionStatus(s.status);
    return `${n} ${s.label || s.userName} — ${s.phoneNumber} ${status}`;
  });

  return card(sock, jid, {
    title: 'Your Sessions',
    lines,
    buttons: [
      { text: 'Add Number', type: 'reply', id: 'session:add' },
      { text: 'Refresh', type: 'reply', id: 'session:refresh' }
    ]
  });
}

async function paymentPrompt(sock, jid, { amount, currency } = {}) {
  const money = formatMoney(amount || config.payment.premiumPrice, currency || config.payment.currency);

  const body = joinLines(
    `${SYM.heart} Premium — ${money}`,
    '',
    `${SYM.arrow} Enter your payment number below`,
    `${SYM.arrow} Example: 255745123456`,
    '',
    `Reply cancel to abort`
  );

  return sendText(sock, jid, body);
}

async function paymentPending(sock, jid) {
  const body = joinLines(
    `${SYM.diamond} Check your phone`,
    `${SYM.arrow} USSD popup will appear`,
    `${SYM.arrow} Enter your PIN to confirm`
  );

  return sendText(sock, jid, body);
}

async function paymentSuccess(sock, jid, { amount, currency, days } = {}) {
  const money = formatMoney(amount || config.payment.premiumPrice, currency || config.payment.currency);

  const body = joinLines(
    `${SYM.heart} Payment received`,
    `${SYM.arrow} Amount: ${money}`,
    `${SYM.arrow} Premium active for ${days || config.payment.premiumDurationDays} days`
  );

  return sendText(sock, jid, body);
}

async function menu(sock, jid, categories = []) {
  const lines = [];

  for (const cat of categories) {
    const meta = cat.meta || {};
    lines.push(`${meta.symbol || SYM.dot} ${meta.label || cat.name}`);

    const chunk = cat.commands
      .slice(0, 8)
      .map((c) => c.name)
      .join(`  ${SYM.bullet}  `);

    lines.push(`   ${chunk}`);

    if (cat.commands.length > 8) {
      lines.push(`   ${SYM.more} +${cat.commands.length - 8} more`);
    }

    lines.push('');
  }

  const body = joinLines(
    `${SYM.heart} ${brand.BOT_NAME}`,
    `${SYM.arrow} ${brand.BOT_TAGLINE}`,
    '',
    ...lines
  );

  return sendText(sock, jid, body);
}

async function helpCommand(sock, jid, command) {
  if (!command) {
    return sendText(sock, jid, `${SYM.cross} Command not found.`);
  }

  const lines = [
    `${SYM.heart} ${command.name}`,
    '',
    `${SYM.arrow} ${command.description || 'No description'}`,
    `${SYM.arrow} Category: ${command.category}`,
    `${SYM.arrow} Usage: ${config.prefixes.whatsappDefault}${command.name} ${command.usage || ''}`.trim()
  ];

  if (command.aliases?.length) {
    lines.push(`${SYM.arrow} Aliases: ${command.aliases.join(', ')}`);
  }

  if (command.permissions?.premium) {
    lines.push(`${SYM.arrow} Premium only`);
  }

  if (command.permissions?.coin > 0) {
    lines.push(`${SYM.arrow} Cost: ${command.permissions.coin} coins`);
  }

  return sendText(sock, jid, lines.join('\n'));
}

async function raw(sock, jid, content, options = {}) {
  return sock.sendMessage(jid, content, options);
}

export {
  sendText,
  sendReply,
  success,
  error,
  warn,
  info,
  withTitle,
  card,
  buttons,
  carousel,
  live,
  product,
  sessionCard,
  sessionsList,
  paymentPrompt,
  paymentPending,
  paymentSuccess,
  menu,
  helpCommand,
  raw,
  ensureFooter
};

export default {
  text:           sendText,
  reply:          sendReply,
  success,
  error,
  warn,
  info,
  withTitle,
  card,
  buttons,
  carousel,
  live,
  product,
  sessionCard,
  sessionsList,
  paymentPrompt,
  paymentPending,
  paymentSuccess,
  menu,
  helpCommand,
  raw
};