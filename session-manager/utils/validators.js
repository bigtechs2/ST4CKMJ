import config from '../config.js';
import C from '../../shared/constants.js';

const PHONE_RE     = /^\d{10,15}$/;
const URL_RE       = /^https?:\/\/.+/i;
const PREFIX_RE    = /^[!.#$%&+\-/~]$/;
const USERNAME_RE  = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const LABEL_RE     = /^[\w\s-]{1,20}$/;
const OBJECTID_RE  = /^[a-f0-9]{24}$/;
const SESSIONID_RE = /^[a-z0-9-]{6,32}$/;
const ORDERID_RE   = /^[a-zA-Z0-9_-]{6,64}$/;
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMOJI_RE     = /^(\p{Extended_Pictographic}|\p{Emoji_Component})$/u;

function result(ok, value = null, reason = '') {
  return { ok, value, reason };
}

function normalizePhone(input) {
  return String(input || '').replace(/\D/g, '');
}

function isValidPhone(input) {
  const clean = normalizePhone(input);
  if (!PHONE_RE.test(clean)) return false;
  return true;
}

function validatePhone(input, { countryCode = null } = {}) {
  const clean = normalizePhone(input);

  if (!clean) return result(false, null, 'empty');
  if (clean.length < 10) return result(false, null, 'too-short');
  if (clean.length > 15) return result(false, null, 'too-long');
  if (!PHONE_RE.test(clean)) return result(false, null, 'invalid-format');
  if (countryCode && !clean.startsWith(String(countryCode))) {
    return result(false, null, 'wrong-country');
  }

  return result(true, clean);
}

function isValidUrl(input) {
  return URL_RE.test(String(input || '').trim());
}

function validateUrl(input) {
  const url = String(input || '').trim();
  if (!url) return result(false, null, 'empty');
  if (!URL_RE.test(url)) return result(false, null, 'invalid-url');
  return result(true, url);
}

function isValidPrefix(input) {
  return PREFIX_RE.test(String(input || ''));
}

function validatePrefix(input) {
  const p = String(input || '').trim();
  if (!p) return result(false, null, 'empty');
  if (p.length > 1) return result(false, null, 'too-long');
  if (!PREFIX_RE.test(p)) return result(false, null, 'not-allowed');
  if (!config.prefixes.whatsappAllowed.includes(p)) {
    return result(false, null, 'not-in-allowlist');
  }
  return result(true, p);
}

function isValidUsername(input) {
  return USERNAME_RE.test(String(input || '').trim());
}

function validateUsername(input) {
  const u = String(input || '').trim();
  if (!u) return result(false, null, 'empty');
  if (u.length < config.auth.usernameMinLength) return result(false, null, 'too-short');
  if (u.length > config.auth.usernameMaxLength) return result(false, null, 'too-long');
  if (!USERNAME_RE.test(u)) return result(false, null, 'invalid-chars');
  return result(true, u);
}

function isValidEmail(input) {
  return EMAIL_RE.test(String(input || '').trim().toLowerCase());
}

function validateEmail(input) {
  const e = String(input || '').trim().toLowerCase();
  if (!e) return result(false, null, 'empty');
  if (!EMAIL_RE.test(e)) return result(false, null, 'invalid-email');
  return result(true, e);
}

function validatePassword(password, confirm = null) {
  const p = String(password || '');

  const rules = {
    minLength: p.length >= config.auth.passwordMinLength,
    uppercase: !config.auth.requireUppercase || /[A-Z]/.test(p),
    lowercase: !config.auth.requireLowercase || /[a-z]/.test(p),
    number:    !config.auth.requireNumber    || /[0-9]/.test(p),
    symbol:    !config.auth.requireSymbol    || /[^A-Za-z0-9]/.test(p)
  };

  const strong = Object.values(rules).every(Boolean);

  let match = true;
  if (confirm !== null) {
    match = p === String(confirm);
  }

  let strength = 'weak';
  const passed = Object.values(rules).filter(Boolean).length;
  if (passed >= 4 && p.length >= 10) strength = 'strong';
  else if (passed >= 3 && p.length >= 8) strength = 'medium';

  return {
    ok: strong && match,
    value: p,
    rules,
    strength,
    match,
    reason: !strong ? 'weak' : !match ? 'mismatch' : ''
  };
}

function isValidLabel(input) {
  return LABEL_RE.test(String(input || '').trim());
}

function validateLabel(input) {
  const l = String(input || '').trim();
  if (!l) return result(true, '', 'empty-ok');
  if (l.length > config.sessions.maxLabelLength) return result(false, null, 'too-long');
  if (!LABEL_RE.test(l)) return result(false, null, 'invalid-chars');
  return result(true, l);
}

function isValidObjectId(input) {
  return OBJECTID_RE.test(String(input || ''));
}

function isValidSessionId(input) {
  return SESSIONID_RE.test(String(input || ''));
}

function isValidOrderId(input) {
  return ORDERID_RE.test(String(input || ''));
}

function isEmoji(input) {
  const s = String(input || '');
  if (!s) return false;
  try {
    return EMOJI_RE.test(s);
  } catch {
    return s.length <= 8;
  }
}

function validateEmoji(input) {
  const e = String(input || '').trim();
  if (!e) return result(false, null, 'empty');
  if (!isEmoji(e)) return result(false, null, 'not-emoji');
  return result(true, e);
}

function validateEmojiList(input) {
  let list = [];

  if (Array.isArray(input)) {
    list = input;
  } else {
    list = String(input || '').trim().split(/\s+/);
  }

  const cleaned = list.map((e) => String(e).trim()).filter(Boolean);
  const valid = cleaned.filter(isEmoji);

  if (!valid.length) return result(false, [], 'no-valid-emojis');
  if (valid.length > 10) return result(false, valid.slice(0, 10), 'too-many');

  return result(true, valid);
}

function isPositiveInt(input) {
  const n = Number(input);
  return Number.isInteger(n) && n > 0;
}

function validateAmount(input, { min = 1, max = 1_000_000 } = {}) {
  const n = Number(input);

  if (!Number.isFinite(n)) return result(false, null, 'not-a-number');
  if (n < min) return result(false, null, 'too-small');
  if (n > max) return result(false, null, 'too-large');
  if (!Number.isInteger(n)) return result(false, null, 'not-integer');

  return result(true, n);
}

function validateCoinAmount(input) {
  return validateAmount(input, { min: 1, max: 1_000_000 });
}

function validateDays(input, { min = 1, max = 365 } = {}) {
  return validateAmount(input, { min, max });
}

function isDigitsOnly(input) {
  return /^\d+$/.test(String(input || ''));
}

function hasPrefix(text, prefix) {
  const t = String(text || '').trimStart();
  return t.startsWith(prefix);
}

function isCommand(text, prefix) {
  if (!hasPrefix(text, prefix)) return false;
  const without = text.trimStart().slice(prefix.length).trim();
  return without.length > 0;
}

function isInGroup(chatId) {
  return String(chatId || '').endsWith('@g.us');
}

function isInPrivate(chatId) {
  return String(chatId || '').endsWith('@s.whatsapp.net');
}

function isStatusJid(chatId) {
  return String(chatId || '') === 'status@broadcast';
}

function isChannelJid(chatId) {
  return String(chatId || '').endsWith('@newsletter');
}

function stripPrefix(text, prefix) {
  const t = String(text || '').trimStart();
  if (!t.startsWith(prefix)) return t;
  return t.slice(prefix.length).trim();
}

function parseCommand(text, prefix = '!') {
  const stripped = stripPrefix(text, prefix);
  if (!stripped) return null;

  const parts = stripped.split(/\s+/);
  const name = parts[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  const args = parts.slice(1);

  if (!name) return null;

  return { name, args, raw: stripped };
}

function extractCommandName(text, prefix = '!') {
  const parsed = parseCommand(text, prefix);
  return parsed ? parsed.name : null;
}

function truncateReason(reason) {
  const map = {
    'empty':              'Nothing provided',
    'too-short':          'Too short',
    'too-long':           'Too long',
    'invalid-format':     'Invalid format',
    'invalid-url':        'Invalid URL',
    'invalid-email':      'Invalid email',
    'not-allowed':        'Not allowed',
    'not-in-allowlist':   'Character not allowed',
    'invalid-chars':      'Invalid characters',
    'not-a-number':       'Not a number',
    'not-integer':        'Must be a whole number',
    'too-small':          'Value too small',
    'too-large':          'Value too large',
    'weak':               'Password too weak',
    'mismatch':           'Passwords do not match',
    'wrong-country':      'Wrong country code',
    'no-valid-emojis':    'No valid emojis found',
    'too-many':           'Too many items',
    'not-emoji':          'Not an emoji'
  };
  return map[reason] || reason || 'Invalid input';
}

function requireValid(validation, fallback = 'Invalid input') {
  if (!validation.ok) {
    throw new Error(validation.reason ? truncateReason(validation.reason) : fallback);
  }
  return validation.value;
}

function chain(...validations) {
  for (const v of validations) {
    if (!v || !v.ok) return v || result(false, null, 'unknown');
  }
  return result(true, validations.map((v) => v.value));
}

export {
  validatePhone,
  validateUrl,
  validatePrefix,
  validateUsername,
  validateEmail,
  validatePassword,
  validateLabel,
  validateEmoji,
  validateEmojiList,
  validateAmount,
  validateCoinAmount,
  validateDays,

  isValidPhone,
  isValidUrl,
  isValidPrefix,
  isValidUsername,
  isValidEmail,
  isValidLabel,
  isValidObjectId,
  isValidSessionId,
  isValidOrderId,
  isEmoji,
  isPositiveInt,
  isDigitsOnly,

  hasPrefix,
  isCommand,
  isInGroup,
  isInPrivate,
  isStatusJid,
  isChannelJid,

  stripPrefix,
  parseCommand,
  extractCommandName,

  normalizePhone,
  truncateReason,
  requireValid,
  chain,
  result
};

export default {
  phone:      validatePhone,
  url:        validateUrl,
  prefix:     validatePrefix,
  username:   validateUsername,
  email:      validateEmail,
  password:   validatePassword,
  label:      validateLabel,
  emoji:      validateEmoji,
  emojiList:  validateEmojiList,
  amount:     validateAmount,
  coins:      validateCoinAmount,
  days:       validateDays,
  parse:      parseCommand,
  strip:      stripPrefix,
  normalizePhone,
  truncateReason,
  requireValid,
  chain,
  isPhone:    isValidPhone,
  isUrl:      isValidUrl,
  isGroup:    isInGroup,
  isPrivate:  isInPrivate
};