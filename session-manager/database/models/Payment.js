import mongoose from 'mongoose';
import crypto from 'crypto';

import C from '../../../shared/constants.js';
import config from '../../config.js';

const { Schema, model } = mongoose;

const PaymentSchema = new Schema({

  orderId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true
  },

  sessionId: {
    type:    String,
    index:   true,
    default: null
  },

  accountId: {
    type:    Schema.Types.ObjectId,
    ref:     'Account',
    index:   true,
    default: null
  },

  userName: {
    type:      String,
    default:   '',
    trim:      true,
    maxlength: 30
  },

  phoneNumber: {
    type:     String,
    required: true,
    index:    true,
    trim:     true
  },

  amount: {
    type:     Number,
    required: true,
    min:      0
  },

  currency: {
    type:    String,
    default: config.payment.currency
  },

  provider: {
    type:    String,
    enum:    Object.values(C.PAYMENT_PROVIDER),
    default: C.PAYMENT_PROVIDER.sonicpesa,
    index:   true
  },

  method: {
    type:    String,
    enum:    Object.values(C.PAYMENT_METHOD),
    default: C.PAYMENT_METHOD.ussd,
    index:   true
  },

  status: {
    type:    String,
    enum:    Object.values(C.PAYMENT_STATE),
    default: C.PAYMENT_STATE.pending,
    index:   true
  },

  purpose: {
    type:    String,
    enum:    ['premium', 'coins', 'renewal'],
    default: 'premium',
    index:   true
  },

  durationDays: {
    type:    Number,
    default: config.payment.premiumDurationDays
  },

  providerOrderId: {
    type:    String,
    default: ''
  },

  providerTransactionId: {
    type:    String,
    default: ''
  },

  providerReference: {
    type:    String,
    default: ''
  },

  providerResponse: {
    type:    Schema.Types.Mixed,
    default: {}
  },

  webhookPayload: {
    type:    Schema.Types.Mixed,
    default: {}
  },

  webhookReceivedAt: {
    type:    Date,
    default: null
  },

  webhookCount: {
    type:    Number,
    default: 0
  },

  failureReason: {
    type:    String,
    default: ''
  },

  cancelledReason: {
    type:    String,
    default: ''
  },

  refunded: {
    type:    Boolean,
    default: false
  },

  refundedAt: {
    type:    Date,
    default: null
  },

  refundReason: {
    type:    String,
    default: ''
  },

  activatedAt: {
    type:    Date,
    default: null
  },

  activatedBy: {
    type:    String,
    enum:    ['auto', 'admin', 'owner', null],
    default: null
  },

  expiresAt: {
    type:    Date,
    default: null
  },

  ipAddress: {
    type:    String,
    default: ''
  },

  userAgent: {
    type:    String,
    default: ''
  },

  source: {
    type:    String,
    enum:    ['website', 'whatsapp', 'telegram', 'admin'],
    default: 'website'
  },

  notified: {
    type:    Boolean,
    default: false
  },

  notifiedAt: {
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

PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ provider: 1, status: 1 });
PaymentSchema.index({ phoneNumber: 1, status: 1 });
PaymentSchema.index({ accountId: 1, status: 1 });
PaymentSchema.index({ createdAt: -1 });

PaymentSchema.virtual('isPending').get(function () {
  return this.status === C.PAYMENT_STATE.pending;
});

PaymentSchema.virtual('isCompleted').get(function () {
  return this.status === C.PAYMENT_STATE.completed;
});

PaymentSchema.virtual('isFailed').get(function () {
  return this.status === C.PAYMENT_STATE.failed;
});

PaymentSchema.virtual('isCancelled').get(function () {
  return this.status === C.PAYMENT_STATE.cancelled;
});

PaymentSchema.virtual('isExpired').get(function () {
  return this.status === C.PAYMENT_STATE.expired;
});

PaymentSchema.virtual('isFinal').get(function () {
  return [
    C.PAYMENT_STATE.completed,
    C.PAYMENT_STATE.failed,
    C.PAYMENT_STATE.cancelled,
    C.PAYMENT_STATE.expired
  ].includes(this.status);
});

