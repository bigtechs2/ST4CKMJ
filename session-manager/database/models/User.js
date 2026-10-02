import mongoose from 'mongoose';

import C from '../../../shared/constants.js';
import config from '../../config.js';

const { Schema, model } = mongoose;

const LAST_SEEN_REASONS = [
  'first-seen',
  'command',
  'message',
  'statusView',
  'statusReact',
  'reaction',
  'payment',
  'premiumGranted',
  'premiumRevoked',
  'coinCredit',
  'coinDebit',
  'manualSync'
];

const UserSchema = new Schema({

  phoneNumber: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true
  },

  name: {
    type:      String,
    default:   '',
    trim:      true,
    maxlength: 50
  },

  pushName: {
    type:      String,
    default:   '',
    trim:      true,
    maxlength: 50
  },

  about: {
    type:      String,
    default:   '',
    maxlength: 139
  },

  profilePic: {
    type:    String,
    default: ''
  },

  accountId: {
    type:    Schema.Types.ObjectId,
    ref:     'Account',
    index:   true,
    default: null
  },

  sessionId: {
    type:    String,
    index:   true,
    default: null
  },

  isSessionOwner: {
    type:    Boolean,
    default: false,
    index:   true
  },

  tier: {
    type:    String,
    enum:    Object.values(C.TIER),
    default: C.TIER.freeUser,
    index:   true
  },

  isPremium: {
    type:    Boolean,
    default: false,
    index:   true
  },

  premiumUntil: {
    type:    Date,
    default: null,
    index:   true
  },

  premiumGrantedBy: {
    type:    String,
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

  totalCommands: {
    type:    Number,
    default: 0
  },

  totalMessages: {
    type:    Number,
    default: 0
  },

  totalStatusViews: {
    type:    Number,
    default: 0
  },

  totalStatusReacts: {
    type:    Number,
    default: 0
  },

  firstSeenAt: {
    type:    Date,
    default: Date.now,
    index:   true
  },

  lastSeen: {
    type:    Date,
    default: Date.now,
    index:   true
  },

  lastSeenReason: {
    type:    String,
    enum:    LAST_SEEN_REASONS,
    default: 'first-seen'
  },

  lastCommand: {
    type:    String,
    default: ''
  },

  lastCommandAt: {
    type:    Date,
    default: null
  },

  isOwner: {
    type:    Boolean,
    default: false,
    index:   true
  },

  isCoOwner: {
    type:    Boolean,
    default: false
  },

  isBlocked: {
    type:    Boolean,
    default: false,
    index:   true
  },

  blockedReason: {
    type:    String,
    default: ''
  },

  blockedAt: {
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

  rateLimit: {
    windowStart: { type: Date,   default: null },
    count:       { type: Number, default: 0 }
  },

  preferences: {
    language:  { type: String, default: 'en' },
    timezone:  { type: String, default: 'Africa/Dar_es_Salaam' },
    silent:    { type: Boolean, default: false },
    autoRead:  { type: Boolean, default: false }
  },

  metadata: {
    type:    Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true,
  versionKey: false
});

UserSchema.index({ sessionId: 1, isBlocked: 1 });
UserSchema.index({ tier: 1, isPremium: 1 });
UserSchema.index({ isPremium: 1, premiumUntil: 1 });
UserSchema.index({ lastSeen: -1 });

UserSchema.virtual('isPremiumActive').get(function () {
  if (!this.isPremium) return false;
  if (!this.premiumUntil) return true;
  return this.premiumUntil.getTime() > Date.now();
});

UserSchema.virtual('isAdmin').get(function () {
  return this.isOwner || this.isCoOwner;
});

UserSchema.virtual('canUseBot').get(function () {
  return !this.isBlocked && !this.isBanned;
});

UserSchema.statics.findByPhone = function (phoneNumber) {
  return this.findOne({ phoneNumber: String(phoneNumber).replace(/\D/g, '') });
};

UserSchema.statics.findBySession = function (sessionId) {
  return this.find({ sessionId }).sort({ lastSeen: -1 });
};

UserSchema.statics.findOrCreate = async function (phoneNumber, defaults = {}) {
  const clean = String(phoneNumber).replace(/\D/g, '');

  let user = await this.findOne({ phoneNumber: clean });
  if (user) return user;

  user = await this.create({
    phoneNumber: clean,
    name:        defaults.name        || '',
    pushName:    defaults.pushName    || '',
    sessionId:   defaults.sessionId   || null,
    accountId:   defaults.accountId   || null,
    isSessionOwner: !!defaults.isSessionOwner,
    tier:        defaults.tier        || C.TIER.freeUser
  });

  return user;
};

UserSchema.statics.countActive = function () {
  return this.countDocuments({ isBlocked: false, isBanned: false });
};

UserSchema.statics.countPremium = function () {
  return this.countDocuments({
    isPremium: true,
    $or: [
      { premiumUntil: null },
      { premiumUntil: { $gt: new Date() } }
    ]
  });
};

UserSchema.methods.touch = function (reason = 'message') {
  this.lastSeen       = new Date();
  this.lastSeenReason = reason;
  return this.save();
};

UserSchema.methods.recordCommand = function (commandName) {
  this.totalCommands += 1;
  this.lastCommand    = commandName;
  this.lastCommandAt  = new Date();
  this.lastSeen       = new Date();
  this.lastSeenReason = 'command';
  return this.save();
};

UserSchema.methods.recordMessage = function () {
  this.totalMessages += 1;
  this.lastSeen       = new Date();
  this.lastSeenReason = 'message';
  return this.save();
};

UserSchema.methods.recordStatusView = function () {
  this.totalStatusViews += 1;
  this.lastSeen          = new Date();
  this.lastSeenReason    = 'statusView';
  return this.save();
};

UserSchema.methods.recordStatusReact = function () {
  this.totalStatusReacts += 1;
  this.lastSeen           = new Date();
  this.lastSeenReason     = 'statusReact';
  return this.save();
};

UserSchema.methods.markOwner = function (co = false) {
  this.isOwner   = !co;
  this.isCoOwner = co;
  this.tier      = co ? C.TIER.sessionOwner : C.TIER.superOwner;
  return this.save();
};

UserSchema.methods.grantPremium = function (days, source = 'manual') {
  const base = this.isPremiumActive && this.premiumUntil
    ? this.premiumUntil.getTime()
    : Date.now();

  this.isPremium        = true;
  this.premiumUntil     = new Date(base + days * 24 * 60 * 60 * 1000);
  this.premiumGrantedBy = source;
  this.tier             = C.TIER.premiumUser;
  this.lastSeen         = new Date();
  this.lastSeenReason   = 'premiumGranted';
  return this.save();
};

UserSchema.methods.revokePremium = function () {
  this.isPremium        = false;
  this.premiumUntil     = null;
  this.premiumGrantedBy = null;

  if (this.tier === C.TIER.premiumUser) {
    this.tier = C.TIER.freeUser;
  }

  this.lastSeen       = new Date();
  this.lastSeenReason = 'premiumRevoked';
  return this.save();
};

UserSchema.methods.addCoins = function (amount, reason = '') {
  const n = Math.max(0, Number(amount) || 0);
  if (!n) return this;

  this.coins            += n;
  this.totalCoinsEarned += n;
  this.lastSeen          = new Date();
  this.lastSeenReason    = 'coinCredit';

  if (!this.metadata.coinHistory) this.metadata.coinHistory = [];
  this.metadata.coinHistory.push({
    type:      'credit',
    amount:    n,
    reason,
    at:        new Date()
  });

  if (this.metadata.coinHistory.length > 100) {
    this.metadata.coinHistory = this.metadata.coinHistory.slice(-100);
  }

  return this.save();
};

UserSchema.methods.spendCoins = function (amount, reason = '') {
  const n = Math.max(0, Number(amount) || 0);
  if (!n) return null;
  if (this.coins < n) return null;

  this.coins           -= n;
  this.totalCoinsSpent += n;
  this.lastSeen         = new Date();
  this.lastSeenReason   = 'coinDebit';

  if (!this.metadata.coinHistory) this.metadata.coinHistory = [];
  this.metadata.coinHistory.push({
    type:      'debit',
    amount:    n,
    reason,
    at:        new Date()
  });

  if (this.metadata.coinHistory.length > 100) {
    this.metadata.coinHistory = this.metadata.coinHistory.slice(-100);
  }

  return this.save();
};

UserSchema.methods.canAfford = function (amount) {
  return this.coins >= Number(amount || 0);
};

UserSchema.methods.canClaimDailyBonus = function () {
  if (!this.lastDailyBonus) return true;
  const diff = Date.now() - this.lastDailyBonus.getTime();
  return diff >= 24 * 60 * 60 * 1000;
};

UserSchema.methods.claimDailyBonus = function () {
  if (!this.canClaimDailyBonus()) return null;

  const streakAlive = this.lastDailyBonus &&
    (Date.now() - this.lastDailyBonus.getTime()) < 48 * 60 * 60 * 1000;

  this.dailyStreak = streakAlive ? this.dailyStreak + 1 : 1;

  const base  = config.coins.dailyBonus;
  const bonus = Math.min(this.dailyStreak, 7) * 2;
  const total = base + bonus;

  this.lastDailyBonus = new Date();
  this.addCoins(total, `daily-streak-${this.dailyStreak}`);

  return {
    coins:  total,
    streak: this.dailyStreak
  };
};

UserSchema.methods.checkRateLimit = function () {
  const now    = new Date();
  const window = 60 * 1000;
  const limit  = config.limits.rateLimitPerMinute;

  if (!this.rateLimit.windowStart ||
      now.getTime() - this.rateLimit.windowStart.getTime() > window) {
    this.rateLimit.windowStart = now;
    this.rateLimit.count       = 1;
    return { allowed: true, remaining: limit - 1 };
  }

  this.rateLimit.count += 1;

  if (this.rateLimit.count > limit) {
    const resetIn = window - (now.getTime() - this.rateLimit.windowStart.getTime());
    return { allowed: false, resetIn: Math.ceil(resetIn / 1000) };
  }

  return { allowed: true, remaining: limit - this.rateLimit.count };
};

UserSchema.methods.block = function (reason = '') {
  this.isBlocked     = true;
  this.blockedReason = reason;
  this.blockedAt     = new Date();
  return this.save();
};

UserSchema.methods.unblock = function () {
  this.isBlocked     = false;
  this.blockedReason = '';
  this.blockedAt     = null;
  return this.save();
};

UserSchema.methods.ban = function (reason = '') {
  this.isBanned     = true;
  this.bannedReason = reason;
  this.bannedAt     = new Date();
  return this.save();
};

UserSchema.methods.unban = function () {
  this.isBanned     = false;
  this.bannedReason = '';
  this.bannedAt     = null;
  return this.save();
};

const User = model('User', UserSchema);

export default User;