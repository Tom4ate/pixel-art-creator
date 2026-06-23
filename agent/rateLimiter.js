export class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 25;
    this.refillInterval = options.refillInterval || 2000;
    this.maxQueueSize = options.maxQueueSize || 20;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
    this.dailyRequests = 0;
    this.dailyReset = Date.now() + 86400000;
    this.maxDaily = options.maxDaily || 6000;
    this._baseRefillInterval = this.refillInterval;
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const add = Math.floor(elapsed / this.refillInterval);
    if (add > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + add);
      this.lastRefill = now;
    }
    if (now > this.dailyReset) {
      this.dailyRequests = 0;
      this.dailyReset = now + 86400000;
    }
  }

  async acquire(signal) {
    if (signal?.aborted) throw new Error('Aborted');

    this.refill();
    if (this.dailyRequests >= this.maxDaily) {
      throw new Error('Daily request limit reached. Try again tomorrow.');
    }
    if (this.tokens > 0 && this.queue.length === 0) {
      this.tokens--;
      return true;
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Too many queued requests. Try again later.');
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error('Aborted'));
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const entry = { resolve, reject };
      entry._cleanup = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      this.queue.push(entry);
      if (!this.processing) this._processQueue(signal);
    });
  }

  async _processQueue(signal) {
    this.processing = true;
    while (this.queue.length > 0) {
      if (signal?.aborted) {
        this.queue.forEach(item => {
          if (item._cleanup) item._cleanup();
          item.reject(new Error('Aborted'));
        });
        this.queue = [];
        break;
      }

      this.refill();
      while (this.tokens > 0 && this.queue.length > 0) {
        this.tokens--;
        const item = this.queue.shift();
        if (item._cleanup) item._cleanup();
        item.resolve(true);
      }

      if (this.queue.length === 0) break;

      await this.waitWithSignal(250, signal);
    }
    this.processing = false;
  }

  waitWithSignal(ms, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      }
    });
  }

  recordSuccess() {
    this.dailyRequests++;
  }

  async withRetry(fn, maxRetries = 3, signal, onRetry) {
    if (signal?.aborted) throw new Error('Aborted');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.acquire(signal);
        if (signal?.aborted) throw new Error('Aborted');
        const result = await fn();
        this.recordSuccess();
        return result;
      } catch (err) {
        if (err.message === 'Aborted') throw err;
        if (err.status === 429 && attempt < maxRetries) {
          let wait;
          const retryAfter = err.headers?.['retry-after'] ?? err.headers?.['Retry-After'];
          if (retryAfter) {
            wait = parseInt(retryAfter, 10) * 1000;
          } else {
            wait = Math.min(1000 * Math.pow(2, attempt), 30000);
          }

          this.tokens = 0;
          this.refillInterval = Math.min(this.refillInterval * 1.5, 5000);
          clearTimeout(this._restoreTimer);
          this._restoreTimer = setTimeout(() => {
            this.refillInterval = this._baseRefillInterval;
          }, 30000);

          if (onRetry) onRetry(attempt + 1, wait);
          await this.waitWithSignal(wait, signal);
          continue;
        }
        throw err;
      }
    }
  }
}
