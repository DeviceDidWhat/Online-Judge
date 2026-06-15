const Submission = require('../models/submission');
const ContestRegistration = require('../models/contestRegistration');
const { getIO } = require('./index');

/**
 * Watches the Submission collection for verdict changes via MongoDB Change Streams.
 *
 * This runs in the SERVER process and reacts to updates made by the WORKER process,
 * bridging the cross-process gap without needing Redis or a message queue.
 *
 * Events emitted:
 *   submission:result  → to room `user:<userId>`   (private)
 *   contest:leaderboard → to room `contest:<id>`   (broadcast)
 */
async function startSubmissionWatcher() {
  // Only watch for updates where the verdict field changes to a non-Pending value.
  const pipeline = [
    {
      $match: {
        operationType: 'update',
        'updateDescription.updatedFields.verdict': { $exists: true },
      },
    },
  ];

  const changeStream = Submission.watch(pipeline, { fullDocument: 'updateLookup' });

  changeStream.on('change', async (change) => {
    try {
      const submission = change.fullDocument;
      if (!submission) return;
      // Ignore if still pending — we only want final verdicts.
      if (submission.verdict === 'Pending') return;

      const io = getIO();

      // Push verdict to the submitting user.
      // NOTE: when the judge runs embedded (JUDGE_WORKER_ENABLED=true),
      // submissionResultService also emits this directly after scoring.
      // This acts as a fallback for standalone worker processes that cannot
      // reach Socket.IO.  Duplicate delivery is harmless on the client.
      io.to(`user:${submission.user}`).emit('submission:result', {
        submissionId: submission.submissionId,
        verdict:      submission.verdict,
        language:     submission.language,
        submittedAt:  submission.submittedAt,
        runtime:      submission.runtime,
        memory:       submission.memory,
        testcasesPassed: submission.testcasesPassed,
        totalTestcases:  submission.totalTestcases,
        stdout:          submission.stdout,
        stderr:          submission.stderr,
        compileOutput:   submission.compileOutput,
        failedTestcase:  submission.failedTestcase,
        testcaseResults: submission.testcaseResults,
        judgedAt:        submission.judgedAt,
      });

      // ── Leaderboard is intentionally NOT emitted here ───────────────────────
      // submissionResultService emits contest:leaderboard AFTER updateContestScore
      // has written the new score/solvedProblems to ContestRegistration.
      // Emitting here would fire before that update runs, sending stale standings
      // that then need to be corrected — causing the visible "slow update" flash.
    } catch (err) {
      console.error('[submissionWatcher] Error handling change:', err.message);
    }
  });

  changeStream.on('error', (err) => {
    console.error('[submissionWatcher] Change stream error:', err.message);
  });

  console.log('[submissionWatcher] Submission change stream started');
  return changeStream;
}

module.exports = { startSubmissionWatcher };
