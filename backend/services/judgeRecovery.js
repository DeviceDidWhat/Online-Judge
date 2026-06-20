const JudgeJob = require('../models/judgeJob');
const Submission = require('../models/submission');
const { enqueueJudgeJob } = require('./judgeQueue');

// A submission only becomes judgeable once its JudgeJob is added to the BullMQ
// queue. If that enqueue ever fails (e.g. Redis is briefly unreachable) or a job
// is otherwise lost, the submission would sit at "Pending" forever — and because
// contest finalization defers while any in-window submission is Pending, a single
// lost job can permanently wedge a contest's standings.
//
// This reaper finds non-terminal JudgeJobs whose submission is still Pending and
// re-enqueues them. enqueueJudgeJob uses jobId = judgeJobId, so any job still
// present in Redis (waiting/delayed/active) is deduped and untouched — only
// genuinely lost jobs are revived. BullMQ's own stalled-job detection already
// handles workers that die mid-job; this covers the gap it cannot see (jobs that
// never reached Redis at all).
const STALE_RUNNING_MS = Number(process.env.JUDGE_STALE_RUNNING_MS || 5 * 60 * 1000);

const recoverStuckJudgeJobs = async () => {
  const staleRunningBefore = new Date(Date.now() - STALE_RUNNING_MS);

  const candidates = await JudgeJob.find({
    $or: [
      { status: 'queued' },
      // A job marked running but with no recent progress is likely orphaned; the
      // jobId dedupe makes re-enqueuing a genuinely-active job a harmless no-op.
      { status: 'running', startedAt: { $lt: staleRunningBefore } },
      { status: 'running', startedAt: { $exists: false } },
    ],
  }).select('_id submission priority').lean();

  let revived = 0;
  for (const job of candidates) {
    const submission = await Submission.findById(job.submission).select('verdict').lean();
    // Only revive jobs whose submission is still unresolved.
    if (!submission || submission.verdict !== 'Pending') continue;
    try {
      await enqueueJudgeJob(job._id, { priority: job.priority || 0 });
      revived += 1;
    } catch (err) {
      console.error('[judgeRecovery] re-enqueue failed for job', String(job._id), '-', err.message);
    }
  }

  if (revived > 0) console.log(`[judgeRecovery] re-enqueued ${revived} stuck judge job(s)`);
  return revived;
};

module.exports = { recoverStuckJudgeJobs };