PaymentSchema.statics.generateOrderId = function () {
  const prefix = 'sp_';
  const rand   = crypto.randomBytes(8).toString('hex');
  const time   = Date.now().toString(36);
  return `${prefix}${time}${rand}`;
};

PaymentSchema.statics.findByOrderId = function (orderId) {
  return this.findOne({ orderId: String(orderId) });
};

PaymentSchema.statics.findPending = function (phoneNumber) {
  return this.findOne({
    phoneNumber: String(phoneNumber).replace(/\D/g, ''),
    status:      { $in: [C.PAYMENT_STATE.pending, C.PAYMENT_STATE.processing] }
  }).sort({ createdAt: -1 });
};

PaymentSchema.statics.findByAccount = function (accountId) {
  return this.find({ accountId }).sort({ createdAt: -1 });
};

PaymentSchema.statics.findByPhone = function (phoneNumber) {
  return this.find({
    phoneNumber: String(phoneNumber).replace(/\D/g, '')
  }).sort({ createdAt: -1 });
};

PaymentSchema.statics.findRecent = function (limit = 20) {
  return this.find().sort({ createdAt: -1 }).limit(limit);
};

PaymentSchema.statics.sumCompleted = function (from, to) {
  const match = {
    status:    C.PAYMENT_STATE.completed,
    createdAt: {}
  };

  if (from) match.createdAt.$gte = from;
  if (to)   match.createdAt.$lte = to;

  if (!Object.keys(match.createdAt).length) delete match.createdAt;

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id:     null,
        total:   { $sum: '$amount' },
        count:   { $sum: 1 }
      }
    }
  ]);
};

PaymentSchema.methods.markProcessing = function () {
  this.status = C.PAYMENT_STATE.processing;
  return this.save();
};

PaymentSchema.methods.markCompleted = function (data = {}, activatedBy = 'auto') {
  if (this.isCompleted) return this;

  this.status             = C.PAYMENT_STATE.completed;
  this.activatedAt        = new Date();
  this.activatedBy        = activatedBy;
  this.webhookPayload     = data.payload || this.webhookPayload;
  this.webhookReceivedAt  = new Date();
  this.webhookCount      += 1;

  if (data.providerTransactionId) {
    this.providerTransactionId = data.providerTransactionId;
  }
  if (data.providerReference) {
    this.providerReference = data.providerReference;
  }
  if (data.expiresAt) {
    this.expiresAt = data.expiresAt;
  } else {
    this.expiresAt = new Date(Date.now() + this.durationDays * 24 * 60 * 60 * 1000);
  }

  return this.save();
};

PaymentSchema.methods.markFailed = function (reason = '') {
  if (this.isFinal) return this;

  this.status        = C.PAYMENT_STATE.failed;
  this.failureReason = reason || 'Payment failed';
  this.webhookReceivedAt = new Date();
  this.webhookCount += 1;

  return this.save();
};

PaymentSchema.methods.markCancelled = function (reason = '') {
  if (this.isFinal) return this;

  this.status          = C.PAYMENT_STATE.cancelled;
  this.cancelledReason = reason || 'Cancelled by user';

  return this.save();
};

PaymentSchema.methods.markExpired = function () {
  if (this.isFinal) return this;

  this.status = C.PAYMENT_STATE.expired;
  return this.save();
};

PaymentSchema.methods.markRefunded = function (reason = '') {
  this.refunded     = true;
  this.refundedAt   = new Date();
  this.refundReason = reason;
  return this.save();
};

PaymentSchema.methods.markNotified = function () {
  this.notified   = true;
  this.notifiedAt = new Date();
  return this.save();
};

PaymentSchema.methods.recordWebhook = function (payload) {
  this.webhookPayload    = payload;
  this.webhookReceivedAt = new Date();
  this.webhookCount     += 1;
  return this.save();
};

const Payment = model('Payment', PaymentSchema);

export default Payment;