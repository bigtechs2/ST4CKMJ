import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import config from '../config.js';
import C from '../../shared/constants.js';
import logger from '../../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const log = logger.child('commandLoader');

const COMMANDS_DIR = path.join(__dirname, '..', 'minibot', 'commands');

const commands = new Map();
const byCategory = new Map();
const byName = new Map();

let loaded = false;

function isValidCategory(name) {
  return C.CATEGORIES.includes(name);
}

function validateCommand(cmd, filePath) {
  const errors = [];

  if (!cmd || typeof cmd !== 'object') {
    errors.push('not a valid module');
    return errors;
  }

  if (typeof cmd.name !== 'string' || !cmd.name.trim()) {
    errors.push('missing or invalid "name"');
  }

  if (typeof cmd.category !== 'string' || !cmd.category.trim()) {
    errors.push('missing or invalid "category"');
  } else if (!isValidCategory(cmd.category)) {
    errors.push(`unknown category "${cmd.category}"`);
  }

  if (typeof cmd.code !== 'function') {
    errors.push('missing "code" function');
  }

  if (cmd.aliases && !Array.isArray(cmd.aliases)) {
    errors.push('"aliases" must be an array');
  }

  if (cmd.permissions && typeof cmd.permissions !== 'object') {
    errors.push('"permissions" must be an object');
  }

  return errors;
}

function normalizeCommand(cmd, filePath) {
  return {
    name:        String(cmd.name).toLowerCase().trim(),
    aliases:     (cmd.aliases || []).map((a) => String(a).toLowerCase().trim()),
    category:    String(cmd.category).toLowerCase().trim(),
    description: cmd.description || '',
    emoji:       cmd.emoji || C.SYM?.diamond || '⟡',
    usage:       cmd.usage || '',
    permissions: {
      coin:    typeof cmd.permissions?.coin === 'number' ? cmd.permissions.coin : 0,
      owner:   cmd.permissions?.owner   === true,
      admin:   cmd.permissions?.admin   === true,
      premium: cmd.permissions?.premium === true,
      group:   cmd.permissions?.group   === true,
      private: cmd.permissions?.private === true
    },
    code:     cmd.code,
    callbacks: Array.isArray(cmd.callbacks) ? cmd.callbacks : [],
    filePath,
    fileName: path.basename(filePath)
  };
}

async function loadFile(filePath) {
  try {
    const fileUrl = pathToFileURL(filePath).href;

    const mod = await import(`${fileUrl}?t=${Date.now()}`);
    const cmd = mod.default || mod;

    const errors = validateCommand(cmd, filePath);
    if (errors.length) {
      log.warn(`Skipped ${path.basename(filePath)} — ${errors.join(', ')}`);
      return null;
    }

    return normalizeCommand(cmd, filePath);
  } catch (err) {
    log.error(`Failed to load ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

async function walkCategory(categoryName) {
  const categoryPath = path.join(COMMANDS_DIR, categoryName);

  if (!fs.existsSync(categoryPath)) return [];

  const entries = fs.readdirSync(categoryPath);
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(categoryPath, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) continue;
    if (!entry.endsWith('.js')) continue;
    if (entry.startsWith('_')) continue;

    const cmd = await loadFile(fullPath);

    if (cmd) {
      cmd.category = categoryName;
      results.push(cmd);
    }
  }

  return results;
}

async function loadAll() {
  if (loaded) return commands;

  commands.clear();
  byCategory.clear();
  byName.clear();

  if (!fs.existsSync(COMMANDS_DIR)) {
    log.warn(`Commands directory not found: ${COMMANDS_DIR}`);
    loaded = true;
    return commands;
  }

  const categoryFolders = fs.readdirSync(COMMANDS_DIR).filter((entry) => {
    const fullPath = path.join(COMMANDS_DIR, entry);
    return fs.statSync(fullPath).isDirectory();
  });

  let total = 0;

  for (const categoryName of categoryFolders) {
    const cmds = await walkCategory(categoryName);

    if (!cmds.length) continue;

    byCategory.set(categoryName, cmds);

    for (const cmd of cmds) {
      if (byName.has(cmd.name)) {
        log.warn(`Duplicate command "${cmd.name}" — overwriting`);
      }

      byName.set(cmd.name, cmd);
      commands.set(cmd.name, cmd);

      for (const alias of cmd.aliases) {
        if (byName.has(alias)) {
          log.warn(`Duplicate alias "${alias}" for ${cmd.name}`);
          continue;
        }
        byName.set(alias, cmd);
        commands.set(alias, cmd);
      }

      total += 1;
    }
  }

  loaded = true;
  log.ready(`Loaded ${total} commands across ${byCategory.size} categories`);

  return commands;
}

function get(name) {
  if (!name) return null;
  return byName.get(String(name).toLowerCase().trim()) || null;
}

function has(name) {
  return !!get(name);
}

function all() {
  return Array.from(new Set(commands.values()));
}

function categories() {
  return Array.from(byCategory.keys());
}

function getCategory(categoryName) {
  return byCategory.get(categoryName) || [];
}

function getCategoriesInOrder() {
  const order = config.categoryOrder || C.CATEGORIES;
  const result = [];

  for (const cat of order) {
    const cmds = byCategory.get(cat);
    if (cmds && cmds.length) {
      result.push({
        name:  cat,
        meta:  config.categories?.[cat] || { symbol: '·', label: cat },
        commands: cmds.map((c) => ({
          name:        c.name,
          description: c.description,
          usage:       c.usage,
          emoji:       c.emoji,
          premium:     c.permissions.premium,
          owner:       c.permissions.owner,
          admin:       c.permissions.admin,
          coin:        c.permissions.coin
        }))
      });
    }
  }

  return result;
}

function search(term) {
  const q = String(term || '').toLowerCase().trim();
  if (!q) return [];

  const results = [];

  for (const cmd of all()) {
    if (cmd.name.includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.aliases.some((a) => a.includes(q))) {
      results.push(cmd);
    }
  }

  return results;
}

function findByCategory(categoryName) {
  return byCategory.get(categoryName) || [];
}

function stats() {
  const list = all();

  return {
    total:        list.length,
    categories:   byCategory.size,
    premium:      list.filter((c) => c.permissions.premium).length,
    ownerOnly:    list.filter((c) => c.permissions.owner).length,
    adminOnly:    list.filter((c) => c.permissions.admin).length,
    freeCommands: list.filter((c) => c.permissions.coin === 0).length,
    paidCommands: list.filter((c) => c.permissions.coin > 0).length
  };
}

function reload() {
  loaded = false;
  return loadAll();
}

function register(cmd) {
  if (!cmd || !cmd.name) return false;

  const normalized = normalizeCommand(cmd, 'manual');

  byName.set(normalized.name, normalized);

  for (const alias of normalized.aliases) {
    if (!byName.has(alias)) {
      byName.set(alias, normalized);
    }
  }

  const cat = byCategory.get(normalized.category) || [];
  cat.push(normalized);
  byCategory.set(normalized.category, cat);

  return true;
}

export {
  loadAll,
  reload,
  get,
  has,
  all,
  categories,
  getCategory,
  getCategoriesInOrder,
  findByCategory,
  search,
  stats,
  register
};

export default {
  loadAll,
  reload,
  get,
  has,
  all,
  categories,
  getCategory,
  getCategoriesInOrder,
  findByCategory,
  search,
  stats,
  register
};