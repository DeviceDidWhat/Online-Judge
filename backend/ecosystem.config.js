// PM2 process manifest. From the backend/ directory on the server:
//
//   npm install --omit=dev
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup     # survive reboots
//   pm2 logs                    # tail logs
//
// Layout: ONE web/API process (judging disabled) + SEVEN dedicated judge workers.
// Each worker.js runs in its own OS process, so worker-<pid> gives every one a
// unique id in the JudgeWorker registry automatically — no per-worker config.
//
// Resource note: at peak all 7 workers judge at once, each spawning a Docker
// container capped at JUDGE_DOCKER_CPUS (1) + the problem's memory limit (~256MB).
// Size the VM for ~7 vCPU + ~4GB headroom (Oracle Free ARM 4vCPU/24GB is plenty;
// CPU oversubscription is fine for a college demo).
module.exports = {
  apps: [
    {
      name: 'oj-web',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        // The API box must NOT judge; the workers below do. (Overrides .env.)
        JUDGE_WORKER_ENABLED: 'false',
      },
    },
    {
      name: 'oj-judge',
      script: 'worker.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 7,
      max_memory_restart: '500M',
      // Stagger restarts so 7 workers don't hammer Redis/Mongo simultaneously.
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
