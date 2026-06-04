require('dotenv').config();
const connectDB = require('./config/db');
const { startJudgeWorker, stopJudgeWorker } = require('./services/judgeWorkerService');
const dns = require('dns');
const dotenv = require('dotenv');

dotenv.config();
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const shutdown = async () => {
  await stopJudgeWorker();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

connectDB()
  .then(() => startJudgeWorker())
  .catch((err) => {
    console.error('Failed to start judge worker:', err);
    process.exit(1);
  });
