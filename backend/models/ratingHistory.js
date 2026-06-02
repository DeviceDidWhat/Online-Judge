const mongoose = require('mongoose');
const { Schema } = mongoose;

const ratingHistorySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  contest: { type: Schema.Types.ObjectId, ref: 'Contest' },
  contestName: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 0 },
  change: { type: Number, default: 0 },
  rank: { type: Number, min: 1 },
}, { timestamps: true });

ratingHistorySchema.index({ user: 1, createdAt: 1 });
ratingHistorySchema.index({ contest: 1, rating: -1 });

module.exports = mongoose.model('RatingHistory', ratingHistorySchema);
