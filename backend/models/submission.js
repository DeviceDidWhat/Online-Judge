const mongoose = require('mongoose');
const { Schema } = mongoose;

const testcaseResultSchema = new Schema({
  index: { type: Number, required: true, min: 1 },
  verdict: {
    type: String,
    enum: ['Accepted', 'Wrong Answer', 'TLE', 'MLE', 'Runtime Error', 'Compilation Error'],
    required: true,
  },
  runtime: { type: Number, min: 0 },
  memory: { type: Number, min: 0 },
  stdout: { type: String },
  stderr: { type: String },
}, { _id: false });

const submissionSchema = new Schema({
  submissionId: { type: String, required: true, unique: true, trim: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true, index: true },
  problemTitle: { type: String, trim: true },
  // Optional: links this submission to a contest context
  contest: { type: Schema.Types.ObjectId, ref: 'Contest', index: true },
  language: { type: String, required: true, trim: true },
  sourceCode: { type: String, required: true },
  verdict: {
    type: String,
    enum: ['Accepted', 'Wrong Answer', 'TLE', 'MLE', 'Runtime Error', 'Compilation Error', 'Pending'],
    default: 'Pending',
    index: true,
  },
  runtime: { type: Number, min: 0 },
  memory: { type: Number, min: 0 },
  testcasesPassed: { type: Number, default: 0, min: 0 },
  totalTestcases: { type: Number, default: 0, min: 0 },
  stdout: { type: String },
  stderr: { type: String },
  compileOutput: { type: String },
  failedTestcase: {
    input: String,
    expectedOutput: String,
    actualOutput: String,
    index: Number,
  },
  testcaseResults: [testcaseResultSchema],
  submittedAt: { type: Date, default: Date.now, index: true },
  judgedAt: { type: Date },
}, { timestamps: true });

submissionSchema.index({ user: 1, submittedAt: -1 });
submissionSchema.index({ problem: 1, verdict: 1 });
submissionSchema.index({ contest: 1, user: 1, problem: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
