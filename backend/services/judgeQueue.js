const { Queue } = require('bullmq');
const connection = require('../config/redis');

const JUDGE_QUEUE_NAME = 'judge-jobs';
const JUDGE_MAX_ATTEMPTS = Number(process.env.JUDGE_MAX_ATTEMPTS || 3);

const judgeQueue = new Queue(JUDGE_QUEUE_NAME, { connection });

// The old Mongo-backed queue sorted by priority desc (bigger = more urgent).
// BullMQ priority is ascending (1 = most urgent, unset = normal FIFO), so invert it.
const toBullPriority = (priority) => (priority > 0 ? Math.max(1, 1000 - priority) : undefined);

const enqueueJudgeJob = (judgeJobId, { priority = 0 } = {}) => judgeQueue.add(
  'judge',
  { judgeJobId: judgeJobId.toString() },
  {
    jobId: judgeJobId.toString(),
    priority: toBullPriority(priority),
    attempts: JUDGE_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
  }
);

module.exports = { judgeQueue, enqueueJudgeJob, JUDGE_QUEUE_NAME, JUDGE_MAX_ATTEMPTS };
