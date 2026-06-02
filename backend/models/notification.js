const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  type: {
    type: String,
    enum: ['contest', 'submission', 'discussion', 'rating', 'system'],
    default: 'system',
  },
  unread: { type: Boolean, default: true, index: true },
  link: { type: String, trim: true },
  metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
