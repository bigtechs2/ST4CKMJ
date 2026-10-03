import shared from '../../shared/formatters.js';
import brand from '../../shared/brand.js';
import config from '../../shared/config.js';
import C from '../../shared/constants.js';

const SYM = brand.SYM;

function mention(number) {
  const clean = String(number || '').replace(/\D/g, '');
  if (!clean) return '';
  return `@${clean}`;
}

function mentionJid(number) {
  const clean = String(number || '').replace(/\D/g, '');
  if (!clean) return '';
  return `${clean}@s.whatsapp.net`;
}

function userJid(number) {
  return mentionJid(number);
}

function groupJid(id) {
  const clean = String(id || '').replace(/\D/g, '');
  if (!clean) return '';
  return `${clean}@g.us`;
}

function channelJid(id) {
  const clean = String(id || '');
  if (!clean) return '';
  if (clean.includes('@newsletter')) return clean;
  return `${clean}@newsletter`;
}

function stripJid(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0];
}

function phoneFromJid(jid) {
  return stripJid(jid).replace(/\D/g, '');
}

function sessionLine(session, index = null) {
  const prefix = index !== null
    ? `${brand.NUM.normal[index] || `(${index + 1})`} `
    : '';

  const label  = session.label || session.userName || 'Session';
  const status = shared.formatSessionStatus(session.status);
  const phone  = shared.formatPhone(session.phoneNumber);
  const plan   = session.premium ? 'Premium' : 'Free';

  return `${prefix}${label} — ${phone} ${SYM.bullet} ${status} ${SYM.bullet} ${plan}`;
}

function sessionDetail(session, { prefix = '   ' } = {}) {
  const lines = [
    `${prefix}${SYM.arrow} Phone:   ${shared.formatPhone(session.phoneNumber)}`,
    `${prefix}${SYM.arrow} Status:  ${shared.formatSessionStatus(session.status)}`,
    `${prefix}${SYM.arrow} Plan:    ${session.premium ? 'Premium' : 'Free'}`,
    `${prefix}${SYM.arrow} Paired:  ${shared.formatDate(session.pairedAt, 'full')}`,
    `${prefix}${SYM.arrow} Seen:    ${shared.timeAgo(session.lastSeen)} (${session.lastSeenReason || 'unknown'})`
  ];

  if (session.premiumUntil) {
    lines.push(`${prefix}${SYM.arrow} Expires: ${shared.formatDate(session.premiumUntil, 'date')}`);
  }

  return lines.join('\n');
}

function premiumLine(session) {
  if (!session.premium) return `${SYM.cross} Free plan`;

  const until = session.premiumUntil
    ? `until ${shared.formatDate(session.premiumUntil, 'date')}`
    : 'lifetime';

  return `${SYM.check} Premium ${until}`;
}

function coinLine(coins) {
  return `${SYM.diamond} ${shared.formatNumber(coins)} coins`;
}

function uptimeLine(seconds) {
  return `${SYM.timer} ${shared.formatUptime(seconds)}`;
}

function statusLine(state) {
  return shared.formatSessionStatus(state);
}

function tierLine(tier) {
  return shared.formatTier(tier);
}

function planLine(plan) {
  return shared.formatPlan(plan);
}

function paymentLine(payment) {
  const amount = shared.formatMoney(payment.amount, payment.currency);
  const state  = shared.formatPaymentState(payment.status);
  const method = payment.method ? `· ${payment.method}` : '';

  return `${state}  ${amount}  ${method}`.trim();
}

function costLine(cost) {
  if (!cost || cost <= 0) return `${SYM.check} Free`;
  return `${SYM.diamond} ${cost} coins`;
}

function buildKeyValue(pairs) {
  return Object.entries(pairs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `   ${SYM.arrow} ${k}: ${v}`)
    .join('\n');
}

function buildList(items, { bullet = SYM.bullet } = {}) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((item) => `   ${bullet} ${item}`).join('\n');
}

function numbered(items, { style = 'normal' } = {}) {
  return shared.toNumbered(items, style).join('\n');
}

function footer() {
  return config.msg.footer || brand.FOOTER.whatsapp;
}

function withFooter(text) {
  const f = footer();
  if (!f) return text;
  if (String(text).includes(f)) return text;
  return `${text}\n\n${f}`;
}

