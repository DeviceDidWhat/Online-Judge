const JudgeJob = require('../models/judgeJob');
const JudgeWorker = require('../models/judgeWorker');
const { asyncHandler, parsePagination } = require('../utils/controller');

const listJobs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 30 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [jobs, total] = await Promise.all([
    JudgeJob.find(filter)
      .populate({ path: 'submission', select: 'submissionId verdict language problemTitle submittedAt', populate: { path: 'user', select: 'username' } })
      .populate('worker', 'workerId region status')
      .sort({ priority: -1, queuedAt: 1 })
      .skip(skip)
      .limit(limit),
    JudgeJob.countDocuments(filter),
  ]);

  res.json({ jobs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const updateJob = asyncHandler(async (req, res) => {
  const job = await JudgeJob.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!job) return res.status(404).json({ message: 'Judge job not found' });
  res.json({ job });
});

const WORKER_STALE_THRESHOLD_MS = Number(process.env.JUDGE_WORKER_STALE_MS || 30_000);

const listWorkers = asyncHandler(async (req, res) => {
  const staleThreshold = new Date(Date.now() - WORKER_STALE_THRESHOLD_MS);

  // Auto-mark workers whose heartbeat is older than the threshold as offline
  await JudgeWorker.updateMany(
    { status: { $ne: 'offline' }, lastHeartbeatAt: { $lt: staleThreshold } },
    { $set: { status: 'offline', load: 0, activeJobs: 0 } }
  );

  const workers = await JudgeWorker.find({}).sort({ status: 1, load: 1, region: 1 });
  res.json({ workers });
});

const upsertWorker = asyncHandler(async (req, res) => {
  const worker = await JudgeWorker.findOneAndUpdate(
    { workerId: req.params.workerId },
    { ...req.body, workerId: req.params.workerId, lastHeartbeatAt: req.body.lastHeartbeatAt || new Date() },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json({ worker });
});

const deleteWorker = asyncHandler(async (req, res) => {
  const worker = await JudgeWorker.findOneAndDelete({ workerId: req.params.workerId });
  if (!worker) return res.status(404).json({ message: 'Judge worker not found' });
  res.json({ message: 'Judge worker deleted' });
});

module.exports = { listJobs, updateJob, listWorkers, upsertWorker, deleteWorker };
