'use strict';

const brand = require('./brand');
const C = require('./constants');

const NUM_NORMAL = brand.NUM.normal;
const NUM_BLACK  = brand.NUM.black;
const NUM_ALPHA  = brand.NUM.alpha;

function toCircle(n) {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0 || i > 9) return String(n);
  return NUM_NORMAL[i];
}

function toBlackCircle(n) {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0 || i > 9) return String(n);
  return NUM_BLACK[i];
}

function toAlpha(n) {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0 || i > 25) return String(n);
  return NUM_ALPHA[i];
}

function toNumbered(items, style = 'normal') {
  if (!Array.isArray(items)) return [];
  const map = style === 'black' ? NUM_BLACK : NUM_NORMAL;
  return items.map((item, i) => {
    const n = i < 10 ? map[i] : `(${i + 1})`;
    return `${n} ${item}`;
  });
}

function toNumberedLines(items, style = 'normal', prefix = '') {
  return toNumbered(items, style)
    .map(line => `${prefix}${line}`)
    .join('\n');
}

function formatBytes(bytes, decimals = 1) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  const value = n / Math.pow(1024, idx);

  return `${value.toFixed(decimals)} ${units[idx]}`;
}

function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '0:00';

  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatUptime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '0s';

  const days    = Math.floor(s / 86400);
  const hours   = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs    = Math.floor(s % 60);

  const parts = [];
  if (days)    parts.push(`${days}d`);
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs && !days) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

function formatPhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 12 && digits.startsWith('255')) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }

  if (digits.length >= 10) {
    const cc = digits.length > 11 ? digits.slice(0, 3) : digits.slice(0, 2);
    const rest = digits.slice(cc.length);
    const grouped = rest.replace(/(\d{3})(?=\d)/g, '$1 ');
    return `+${cc} ${grouped}`;
  }

  return digits;
}

function maskPhone(number, keep = 3) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length <= keep * 2) return digits;

  const head = digits.slice(0, keep + 1);
  const tail = digits.slice(-keep);
  const stars = '*'.repeat(Math.max(3, digits.length - head.length - tail.length));

  return `${head}${stars}${tail}`;
}

function truncate(str, max = 50, suffix = '…') {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  return s.slice(0, max - suffix.length) + suffix;
}

function truncateMiddle(str, max = 30, sep = '…') {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  const side = Math.floor((max - sep.length) / 2);
  return s.slice(0, side) + sep + s.slice(-side);
}

function sanitizeFilename(name, fallback = 'file') {
  const base = String(name || fallback)
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  return base || fallback;
}

function capitalize(str) {
  const s = String(str ?? '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function titleCase(str) {
  return String(str ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ');
}

function pad(n, len = 2, char = '0') {
  return String(n).padStart(len, char);
}

function formatDate(date, style = 'short') {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());

  switch (style) {
    case 'time':  return `${h}:${min}`;
    case 'timeS': return `${h}:${min}:${s}`;
    case 'date':  return `${day}/${m}/${y}`;
    case 'iso':   return `${y}-${m}-${day}`;
    case 'full':  return `${day}/${m}/${y} ${h}:${min}`;
    case 'log':   return `${y}-${m}-${day} ${h}:${min}:${s}`;
    case 'long':  return `${day} ${monthName(d.getMonth())} ${y}, ${h}:${min}`;
    default:      return `${day}/${m}/${y} ${h}:${min}`;
  }
}

function monthName(index) {
  const months = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  return months[index] || '';
}

function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5)        return 'just now';
  if (seconds < 60)       return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)       return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)         return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)          return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12)        return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `0 ${currency || ''}`.trim();

  const formatted = n
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formatted} ${currency || ''}`.trim();
}

function formatCoins(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.floor(v));
}

function formatPercent(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(decimals)}%`;
}

function formatLatency(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1) return '<1ms';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function formatNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.floor(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatSessionStatus(state) {
  return C.SESSION_STATUS_LABEL[state] || state || '—';
}

function formatPaymentState(state) {
  return C.PAYMENT_STATE_LABEL[state] || state || '—';
}

function formatTier(tier) {
  return C.TIER_LABEL[tier] || tier || '—';
}

function formatPlan(plan) {
  const p = String(plan || 'free').toLowerCase();
  if (p === 'premium') return 'Premium';
  return 'Free';
}

function formatList(items, { bullet = '·', indent = '   ' } = {}) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map(item => `${indent}${bullet} ${item}`).join('\n');
}

function formatKeyValue(pairs, { sep = '➩', indent = '   ' } = {}) {
  if (!pairs || typeof pairs !== 'object') return '';
  return Object.entries(pairs)
    .map(([k, v]) => `${indent}${sep} ${k}: ${v}`)
    .join('\n');
}

function joinLines(...lines) {
  return lines.filter(Boolean).join('\n');
}

function joinSpaced(...lines) {
  return lines.filter(Boolean).join('\n\n');
}

function pluralize(count, singular, plural) {
  const n = Number(count);
  if (n === 1) return `${n} ${singular}`;
  return `${n} ${plural ?? singular + 's'}`;
}

function shortHash(str, length = 8) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= length) return s;
  return s.slice(0, length);
}

function padRight(str, len, char = ' ') {
  return String(str ?? '').padEnd(len, char);
}

function padLeft(str, len, char = ' ') {
  return String(str ?? '').padStart(len, char);
}

function linesToArray(str) {
  return String(str ?? '')
    .split('\n')
    .map(l => l.trimEnd())
    .filter(Boolean);
}

function humanList(items, { max = 3, sep = ', ', last = ' and ' } = {}) {
  const arr = Array.isArray(items) ? items.slice() : [];
  if (!arr.length) return '';

  if (arr.length <= max) {
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + last + arr[1];
    return arr.slice(0, -1).join(sep) + last + arr[arr.length - 1];
  }

  const remaining = arr.length - max;
  return arr.slice(0, max).join(sep) + last + `${remaining} more`;
}

module.exports = {
  toCircle,
  toBlackCircle,
  toAlpha,
  toNumbered,
  toNumberedLines,

  formatBytes,
  formatDuration,
  formatUptime,
  formatPhone,
  maskPhone,
  truncate,
  truncateMiddle,
  sanitizeFilename,

  capitalize,
  titleCase,
  pad,
  padRight,
  padLeft,

  formatDate,
  monthName,
  timeAgo,

  formatMoney,
  formatCoins,
  formatPercent,
  formatLatency,
  formatNumber,

  formatSessionStatus,
  formatPaymentState,
  formatTier,
  formatPlan,

  formatList,
  formatKeyValue,
  joinLines,
  joinSpaced,
  linesToArray,
  humanList,

  pluralize,
  shortHash
};