/**
 * contestService.js
 *
 * Core business logic for contest scoring, finalization, and rating computation.
 *
 * Scoring:  ICPC-style
 *   - score   = number of problems solved (each problem solved adds 1)
 *   - penalty = sum over solved problems of: (minutesFromStart + 20 * wrongAttempts)
 *   - Tiebreak: score DESC → penalty ASC → first-solve-time ASC
 *
 * Rating: Codeforces-style Elo
 *   - Uses expected vs actual rank to compute delta (capped at ±300 per contest)
 *   - Applies a small inflation correction (+1 to bottom 75%, -1 to top 25%)
 */

const Contest = require('../models/contest');
const ContestRegistration = require('../models/contestRegistration');
const RatingHistory = require('../models/ratingHistory');
const User = require('../models/user');
const { getIO } = require('../socket');

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after a submission is judged, if it belongs to a contest.
 * Updates the contestant's score and penalty atomically.
 * Fully idempotent — second AC on same problem is ignored.
 *
 * @param {string|ObjectId} contestId
 * @param {string|ObjectId} userId
 * @param {string|ObjectId} problemId
 * @param {object} submission  — the just-judged Submission document
 */
const WRONG_VERDICTS = ['Wrong Answer', 'TLE', 'MLE', 'Runtime Error', 'Compilation Error'];

const updateContestScore = async (contestId, userId, problemId) => {
  const Submission = require('../models/submission');

  // Recompute is read-modify-write, so retry on a concurrent modification
  // (two submissions for the same user judged at the same time).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const contest = await Contest.findById(contestId).select('startsAt duration status problems ratingProcessed');
      if (!contest) return;
      // Once ratings are computed the standings are locked — don't keep mutating them.
      // We intentionally do NOT bail on status === 'ended': a submission made in the
      // final seconds (while live) may only finish judging after the contest flips to
      // ended, and it must still be scored.
      if (contest.ratingProcessed) return;

      const registration = await ContestRegistration.findOne({ contest: contestId, user: userId });
      if (!registration) return;

      // ── Recompute this problem's contribution from submission TIMES ───────────
      // We deliberately ignore the order in which submissions were judged and derive
      // the official result purely from `submittedAt`. This converges to the correct
      // ICPC result no matter what order the judge finishes submissions in.
      // Only judged (non-Pending) submissions made WITHIN the contest window count.
      const contestEndMs = new Date(contest.startsAt).getTime() + contest.duration * 60 * 1000;
      const attempts = await Submission.find({
        contest: contestId,
        user: userId,
        problem: problemId,
        verdict: { $ne: 'Pending' },
        submittedAt: { $lte: new Date(contestEndMs) },
      }).select('verdict submittedAt').sort({ submittedAt: 1 });

      // The official solve is the EARLIEST accepted submission by submission time.
      const firstAccepted = attempts.find((s) => s.verdict === 'Accepted');

      const existingIdx = registration.solvedProblems.findIndex(
        (sp) => sp.problem.toString() === problemId.toString()
      );

      // Wrong attempts in ICPC count only non-accepted submissions made BEFORE the AC.
      if (firstAccepted) {
        const acMs = new Date(firstAccepted.submittedAt).getTime();
        const wrongAttempts = attempts.filter(
          (s) => WRONG_VERDICTS.includes(s.verdict)
            && new Date(s.submittedAt).getTime() < acMs
        ).length;

        const contestStartMs = new Date(contest.startsAt).getTime();
        const minutesFromStart = Math.max(0, Math.floor((acMs - contestStartMs) / 60000));
        const timePenaltyMinutes = minutesFromStart + 20 * wrongAttempts;

        const solvedEntry = {
          problem: problemId,
          submission: firstAccepted._id,
          solvedAt: firstAccepted.submittedAt,
          points: 1,
          wrongAttempts,
          timePenaltyMinutes,
        };

        if (existingIdx === -1) {
          registration.solvedProblems.push(solvedEntry);
        } else {
          // Replace — corrects an earlier value computed from out-of-order judging.
          registration.solvedProblems[existingIdx] = solvedEntry;
        }
      } else if (existingIdx !== -1) {
        // No AC among judged submissions, yet we have a stale solve entry
        // (e.g. an AC was rejudged to a wrong verdict). Remove it.
        registration.solvedProblems.splice(existingIdx, 1);
      } else {
        // Still unsolved — wrong attempts alone never change score/penalty in ICPC.
        return;
      }

      // ── Recompute aggregates from solvedProblems (single source of truth) ──────
      registration.score = registration.solvedProblems.length;
      registration.penalty = registration.solvedProblems.reduce(
        (sum, sp) => sum + (sp.timePenaltyMinutes || 0), 0
      );
      // Tiebreak key: time of the LATEST solve (derived from submittedAt).
      registration.lastSolveAt = registration.solvedProblems.reduce((latest, sp) => {
        const t = new Date(sp.solvedAt).getTime();
        return t > latest ? t : latest;
      }, 0) || undefined;

      await registration.save();
      return;
    } catch (err) {
      // VersionError → another judge updated this registration; re-read and retry.
      if (err.name === 'VersionError' && attempt < 2) continue;
      console.error('[contestService] updateContestScore error:', err);
      return;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assigns rank numbers to all registrations for a contest.
 * Sort order: score DESC, penalty ASC, last-solve-time ASC.
 * Tiebreak uses lastSolveAt (derived from submittedAt), so it is independent of the
 * order submissions were judged in. Falls back to 0 for registrations with no solves.
 * Returns the sorted registrations with ranks applied (not saved yet).
 */
const rankRegistrations = (registrations) => {
  const sorted = [...registrations].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    return new Date(a.lastSolveAt || 0) - new Date(b.lastSolveAt || 0);
  });

  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].score === sorted[i - 1].score && sorted[i].penalty === sorted[i - 1].penalty) {
      sorted[i]._rank = sorted[i - 1]._rank;
    } else {
      sorted[i]._rank = rank;
    }
    rank++;
  }

  return sorted;
};

