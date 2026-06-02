const mongoose = require('mongoose');
const { Schema } = mongoose;

const savedCodeSchema = new Schema({
  language: { type: String, required: true, trim: true },
  code: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const userProblemProgressSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  status: { type: String, enum: ['unsolved', 'attempted', 'solved'], default: 'unsolved', index: true },
  bookmarked: { type: Boolean, default: false, index: true },
  attempts: { type: Number, default: 0, min: 0 },
  bestSubmission: { type: Schema.Types.ObjectId, ref: 'Submission' },
  lastSubmission: { type: Schema.Types.ObjectId, ref: 'Submission' },
  solvedAt: { type: Date },
  savedCode: [savedCodeSchema],
}, { timestamps: true });

userProblemProgressSchema.index({ user: 1, problem: 1 }, { unique: true });
userProblemProgressSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('UserProblemProgress', userProblemProgressSchema);
