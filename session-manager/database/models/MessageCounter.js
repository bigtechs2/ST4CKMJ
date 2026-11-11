import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const MessageCounterSchema = new Schema({

  sessionId: {
    type:  String,
    index: true
  },

  groupId: {
    type:  String,
    index: true
  },

  userId: {
    type:  String,
    index: true
  },

  userName: {
    type:    String,
    default: ''
  },

  count: {
    type:    Number,
    default: 0
  },

  firstMessageAt: {
    type:    Date,
    default: Date.now
  },

  lastMessageAt: {
    type:    Date,
    default: Date.now
  }

}, {
  timestamps: false,
  versionKey: false
});

MessageCounterSchema.index(
  { sessionId: 1, groupId: 1, userId: 1 },
  { unique: true }
);

MessageCounterSchema.index({ groupId: 1, count: -1 });

MessageCounterSchema.statics.increment = async function ({ sessionId, groupId, userId, userName }) {
  try {
    await this.updateOne(
      { sessionId, groupId, userId },
      {
        $inc: { count: 1 },
        $set: {
          userName: userName || '',
          lastMessageAt: new Date()
        },
        $setOnInsert: {
          firstMessageAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    if (!err.message.includes('E11000')) throw err;
  }
};

MessageCounterSchema.statics.topMembers = async function (groupId, limit = 20) {
  return this.find({ groupId, count: { $gt: 0 } })
    .sort({ count: -1 })
    .limit(limit)
    .lean();
};

MessageCounterSchema.statics.ghostMembers = async function (groupId, threshold = 5, limit = 50) {
  return this.find({
    groupId,
    count: { $lt: threshold }
  })
    .sort({ count: 1 })
    .limit(limit)
    .lean();
};

MessageCounterSchema.statics.groupStats = async function (groupId) {
  const agg = await this.aggregate([
    { $match: { groupId } },
    {
      $group: {
        _id: null,
        totalMembers: { $sum: 1 },
        totalMessages: { $sum: '$count' },
        avgMessages: { $avg: '$count' },
        maxMessages: { $max: '$count' },
        minMessages: { $min: '$count' }
      }
    }
  ]);
  return agg[0] || {
    totalMembers: 0,
    totalMessages: 0,
    avgMessages: 0,
    maxMessages: 0,
    minMessages: 0
  };
};

MessageCounterSchema.statics.resetGroup = function (groupId) {
  return this.deleteMany({ groupId });
};

const MessageCounter = model('MessageCounter', MessageCounterSchema);

export default MessageCounter;