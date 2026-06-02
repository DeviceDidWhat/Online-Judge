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
  startsAt: { type: Date, required: true, index: true },
  duration: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['upcoming', 'live', 'ended'], default: 'upcoming', index: true },
  difficulty: { type: String, trim: true, default: 'Mixed' },
  registeredCount: { type: Number, default: 0, min: 0 },
  problems: [contestProblemSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

contestSchema.index({ name: 'text' });

module.exports = mongoose.model('Contest', contestSchema);
