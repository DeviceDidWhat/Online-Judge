# Redis + BullMQ — Implementation Guide

This document describes how to introduce **Redis** and **BullMQ** into the Online Judge
backend. It is a design/migration reference — it maps each opportunity to the **actual
files** in this repository, explains *why* the change helps, and sketches the
implementation.

> **Scope:** Backend only (`backend/`). The current architecture works without these —
> this guide is for scaling, removing hand-rolled infrastructure, and preparing for a
> multi-instance deployment.

---

## Table of Contents

1. [Background — current architecture](#background)
2. [Why Redis + BullMQ (and not Kafka)](#why)
3. [Prerequisites & setup](#setup)
4. [Part 1 — BullMQ (background job queue)](#part-1)
   - [1. Judge queue](#p1-judge)
   - [2. Contest scheduling (go-live / end / finalize)](#p1-schedule)
   - [3. Contest finalization / rating computation](#p1-finalize)
   - [4. Notifications & email](#p1-notify)
5. [Part 2 — Redis (cache / data structures / pub-sub)](#part-2)
   - [5. Live leaderboard via Sorted Sets](#p2-leaderboard)
   - [6. Socket.IO Redis adapter](#p2-adapter)
   - [7. Caching hot reads](#p2-cache)
   - [8. Rate limiting](#p2-ratelimit)
   - [9. Auth token store / revocation](#p2-tokens)
   - [10. Distributed lock for finalize idempotency](#p2-lock)
6. [Implementation priority](#priority)
7. [Deployment notes](#deploy)

---

<a name="background"></a>

## 1. Background — current architecture

The submission pipeline today is a **MongoDB-backed polling queue**:

1. **Submit** — `createSubmission` creates a `Submission` + a `JudgeJob` document.
   - `backend/controllers/submissionController.js`
2. **Judge worker** — polls MongoDB every ~1.5s, atomically claims a job with
   `findOneAndUpdate` (`queued → running`), runs the code, writes the verdict. It
   hand-rolls priority ordering, retries (`attempts`/`maxAttempts`), stale-job
   requeue, and worker heartbeats.
   - `backend/services/judgeWorkerService.js`
3. **Real-time results** — MongoDB Change Streams detect verdict/status changes and
   Socket.IO pushes them to the user / contest room.
   - `backend/socket/submissionWatcher.js`
   - `backend/socket/contestWatcher.js`
   - `backend/socket/index.js`

This works on a single backend instance. The limitations it hits at scale:

- **~1.5s pickup latency** before a queued job runs (`JUDGE_POLL_INTERVAL_MS`).
- **Constant DB polling** load (job claim + contest status scan every tick).
- **Claim contention** as worker count grows (many workers racing one `findOneAndUpdate`).
- **Single-process Socket.IO** — emits don't reach clients on other instances.
- **Full leaderboard re-query** on every judged contest submission (hot path).

---

<a name="why"></a>

## 2. Why Redis + BullMQ (and not Kafka)

- **BullMQ** is a Redis-backed **job queue** built for exactly this: one worker grabs one
  job, acks it, retries on failure. It maps 1:1 onto the existing `JudgeJob` model.
- **Redis** additionally provides the cache, leaderboard data structure (Sorted Sets),
  Socket.IO pub/sub adapter, rate-limit counters, and token store.
- **Kafka** is a distributed event *log*, not a task queue. It is overkill for an online
  judge (the bottleneck is code execution, not message throughput) and would require
  re-implementing claim/retry/DLQ semantics on top of partitions and offsets.

> **Key infra fact:** Everything below shares **one Redis instance**. BullMQ, the cache,
> the leaderboard ZSETs, the Socket.IO adapter, rate limiting, and the token store all
> connect to the same Redis server.

---

<a name="setup"></a>

## 3. Prerequisites & setup

### Dependencies

```bash
# backend/
npm install bullmq ioredis
npm install @socket.io/redis-adapter        # for Part 2 #6
npm install rate-limit-redis express-rate-limit   # for Part 2 #8
```

### Environment variables

```dotenv
# backend/.env
REDIS_URL=redis://localhost:6379
# or, for managed Redis:
# REDIS_URL=rediss://default:<password>@<host>:<port>
```

### Shared Redis connection (`backend/config/redis.js`)

```js
const IORedis = require('ioredis');

// BullMQ requires maxRetriesPerRequest = null on its connection.
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => console.error('[redis] connection error:', err.message));
connection.on('connect', () => console.log('[redis] connected'));

module.exports = { connection };
```

### Local development

```bash
docker run -d --name oj-redis -p 6379:6379 redis:7-alpine
```

---

<a name="part-1"></a>

# Part 1 — BullMQ (background job queue)

<a name="p1-judge"></a>

## 1. Judge queue ⭐ (primary use)

**Replaces:** the `JudgeJob` polling loop in `backend/services/judgeWorkerService.js`
and the producer in `backend/controllers/submissionController.js`.

### What it removes

| Hand-rolled today | BullMQ equivalent |
|---|---|
| `JudgeJob.create(...)` | `judgeQueue.add(...)` |
| Poll loop + `pollIntervalMs` | Push-based `Worker` (no lag) |
| `claimJob` `findOneAndUpdate` | Built-in atomic job locking |
| `attempts` / `maxAttempts` / `failJob` retry | `attempts` + `backoff` job options |
| `requeueStaleJobs` (stale timeout) | Built-in `stalled` job recovery |
| `priority` sort | Native `priority` job option |

### Queue definition (`backend/queues/judgeQueue.js`)

```js
const { Queue } = require('bullmq');
const { connection } = require('../config/redis');

const judgeQueue = new Queue('judge', {
  connection,
  defaultJobOptions: {
    attempts: 3,                                  // was JUDGE_MAX_ATTEMPTS
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,                        // keep last 1000 for history
    removeOnFail: 5000,
  },
});

module.exports = { judgeQueue };
```

### Producer — on submit

In `backend/controllers/submissionController.js`, replace the `JudgeJob.create(...)`
call inside `createSubmission`:

```js
// before:
// JudgeJob.create({ submission: submission._id }),

// after:
judgeQueue.add(
  'run',
  { submissionId: submission._id.toString() },
  { priority: 1 }            // higher number = higher priority if needed
);
```

### Consumer — the worker (`backend/workers/judgeWorker.js`)

```js
const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const Submission = require('../models/submission');
const Problem = require('../models/problem');
const { runSubmission } = require('../services/judgeRunner');
const { applySubmissionResult } = require('../services/submissionResultService');

const concurrency = Number(process.env.JUDGE_CONCURRENCY || 1);

const judgeWorker = new Worker(
  'judge',
  async (job) => {
    const submission = await Submission.findById(job.data.submissionId).populate('problem');
    if (!submission) throw new Error('Submission not found');
    const problem = submission.problem || (await Problem.findById(submission.problem));
    if (!problem) throw new Error('Problem not found');

    const result = await runSubmission({ submission, problem });
    await applySubmissionResult(submission._id, result);
  },
  { connection, concurrency }
);

// Final-failure handler — mirrors the old failJob() fallback verdict.
judgeWorker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await applySubmissionResult(job.data.submissionId, {
      verdict: 'Runtime Error',
      runtime: 0,
      memory: 0,
      testcasesPassed: 0,
      totalTestcases: 0,
      stderr: `Judge worker failed: ${err.message}`,
      testcaseResults: [],
    });
  }
});

module.exports = { judgeWorker };
```

### Notes

- `runSubmission` and `applySubmissionResult` are **reused unchanged** — only the
  transport around them changes.
- Scale judging by running more worker processes or raising `JUDGE_CONCURRENCY`.
- The `JudgeJob` / `JudgeWorker` models and heartbeat logic become optional. If you keep
  an admin "worker status" page, BullMQ's queue metrics (`getJobCounts`, `bullmq` events)
  or [Bull Board](https://github.com/felixmosh/bull-board) replace it.

---

<a name="p1-schedule"></a>

## 2. Contest scheduling (go-live / end / finalize) ⭐

**Replaces:** the per-tick scanning in `transitionContestStatuses()` —
`backend/services/contestService.js`.

### Problem today

`transitionContestStatuses()` runs on **every worker tick (~1.5s)**, scanning all
contests for `upcoming→live` and `live→ended` transitions. The transition times are
already known, so polling is wasteful.

### Solution — BullMQ delayed jobs

When a contest is **created** (in `backend/controllers/contestController.js`), schedule
its lifecycle events:

```js
const { contestQueue } = require('../queues/contestQueue');

const goLiveDelay = new Date(contest.startsAt).getTime() - Date.now();
const endDelay = goLiveDelay + contest.duration * 60 * 1000;

await contestQueue.add('go-live', { contestId }, { delay: Math.max(0, goLiveDelay) });
await contestQueue.add('end',     { contestId }, { delay: Math.max(0, endDelay) });
```

Worker (`backend/workers/contestWorker.js`):

```js
const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const Contest = require('../models/contest');
const { finalizeContest } = require('../services/contestService');

new Worker('contest', async (job) => {
  if (job.name === 'go-live') {
    await Contest.findByIdAndUpdate(job.data.contestId, { status: 'live' });
  } else if (job.name === 'end') {
    await Contest.findByIdAndUpdate(job.data.contestId, { status: 'ended' });
    await finalizeContest(job.data.contestId);   // see #3
  }
}, { connection });
```

- The status write still triggers `contestWatcher` → Socket.IO, so the realtime layer is
  unchanged.
- If a contest's `startsAt`/`duration` is edited, **re-schedule** (remove old delayed
  jobs by id and add new ones). Use deterministic `jobId`s, e.g.
  `jobId: ` + "`${contestId}:go-live`".

---

<a name="p1-finalize"></a>

## 3. Contest finalization / rating computation

**File:** `finalizeContest()` in `backend/services/contestService.js`.

This is genuinely CPU-heavy:
- `computeSeeds()` is **O(n²)** over participants.
- `binarySearchRating()` runs **50 iterations per participant**.

Today it's fired inline (`.catch()`) inside the worker tick, so a large contest finalize
can stall judging. Move it to its own job (triggered by the `end` job in #2, or its own
queue). It is **already idempotent** via the `ratingProcessed` flag, so retries are safe.

For very large contests, consider chunking the rating writes (Step 4 of `finalizeContest`)
across job iterations so a single job doesn't hold a long transaction.

---

<a name="p1-notify"></a>

## 4. Notifications & email

**File:** `backend/controllers/notificationController.js` (plus any email: verification,
password reset, contest reminders).

Move any "fan-out to many users" or outbound email onto a queue so the HTTP request
returns immediately and delivery retries on failure.

```js
const { notificationQueue } = require('../queues/notificationQueue');

// fan-out notification
await notificationQueue.add('broadcast', { type: 'contest-start', contestId, userIds });

// contest reminder — delayed job
await notificationQueue.add(
  'reminder',
  { contestId, userId },
  { delay: reminderTime - Date.now() }
);
```

---

<a name="part-2"></a>

# Part 2 — Redis (cache / data structures / pub-sub)

<a name="p2-leaderboard"></a>

## 5. Live leaderboard via Sorted Sets (ZSET) ⭐

**File:** `applySubmissionResult()` in
`backend/services/submissionResultService.js` (the contest block, ~lines 86–94).

### Problem today

On **every** judged contest submission, the code re-queries **all**
`ContestRegistration` documents, sorts them in Mongo, and broadcasts the full list. That
is O(n) DB work per submission — the exact hot path that struggles during a live contest.

### Solution — Redis Sorted Sets

A ZSET is the canonical leaderboard structure: score updates and ranked reads are
~O(log n), fully in-memory. Mongo stays the source of truth; Redis is the live ranking
cache.

```js
const { connection: redis } = require('../config/redis');

// ICPC ordering: score DESC, then penalty ASC. Encode both into one float so a single
// ZSET sorts correctly. (Higher composite = better rank.)
//   composite = score * 1e7 - penalty
function composite(score, penalty) {
  return score * 1e7 - penalty;
}

// On score change (inside updateContestScore / applySubmissionResult):
await redis.zadd(`contest:${contestId}:lb`, composite(score, penalty), userId.toString());

// Read top N for broadcast:
const top = await redis.zrevrange(`contest:${contestId}:lb`, 0, 49, 'WITHSCORES');
```

- Hydrate the ZSET when a contest goes live (or lazily on first read) from Mongo.
- Keep persisting authoritative score/penalty to `ContestRegistration` for durability and
  finalization; the ZSET is a fast read/rank cache.
- Set a TTL or delete the key after the contest ends + finalize.

---

<a name="p2-adapter"></a>

## 6. Socket.IO Redis adapter ⭐ (required for multi-instance)

**File:** `initSocketIO()` in `backend/socket/index.js`.

Socket.IO is currently single-process. With 2+ backend instances behind a load balancer,
an `io.to(...).emit()` on instance A **won't reach** a user connected to instance B. The
Redis adapter bridges instances via pub/sub.

```js
const { createAdapter } = require('@socket.io/redis-adapter');
const { connection } = require('../config/redis');

function initSocketIO(httpServer) {
  io = new Server(httpServer, { cors: { /* ...existing... */ } });

  const pubClient = connection;
  const subClient = connection.duplicate();   // adapter needs a separate subscriber
  io.adapter(createAdapter(pubClient, subClient));

  // ...existing auth middleware + connection handlers unchanged...
}
```

This is the **one item that becomes mandatory** (not optional) when scaling horizontally.

> Once this is in place, the MongoDB change-stream watchers
> (`submissionWatcher` / `contestWatcher`) can keep working, or you can emit Socket.IO
> events directly from the workers — both reach all instances via the adapter.

---

<a name="p2-cache"></a>

## 7. Caching hot reads

**Files:** `backend/controllers/problemController.js`,
`backend/controllers/dashboardController.js`,
`backend/controllers/ratingController.js`.

Cache read-heavy, rarely-changing endpoints with a TTL; invalidate on write.

```js
const { connection: redis } = require('../config/redis');

async function getProblemList(req, res) {
  const key = `problems:list:${req.query.page || 1}`;
  const cached = await redis.get(key);
  if (cached) return res.json(JSON.parse(cached));

  const data = await /* ...existing Mongo query... */;
  await redis.set(key, JSON.stringify(data), 'EX', 60);  // 60s TTL
  res.json(data);
}
```

Good candidates: problem list, problem detail, dashboard stats, public profiles, rating /
leaderboard pages. Invalidate the relevant keys when an admin edits a problem, etc.

---

<a name="p2-ratelimit"></a>

## 8. Rate limiting (currently none)

**Files:** `backend/server.js` (global), `backend/routes/submissions.js`,
`backend/routes/auth.js`.

There is no rate limiting today. Use `express-rate-limit` with a Redis store so counters
are **shared across instances**.

```js
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { connection } = require('./config/redis');

const submitLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => connection.call(...args) }),
  windowMs: 60 * 1000,
  max: 10,                    // 10 submissions / minute / IP
  message: { message: 'Too many submissions, slow down.' },
});

// backend/routes/submissions.js
router.post('/', submitLimiter, createSubmission);
```

Apply to: submission spam, login brute-force (`auth.js`), and a general API limit in
`server.js`. Important before any public deployment.

---

<a name="p2-tokens"></a>

## 9. Auth token store / revocation

**File:** `backend/controllers/authController.js`.

Store refresh tokens / a JWT blacklist in Redis so logout actually revokes tokens and
refresh-token rotation works across instances.

```js
// on login / refresh issue:
await redis.set(`refresh:${userId}:${jti}`, '1', 'EX', 7 * 24 * 3600);

// on logout / rotation:
await redis.del(`refresh:${userId}:${jti}`);

// on refresh attempt — reject if the jti is no longer present:
const valid = await redis.exists(`refresh:${userId}:${jti}`);
if (!valid) return res.status(401).json({ message: 'Token revoked' });
```

---

<a name="p2-lock"></a>

## 10. Distributed lock for finalize idempotency (minor)

**File:** `finalizeContest()` in `backend/services/contestService.js` (the
`ratingProcessed` guard).

Today double-processing is prevented by the `ratingProcessed` flag. Across multiple
instances there is a small race window. A Redis lock closes it:

```js
const got = await redis.set(`lock:finalize:${contestId}`, '1', 'NX', 'EX', 120);
if (!got) return false;   // another instance is finalizing
try {
  // ...existing finalizeContest body...
} finally {
  await redis.del(`lock:finalize:${contestId}`);
}
```

---

<a name="priority"></a>

## 6. Implementation priority

| Priority | Change | Type | Why |
|---|---|---|---|
| 1 | Judge queue (#1) | BullMQ | Removes the most hand-rolled code; kills 1.5s latency |
| 2 | Leaderboard ZSET (#5) | Redis | Fixes the real hot-path bottleneck |
| 3 | Socket.IO Redis adapter (#6) | Redis | Mandatory to scale past 1 instance |
| 4 | Contest scheduling/finalize (#2, #3) | BullMQ | Removes per-tick polling |
| 5 | Rate limiting (#8) | Redis | Needed before public deploy |
| 6 | Caching, tokens, notifications (#7, #9, #4) | both | Incremental wins |

---

<a name="deploy"></a>

## 7. Deployment notes

- **One Redis instance** serves all of the above (BullMQ + cache + ZSET + adapter +
  rate-limit + tokens). Use a managed Redis (Upstash, Redis Cloud, AWS ElastiCache) in
  production.
- **Process model:** run the API and the BullMQ worker(s) as **separate processes**
  (`npm start` vs a new `npm run worker`). The repo already has a `worker` script in
  `backend/package.json` — point it at `backend/workers/` once migrated.
- **MongoDB Change Streams** still require a **replica set** (Atlas provides this). Even
  after adding Redis, the existing watchers depend on it unless you fully move realtime
  emits into the workers.
- **Graceful shutdown:** close BullMQ workers/queues and the Redis connection on
  `SIGTERM` so in-flight jobs finish or re-queue cleanly.
- **Monitoring:** add [Bull Board](https://github.com/felixmosh/bull-board) for queue
  visibility (replaces the custom `JudgeWorker` heartbeat/admin view).
