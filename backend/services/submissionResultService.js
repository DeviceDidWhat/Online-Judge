const Problem = require('../models/problem');
const Submission = require('../models/submission');
const { updateProgressForSubmission } = require('../utils/problemProgress');

const RESULT_FIELDS = [
  'verdict',
  'runtime',
  'memory',
  'testcasesPassed',
  'totalTestcases',
  'stdout',
  'stderr',
  'compileOutput',
  'failedTestcase',
  'testcaseResults',
];

const pickResultFields = (payload) => RESULT_FIELDS.reduce((acc, field) => {
  if (Object.prototype.hasOwnProperty.call(payload, field)) acc[field] = payload[field];
  return acc;
}, {});

const applySubmissionResult = async (submissionId, result) => {
  const existing = await Submission.findOne(
    typeof submissionId === 'string' && submissionId.startsWith('sub_')
      ? { submissionId }
      : { _id: submissionId }
  );
  if (!existing) return null;

  const wasPending = existing.verdict === 'Pending';
  const wasAccepted = existing.verdict === 'Accepted';
  const update = {
    ...pickResultFields(result),
    judgedAt: new Date(),
  };

  const submission = await Submission.findByIdAndUpdate(existing._id, update, {
    new: true,
    runValidators: true,
  });

  if (submission.verdict === 'Accepted' && !wasAccepted) {
    await Problem.findByIdAndUpdate(submission.problem, { $inc: { acceptedSubmissions: 1 } });
  }

  if (wasPending) await updateProgressForSubmission(submission);
  return submission;
};

module.exports = { applySubmissionResult };
