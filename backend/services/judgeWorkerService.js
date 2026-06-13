const JudgeJob = require('../models/judgeJob');
const JudgeWorker = require('../models/judgeWorker');
const Problem = require('../models/problem');
const Submission = require('../models/submission');
const { runSubmission } = require('./judgeRunner');
const { applySubmissionResult } = require('./submissionResultService');
const { transitionContestStatuses } = require('./contestService');

const workerId = process.env.JUDGE_WORKER_ID || `worker-${process.pid}`;
const region = process.env.JUDGE_WORKER_REGION || 'local';
const pollIntervalMs = Number(process.env.JUDGE_POLL_INTERVAL_MS || 1500);
const staleRunningMs = Number(process.env.JUDGE_STALE_RUNNING_MS || 10 * 60 * 1000);
const maxAttempts = Number(process.env.JUDGE_MAX_ATTEMPTS || 3);

let stopping = false;
let loopPromise = null;

const heartbeat = async (status = 'online', activeJobs = 0) => JudgeWorker.findOneAndUpdate(
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

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const requeueStaleJobs = async () => {
  const cutoff = new Date(Date.now() - staleRunningMs);
  await JudgeJob.updateMany(
    { status: 'running', startedAt: { $lt: cutoff } },
    { $set: { status: 'queued', worker: null, error: 'Requeued after stale worker timeout' } }
  );
};

const claimJob = async (worker) => JudgeJob.findOneAndUpdate(
  { status: 'queued', attempts: { $lt: maxAttempts } },
  {
    $set: { status: 'running', worker: worker._id, startedAt: new Date(), error: undefined },
    $inc: { attempts: 1 },
  },
  { sort: { priority: -1, queuedAt: 1 }, new: true }
).populate({
  path: 'submission',
  populate: { path: 'problem' },
});

const failJob = async (job, error) => {
  const retryable = job.attempts < maxAttempts;
  await JudgeJob.findByIdAndUpdate(job._id, {
    status: retryable ? 'queued' : 'failed',
    worker: retryable ? null : job.worker,
    finishedAt: retryable ? undefined : new Date(),
    error: error.message || String(error),
  });

  if (!retryable && job.submission?._id) {
    await applySubmissionResult(job.submission._id, {
      verdict: 'Runtime Error',
      runtime: 0,
      memory: 0,
      testcasesPassed: 0,
      totalTestcases: job.submission.totalTestcases || 0,
      stderr: `Judge worker failed: ${error.message || String(error)}`,
      testcaseResults: [],
    });
  }
};

const processJob = async (job) => {
  const submission = await Submission.findById(job.submission._id).populate('problem');
  if (!submission) throw new Error('Submission not found');
  const problem = submission.problem || await Problem.findById(submission.problem);
  if (!problem) throw new Error('Problem not found');

  const result = await runSubmission({ submission, problem });
  await applySubmissionResult(submission._id, result);
  await JudgeJob.findByIdAndUpdate(job._id, {
    status: 'completed',
    finishedAt: new Date(),
    error: undefined,
  });
};

const tick = async () => {
  // Transition contest statuses (upcoming → live → ended) and finalize ended contests
  await transitionContestStatuses();

  await requeueStaleJobs();
  const worker = await heartbeat('online', 0);
  const job = await claimJob(worker);
  if (!job) return false;

  await heartbeat('online', 1);
  try {
    await processJob(job);
  } catch (error) {
    await failJob(job, error);
  } finally {
    await heartbeat('online', 0);
  }
  return true;
};

const startJudgeWorker = () => {
  if (loopPromise) return loopPromise;

  stopping = false;
  loopPromise = (async () => {
    await heartbeat('online', 0);
    while (!stopping) {
      const hadJob = await tick();
      if (!hadJob) await sleep(pollIntervalMs);
    }
    await heartbeat('offline', 0);
  })();

  return loopPromise;
};

const stopJudgeWorker = async () => {
  stopping = true;
  if (loopPromise) await loopPromise;
  loopPromise = null;
};

module.exports = { startJudgeWorker, stopJudgeWorker, tick };
