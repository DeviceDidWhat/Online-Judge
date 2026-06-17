const IORedis = require('ioredis');

// BullMQ requires maxRetriesPerRequest: null on connections it manages.
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

module.exports = connection;
