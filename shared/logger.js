'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./constants');

const COLORS = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  italic:  '\x1b[3m',

  black:   '\x1b[30m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  grey:    '\x1b[90m',

  bgRed:    '\x1b[41m',
  bgGreen:  '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue:   '\x1b[44m'
};

const LEVEL_STYLE = {
  info:  { label: ' INFO ', color: COLORS.cyan,   bg: ''           },
  warn:  { label: ' WARN ', color: COLORS.yellow, bg: ''           },
  error: { label: ' ERR  ', color: COLORS.red,    bg: ''           },
  debug: { label: ' DBG  ', color: COLORS.grey,   bg: ''           },
  ready: { label: ' READY', color: COLORS.green,  bg: ''           },
  event: { label: ' EVENT', color: COLORS.magenta,bg: ''           }
};

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

let currentScope = 'app';
let fileStream = null;
let fileStreamDate = null;

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (err) {
    // Silent — falling back to console only
  }
}

function getFileStream() {
  const today = new Date().toISOString().slice(0, 10);

  if (fileStream && fileStreamDate === today) return fileStream;

  if (fileStream) {
    try { fileStream.end(); } catch {}
    fileStream = null;
  }

  ensureLogDir();

  const filePath = path.join(LOG_DIR, `${today}.log`);
  try {
    fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    fileStreamDate = today;
  } catch {
    fileStream = null;
  }

  return fileStream;
}

function timestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');

  return (
    d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds()) + '.' +
    pad(d.getMilliseconds(), 3)
  );
}

function timeShort() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatArg(arg) {
  if (arg === null)      return 'null';
  if (arg === undefined) return 'undefined';
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg, null, 0);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function writeLine(level, args) {
  const style = LEVEL_STYLE[level] || LEVEL_STYLE.info;
  const scoped = `[${currentScope}]`;
  const message = args.map(formatArg).join(' ');

  const consoleLine =
    `${COLORS.dim}${timeShort()}${COLORS.reset} ` +
    `${style.color}${COLORS.bold}${style.label}${COLORS.reset} ` +
    `${COLORS.grey}${scoped.padEnd(18)}${COLORS.reset} ` +
    `${message}`;

  if (level === 'error') {
    process.stderr.write(consoleLine + '\n');
  } else {
    process.stdout.write(consoleLine + '\n');
  }

  const stream = getFileStream();
  if (stream) {
    const fileLine = `${timestamp()} [${level.toUpperCase().padEnd(5)}] [${currentScope}] ${message}`;
    stream.write(fileLine + '\n');
  }
}

const logger = {

  scope(name) {
    if (typeof name === 'string' && name.length) {
      currentScope = name;
    }
    return logger;
  },

  info(...args)  { writeLine('info',  args); return logger; },
  warn(...args)  { writeLine('warn',  args); return logger; },
  error(...args) { writeLine('error', args); return logger; },
  debug(...args) {
    if (process.env.NODE_ENV === 'production' && process.env.DEBUG !== 'true') {
      return logger;
    }
    writeLine('debug', args);
    return logger;
  },
  ready(...args) { writeLine('ready', args); return logger; },
  event(...args) { writeLine('event', args); return logger; },

  blank() {
    process.stdout.write('\n');
    return logger;
  },

  divider(char = '─', length = 60) {
    const line = char.repeat(length);
    process.stdout.write(`${COLORS.grey}${line}${COLORS.reset}\n`);
    return logger;
  },

  banner(title, subtitle) {
    const width = 60;
    const pad = (str, len) => {
      const s = String(str);
      const total = len - s.length;
      const left = Math.floor(total / 2);
      const right = total - left;
      return ' '.repeat(Math.max(0, left)) + s + ' '.repeat(Math.max(0, right));
    };

    process.stdout.write('\n');
    process.stdout.write(`${COLORS.grey}┌${'─'.repeat(width)}┐${COLORS.reset}\n`);
    process.stdout.write(`${COLORS.grey}│${COLORS.reset}${COLORS.bold}${COLORS.white}${pad(title, width)}${COLORS.reset}${COLORS.grey}│${COLORS.reset}\n`);
    if (subtitle) {
      process.stdout.write(`${COLORS.grey}│${COLORS.reset}${COLORS.dim}${pad(subtitle, width)}${COLORS.reset}${COLORS.grey}│${COLORS.reset}\n`);
    }
    process.stdout.write(`${COLORS.grey}└${'─'.repeat(width)}┘${COLORS.reset}\n\n`);

    return logger;
  },

  child(scopeName) {
    const childScope = scopeName || currentScope;

    return {
      info:  (...args) => writeLine('info',  [`[${childScope}]`, ...args]),
      warn:  (...args) => writeLine('warn',  [`[${childScope}]`, ...args]),
      error: (...args) => writeLine('error', [`[${childScope}]`, ...args]),
      debug: (...args) => {
        if (process.env.NODE_ENV === 'production' && process.env.DEBUG !== 'true') return;
        writeLine('debug', [`[${childScope}]`, ...args]);
      },
      ready: (...args) => writeLine('ready', [`[${childScope}]`, ...args]),
      event: (...args) => writeLine('event', [`[${childScope}]`, ...args])
    };
  },

  close() {
    if (fileStream) {
      try { fileStream.end(); } catch {}
      fileStream = null;
    }
  }

};

process.on('exit', () => logger.close());
process.on('SIGINT', () => { logger.close(); process.exit(0); });
process.on('SIGTERM', () => { logger.close(); process.exit(0); });

module.exports = logger;