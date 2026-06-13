const mongoose = require('mongoose');
const { Schema } = mongoose;

const solvedProblemSchema = new Schema({
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  submission: { type: Schema.Types.ObjectId, ref: 'Submission' },
  solvedAt: { type: Date, default: Date.now },
  points: { type: Number, default: 0, min: 0 },
  // ICPC-style: number of wrong attempts before the AC
  wrongAttempts: { type: Number, default: 0, min: 0 },
  // Minutes from contest start to AC (used for penalty)
  timePenaltyMinutes: { type: Number, default: 0, min: 0 },
}, { _id: false });

const contestRegistrationSchema = new Schema({
  contest: { type: Schema.Types.ObjectId, ref: 'Contest', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  registeredAt: { type: Date, default: Date.now },
  score: { type: Number, default: 0, min: 0 },
  // ICPC-style total penalty (sum of timePenaltyMinutes + 20*wrongAttempts per solved problem)
  penalty: { type: Number, default: 0, min: 0 },
  rank: { type: Number, min: 1 },
  solvedProblems: [solvedProblemSchema],
  // Rating delta applied after finalization
  ratingChange: { type: Number, default: 0 },
}, { timestamps: true });

contestRegistrationSchema.index({ contest: 1, user: 1 }, { unique: true });
contestRegistrationSchema.index({ contest: 1, score: -1, penalty: 1 });

module.exports = mongoose.model('ContestRegistration', contestRegistrationSchema);
