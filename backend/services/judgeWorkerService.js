const { Worker } = require('bullmq');
const connection = require('../config/redis');
const JudgeJob = require('../models/judgeJob');
const JudgeWorker = require('../models/judgeWorker');
const Problem = require('../models/problem');
const Submission = require('../models/submission');
const { runSubmission } = require('./judgeRunner');
const { applySubmissionResult } = require('./submissionResultService');
const { JUDGE_QUEUE_NAME, JUDGE_MAX_ATTEMPTS } = require('./judgeQueue');
const { recoverStuckJudgeJobs } = require('./judgeRecovery');

const workerId = process.env.JUDGE_WORKER_ID || `worker-${process.pid}`;
const region = process.env.JUDGE_WORKER_REGION || 'local';
const concurrency = Number(process.env.JUDGE_WORKER_CONCURRENCY || 1);
const RECOVERY_INTERVAL_MS = Number(process.env.JUDGE_RECOVERY_INTERVAL_MS || 60_000);

let activeJobs = 0;
let worker = null;
let recoveryTimer = null;

const heartbeat = async (status = 'online') => JudgeWorker.findOneAndUpdate(
  { workerId },
  {
    workerId,
    region,
    status,
    activeJobs,
    load: activeJobs > 0 ? 100 : 0,
    supportedLanguages: ['c', 'cpp', 'python', 'javascript', 'java'],
    lastHeartbeatAt: new Date(),
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

const processJudgeJob = async (job) => {
  activeJobs += 1;
  try {
    const workerDoc = await heartbeat();
    const judgeJob = await JudgeJob.findByIdAndUpdate(job.data.judgeJobId, {
      status: 'running',
      startedAt: new Date(),
      worker: workerDoc._id,
      error: undefined,
    }, { new: true });
    if (!judgeJob) throw new Error('Judge job not found');

    const submission = await Submission.findById(judgeJob.submission).populate('problem');
    if (!submission) throw new Error('Submission not found');
    const problem = submission.problem || await Problem.findById(submission.problem);
    if (!problem) throw new Error('Problem not found');

    const result = await runSubmission({ submission, problem });
    await applySubmissionResult(submission._id, result);
    await JudgeJob.findByIdAndUpdate(judgeJob._id, { status: 'completed', finishedAt: new Date(), error: undefined });
  } finally {
    activeJobs -= 1;
    await heartbeat();
  }
};

const handleFailed = async (job, error) => {
  if (!job) return;
  const judgeJobId = job.data.judgeJobId;
  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || JUDGE_MAX_ATTEMPTS);

  const judgeJob = await JudgeJob.findByIdAndUpdate(judgeJobId, {
    status: isFinalAttempt ? 'failed' : 'queued',
    finishedAt: isFinalAttempt ? new Date() : undefined,
    error: error.message || String(error),
  });

  if (isFinalAttempt && judgeJob?.submission) {
    const submission = await Submission.findById(judgeJob.submission).select('totalTestcases');
    const result = {
      verdict: 'Runtime Error',
      runtime: 0,
      memory: 0,
      testcasesPassed: 0,
      stderr: `Judge worker failed: ${error.message || String(error)}`,
      testcaseResults: [],
    };
    // Only set totalTestcases when we actually know it. applySubmissionResult only
    // writes the fields present here, so omitting it preserves the value stored at
    // submission time rather than clobbering a good count with 0.
    if (typeof submission?.totalTestcases === 'number') {
      result.totalTestcases = submission.totalTestcases;
    }
    await applySubmissionResult(judgeJob.submission, result);
  }
};

const startJudgeWorker = () => {
  if (worker) return worker;

  worker = new Worker(JUDGE_QUEUE_NAME, processJudgeJob, { connection, concurrency });
  worker.on('failed', (job, error) => {
    handleFailed(job, error).catch((err) => console.error('[judgeWorker] failed-handler error:', err.message));
  });
  worker.on('error', (err) => console.error('[judgeWorker] worker error:', err.message));

  heartbeat().catch((err) => console.error('[judgeWorker] heartbeat error:', err.message));

  // Revive any submissions whose judge job was lost (e.g. a failed enqueue) on
  // startup and then periodically, so a single dropped job can't leave a
  // submission Pending forever (and wedge contest finalization).
  recoverStuckJudgeJobs().catch((err) => console.error('[judgeWorker] recovery error:', err.message));
  if (!recoveryTimer) {
    recoveryTimer = setInterval(() => {
      recoverStuckJudgeJobs().catch((err) => console.error('[judgeWorker] recovery error:', err.message));
    }, RECOVERY_INTERVAL_MS);
    if (recoveryTimer.unref) recoveryTimer.unref();
  }

  return worker;
};

const stopJudgeWorker = async () => {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  if (worker) {
    await worker.close();
    worker = null;
  }
  await heartbeat('offline');
};

module.exports = { startJudgeWorker, stopJudgeWorker };
