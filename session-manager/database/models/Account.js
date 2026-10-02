import mongoose from 'mongoose';
import crypto from 'crypto';

import C from '../../../shared/constants.js';
import config from '../../config.js';

const { Schema, model } = mongoose;

const AccountSchema = new Schema({

  username: {
    type:      String,
    required:  true,
    unique:    true,
    index:     true,
    trim:      true,
    minlength: config.auth.usernameMinLength,
    maxlength: config.auth.usernameMaxLength
  },

  usernameLower: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true,
    lowercase: true
  },

  displayName: {
    type:      String,
    required:  true,
    trim:      true,
    maxlength: 30
  },

  email: {
    type:      String,
    default:   '',
    trim:      true,
    lowercase: true,
    index:     true,
    sparse:    true
  },

  emailVerified: {
    type:    Boolean,
    default: false
  },

  passwordHash: {
    type:    String,
    default: null
  },

  telegramId: {
    type:    String,
    default: null,
    index:   true,
    sparse:  true
  },

  telegramUsername: {
    type:    String,
    default: '',
    trim:    true
  },

  accountType: {
    type:    String,
    enum:    Object.values(C.ACCOUNT_TYPE),
    default: C.ACCOUNT_TYPE.website,
    index:   true
  },

  recoveryHash: {
    type:    String,
    default: null
  },

  recoveryUsed: {
    type:    Boolean,
    default: false
  },

  recoveryCreatedAt: {
    type:    Date,
    default: null
  },

  resetToken: {
    type:    String,
    default: null
  },

  resetExpires: {
    type:    Date,
    default: null
  },

  coins: {
    type:    Number,
    default: config.coins.startingBalance,
    min:     0
  },

  totalCoinsEarned: {
    type:    Number,
    default: 0
  },

  totalCoinsSpent: {
    type:    Number,
    default: 0
  },

  lastDailyBonus: {
    type:    Date,
    default: null
  },

  dailyStreak: {
    type:    Number,
    default: 0
  },

  referrals: {
    type:    [String],
    default: []
  },

  referredBy: {
    type:    String,
    default: null
  },

  plan: {
    type:    String,
    enum:    Object.values(C.PLAN),
    default: C.PLAN.free,
    index:   true
  },

  premiumUntil: {
    type:    Date,
    default: null
  },

  isBanned: {
    type:    Boolean,
    default: false,
    index:   true
  },

  bannedReason: {
    type:    String,
    default: ''
  },

  bannedAt: {
    type:    Date,
    default: null
  },

  isActive: {
    type:    Boolean,
    default: true
  },

  lastLogin: {
    type:    Date,
    default: null
  },

  lastLoginIp: {
    type:    String,
    default: ''
  },

  loginCount: {
    type:    Number,
    default: 0
  },

  sessions: {
    type:    [String],
    default: []
  },

  notificationPrefs: {
    email:    { type: Boolean, default: false },
    telegram: { type: Boolean, default: true }
  },

  metadata: {
    type:    Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true,
  versionKey: false
});

AccountSchema.index({ email: 1 }, { sparse: true });
AccountSchema.index({ telegramId: 1 }, { sparse: true });
AccountSchema.index({ plan: 1, premiumUntil: 1 });

AccountSchema.virtual('isPremiumActive').get(function () {
  if (this.plan !== C.PLAN.premium) return false;
  if (!this.premiumUntil) return true;
  return this.premiumUntil.getTime() > Date.now();
});

AccountSchema.virtual('hasPassword').get(function () {
  return typeof this.passwordHash === 'string' && this.passwordHash.length > 0;
});

AccountSchema.virtual('hasTelegram').get(function () {
  return typeof this.telegramId === 'string' && this.telegramId.length > 0;
});

AccountSchema.virtual('hasRecovery').get(function () {
  return typeof this.recoveryHash === 'string' && this.recoveryHash.length > 0 && !this.recoveryUsed;
});

AccountSchema.pre('save', function (next) {
  if (this.isModified('username') && this.username) {
    this.usernameLower = this.username.toLowerCase();
  }
  next();
});

AccountSchema.statics.findByUsername = function (username) {
  return this.findOne({ usernameLower: String(username).toLowerCase() });
};

AccountSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: String(email).toLowerCase() });
};

AccountSchema.statics.findByTelegram = function (telegramId) {
  return this.findOne({ telegramId: String(telegramId) });
};

AccountSchema.statics.usernameExists = async function (username) {
  const count = await this.countDocuments({ usernameLower: String(username).toLowerCase() });
  return count > 0;
};

