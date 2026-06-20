// A small promise-based concurrency limiter.
//
// `max` slots may run at once; further callers wait in a FIFO queue. If the queue
// already holds `maxPending` waiters, acquire() rejects immediately with a
// CAPACITY error so callers can shed load (return 503) instead of growing an
// unbounded backlog of pending requests.
//
// The slot is handed off directly from release() -> the next waiter, so the
// active count can never exceed `max` (no over-admission race).
class Semaphore {
  constructor(max, maxPending = Infinity) {
    this.max = Math.max(1, Number(max) || 1);
    this.maxPending = maxPending;
    this.active = 0;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve, reject) => {
      // Only count genuinely-waiting callers (we admit immediately when a slot is
      // free), so this rejects only when we're at capacity AND the queue is full.
      if (this.active >= this.max && this.queue.length >= this.maxPending) {
        const err = new Error('Server at capacity');
        err.code = 'CAPACITY';
        return reject(err);
      }
      this.queue.push(resolve);
      this._dispatch();
    });
  }

  _dispatch() {
    while (this.active < this.max && this.queue.length > 0) {
      this.active += 1;
      const resolve = this.queue.shift();
      resolve();
    }
  }

  release() {
    this.active -= 1;
    this._dispatch();
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

module.exports = Semaphore;