function welcomeText(pushName) {
  return [
    `${SYM.heart} Welcome to ${brand.BOT_NAME}`,
    `${pushName ? `${pushName} — ` : ''}you're now linked`,
    '',
    `${SYM.diamond} pick a starting point`,
    `   ${SYM.arrow} menu   ${SYM.bullet} see all commands`,
    `   ${SYM.arrow} ping   ${SYM.bullet} test latency`,
    `   ${SYM.arrow} help   ${SYM.bullet} command guide`,
    '',
    `${SYM.square} you're now following our channel`,
    `   ${SYM.arrow} updates and news will reach you`
  ].join('\n');
}

function pairingCodeText(code, { minutes = 5 } = {}) {
  return [
    `${SYM.heart} Pairing code`,
    '',
    `\`${code}\``,
    '',
    `${SYM.arrow} Code refreshes automatically`,
    `${SYM.arrow} Valid for ${minutes} minutes`,
    '',
    `${SYM.arrow} Open WhatsApp → Linked Devices`,
    `${SYM.arrow} Link with phone number`,
    `${SYM.arrow} Enter the code above`
  ].join('\n');
}

function errorText(reason, extra = '') {
  const base = config.messages.errors[reason] || config.messages.errors.generic;
  return extra ? `${base}\n${SYM.arrow} ${extra}` : base;
}

function successText(title, lines = []) {
  const parts = [`${SYM.check} ${title}`];
  if (lines.length) parts.push(buildList(lines));
  return parts.join('\n');
}

function infoText(title, lines = []) {
  const parts = [`${SYM.info} ${title}`];
  if (lines.length) parts.push(buildList(lines));
  return parts.join('\n');
}

function truncateBody(text, max = 4000) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + `\n${SYM.more} truncated`;
}

function escapeMarkdown(text) {
  return String(text || '')
    .replace(/([_*`~])/g, '\\$1');
}

function toBold(text) {
  return `*${String(text || '')}*`;
}

function toItalic(text) {
  return `_${String(text || '')}_`;
}

function toStrike(text) {
  return `~${String(text || '')}~`;
}

function toMono(text) {
  return `\`${String(text || '')}\``;
}

function toCodeBlock(text) {
  return '```\n' + String(text || '') + '\n```';
}

function toQuote(text) {
  return String(text || '')
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function bullet(text) {
  return `${SYM.bullet} ${text}`;
}

function arrow(text) {
  return `${SYM.arrow} ${text}`;
}

function pointer(text) {
  return `${SYM.pointer} ${text}`;
}

function check(text) {
  return `${SYM.check} ${text}`;
}

function cross(text) {
  return `${SYM.cross} ${text}`;
}

export {
  mention,
  mentionJid,
  userJid,
  groupJid,
  channelJid,
  stripJid,
  phoneFromJid,

  sessionLine,
  sessionDetail,
  premiumLine,
  coinLine,
  uptimeLine,
  statusLine,
  tierLine,
  planLine,
  paymentLine,
  costLine,

  buildKeyValue,
  buildList,
  numbered,

  footer,
  withFooter,
  welcomeText,
  pairingCodeText,
  errorText,
  successText,
  infoText,
  truncateBody,

  escapeMarkdown,
  toBold,
  toItalic,
  toStrike,
  toMono,
  toCodeBlock,
  toQuote,

  bullet,
  arrow,
  pointer,
  check,
  cross,

  ...shared
};

export default {
  ...shared,

  mention,
  mentionJid,
  userJid,
  groupJid,
  channelJid,
  stripJid,
  phoneFromJid,

  sessionLine,
  sessionDetail,
  premiumLine,
  coinLine,
  uptimeLine,
  statusLine,
  tierLine,
  planLine,
  paymentLine,
  costLine,

  buildKeyValue,
  buildList,
  numbered,

  footer,
  withFooter,
  welcomeText,
  pairingCodeText,
  errorText,
  successText,
  infoText,
  truncateBody,

  escapeMarkdown,
  toBold,
  toItalic,
  toStrike,
  toMono,
  toCodeBlock,
  toQuote,

  bullet,
  arrow,
  pointer,
  check,
  cross
};