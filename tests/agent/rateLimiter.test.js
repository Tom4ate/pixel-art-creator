import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../../agent/rateLimiter.js';

describe('RateLimiter', () => {
  let rl;

  beforeEach(() => {
    rl = new RateLimiter({ maxTokens: 3, refillInterval: 5000, maxQueueSize: 2, maxDaily: 100 });
  });

  it('should start with maxTokens', () => {
    assert.equal(rl.tokens, 3);
  });

  it('should consume a token on acquire', async () => {
    await rl.acquire();
    assert.equal(rl.tokens, 2);
  });

  it('should queue when out of tokens', async () => {
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    assert.equal(rl.tokens, 0);
    const p = rl.acquire();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(rl.queue.length, 1);
    rl.refillInterval = 1;
    rl.lastRefill = 0;
    rl.refill();
    await p;
    assert.equal(rl.tokens, rl.maxTokens - 1);
  });

  it('should reject when queue is full', async () => {
    rl.tokens = 0;
    rl.acquire().catch(() => {});
    rl.acquire().catch(() => {});
    await assert.rejects(() => rl.acquire(), /Too many queued/);
  });

  it('should throw when daily limit reached', async () => {
    rl.dailyRequests = rl.maxDaily;
    await assert.rejects(() => rl.acquire(), /Daily request limit/);
  });

  it('withRetry should execute function on success', async () => {
    let called = false;
    const result = await rl.withRetry(async () => { called = true; return 42; });
    assert.equal(called, true);
    assert.equal(result, 42);
  });

  it('withRetry should retry on 429', async () => {
    let attempts = 0;
    const result = await rl.withRetry(async () => {
      attempts++;
      if (attempts < 2) { const e = new Error('Rate limited'); e.status = 429; throw e; }
      return 'ok';
    }, 3);
    assert.equal(attempts, 2);
    assert.equal(result, 'ok');
  });

  it('withRetry should throw on non-429 error', async () => {
    const asyncFn = () => rl.withRetry(async () => { throw new Error('not 429'); }, 2);
    await assert.rejects(asyncFn, /not 429/);
  });

  it('withRetry should throw after exhausting retries', async () => {
    const asyncFn = () => rl.withRetry(async () => {
      const e = new Error('persistent 429');
      e.status = 429;
      throw e;
    }, 2);
    await assert.rejects(asyncFn, /persistent 429/);
  });

  it('recordSuccess increments daily count', () => {
    assert.equal(rl.dailyRequests, 0);
    rl.recordSuccess();
    assert.equal(rl.dailyRequests, 1);
  });
});
