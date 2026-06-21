# Online Judge

A full-stack competitive-programming platform — solve problems, run code against test cases in sandboxed Docker containers, compete in rated contests with live leaderboards, and track progress over time. Think a self-hosted LeetCode/Codeforces.

**Live:**
- Frontend → https://online-judge.kavyabhanvadia.workers.dev
- API → https://api.bestdevs.ninja

---

## Table of contents
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [How the judge works](#how-the-judge-works)
- [Real-time updates](#real-time-updates)
- [Getting started (local)](#getting-started-local)
- [Environment variables](#environment-variables)
- [Running the judge workers](#running-the-judge-workers)
- [API overview](#api-overview)
- [Data models](#data-models)
- [Deployment](#deployment)

---

## Features

- **Problem solving** — browse/filter problems by difficulty and tags, read statements with examples/constraints/hints/editorials, and code in an in-browser **Monaco** editor with per-language starter code.
- **Multi-language judging** — C, C++, Python, JavaScript (Node), and Java, each run in its own hardened Docker image.
- **Run vs. Submit** — "Run" executes against custom input; "Submit" runs against the full hidden test suite and records a verdict (`Accepted`, `Wrong Answer`, `TLE`, `MLE`, `Runtime Error`, `Compilation Error`).
- **Accurate measurement** — per-program runtime and peak memory measured with GNU `/usr/bin/time` inside the container (excludes container startup overhead).
- **Contests** — timed, rated contests with registration, per-problem points/labels, live status (`upcoming` → `live` → `ended`), and **live leaderboards**.
- **Ratings & ranks** — Elo-style rating (default 1200), rating history, and a global leaderboard.
- **Progress tracking** — solved counts by difficulty, streaks, an activity **heatmap**, bookmarks, and saved (draft) code per problem.
- **Discussions** — per-problem / general discussion threads.
- **Notifications** — delivered in real time over WebSockets.
- **Admin** — create/edit/archive problems, manage hidden test cases, and author contests (role-gated).
- **Auth** — JWT access tokens + httpOnly refresh-token cookie rotation, with bcrypt password hashing.

---

## Architecture

The system is split into a **stateless API**, a **pool of judge workers**, and managed **datastores**, decoupled by a Redis queue. The frontend is a separately deployed SSR app.

```
                ┌─────────────────────────────────────────────┐
   Browser ────▶│  Frontend (TanStack Start on Cloudflare)     │
                └───────────────┬─────────────────────────────┘
                                │ HTTPS REST + WebSocket
                                ▼
                ┌─────────────────────────────────────────────┐
                │  Caddy (auto-HTTPS reverse proxy)            │
                └───────────────┬─────────────────────────────┘
                                ▼
                ┌───────────────────────────────────────────── ┐
                │  API server (Express + Socket.IO)  [oj-web]  │
                │  - REST routes / auth                        │
                │  - enqueues judge jobs ──────────────┐       │
                │  - Mongo change streams ─▶ Socket.IO │       │
                └───────────────┬────────────────────── ┼───────┘
                                │                       │
              MongoDB (Atlas) ◀─┘                       ▼
              replica set                        Redis (BullMQ queue)
                    ▲                                   │
                    │                                   ▼
                    │        ┌──────────────────────────────────────┐
                    └────────│  Judge workers ×N  [oj-judge]         │
                  write       │  - pull jobs from Redis              │
                  verdict     │  - run code in Docker (per submission)│
                              │     docker run --network none        │
                              │       --cap-drop ALL --read-only ... │
                              └──────────────────────────────────────┘
```

**Why this shape:**
- The **API never judges** — it just enqueues. Judging is CPU/IO heavy and is offloaded to dedicated worker processes (`worker.js`), scaled horizontally (the production setup runs **7**).
- **Redis + BullMQ** provides the durable job queue (priorities, retries with exponential backoff, stuck-job recovery).
- **MongoDB change streams** bridge the worker→client gap: a worker writes the verdict to Mongo, the API's watcher picks up the change and pushes it to the right user/contest room over Socket.IO. No polling.
- Each submission runs in a throwaway Docker container that is network-isolated, capability-dropped, read-only-rootfs, and memory/PID/CPU limited.

---

## Tech stack

| Layer | Tech |
|---|---|
| **Frontend** | React 19, TanStack Start / Router, TanStack Query, Tailwind CSS v4, Radix UI, Monaco editor, Socket.IO client, Vite 7 |
| **Backend** | Node.js, Express 5, Socket.IO, Mongoose 8, BullMQ, Zod, Helmet, JWT, bcryptjs, Multer + Cloudinary |
| **Datastores** | MongoDB (replica set — change streams), Redis |
| **Judge** | Docker (one container per run), GNU `time` for metrics |
| **Infra** | Cloudflare Workers (frontend), Linux VM + PM2 + Caddy (backend) |

---

## Repository layout

```
.
├── backend/
│   ├── server.js                 # API + Socket.IO entry (oj-web)
│   ├── worker.js                 # Judge worker entry (oj-judge ×7)
│   ├── ecosystem.config.js       # PM2: 1 web + 7 workers
│   ├── config/                   # db, redis, cors
│   ├── routes/                   # auth, problems, submissions, contests, ...
│   ├── controllers/              # request handlers
│   ├── services/
│   │   ├── judgeQueue.js          # BullMQ queue (enqueue)
│   │   ├── judgeWorkerService.js  # BullMQ worker (consume + heartbeat)
│   │   ├── judgeRunner.js         # builds & runs the sandboxed docker commands
│   │   ├── judgeRecovery.js       # requeues stuck jobs
│   │   └── submissionResultService.js
│   ├── socket/
│   │   ├── index.js               # Socket.IO init + auth
│   │   ├── submissionWatcher.js   # Mongo change stream → emit verdicts
│   │   └── contestWatcher.js      # Mongo change stream → leaderboard
│   ├── middlewares/              # auth (JWT), rateLimit, upload
│   ├── models/                   # Mongoose schemas
│   ├── docker/                   # per-language judge Dockerfiles + build scripts
│   └── scripts/                  # setup-vm.sh, migrations
├── frontend/
│   ├── src/routes/               # file-based routes (problems, contests, ...)
│   ├── src/components/           # app-shell, navbar, editor, heatmap, ui/
│   ├── src/lib/                  # api.ts, auth.tsx, socket.ts, theme
│   ├── wrangler.jsonc            # Cloudflare Worker config
│   └── vite.config.ts
├── Caddyfile                     # reverse proxy / HTTPS
└── DEPLOYMENT.md                 # full deploy guide
```

---

## How the judge works

For each submission (`backend/services/judgeRunner.js`):

1. A temp workspace is created (`/tmp/judge-*`) and the source written to it (e.g. `main.cpp`).
2. **Compile step** (for compiled languages) runs in the container; a non-zero exit returns `Compilation Error`.
3. Each test case streams from Mongo (cursor — one at a time, so 10⁵-sized inputs don't blow memory) and runs in a fresh container with the test input piped to stdin.
4. Output is normalized (CRLF/trailing-whitespace) and compared to expected; verdict is derived (`Accepted` / `Wrong Answer` / `TLE` / `MLE` / `Runtime Error`).
5. Hidden test cases never leak their input/expected/actual to the client — only the failing index.

**Sandboxing flags** on every run:

```
docker run --network none --cpus 1 --memory <limit>m --memory-swap <limit>m
           --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges
           --read-only --tmpfs /tmp:rw,noexec,nosuid --workdir /workspace
           -v <workspace>:/workspace[:ro]
```

> **Linux note:** because containers run with `--cap-drop ALL` (no `CAP_DAC_OVERRIDE`), the ephemeral workspace dir is `chmod 0777`-ed so the container UID can read the source / write the binary. Without this you get `Permission denied` on Linux hosts (Docker Desktop on Windows masks it).

Judge images are built from `backend/docker/*.Dockerfile`:

```bash
bash backend/docker/build.sh        # Linux/macOS
pwsh backend/docker/build.ps1       # Windows
# builds: judge-gcc:13, judge-python:3.10, judge-node:18, judge-java:17
```

---

## Real-time updates

There is **no polling**. The API server starts two MongoDB **change-stream** watchers on boot (`server.js`):

- `submissionWatcher` → when a submission's verdict changes, emits to that user's Socket.IO room.
- `contestWatcher` → when contest/submission state changes, emits leaderboard updates to the contest room.

This is why MongoDB **must be a replica set** (Atlas M0 qualifies) — change streams aren't available on standalone mongod.

---

## Getting started (local)

### Prerequisites
- Node.js 20+
- Docker (running) — required for judging
- MongoDB **replica set** (Atlas free tier, or a local single-node replica set)
- Redis (local or a container)

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env          # then edit values (see table below)
```
Build the judge images (once):
```bash
bash docker/build.sh          # or pwsh docker/build.ps1 on Windows
```
Start the API and a judge worker (two terminals):
```bash
npm run dev                   # API + Socket.IO on :5000
npm run dev:worker            # one judge worker
```

### 2. Frontend
```bash
cd frontend
npm install
# point the app at your local API:
echo "VITE_API_URL=http://localhost:5000/api" > .env
npm run dev                   # Vite dev server
```

Open the printed dev URL, register an account, and submit a solution.

---

## Environment variables

### Backend (`backend/.env`)
| Variable | Description | Example |
|---|---|---|
| `PORT` | API port | `5000` |
| `NODE_ENV` | `development` / `production` | `production` |
| `MONGO_URI` | MongoDB **replica set** URI | `mongodb+srv://...` |
| `REDIS_URL` | Redis connection | `redis://127.0.0.1:6379` |
| `CLIENT_ORIGIN` | Allowed frontend origin(s), comma-separated | `https://online-judge.kavyabhanvadia.workers.dev` |
| `JWT_ACCESS_SECRET` | Access-token signing secret | `openssl rand -hex 48` |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret | `openssl rand -hex 48` |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | Token lifetimes | `15m` / `7d` |
| `COOKIE_SECURE` | `true` in production (HTTPS) | `true` |
| `COOKIE_SAME_SITE` | `none` for cross-site frontend, else `lax` | `none` |
| `BCRYPT_SALT_ROUNDS` | Password hash cost | `12` |
| `JUDGE_WORKER_ENABLED` | Run an embedded worker in the API (keep `false` in prod) | `false` |
| `JUDGE_WORKER_CONCURRENCY` | Concurrent judges per worker process | `1` |
| `JUDGE_DOCKER_CPUS` / `JUDGE_DOCKER_PIDS_LIMIT` | Per-container limits | `1` / `128` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Avatar uploads | — |

See `backend/.env.example` (dev) and `backend/.env.production.example` (prod) for the full list.

### Frontend
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL incl. `/api`. **Baked in at build time.** |

---

## Running the judge workers

Production runs **1 API process + 7 judge workers** via PM2 ([backend/ecosystem.config.js](backend/ecosystem.config.js)):

```bash
cd backend
pm2 start ecosystem.config.js
pm2 ls            # 1× oj-web + 7× oj-judge
pm2 logs oj-judge
```

Each `worker.js` process registers itself in the `JudgeWorker` collection with a heartbeat (`worker-<pid>`), and BullMQ distributes jobs across them. Scale by changing `instances` in the ecosystem file (size the VM for ~1 vCPU + the problem memory limit per concurrent judge).

---

## API overview

All routes are under `/api`. Auth is a Bearer access token; protected admin routes require `role: admin`.

| Group | Examples |
|---|---|
| `auth` | `POST /auth/register`, `/auth/login`, `/auth/refresh-token`, `/auth/logout` |
| `problems` | `GET /problems`, `GET /problems/:slug`, `POST /problems/:slug/run`, admin CRUD + test-case management |
| `submissions` | submit + list/inspect submissions |
| `contests` | list/detail, register, leaderboard |
| `discussions` | threads per problem / general |
| `dashboard` `progress` `ratings` `leaderboard` | stats, heatmap, rating history, rankings |
| `notifications` `users` `languages` `judge` | misc + worker/judge status |

---

## Data models

Key Mongoose collections (`backend/models/`):

- **User** — credentials, role, `rating`/`rank`, `solved` breakdown, streak, badges, preferences, rotating refresh tokens.
- **Problem** — `slug`, difficulty, tags, description/constraints/examples/hints/editorial, `starterCode` per language, time/memory limits, acceptance stats.
- **TestCase** — stored in its own collection (not embedded) to stay under Mongo's 16 MB doc limit; flagged `hidden`.
- **Submission** — source, verdict, per-test results, runtime/memory, optional contest link.
- **Contest** / **ContestRegistration** — schedule, problems with points/labels, status, rating-processed flag.
- **JudgeJob** / **JudgeWorker** — queue job records and worker registry/heartbeats.
- **RatingHistory**, **Notification**, **Discussion**, **UserProblemProgress**, **UserActivity**.

---

## Deployment

The production setup is: **frontend on Cloudflare Workers**, **backend on a Linux VM** (AWS EC2 / Oracle Cloud) behind **Caddy** with PM2 running the web + 7 workers, **MongoDB Atlas**, and **Redis** on the VM.

Full step-by-step (managed services, VM provisioning, DNS, HTTPS, smoke test) is in **[DEPLOYMENT.md](DEPLOYMENT.md)**. The VM bootstrap (Docker + Node + PM2 + Caddy + judge images) is automated by `backend/scripts/setup-vm.sh`.

Redeploy after changes:
```bash
# backend (on the VM)
cd ~/online-judge && git pull && pm2 restart all
# frontend
cd frontend && npm run build && npx wrangler deploy
```
