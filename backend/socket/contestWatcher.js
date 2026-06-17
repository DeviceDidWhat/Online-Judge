const Contest = require('../models/contest');
const { getIO } = require('./index');

/**
 * Watches the Contest collection for status transitions via MongoDB Change Streams.
 *
 * The contest lifecycle BullMQ worker (services/contestLifecycleWorkerService.js)
 * flips status via a silent Contest.findOneAndUpdate() when its go-live/end jobs
 * fire. This watcher detects those DB writes and notifies all connected clients
 * so they can reload without refreshing — a fallback for processes that ran the
 * write without direct Socket.IO access (e.g. a standalone worker process).
 *
 * Events emitted:
 *   contest:statusChange → to room `contest:<id>` with { contestId, status }
 *                        → also broadcast to ALL clients so the contests list updates
 */
async function startContestWatcher() {
  const pipeline = [
    {
      $match: {
        operationType: { $in: ['update', 'replace'] },
        'updateDescription.updatedFields.status': { $exists: true },
      },
    },
  ];

  const changeStream = Contest.watch(pipeline, { fullDocument: 'updateLookup' });

  changeStream.on('change', async (change) => {
    try {
      const contest = change.fullDocument;
      if (!contest) return;

      const io = getIO();
      const payload = {
        contestId: String(contest._id),
        status:    contest.status,
        startsAt:  contest.startsAt,
        duration:  contest.duration,
        ratingProcessed: contest.ratingProcessed,
      };

      // Notify clients watching this specific contest (joined the room).
      io.to(`contest:${contest._id}`).emit('contest:statusChange', payload);

      // Also broadcast to ALL connected clients so the contests list page
      // can reflect status changes without polling.
      io.emit('contest:statusChange', payload);

      console.log(`[contestWatcher] Contest "${contest.name}" → ${contest.status}`);
    } catch (err) {
      console.error('[contestWatcher] Error handling change:', err.message);
    }
  });

  changeStream.on('error', (err) => {
    console.error('[contestWatcher] Change stream error:', err.message);
  });

  console.log('[contestWatcher] Contest change stream started');
  return changeStream;
}

module.exports = { startContestWatcher };
