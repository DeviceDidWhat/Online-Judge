/**
 * Backfill / repair script: recompute totalSubmissions, acceptedSubmissions and the
 * acceptance percentage for every problem from the actual Submission collection.
 *
 * Fixes problems whose acceptance is stuck at 0% because it was never computed, and
 * self-heals any counter drift.
 *
 * Usage (from the backend/ directory):
 *   node scripts/recomputeAcceptance.js
 *
 * Reads MONGO_URI from the environment (same as the app).
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Submission = require('../models/submission');

// Some networks' internal DNS resolvers time out on the TXT lookup that
// `mongodb+srv://` requires; force public resolvers for this one-off script.
dns.setServers(['1.1.1.1', '8.8.8.8']);

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set in env');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Acceptance is counted PER USER, not per submission (so repeated correct
  // submissions don't inflate it). Collapse each (problem, user) pair to one row
  // first — solved=1 if that user ever got an AC — then count unique users and
  // unique solvers per problem.
  const stats = await Submission.aggregate([
    {
      $group: {
        _id: { problem: '$problem', user: '$user' },
        solved: { $max: { $cond: [{ $eq: ['$verdict', 'Accepted'] }, 1, 0] } },
      },
    },
    {
      $group: {
        _id: '$_id.problem',
        total: { $sum: 1 },          // distinct users who attempted
        accepted: { $sum: '$solved' }, // distinct users who solved
      },
    },
  ]);
  const byProblem = new Map(stats.map((row) => [String(row._id), row]));

  const problems = await Problem.find({}).select('_id problemId title').lean();
  let updated = 0;

  for (const problem of problems) {
    const s = byProblem.get(String(problem._id)) || { total: 0, accepted: 0 };
    const acceptance = s.total > 0 ? Math.round((s.accepted / s.total) * 100) : 0;
    await Problem.updateOne(
      { _id: problem._id },
      { $set: { totalSubmissions: s.total, acceptedSubmissions: s.accepted, acceptance } }
    );
    updated += 1;
    console.log(`  problem ${problem.problemId ?? problem._id} ("${problem.title}"): ${s.accepted}/${s.total} -> ${acceptance}%`);
  }

  console.log(`\nDone. Recomputed acceptance for ${updated} problem(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Recompute failed:', err);
  process.exit(1);
});