// ─────────────────────────────────────────────────────────────────────────────
// Codeforces-style Rating
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Probability that player A (rating Ra) beats player B (rating Rb).
 * Uses the Codeforces formula.
 */
const winProbability = (Ra, Rb) => 1 / (1 + Math.pow(6, (Rb - Ra) / 400));

/**
 * Compute seed (expected rank) for each player.
 * seed_i = 1 + sum over all j≠i of P(j beats i)
 */
const computeSeeds = (ratings) => {
  return ratings.map((Ra) => {
    const seed = 1 + ratings.reduce((acc, Rb) => acc + winProbability(Rb, Ra), 0);
    return seed;
  });
};

/**
 * Full Codeforces-style rating update.
 *
 * @param {Array<{userId, rating, rank}>} participants  — sorted by rank ASC
 * @returns {Array<{userId, delta, newRating}>}
 */
const codeforcesRatingUpdate = (participants) => {
  if (participants.length === 0) return [];

  const ratings = participants.map((p) => p.rating);
  const seeds = computeSeeds(ratings);

  const deltas = participants.map((p, i) => {
    const seed = seeds[i];
    const rank = p.rank;

    // Target rank = geometric mean of seed and actual rank
    const targetRank = Math.sqrt(seed * rank);

    // Rating the participant SHOULD have to expect rank = targetRank
    // Solve: targetRank = 1 + sum P(j beats X) — we find X by binary search
    const targetRating = binarySearchRating(targetRank, ratings, i);

    let delta = Math.round((targetRating - p.rating) / 2);

    // Cap delta
    delta = Math.max(-300, Math.min(300, delta));
    return delta;
  });

  // Inflation correction:
  // Ensure sum of top half deltas doesn't blow up ratings
  const totalSum = deltas.reduce((a, b) => a + b, 0);
  const correction = Math.min(0, Math.max(-totalSum / participants.length - 1, -10));
  const correctedDeltas = deltas.map((d) => d + Math.round(correction));

  // Additional: guarantee bottom 75% gets at least +1, top 25% pays the cost
  // (optional fairness adjustment — keeps platform rating healthy)
  const cutoff = Math.floor(participants.length * 0.75);
  for (let i = cutoff; i < participants.length; i++) {
    if (correctedDeltas[i] < -1) correctedDeltas[i] = -1;
  }

  return participants.map((p, i) => ({
    userId: p.userId,
    delta: correctedDeltas[i],
    newRating: Math.max(0, p.rating + correctedDeltas[i]),
  }));
};

