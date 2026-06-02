const mongoose = require('mongoose');
const { Schema } = mongoose;

const userActivitySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  count: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

userActivitySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('UserActivity', userActivitySchema);
