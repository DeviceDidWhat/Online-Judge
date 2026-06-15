const mongoose = require('mongoose');
const { Schema } = mongoose;

const contestProblemSchema = new Schema({
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  label: { type: String, trim: true, required: true },
  points: { type: Number, required: true, min: 0 },
  order: { type: Number, required: true, min: 0 },
}, { _id: false });

const contestSchema = new Schema({
  contestId: { type: Number, required: true, unique: true, min: 1 },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  startsAt: { type: Date, required: true, index: true },
  duration: { type: Number, required: true, min: 1 }, // minutes
  status: { type: String, enum: ['upcoming', 'live', 'ended'], default: 'upcoming', index: true },
  difficulty: { type: String, trim: true, default: 'Mixed' },
  registeredCount: { type: Number, default: 0, min: 0 },
  problems: [contestProblemSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  // Set to true once rating has been computed for this contest — prevents double-processing
  ratingProcessed: { type: Boolean, default: false },
}, { timestamps: true });

contestSchema.index({ name: 'text' });

// Auto-assign a sequential contestId when one isn't explicitly provided.
// Runs before validation so the `required` constraint is satisfied.
contestSchema.pre('validate', async function autoContestId(next) {
  try {
    if (this.contestId == null) {
      const last = await this.constructor.findOne().sort({ contestId: -1 }).select('contestId').lean();
      this.contestId = last && last.contestId ? last.contestId + 1 : 1;
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Contest', contestSchema);
