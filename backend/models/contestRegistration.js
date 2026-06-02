const mongoose = require('mongoose');
const { Schema } = mongoose;

const solvedProblemSchema = new Schema({
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  submission: { type: Schema.Types.ObjectId, ref: 'Submission' },
  solvedAt: { type: Date, default: Date.now },
  points: { type: Number, default: 0, min: 0 },
}, { _id: false });

const contestRegistrationSchema = new Schema({
  contest: { type: Schema.Types.ObjectId, ref: 'Contest', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  registeredAt: { type: Date, default: Date.now },
  score: { type: Number, default: 0, min: 0 },
  penalty: { type: Number, default: 0, min: 0 },
  rank: { type: Number, min: 1 },
  solvedProblems: [solvedProblemSchema],
}, { timestamps: true });

contestRegistrationSchema.index({ contest: 1, user: 1 }, { unique: true });
contestRegistrationSchema.index({ contest: 1, score: -1, penalty: 1 });

module.exports = mongoose.model('ContestRegistration', contestRegistrationSchema);
