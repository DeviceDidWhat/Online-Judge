const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentSchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true },
  upvotes: { type: Number, default: 0, min: 0 },
  upvotedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
}, { _id: true });

const discussionSchema = new Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  authorUsername: { type: String, trim: true },
  tags: [{ type: String, trim: true }],
  problem: { type: Schema.Types.ObjectId, ref: 'Problem' },
  contest: { type: Schema.Types.ObjectId, ref: 'Contest' },
  upvotes: { type: Number, default: 0, min: 0 },
  downvotes: { type: Number, default: 0, min: 0 },
  upvotedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  downvotedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  isPinned: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
}, { timestamps: true });

discussionSchema.index({ title: 'text', body: 'text', tags: 'text' });
discussionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Discussion', discussionSchema);