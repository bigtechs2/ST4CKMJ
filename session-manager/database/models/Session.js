import mongoose from 'mongoose';

import C from '../../../shared/constants.js';

const { Schema, model } = mongoose;

const LAST_SEEN_REASONS = [
  'paired',
  'connected',
  'reconnected',
  'disconnected',
  'loggedOut',
  'banned',
  'command',
  'message',
  'statusView',
  'statusReact',
  'heartbeat',
  'premiumGranted',
  'premiumRevoked',
  'manualSync'
];

const SessionSchema = new Schema({

  sessionId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true
  },

  accountId: {
    type:    Schema.Types.ObjectId,
    ref:     'Account',
    index:   true,
    default: null
  },

  userName: {
    type:      String,
    required:  true,
    trim:      true,
    maxlength: 30
  },

  phoneNumber: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true
  },

  label: {
    type:      String,
    trim:      true,
    maxlength: 20,
    default:   ''
  },

  source: {
    type:    String,
    enum:    Object.values(C.SOURCE),
    default: C.SOURCE.website,
    index:   true
  },

  status: {
    type:    String,
    enum:    Object.values(C.SESSION_STATE),
    default: C.SESSION_STATE.pairing,
    index:   true
  },

  statusReason: {
    type:    String,
    default: ''
  },

  premium: {
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
    enum:    ['sonicpesa', 'telegram', 'manual', 'admin', 'trial', null],
    default: null
  },

  followedChannel: {
    type:    Boolean,
    default: false
  },

  welcomeSent: {
    type:    Boolean,
    default: false
  },

  customBotName: {
    type:      String,
    default:   '',
    maxlength: 30
  },

  customBotPic: {
    type:    String,
    default: ''
  },

  customBotAbout: {
    type:      String,
    default:   '',
    maxlength: 139
  },

  customBotStatus: {
    type:      String,
    default:   '',
    maxlength: 139
  },

  deviceInfo: {
    platform: { type: String, default: '' },
    version:  { type: String, default: '' },
    os:       { type: String, default: '' }
  },

  ipAddress: {
    type:    String,
    default: ''
  },

  userAgent: {
    type:    String,
    default: ''
  },

  pairedAt: {
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
    default: 'paired'
  },

  lastCommandAt: {
    type:    Date,
    default: null
  },

  totalCommands: {
    type:    Number,
    default: 0
  },

  totalMessages: {
    type:    Number,
    default: 0
  },

  reconnectCount: {
    type:    Number,
    default: 0
  },

  reconnectAttempts: {
    type:    Number,
    default: 0
  },

  lastReconnectAt: {
    type:    Date,
    default: null
  },

  lastDisconnectCode: {
    type:    Number,
    default: null
  },

  lastDisconnectAt: {
    type:    Date,
    default: null
  },

  bannedAt: {
    type:    Date,
    default: null
  },

  bannedReason: {
    type:    String,
    default: ''
  },

  bannedUntil: {
    type:    Date,
    default: null
  },

  deletedAt: {
    type:    Date,
    default: null
  },

  metadata: {
    type:    Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true,
  versionKey: false
});

SessionSchema.index({ accountId: 1, status: 1 });
SessionSchema.index({ premium: 1, premiumUntil: 1 });
SessionSchema.index({ source: 1, status: 1 });
SessionSchema.index({ status: 1, lastSeen: -1 });
SessionSchema.index({ createdAt: -1 });

SessionSchema.virtual('isPremiumActive').get(function () {
  if (!this.premium) return false;
  if (!this.premiumUntil) return true;
  return this.premiumUntil.getTime() > Date.now();
});

SessionSchema.virtual('isOnline').get(function () {
  return this.status === C.SESSION_STATE.connected;
});

SessionSchema.virtual('isBanned').get(function () {
  return this.status === C.SESSION_STATE.banned;
});

SessionSchema.methods.touch = function (reason = 'heartbeat') {
  this.lastSeen       = new Date();
  this.lastSeenReason = reason;
  return this.save();
};

SessionSchema.methods.markConnected = function (reason = 'connected') {
  this.status         = C.SESSION_STATE.connected;
  this.statusReason   = '';
  this.lastSeen       = new Date();
  this.lastSeenReason = reason;
  this.reconnectAttempts = 0;
  return this.save();
};