AccountSchema.statics.generateUsername = async function (base) {
  const clean = String(base || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, config.auth.usernameMaxLength - 3) || 'user';

  let candidate = clean;
  let suffix = 0;

  while (await this.usernameExists(candidate)) {
    suffix += 1;
    candidate = `${clean}${suffix}`;
    if (suffix > 9999) {
      candidate = `${clean}${Date.now().toString().slice(-6)}`;
      break;
    }
  }

  return candidate;
};

AccountSchema.methods.recordLogin = function (ip = '') {
  this.lastLogin   = new Date();
  this.lastLoginIp = ip || this.lastLoginIp;
  this.loginCount += 1;
  return this.save();
};

AccountSchema.methods.linkSession = function (sessionId) {
  if (!this.sessions.includes(sessionId)) {
    this.sessions.push(sessionId);
  }
  return this.save();
};

AccountSchema.methods.unlinkSession = function (sessionId) {
  this.sessions = this.sessions.filter((s) => s !== sessionId);
  return this.save();
};

AccountSchema.methods.addCoins = function (amount, reason = '') {
  const n = Math.max(0, Number(amount) || 0);
  if (!n) return this;

  this.coins            += n;
  this.totalCoinsEarned += n;

  if (!this.metadata.coinHistory) this.metadata.coinHistory = [];
  this.metadata.coinHistory.push({
    type:      'credit',
    amount:    n,
    reason,
    createdAt: new Date()
  });

  if (this.metadata.coinHistory.length > 100) {
    this.metadata.coinHistory = this.metadata.coinHistory.slice(-100);
  }

  return this.save();
};

AccountSchema.methods.spendCoins = function (amount, reason = '') {
  const n = Math.max(0, Number(amount) || 0);
  if (!n || this.coins < n) return null;

  this.coins           -= n;
  this.totalCoinsSpent += n;

  if (!this.metadata.coinHistory) this.metadata.coinHistory = [];
  this.metadata.coinHistory.push({
    type:      'debit',
    amount:    n,
    reason,
    createdAt: new Date()
  });

  if (this.metadata.coinHistory.length > 100) {
    this.metadata.coinHistory = this.metadata.coinHistory.slice(-100);
  }

  return this.save();
};

AccountSchema.methods.canClaimDailyBonus = function () {
  if (!this.lastDailyBonus) return true;
  const diff = Date.now() - this.lastDailyBonus.getTime();
  return diff >= 24 * 60 * 60 * 1000;
};

AccountSchema.methods.claimDailyBonus = function () {
  if (!this.canClaimDailyBonus()) return null;

  const streakAlive = this.lastDailyBonus &&
    (Date.now() - this.lastDailyBonus.getTime()) < 48 * 60 * 60 * 1000;

  this.dailyStreak = streakAlive ? this.dailyStreak + 1 : 1;

  const base      = config.coins.dailyBonus;
  const bonus     = Math.min(this.dailyStreak, 7) * 2;
  const totalCoins = base + bonus;

  this.lastDailyBonus = new Date();
  this.addCoins(totalCoins, `daily-bonus-day-${this.dailyStreak}`);

  return {
    coins:  totalCoins,
    streak: this.dailyStreak
  };
};

AccountSchema.methods.grantPremium = function (days, source = 'manual') {
  const base = this.isPremiumActive && this.premiumUntil
    ? this.premiumUntil.getTime()
    : Date.now();

  this.plan         = C.PLAN.premium;
  this.premiumUntil = new Date(base + days * 24 * 60 * 60 * 1000);
  this.metadata.premiumSource = source;

  return this.save();
};

AccountSchema.methods.revokePremium = function () {
  this.plan         = C.PLAN.free;
  this.premiumUntil = null;
  return this.save();
};

AccountSchema.methods.setPassword = function (hash) {
  this.passwordHash = hash;
  return this.save();
};

AccountSchema.methods.setRecovery = function (hash) {
  this.recoveryHash      = hash;
  this.recoveryUsed      = false;
  this.recoveryCreatedAt = new Date();
  return this.save();
};

AccountSchema.methods.useRecovery = function () {
  this.recoveryUsed = true;
  return this.save();
};

AccountSchema.methods.createResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetToken   = crypto.createHash('sha256').update(token).digest('hex');
  this.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
  return this.save().then(() => token);
};

AccountSchema.methods.verifyResetToken = function (token) {
  if (!this.resetToken || !this.resetExpires) return false;
  if (this.resetExpires.getTime() < Date.now()) return false;

  const hashed = crypto.createHash('sha256').update(String(token)).digest('hex');
  return hashed === this.resetToken;
};

AccountSchema.methods.clearResetToken = function () {
  this.resetToken   = null;
  this.resetExpires = null;
  return this.save();
};

const Account = model('Account', AccountSchema);

export default Account;