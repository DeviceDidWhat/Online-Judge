const mongoose = require('mongoose');
const { Schema } = mongoose;

const exampleSchema = new Schema({
  input: { type: String, required: true },
  output: { type: String, required: true },
  explanation: { type: String },
}, { _id: false });

const testCaseSchema = new Schema({
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
  hidden: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const editorialSectionSchema = new Schema({
  title: { type: String, trim: true, required: true },
  body: { type: String, required: true },
  timeComplexity: { type: String, trim: true },
  spaceComplexity: { type: String, trim: true },
}, { _id: false });

const problemSchema = new Schema({
  problemId: { type: Number, required: true, unique: true, min: 1 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  tags: [{ type: String, trim: true }],
  acceptance: { type: Number, default: 0, min: 0, max: 100 },
  premium: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  visibility: { type: String, enum: ['public', 'contest_only'], default: 'public' },
  description: { type: String, required: true },
  constraints: [{ type: String, trim: true }],
  examples: [exampleSchema],
  hints: [{ type: String }],
  starterCode: { type: Map, of: String, default: {} },
  editorial: [editorialSectionSchema],
  testCases: [testCaseSchema],
  timeLimitMs: { type: Number, default: 1000, min: 1 },
  memoryLimitMb: { type: Number, default: 256, min: 1 },
  totalSubmissions: { type: Number, default: 0, min: 0 },
  acceptedSubmissions: { type: Number, default: 0, min: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

problemSchema.index({ title: 'text', tags: 'text', slug: 'text' });
problemSchema.index({ difficulty: 1, status: 1 });

module.exports = mongoose.model('Problem', problemSchema);
