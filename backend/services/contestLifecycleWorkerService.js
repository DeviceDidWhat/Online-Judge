const { Worker } = require('bullmq');
const connection = require('../config/redis');
const Contest = require('../models/contest');
const { finalizeContest, emitStatusChange } = require('./contestService');
const {
  CONTEST_LIFECYCLE_QUEUE,
  CONTEST_FINALIZE_QUEUE,
  scheduleContestLifecycle,
  enqueueContestFinalize,
} = require('./contestQueue');

const finalizeConcurrency = Number(process.env.CONTEST_FINALIZE_CONCURRENCY || 1);

let lifecycleWorker = null;
let finalizeWorker = null;

const processLifecycleJob = async (job) => {
  const { contestId } = job.data;

  if (job.name === 'go-live') {
    const contest = await Contest.findOneAndUpdate(
      { _id: contestId, status: 'upcoming' },
      { status: 'live' },
      { new: true }
    );
    if (contest) {
      console.log(`[contestLifecycle] Contest "${contest.name}" -> live`);
      emitStatusChange(contest, 'live');
    }
    return;
  }

  if (job.name === 'end') {
    const contest = await Contest.findOneAndUpdate(
      { _id: contestId, status: { $ne: 'ended' } },
      { status: 'ended' },
      { new: true }
    );
    if (contest) {
      console.log(`[contestLifecycle] Contest "${contest.name}" -> ended`);
      emitStatusChange(contest, 'ended');
    }
    // Always queue finalize, even if this contest was already ended by another
    // path (e.g. admin force-end) — enqueueContestFinalize's jobId dedupes it.
    await enqueueContestFinalize(contestId);
  }
};

// finalizeContest itself defers (returns false, doesn't throw) while in-window
// submissions are still judging. Throwing here is what makes BullMQ retry it.
const processFinalizeJob = async (job) => {
  const { contestId } = job.data;
  const contest = await Contest.findById(contestId).select('ratingProcessed');
  if (!contest || contest.ratingProcessed) return;

  const done = await finalizeContest(contestId);
  if (!done) throw new Error('Contest not ready to finalize yet (submissions still judging)');
};

// Recovers schedules after a process restart: contests still upcoming/live get their
// go-live/end jobs re-added (the deterministic jobId makes this a no-op if the job
// already exists in Redis), and any ended-but-unprocessed contest gets a finalize job.
const backfillContestSchedules = async () => {
  const pending = await Contest.find({ status: { $in: ['upcoming', 'live'] } });
  await Promise.all(pending.map((c) => scheduleContestLifecycle(c)));

  const unfinalized = await Contest.find({ status: 'ended', ratingProcessed: false }).select('_id');
  await Promise.all(unfinalized.map((c) => enqueueContestFinalize(c._id)));
};

const startContestLifecycleWorker = () => {
  if (lifecycleWorker) return lifecycleWorker;

  lifecycleWorker = new Worker(CONTEST_LIFECYCLE_QUEUE, processLifecycleJob, { connection, concurrency: 5 });
  finalizeWorker = new Worker(CONTEST_FINALIZE_QUEUE, processFinalizeJob, { connection, concurrency: finalizeConcurrency });

  lifecycleWorker.on('error', (err) => console.error('[contestLifecycle] worker error:', err.message));
  finalizeWorker.on('error', (err) => console.error('[contestFinalize] worker error:', err.message));
  finalizeWorker.on('failed', (job, err) => {
    console.error(`[contestFinalize] attempt ${job?.attemptsMade} failed for contest ${job?.data?.contestId}:`, err.message);
  });

  backfillContestSchedules().catch((err) => console.error('[contestLifecycle] backfill error:', err.message));

  return lifecycleWorker;
};

const stopContestLifecycleWorker = async () => {
  if (lifecycleWorker) {
    await lifecycleWorker.close();
    lifecycleWorker = null;
  }
  if (finalizeWorker) {
    await finalizeWorker.close();
    finalizeWorker = null;
  }
};

module.exports = { startContestLifecycleWorker, stopContestLifecycleWorker };
