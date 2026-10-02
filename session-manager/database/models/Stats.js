import mongoose from 'mongoose';

import C from '../../../shared/constants.js';
import config from '../../config.js';

const { Schema, model } = mongoose;

const StatsSchema = new Schema({

  date: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true
  },

  sessions: {
    total:        { type: Number, default: 0 },
    active:       { type: Number, default: 0 },
    paired:       { type: Number, default: 0 },
    disconnected: { type: Number, default: 0 },
    banned:       { type: Number, default: 0 },
    broken:       { type: Number, default: 0 }
  },

  users: {
    total:    { type: Number, default: 0 },
    new:      { type: Number, default: 0 },
    active:   { type: Number, default: 0 },
    premium:  { type: Number, default: 0 },
    blocked:  { type: Number, default: 0 },
    banned:   { type: Number, default: 0 }
  },

  accounts: {
    total:    { type: Number, default: 0 },
    new:      { type: Number, default: 0 },
    website:  { type: Number, default: 0 },
    telegram: { type: Number, default: 0 },
    linked:   { type: Number, default: 0 }
  },

  commands: {
    total:    { type: Number, default: 0 },
    success:  { type: Number, default: 0 },
    failed:   { type: Number, default: 0 },
    byCategory: {
      type:    Schema.Types.Mixed,
      default: {}
    },
    byCommand: {
      type:    Schema.Types.Mixed,
      default: {}
    }
  },

  messages: {
    sent:     { type: Number, default: 0 },
    received: { type: Number, default: 0 }
  },

  status: {
    viewed:  { type: Number, default: 0 },
    reacted: { type: Number, default: 0 }
  },

  payments: {
    total:        { type: Number, default: 0 },
    completed:    { type: Number, default: 0 },
    failed:       { type: Number, default: 0 },
    cancelled:    { type: Number, default: 0 },
    expired:      { type: Number, default: 0 },
    revenue:      { type: Number, default: 0 },
    currency:     { type: String, default: config.payment.currency },
    byProvider: {
      type:    Schema.Types.Mixed,
      default: {}
    }
  },

  coins: {
    credited: { type: Number, default: 0 },
    spent:    { type: Number, default: 0 }
  },

  reconnects: {
    total:    { type: Number, default: 0 },
    success:  { type: Number, default: 0 },
    failed:   { type: Number, default: 0 }
  },

  errors: {
    total:    { type: Number, default: 0 },
    byType: {
      type:    Schema.Types.Mixed,
      default: {}
    }
  },

  uptime: {
    seconds:   { type: Number, default: 0 },
    restarts:  { type: Number, default: 0 }
  },

  peak: {
    sessionsOnline: { type: Number, default: 0 },
    commandsPerHour:{ type: Number, default: 0 },
    commandsPerMinute: { type: Number, default: 0 }
  },

  hourly: {
    type:    [Number],
    default: () => Array(24).fill(0)
  },

  metadata: {
    type:    Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true,
  versionKey: false
});

StatsSchema.index({ date: -1 });

StatsSchema.statics.today = function () {
  const date = new Date().toISOString().slice(0, 10);
  return this.findOne({ date });
};

StatsSchema.statics.todayOrCreate = async function () {
  const date = new Date().toISOString().slice(0, 10);

  let stats = await this.findOne({ date });
  if (stats) return stats;

  stats = await this.create({ date });
  return stats;
};

StatsSchema.statics.forDate = function (date) {
  const key = date instanceof Date
    ? date.toISOString().slice(0, 10)
    : String(date);

  return this.findOne({ date: key });
};

StatsSchema.statics.forRange = function (from, to) {
  const fromKey = from instanceof Date
    ? from.toISOString().slice(0, 10)
    : String(from);
  const toKey = to instanceof Date
    ? to.toISOString().slice(0, 10)
    : String(to);

  return this.find({
    date: { $gte: fromKey, $lte: toKey }
  }).sort({ date: 1 });
};

StatsSchema.statics.lastDays = function (days = 7) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }

  return this.find({ date: { $in: dates } }).sort({ date: 1 });
};

StatsSchema.statics.sumRevenue = async function (days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const result = await this.aggregate([
    { $match: { date: { $gte: since } } },
    {
      $group: {
        _id:     null,
        revenue: { $sum: '$payments.revenue' },
        count:   { $sum: '$payments.completed' }
      }
    }
  ]);

  return result[0] || { revenue: 0, count: 0 };
};

StatsSchema.methods.incrementSession = async function (field, by = 1) {
  const path = `sessions.${field}`;
  return this.constructor.updateOne(
    { _id: this._id },
    { $inc: { [path]: by } }
  );
};

StatsSchema.methods.incrementCommand = function (command, category, success = true) {
  this.commands.total += 1;

  if (success) {
    this.commands.success += 1;
  } else {
    this.commands.failed += 1;
  }

  if (category) {
    const current = this.commands.byCategory[category] || 0;
    this.commands.byCategory[category] = current + 1;
    this.markModified('commands.byCategory');
  }

  if (command) {
    const current = this.commands.byCommand[command] || 0;
    this.commands.byCommand[command] = current + 1;
    this.markModified('commands.byCommand');
  }

  const hour = new Date().getHours();
  this.hourly[hour] += 1;
  this.markModified('hourly');

  return this.save();
};

StatsSchema.methods.incrementMessage = function (direction = 'sent') {
  if (direction === 'sent') {
    this.messages.sent += 1;
  } else {
    this.messages.received += 1;
  }
  return this.save();
};

StatsSchema.methods.incrementStatus = function (type = 'viewed') {
  if (type === 'viewed') {
    this.status.viewed += 1;
  } else if (type === 'reacted') {
    this.status.reacted += 1;
  }
  return this.save();
};

StatsSchema.methods.incrementPayment = function (status, amount = 0, provider = '') {
  this.payments.total += 1;

  switch (status) {
    case C.PAYMENT_STATE.completed:
      this.payments.completed += 1;
      this.payments.revenue += Number(amount) || 0;
      break;
    case C.PAYMENT_STATE.failed:
      this.payments.failed += 1;
      break;
    case C.PAYMENT_STATE.cancelled:
      this.payments.cancelled += 1;
      break;
    case C.PAYMENT_STATE.expired:
      this.payments.expired += 1;
      break;
  }

  if (provider) {
    const current = this.payments.byProvider[provider] || 0;
    this.payments.byProvider[provider] = current + 1;
    this.markModified('payments.byProvider');
  }

  return this.save();
};

StatsSchema.methods.incrementCoins = function (type, amount = 0) {
  if (type === 'credit') {
    this.coins.credited += Number(amount) || 0;
  } else if (type === 'debit') {
    this.coins.spent += Number(amount) || 0;
  }
  return this.save();
};

StatsSchema.methods.incrementReconnect = function (success = true) {
  this.reconnects.total += 1;
  if (success) {
    this.reconnects.success += 1;
  } else {
    this.reconnects.failed += 1;
  }
  return this.save();
};

StatsSchema.methods.incrementError = function (type = 'unknown') {
  this.errors.total += 1;

  const current = this.errors.byType[type] || 0;
  this.errors.byType[type] = current + 1;
  this.markModified('errors.byType');

  return this.save();
};

StatsSchema.methods.recordPeak = function (metric, value) {
  if (this.peak[metric] === undefined) return this;
  if (value > this.peak[metric]) {
    this.peak[metric] = value;
    return this.save();
  }
  return this;
};

const Stats = model('Stats', StatsSchema);

export default Stats;