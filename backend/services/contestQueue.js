const { Queue } = require('bullmq');
const connection = require('../config/redis');

const CONTEST_LIFECYCLE_QUEUE = 'contest-lifecycle';
const CONTEST_FINALIZE_QUEUE = 'contest-finalize';
const CONTEST_FINALIZE_MAX_ATTEMPTS = Number(process.env.CONTEST_FINALIZE_MAX_ATTEMPTS || 200);
const CONTEST_FINALIZE_RETRY_DELAY_MS = Number(process.env.CONTEST_FINALIZE_RETRY_DELAY_MS || 5000);

const contestLifecycleQueue = new Queue(CONTEST_LIFECYCLE_QUEUE, { connection });
const contestFinalizeQueue = new Queue(CONTEST_FINALIZE_QUEUE, { connection });

// Deterministic ids so re-scheduling (e.g. after editing startsAt) and process
// restarts dedupe against any job that's still waiting/delayed in Redis.
const goLiveJobId = (contestId) => `go-live-${contestId}`;
const endJobId = (contestId) => `end-${contestId}`;
const finalizeJobId = (contestId) => `finalize-${contestId}`;

// Schedules (or re-schedules) the go-live and end jobs for a contest based on its
// current startsAt/duration. Safe to call repeatedly — same jobId means BullMQ
// won't duplicate a job that's still pending.
const scheduleContestLifecycle = async (contest) => {
  const startMs = new Date(contest.startsAt).getTime();
  const endMs = startMs + contest.duration * 60 * 1000;
  const now = Date.now();

  await Promise.all([
    contestLifecycleQueue.add('go-live', { contestId: contest._id.toString() }, {
      jobId: goLiveJobId(contest._id),
      delay: Math.max(0, startMs - now),
      removeOnComplete: true,
      removeOnFail: true,
    }),
    contestLifecycleQueue.add('end', { contestId: contest._id.toString() }, {
      jobId: endJobId(contest._id),
      delay: Math.max(0, endMs - now),
      removeOnComplete: true,
      removeOnFail: true,
    }),
  ]);
};

// Removes any not-yet-run lifecycle jobs for a contest. Needed before rescheduling
// after startsAt/duration is edited (BullMQ can't reschedule a delayed job's delay
// in place) and when a contest is deleted.
const cancelContestLifecycle = async (contestId) => {
  await Promise.all([
    contestLifecycleQueue.remove(goLiveJobId(contestId)),
    contestLifecycleQueue.remove(endJobId(contestId)),
    contestFinalizeQueue.remove(finalizeJobId(contestId)),
  ]);
};

// finalizeContest self-defers while submissions are still judging, so give it
// plenty of retries spaced a few seconds apart rather than a tight error backoff.
const enqueueContestFinalize = (contestId) => contestFinalizeQueue.add(
  'finalize',
  { contestId: contestId.toString() },
  {
    jobId: finalizeJobId(contestId),
    attempts: CONTEST_FINALIZE_MAX_ATTEMPTS,
    backoff: { type: 'fixed', delay: CONTEST_FINALIZE_RETRY_DELAY_MS },
    removeOnComplete: true,
    removeOnFail: { age: 86400 },
  }
);

module.exports = {
  CONTEST_LIFECYCLE_QUEUE,
  CONTEST_FINALIZE_QUEUE,
  contestLifecycleQueue,
  contestFinalizeQueue,
  scheduleContestLifecycle,
  cancelContestLifecycle,
  enqueueContestFinalize,
};
