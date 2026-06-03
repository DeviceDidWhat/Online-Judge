const mongoose = require('mongoose');
const { Schema } = mongoose;

const judgeJobSchema = new Schema({
  submission: { type: Schema.Types.ObjectId, ref: 'Submission', required: true, index: true },
  worker: { type: Schema.Types.ObjectId, ref: 'JudgeWorker' },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    default: 'queued',
    index: true,
  },
  priority: { type: Number, default: 0 },
  attempts: { type: Number, default: 0, min: 0 },
  queuedAt: { type: Date, default: Date.now, index: true },
  startedAt: { type: Date },
  finishedAt: { type: Date },
  error: { type: String },
  logs: { type: String },
}, { timestamps: true });

judgeJobSchema.index({ status: 1, priority: -1, queuedAt: 1 });

module.exports = mongoose.model('JudgeJob', judgeJobSchema);
