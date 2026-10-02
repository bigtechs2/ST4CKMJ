import mongoose from 'mongoose';

import C from '../../../shared/constants.js';
import config from '../../config.js';

const { Schema, model } = mongoose;

const CommandLogSchema = new Schema({

  sessionId: {
    type:    String,
    index:   true,
    default: null
  },

  phoneNumber: {
    type:    String,
    index:   true,
    default: ''
  },

  senderNumber: {
    type:    String,
    index:   true,
    default: ''
  },

  senderName: {
    type:    String,
    default: ''
  },

  chatId: {
    type:    String,
    index:   true,
    default: ''
  },

  chatType: {
    type:    String,
    enum:    Object.values(C.CHAT_TYPE),
    default: C.CHAT_TYPE.private,
    index:   true
  },

  command: {
    type:    String,
    required: true,
    index:   true,
    trim:    true
  },

  category: {
    type:    String,
    index:   true,
    default: ''
  },

  args: {
    type:    [String],
    default: []
  },

  rawText: {
    type:    String,
    default: ''
  },

  tier: {
    type:    String,
    enum:    Object.values(C.TIER),
    default: C.TIER.freeUser,
    index:   true
  },

  coinsSpent: {
    type:    Number,
    default: 0
  },

  success: {
    type:    Boolean,
    default: true,
    index:   true
  },

  errorReason: {
    type:    String,
    default: ''
  },

  latencyMs: {
    type:    Number,
    default: 0
  },

  responseType: {
    type:    String,
    default: ''
  },

  messageSize: {
    type:    Number,
    default: 0
  },

  metadata: {
    type:    Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true,
  versionKey: false
});

CommandLogSchema.index({ createdAt: -1 });
CommandLogSchema.index({ command: 1, createdAt: -1 });
CommandLogSchema.index({ sessionId: 1, createdAt: -1 });
CommandLogSchema.index({ senderNumber: 1, createdAt: -1 });
CommandLogSchema.index({ category: 1, createdAt: -1 });

CommandLogSchema.statics.record = function (data = {}) {
  return this.create({
    sessionId:    data.sessionId    || null,
    phoneNumber:  data.phoneNumber  || '',
    senderNumber: data.senderNumber || '',
    senderName:   data.senderName   || '',
    chatId:       data.chatId       || '',
    chatType:     data.chatType     || C.CHAT_TYPE.private,
    command:      data.command      || '',
    category:     data.category     || '',
    args:         data.args         || [],
    rawText:      data.rawText      || '',
    tier:         data.tier         || C.TIER.freeUser,
    coinsSpent:   data.coinsSpent   || 0,
    success:      data.success !== false,
    errorReason:  data.errorReason  || '',
    latencyMs:    data.latencyMs    || 0,
    responseType: data.responseType || '',
    messageSize:  data.messageSize  || 0,
    metadata:     data.metadata     || {}
  });
};

CommandLogSchema.statics.topCommands = function (days = 7, limit = 10) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    { $match: { createdAt: { $gte: since }, success: true } },
    {
      $group: {
        _id:   '$command',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, command: '$_id', count: 1 } }
  ]);
};

CommandLogSchema.statics.topCategories = function (days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id:   '$category',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $project: { _id: 0, category: '$_id', count: 1 } }
  ]);
};

CommandLogSchema.statics.countToday = function () {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return this.countDocuments({ createdAt: { $gte: start } });
};

CommandLogSchema.statics.countSince = function (ms) {
  const since = new Date(Date.now() - ms);
  return this.countDocuments({ createdAt: { $gte: since } });
};

CommandLogSchema.statics.bySession = function (sessionId, limit = 50) {
  return this.find({ sessionId }).sort({ createdAt: -1 }).limit(limit);
};

CommandLogSchema.statics.bySender = function (senderNumber, limit = 50) {
  return this.find({ senderNumber }).sort({ createdAt: -1 }).limit(limit);
};

CommandLogSchema.statics.failures = function (days = 1, limit = 50) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.find({
    success:    false,
    createdAt:  { $gte: since }
  }).sort({ createdAt: -1 }).limit(limit);
};

CommandLogSchema.statics.cleanupOld = function (keepDays = config.stats.keepDays) {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: cutoff } });
};

const CommandLog = model('CommandLog', CommandLogSchema);

export default CommandLog;