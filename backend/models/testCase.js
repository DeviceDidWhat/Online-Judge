const mongoose = require('mongoose');
const { Schema } = mongoose;

// Test cases live in their own collection (one document per test case) rather than
// embedded in the Problem document. This avoids MongoDB's 16 MB per-document limit
// when problems have large inputs/outputs (e.g. 1e5-element arrays) and lets the
// judge stream them with a cursor instead of loading every case into memory.
const testCaseSchema = new Schema({
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true, index: true },
  order: { type: Number, default: 0 },
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
  hidden: { type: Boolean, default: true },
}, { timestamps: true });

testCaseSchema.index({ problem: 1, order: 1 });

module.exports = mongoose.model('TestCase', testCaseSchema);
