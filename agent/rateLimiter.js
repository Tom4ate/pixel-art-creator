export class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 25;
    this.refillInterval = options.refillInterval || 2500;
    this.maxQueueSize = options.maxQueueSize || 10;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
    this.dailyRequests = 0;
    this.dailyReset = Date.now() + 86400000;
    this.maxDaily = options.maxDaily || 6000;
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

  async acquire() {
    this.refill();
    if (this.dailyRequests >= this.maxDaily) {
      throw new Error('Daily request limit reached. Try again tomorrow.');
    }
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        return reject(new Error('Too many queued requests. Try again later.'));
      }
      this.queue.push({ resolve, reject });
      if (!this.processing) this.processQueue();
    });
  }

  async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      await new Promise(r => setTimeout(r, this.refillInterval));
      this.refill();
      if (this.tokens <= 0) continue;
      this.tokens--;
      const item = this.queue.shift();
      item.resolve(true);
    }
    this.processing = false;
  }

  recordSuccess() {
    this.dailyRequests++;
  }

  async withRetry(fn, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.acquire();
        const result = await fn();
        this.recordSuccess();
        return result;
      } catch (err) {
        if (err.status === 429 && attempt < maxRetries) {
          const wait = Math.min(1000 * Math.pow(2, attempt), 30000);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
  }
}
