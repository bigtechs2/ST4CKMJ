import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const DeletedMessageSchema = new Schema({

  messageId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true
  },

  sessionId: {
    type:  String,
    index: true
  },

  chatId: {
    type:  String,
    index: true
  },

  chatType: {
    type:    String,
    enum:    ['private', 'group'],
    default: 'group'
  },

  groupName: {
    type:    String,
    default: ''
  },

  senderJid: {
    type:    String,
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

  deletedByJid: {
    type:    String,
    default: ''
  },

  deletedByNumber: {
    type:    String,
    default: ''
  },

  contentType: {
    type:    String,
    enum:    ['text', 'image', 'video', 'audio', 'sticker', 'document', 'voicenote', 'other'],
    default: 'text'
  },

  textContent: {
    type:    String,
    default: ''
  },

  mediaPath: {
    type:    String,
    default: ''
  },

  mediaMime: {
    type:    String,
    default: ''
  },

  wasViewOnce: {
    type:    Boolean,
    default: false
  },

  reported: {
    type:    Boolean,
    default: false
  },

  createdAt: {
    type:    Date,
    default: Date.now,
    index:   true
  }

}, {
  timestamps: false,
  versionKey: false
});

DeletedMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

DeletedMessageSchema.statics.findByMessageId = function (messageId) {
  return this.findOne({ messageId });
};

DeletedMessageSchema.statics.cleanup = function (keepHours = 24) {
  const cutoff = new Date(Date.now() - keepHours * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: cutoff } });
};

const DeletedMessage = model('DeletedMessage', DeletedMessageSchema);

export default DeletedMessage;