/**
 * Binary search for the rating R such that expectedRank(R, others) ≈ targetRank.
 */
const binarySearchRating = (targetRank, allRatings, skipIndex) => {
  const otherRatings = allRatings.filter((_, i) => i !== skipIndex);

  const expectedRank = (R) => 1 + otherRatings.reduce((acc, Rb) => acc + winProbability(Rb, R), 0);

  let lo = 1, hi = 6000;
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    if (expectedRank(mid) < targetRank) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return Math.round((lo + hi) / 2);
};

// ─────────────────────────────────────────────────────────────────────────────
// Finalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finalizes a contest:
 * 1. Assigns ranks to all participants.
 * 2. Computes and applies rating changes.
 * 3. Marks the contest as ratingProcessed.
 *
 * Idempotent — safe to call multiple times (re-processing is blocked).
 *
 * @param {string|ObjectId} contestId
 * @returns {boolean} — true if processed, false if already done or no participants
 */
const finalizeContest = async (contestId) => {
  // Re-fetch with a fresh find so we see the latest document
  const contest = await Contest.findById(contestId);
  if (!contest) {
    console.log(`[contestService] finalizeContest: contest ${contestId} not found`);
    return false;
  }
  if (contest.ratingProcessed) {
    console.log(`[contestService] finalizeContest: already processed for ${contest.name}`);
    return false;
  }

  const Submission = require('../models/submission');

  // ── Fix A: don't finalize while in-window submissions are still being judged ──
  // A last-second submission may still be Pending when the contest flips to ended.
  // Finalizing now would lock standings before that verdict is scored. Defer instead;
  // transitionContestStatuses re-attempts finalize on a later tick once judging settles.
  const pendingCount = await Submission.countDocuments({ contest: contestId, verdict: 'Pending' });
  if (pendingCount > 0) {
    console.log(`[contestService] finalizeContest: ${pendingCount} submission(s) still judging for "${contest.name}" — deferring.`);
    return false;
  }

  console.log(`[contestService] Finalizing contest: ${contest.name}`);

  const allRegistrations = await ContestRegistration.find({ contest: contestId }).populate('user', 'rating username');

  // ── Fix B: only rate users who actually participated (made ≥1 submission) ──────
  // Registering and never submitting should not change your rating.
  const submittedUserIds = await Submission.distinct('user', { contest: contestId });
  const participatedSet = new Set(submittedUserIds.map(String));
  const registrations = allRegistrations.filter((reg) => participatedSet.has(String(reg.user._id)));

  if (registrations.length === 0) {
    await Contest.findByIdAndUpdate(contestId, { ratingProcessed: true });
    try {
      const io = getIO();
      const payload = { contestId: String(contestId), status: 'ended', ratingProcessed: true };
      io.to(`contest:${contestId}`).emit('contest:statusChange', payload);
      io.emit('contest:statusChange', payload);
    } catch {}
    return true;
  }

  // Step 1: Rank
  const sorted = rankRegistrations(registrations);

  // Step 2: Write ranks back
  const rankUpdates = sorted.map((reg) =>
    ContestRegistration.findByIdAndUpdate(reg._id, { rank: reg._rank })
  );
  await Promise.all(rankUpdates);

  // Step 3: Compute ratings
  const participants = sorted.map((reg) => ({
    userId: reg.user._id,
    registrationId: reg._id,
    username: reg.user.username,
    rating: reg.user.rating || 1200,
    rank: reg._rank,
  }));

  const results = codeforcesRatingUpdate(participants);

  // Step 4: Apply rating updates and create history records
  const now = new Date();
  const applyUpdates = results.map(async ({ userId, delta, newRating }, i) => {
    const regId = participants[i].registrationId;
    const rank = participants[i].rank;

    await Promise.all([
      User.findByIdAndUpdate(userId, { rating: newRating }),
      ContestRegistration.findByIdAndUpdate(regId, { ratingChange: delta }),
      RatingHistory.create({
        user: userId,
        contest: contestId,
        contestName: contest.name,
        rating: newRating,
        change: delta,
        rank,
        createdAt: now,
      }),
    ]);
  });

  await Promise.all(applyUpdates);

  // Step 5: Mark processed
  await Contest.findByIdAndUpdate(contestId, { ratingProcessed: true });

  // Notify all clients that rating processing is complete so they reload
  // without a manual refresh. This is a second event after the ended transition.
  try {
    const io = getIO();
    const payload = {
      contestId: String(contestId),
      status: 'ended',
      ratingProcessed: true,
      startsAt: contest.startsAt,
      duration: contest.duration,
    };
    io.to(`contest:${contestId}`).emit('contest:statusChange', payload);
    io.emit('contest:statusChange', payload);
  } catch {}

  console.log(`[contestService] Contest "${contest.name}" finalized. ${results.length} ratings updated.`);
  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks all contests and transitions statuses as needed:
 *   upcoming → live  (when now >= startsAt)
 *   live → ended     (when now >= startsAt + duration*60s)
 *
 * Then finalizes any newly ended contests that haven't been processed.
 * Called on every judge worker tick (~1.5s interval).
 */
const emitStatusChange = (contest, status) => {
  try {
    const io = getIO();
    const payload = {
      contestId: String(contest._id),
      status,
      startsAt: contest.startsAt,
      duration: contest.duration,
    };
    // Notify both room members and ALL connected clients (lists page, etc.)
    io.to(`contest:${contest._id}`).emit('contest:statusChange', payload);
    io.emit('contest:statusChange', payload);
  } catch {
    // Socket not initialised (separate worker process) — contestWatcher handles it via change stream.
  }
};

const transitionContestStatuses = async () => {
  const now = new Date();

  try {
    // ── upcoming → live ───────────────────────────────────────────────────────
    // Fetch BEFORE updating so we have the documents to emit events for.
    const toGoLive = await Contest.find({ status: 'upcoming', startsAt: { $lte: now } });
    if (toGoLive.length > 0) {
      await Contest.updateMany(
        { status: 'upcoming', startsAt: { $lte: now } },
        { $set: { status: 'live' } }
      );
      for (const c of toGoLive) {
        console.log(`[contestService] Contest "${c.name}" → live`);
        emitStatusChange(c, 'live');
      }
    }

    // ── live → ended ──────────────────────────────────────────────────────────
    const liveContests = await Contest.find({ status: 'live' });
    const toEnd = liveContests.filter((c) => {
      const endTime = new Date(c.startsAt).getTime() + c.duration * 60 * 1000;
      return now.getTime() >= endTime;
    });

    for (const contest of toEnd) {
      await Contest.findByIdAndUpdate(contest._id, { status: 'ended' });
      console.log(`[contestService] Contest "${contest.name}" → ended`);
      emitStatusChange(contest, 'ended');
    }

    // ── finalize ended-but-unprocessed contests ─────────────────────────────────
    // Covers contests that just ended above AND any whose finalize was deferred
    // (Fix A) because last-second submissions were still being judged. finalizeContest
    // is idempotent and self-defers, so re-attempting every tick is safe.
    const toFinalize = await Contest.find({ status: 'ended', ratingProcessed: false });
    for (const contest of toFinalize) {
      finalizeContest(contest._id).catch((err) =>
        console.error(`[contestService] Error finalizing contest ${contest._id}:`, err)
      );
    }
  } catch (err) {
    console.error('[contestService] transitionContestStatuses error:', err);
  }
};

module.exports = {
  updateContestScore,
  finalizeContest,
  transitionContestStatuses,
  rankRegistrations,
  codeforcesRatingUpdate,
};
