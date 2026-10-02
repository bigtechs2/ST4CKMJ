import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const DEFAULT_REACT_EMOJIS = ['🖤', '🤎', '🤍', '💜', '💚'];

const SessionConfigSchema = new Schema({

  sessionId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true
  },

  phoneNumber: {
    type:     String,
    required: true,
    index:    true,
    trim:     true
  },

  prefix: {
    type:    String,
    default: '!',
    trim:    true,
    maxlength: 3
  },

  autoView: {
    type:    Boolean,
    default: false
  },

  autoReact: {
    type:    Boolean,
    default: false
  },

  reactEmojis: {
    type:    [String],
    default: () => [...DEFAULT_REACT_EMOJIS]
  },

  autoRead: {
    type:    Boolean,
    default: false
  },

  autoTyping: {
    type:    Boolean,
    default: false
  },

  autoRecording: {
    type:    Boolean,
    default: false
  },

  alwaysOnline: {
    type:    Boolean,
    default: false
  },

  antiDelete: {
    type:    Boolean,
    default: false
  },

  antilink: {
    type:    Boolean,
    default: false
  },

  antispam: {
    type:    Boolean,
    default: false
  },

  welcome: {
    type:    Boolean,
    default: false
  },

  goodbye: {
    type:    Boolean,
    default: false
  },

  autoreply: {
    type:    Boolean,
    default: false
  },

  autosticker: {
    type:    Boolean,
    default: false
  },

  autovoice: {
    type:    Boolean,
    default: false
  },

  chatbot: {
    type:    Boolean,
    default: false
  },

  ghostMode: {
    type:    Boolean,
    default: false
  },

  invisibleRead: {
    type:    Boolean,
    default: false
  },

  priorityQueue: {
    type:    Boolean,
    default: false
  },

  selfMode: {
    type:    Boolean,
    default: false
  },

  publicMode: {
    type:    Boolean,
    default: true
  },

  groupMode: {
    type:    Boolean,
    default: true
  },

  privateMode: {
    type:    Boolean,
    default: true
  },

  statusReplyText: {
    type:      String,
    default:   '',
    maxlength: 300
  },

  statusReplyMedia: {
    type:    String,
    default: ''
  },

  statusReadEmoji: {
    type:    [String],
    default: () => ['👀']
  },

  keywordReplies: {
    type: [
      {
        keyword:  { type: String, trim: true, required: true },
        response: { type: String, trim: true, required: true },
        enabled:  { type: Boolean, default: true },
        exact:    { type: Boolean, default: false }
      }
    ],
    default: []
  },

  scheduledMessages: {
    type: [
      {
        chatId:    { type: String, required: true },
        text:      { type: String, required: true },
        sendAt:    { type: Date,   required: true },
        sent:      { type: Boolean, default: false },
        createdAt: { type: Date,   default: Date.now }
      }
    ],
    default: []
  },

  customWelcome: {
    type:      String,
    default:   '',
    maxlength: 1000
  },

  customGoodbye: {
    type:      String,
    default:   '',
    maxlength: 1000
  },

  customMenu: {
    type:    Schema.Types.Mixed,
    default: {}
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

  blockedNumbers: {
    type:    [String],
    default: []
  },

  whitelistedNumbers: {
    type:    [String],
    default: []
  },

  mutedChats: {
    type:    [String],
    default: []
  },

  features: {
    commands:   { type: Boolean, default: true },
    downloader: { type: Boolean, default: true },
    ai:         { type: Boolean, default: true },
    tools:      { type: Boolean, default: true },
    group:      { type: Boolean, default: true },
    owner:      { type: Boolean, default: true }
  },

  cooldown: {
    type:    Number,
    default: 3,
    min:     0,
    max:     60
  },

  language: {
    type:    String,
    default: 'en',
    enum:    ['en', 'sw']
  },

  timezone: {
    type:    String,
    default: 'Africa/Dar_es_Salaam'
  },

  stats: {
    commandsRun:   { type: Number, default: 0 },
    messagesSent:  { type: Number, default: 0 },
    messagesRecv:  { type: Number, default: 0 },
    statusViewed:  { type: Number, default: 0 },
    statusReacted: { type: Number, default: 0 }
  },

  lastCommand: {
    type:    String,
    default: ''
  },

  lastCommandAt: {
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

SessionConfigSchema.index({ phoneNumber: 1 });
SessionConfigSchema.index({ prefix: 1 });

SessionConfigSchema.statics.findBySessionId = function (sessionId) {
  return this.findOne({ sessionId });
};

SessionConfigSchema.statics.findByPhone = function (phoneNumber) {
  return this.findOne({ phoneNumber: String(phoneNumber).replace(/\D/g, '') });
};

SessionConfigSchema.statics.getOrCreate = async function (sessionId, phoneNumber) {
  let cfg = await this.findOne({ sessionId });
  if (cfg) return cfg;

  cfg = await this.create({
    sessionId,
    phoneNumber: String(phoneNumber).replace(/\D/g, '')
  });

  return cfg;
};

SessionConfigSchema.methods.setPrefix = function (newPrefix) {
  this.prefix = String(newPrefix).slice(0, 3);
  return this.save();
};

SessionConfigSchema.methods.resetPrefix = function () {
  this.prefix = '!';
  return this.save();
};

SessionConfigSchema.methods.toggleFeature = function (key, value) {
  if (typeof this[key] !== 'boolean') return this;
  this[key] = typeof value === 'boolean' ? value : !this[key];
  return this.save();
};

SessionConfigSchema.methods.setEmojis = function (emojis) {
  if (!Array.isArray(emojis) || !emojis.length) return this;
  this.reactEmojis = emojis.slice(0, 10);
  return this.save();
};

SessionConfigSchema.methods.addKeywordReply = function (keyword, response, exact = false) {
  const existing = this.keywordReplies.findIndex(
    (k) => k.keyword.toLowerCase() === String(keyword).toLowerCase()
  );

  if (existing >= 0) {
    this.keywordReplies[existing].response = response;
    this.keywordReplies[existing].exact    = exact;
    this.keywordReplies[existing].enabled  = true;
  } else {
    this.keywordReplies.push({ keyword, response, exact, enabled: true });
  }

  return this.save();
};

SessionConfigSchema.methods.removeKeywordReply = function (keyword) {
  this.keywordReplies = this.keywordReplies.filter(
    (k) => k.keyword.toLowerCase() !== String(keyword).toLowerCase()
  );
  return this.save();
};

SessionConfigSchema.methods.incrementStat = function (field, by = 1) {
  if (this.stats[field] === undefined) return this;
  this.stats[field] += by;
  return this.save();
};

SessionConfigSchema.methods.recordCommand = function (commandName) {
  this.lastCommand   = commandName;
  this.lastCommandAt = new Date();
  this.stats.commandsRun += 1;
  return this.save();
};

const SessionConfig = model('SessionConfig', SessionConfigSchema);

export default SessionConfig;