SessionSchema.methods.markDisconnected = function (code = null, reason = '') {
  this.status             = C.SESSION_STATE.disconnected;
  this.statusReason       = reason;
  this.lastSeen           = new Date();
  this.lastSeenReason     = 'disconnected';
  this.lastDisconnectCode = code;
  this.lastDisconnectAt   = new Date();
  return this.save();
};

SessionSchema.methods.markReconnecting = function () {
  this.status             = C.SESSION_STATE.connecting;
  this.reconnectAttempts += 1;
  this.lastReconnectAt    = new Date();
  return this.save();
};

SessionSchema.methods.markLoggedOut = function () {
  this.status         = C.SESSION_STATE.loggedOut;
  this.statusReason   = 'WhatsApp logged out this device';
  this.lastSeen       = new Date();
  this.lastSeenReason = 'loggedOut';
  return this.save();
};

SessionSchema.methods.markBanned = function (reason = '', bannedUntil = null) {
  this.status         = C.SESSION_STATE.banned;
  this.statusReason   = reason;
  this.bannedAt       = new Date();
  this.bannedReason   = reason;
  this.bannedUntil    = bannedUntil;
  this.lastSeen       = new Date();
  this.lastSeenReason = 'banned';
  this.premium        = false;
  this.premiumUntil   = null;
  return this.save();
};

SessionSchema.methods.markBroken = function (reason = '') {
  this.status         = C.SESSION_STATE.broken;
  this.statusReason   = reason;
  this.lastSeen       = new Date();
  this.lastSeenReason = 'disconnected';
  return this.save();
};

SessionSchema.methods.incrementCommands = function () {
  this.totalCommands += 1;
  this.lastCommandAt  = new Date();
  this.lastSeen       = new Date();
  this.lastSeenReason = 'command';
  return this.save();
};

SessionSchema.methods.incrementMessages = function () {
  this.totalMessages += 1;
  return this.save();
};

SessionSchema.methods.grantPremium = function (days, source = 'manual') {
  const base = this.isPremiumActive && this.premiumUntil
    ? this.premiumUntil.getTime()
    : Date.now();

  this.premium          = true;
  this.premiumUntil     = new Date(base + days * 24 * 60 * 60 * 1000);
  this.premiumGrantedBy = source;
  this.lastSeen         = new Date();
  this.lastSeenReason   = 'premiumGranted';
  return this.save();
};

SessionSchema.methods.revokePremium = function () {
  this.premium          = false;
  this.premiumUntil     = null;
  this.premiumGrantedBy = null;
  this.lastSeen         = new Date();
  this.lastSeenReason   = 'premiumRevoked';
  return this.save();
};

SessionSchema.statics.findByPhone = function (phoneNumber) {
  return this.findOne({
    phoneNumber: String(phoneNumber).replace(/\D/g, ''),
    deletedAt:   null
  });
};

SessionSchema.statics.findBySessionId = function (sessionId) {
  return this.findOne({ sessionId, deletedAt: null });
};

SessionSchema.statics.findByAccount = function (accountId) {
  return this.find({ accountId, deletedAt: null }).sort({ createdAt: -1 });
};

SessionSchema.statics.findAllActive = function () {
  return this.find({
    status:    { $nin: [C.SESSION_STATE.banned, C.SESSION_STATE.loggedOut, C.SESSION_STATE.broken] },
    deletedAt: null
  });
};

SessionSchema.statics.countActive = function () {
  return this.countDocuments({
    status:    C.SESSION_STATE.connected,
    deletedAt: null
  });
};

SessionSchema.statics.countPremium = function () {
  return this.countDocuments({
    premium:   true,
    deletedAt: null,
    $or: [
      { premiumUntil: null },
      { premiumUntil: { $gt: new Date() } }
    ]
  });
};

SessionSchema.statics.countBanned = function () {
  return this.countDocuments({
    status:    C.SESSION_STATE.banned,
    deletedAt: null
  });
};

SessionSchema.statics.softDelete = function (sessionId) {
  return this.updateOne(
    { sessionId },
    { $set: { deletedAt: new Date(), status: C.SESSION_STATE.disconnected } }
  );
};

const Session = model('Session', SessionSchema);

export default Session;