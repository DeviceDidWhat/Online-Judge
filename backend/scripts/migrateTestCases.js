/**
 * One-time migration: move test cases embedded in each Problem document into the
 * standalone `testcases` collection (models/testCase.js), then drop the embedded
 * `testCases` field from the Problem documents.
 *
 * Safe to run multiple times: problems that already have rows in the TestCase
 * collection are skipped, so re-running won't duplicate data.
 *
 * Usage (from the backend/ directory):
 *   node scripts/migrateTestCases.js
 *
 * Reads MONGO_URI from the environment (same as the app). Pass --keep-embedded to
 * leave the old embedded field in place instead of unsetting it.
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
const TestCase = require('../models/testCase');

// Some networks' internal DNS resolvers time out on the TXT lookup that
// `mongodb+srv://` requires. Force public resolvers for this one-off script so it
// can connect regardless of the local DNS configuration.
dns.setServers(['1.1.1.1', '8.8.8.8']);

const keepEmbedded = process.argv.includes('--keep-embedded');

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set in env');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Read raw problem docs through the native driver so the embedded testCases are
  // visible even though they are no longer part of the Mongoose Problem schema.
  const problems = mongoose.connection.db.collection('problems');
  const cursor = problems.find({ testCases: { $exists: true, $not: { $size: 0 } } });

  let migratedCases = 0;
  let migratedProblems = 0;
  let skipped = 0;

  for (let p = await cursor.next(); p != null; p = await cursor.next()) {
    const existing = await TestCase.countDocuments({ problem: p._id });
    if (existing > 0) {
      skipped += 1;
      continue;
    }

    const docs = (p.testCases || []).map((tc, index) => ({
      problem: p._id,
      order: typeof tc.order === 'number' ? tc.order : index + 1,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      hidden: tc.hidden ?? true,
    }));

    if (docs.length > 0) {
      await TestCase.insertMany(docs);
      migratedCases += docs.length;
      migratedProblems += 1;
      console.log(`  problem ${p.problemId ?? p._id}: migrated ${docs.length} test case(s)`);
    }
  }

  if (!keepEmbedded) {
    const res = await problems.updateMany(
      { testCases: { $exists: true } },
      { $unset: { testCases: '' } }
    );
    console.log(`Unset embedded testCases on ${res.modifiedCount} problem(s)`);
  }

  console.log(`\nDone. Migrated ${migratedCases} test case(s) across ${migratedProblems} problem(s). Skipped ${skipped} already-migrated problem(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
