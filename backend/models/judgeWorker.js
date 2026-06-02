const mongoose = require('mongoose');
const { Schema } = mongoose;

const judgeWorkerSchema = new Schema({
  workerId: { type: String, required: true, unique: true, trim: true },
  region: { type: String, required: true, trim: true },
  load: { type: Number, default: 0, min: 0, max: 100 },
  status: { type: String, enum: ['online', 'degraded', 'offline'], default: 'offline', index: true },
  supportedLanguages: [{ type: String, trim: true }],
  activeJobs: { type: Number, default: 0, min: 0 },
  lastHeartbeatAt: { type: Date },
}, { timestamps: true });

judgeWorkerSchema.index({ region: 1, status: 1 });

module.exports = mongoose.model('JudgeWorker', judgeWorkerSchema);
