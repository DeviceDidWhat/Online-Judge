# Deployment guide

A from-scratch guide to deploy this online judge for a college project, free.

## Architecture recap

- **Frontend** — TanStack Start app, deploys to **Cloudflare Workers** (already wired
  up via `wrangler.jsonc`). `VITE_API_URL` is baked in at build time.
- **Backend API + Judge** — Express + Socket.IO + BullMQ. Runs on a **Linux VM**
  because the judge spawns **Docker containers** per submission (this is why it can't
  go on Vercel/Render/Railway).
- **MongoDB** — must be a **replica set** (the app uses change streams). Use
  **MongoDB Atlas** free M0.
- **Redis** — backs the judge queue. Use **Upstash**/**Redis Cloud** free tier, or run
  Redis as a container on the same VM.

```
Browser ──▶ Cloudflare (frontend) ──▶ Caddy/HTTPS ──▶ Node API (:5000) ──▶ Mongo Atlas
                                                          │                   ▲
                                                          ▼                   │
                                                       Redis ◀── 7 × worker.js ┘
                                                                   │
                                                                   ▼
                                                            docker run (per submission)
```

---

## 0. Provision the managed services (free)

1. **MongoDB Atlas** → create a free **M0** cluster. Add a database user. Under
   *Network Access* allow your VM's IP (or `0.0.0.0/0` for a demo). Copy the
   `mongodb+srv://...` connection string. Atlas is a replica set by default, so change
   streams work.
2. **Redis** → create a free **Upstash** Redis database, copy its `redis://...` (or
   `rediss://...`) URL. *(Or skip and run Redis locally on the VM — step 2 below.)*
3. **Cloudinary** → free account; copy cloud name + API key + secret (used for avatar
   uploads).

---

## 1. Create the VM

**Recommended: Oracle Cloud Always Free** — an ARM Ampere VM, up to **4 vCPU / 24 GB
RAM, free forever**, big enough for 7 judge workers.

- Create an **Ubuntu 22.04 / 24.04** instance.
- In the instance's **VCN security list / NSG**, open inbound **TCP 80 and 443** (for
  Caddy/HTTPS). You do *not* need to expose 5000 publicly — Caddy proxies to it locally.
- SSH in.

> Any VM with Docker works (DigitalOcean, Hetzner, Azure for Students, etc.). Avoid the
> 1 vCPU / 1 GB free micro VMs (AWS/GCP) — too small for 7 workers; fine for a 1-worker demo.

---

## 2. Bootstrap the VM

```bash
git clone <your-repo-url> online-judge && cd online-judge
bash backend/scripts/setup-vm.sh
```

This installs Docker, Node 20, PM2, Caddy and **builds the four judge images**
(`judge-gcc:13`, `judge-python:3.10`, `judge-node:18`, `judge-java:17`).

**Log out and back in once** afterwards so your user can run `docker` without `sudo`.

*(Optional — local Redis instead of Upstash):*
```bash
docker run -d --name redis --restart unless-stopped -p 127.0.0.1:6379:6379 redis:7
# then use REDIS_URL=redis://127.0.0.1:6379
```

---

## 3. Configure & start the backend

```bash
cd ~/online-judge/backend
cp .env.production.example .env
nano .env                 # fill in MONGO_URI, REDIS_URL, CLIENT_ORIGIN, secrets, Cloudinary
# generate secrets with:  openssl rand -hex 48
npm install --omit=dev
pm2 start ecosystem.config.js
pm2 save && pm2 startup   # run the command it prints, so it restarts on reboot
pm2 ls                    # should show 1 oj-web + 7 oj-judge, all "online"
```

Key `.env` values for production (see `.env.production.example` for the full list):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas SRV string |
| `REDIS_URL` | your Upstash URL (or `redis://127.0.0.1:6379`) |
| `CLIENT_ORIGIN` | the frontend URL, e.g. `https://your-app.workers.dev` (comma-separate for several) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | long random strings — **change them** |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `none` (frontend & API are different domains) |
| `JUDGE_WORKER_ENABLED` | `false` (the 7 `worker.js` processes do the judging) |

---

## 4. HTTPS with Caddy

You need a hostname for the API. Use a real domain or a free one (DuckDNS, or
`<ip>.nip.io`). Point an **A record** at the VM's public IP.

```bash
sudo cp ~/online-judge/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # replace api.your-domain.com with your hostname
sudo systemctl reload caddy
```

Caddy fetches a Let's Encrypt cert automatically. Test:
```bash
curl https://api.your-domain.com/api/protected   # expect 401 JSON, not a connection error
```

> The API hostname here must match the host in the frontend's `VITE_API_URL`, and must
> be listed in the backend's `CLIENT_ORIGIN`.

---

## 5. Deploy the frontend to Cloudflare

From your **local machine** (or the VM) in `frontend/`:

```bash
npm install
npx wrangler login
# Set the API URL the bundle will call (build-time):
echo "VITE_API_URL=https://api.your-domain.com/api" > .env.production
npm run build
npx wrangler deploy
```

Wrangler prints your `https://<name>.workers.dev` URL. Then:

1. Put that URL in the backend `.env` `CLIENT_ORIGIN`, and `pm2 restart oj-web`.
2. If you change the API domain later, rebuild the frontend (`VITE_API_URL` is baked in
   at build time, not runtime).

> Prefer a dashboard flow? Connect the repo in **Cloudflare Workers & Pages**, set the
> build dir to `frontend`, build command `npm run build`, and add the `VITE_API_URL`
> build variable there.

---

## 6. Smoke test

1. Open the Cloudflare URL → register a user → log in. (If login "works" but you're
   logged out on refresh, the cross-site cookie is being dropped → re-check
   `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, HTTPS on the API, and `CLIENT_ORIGIN`.)
2. Create/open a problem and submit a solution in each language. Watch it judge.
   - `pm2 logs oj-judge` shows worker activity.
   - First run per language is slightly slower (image warm-up).
3. Verdicts updating live = Socket.IO + Mongo change streams are working.

---

## Operations cheat sheet

```bash
pm2 ls                       # process status (1 web + 7 judge)
pm2 logs oj-judge --lines 100
pm2 restart oj-web           # after editing .env
pm2 restart all
bash backend/docker/build.sh # rebuild judge images after editing a Dockerfile
docker ps                    # transient judge_run_* / judge_compile_* containers appear here
```

## Common gotchas

- **Logged out after refresh / login fails** → cross-site cookie dropped. Needs
  `COOKIE_SECURE=true` + `COOKIE_SAME_SITE=none` + HTTPS API + correct `CLIENT_ORIGIN`.
- **CORS errors in the browser console** → `CLIENT_ORIGIN` doesn't exactly match the
  frontend origin (scheme + host, no trailing slash). It accepts a comma-separated list.
- **Submissions stuck "Pending"** → workers can't reach Redis, or judge images missing.
  Check `pm2 logs oj-judge` and `docker images | grep judge`.
- **`change stream ... only supported on replica sets`** → you pointed `MONGO_URI` at a
  standalone mongod. Use Atlas (or run mongod as a single-node replica set).
- **`permission denied ... /var/run/docker.sock`** → you didn't re-login after
  `usermod -aG docker`. Log out/in, or `newgrp docker`.
- **Judges slow / OOM with 7 workers** → lower `instances` in `ecosystem.config.js`, or
  use a bigger VM. Each concurrent judge wants ~1 vCPU + the problem's memory limit.
