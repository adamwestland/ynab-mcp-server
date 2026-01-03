/**
 * RateLimiter Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter, createYnabRateLimiter } from '../../src/client/RateLimiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default capacity of 200', () => {
      const limiter = new RateLimiter();
      expect(limiter.getCapacity()).toBe(200);
      expect(limiter.getRemainingTokens()).toBe(200);
    });

    it('initializes with custom capacity', () => {
      const limiter = new RateLimiter(100, 60000);
      expect(limiter.getCapacity()).toBe(100);
      expect(limiter.getRemainingTokens()).toBe(100);
    });

    it('throws error for non-positive capacity', () => {
      expect(() => new RateLimiter(0, 60000)).toThrow('Capacity and refill interval must be positive numbers');
      expect(() => new RateLimiter(-1, 60000)).toThrow('Capacity and refill interval must be positive numbers');
    });

    it('throws error for non-positive refill interval', () => {
      expect(() => new RateLimiter(100, 0)).toThrow('Capacity and refill interval must be positive numbers');
      expect(() => new RateLimiter(100, -1)).toThrow('Capacity and refill interval must be positive numbers');
    });
  });

  describe('acquire', () => {
    it('consumes one token by default', async () => {
      const limiter = new RateLimiter(10, 60000);
      await limiter.acquire();
      expect(limiter.getRemainingTokens()).toBe(9);
    });

    it('consumes multiple tokens when specified', async () => {
      const limiter = new RateLimiter(10, 60000);
      await limiter.acquire(5);
      expect(limiter.getRemainingTokens()).toBe(5);
    });

    it('throws error for non-positive token request', async () => {
      const limiter = new RateLimiter(10, 60000);
      await expect(limiter.acquire(0)).rejects.toThrow('Tokens required must be greater than 0');
      await expect(limiter.acquire(-1)).rejects.toThrow('Tokens required must be greater than 0');
    });

    it('throws error when requesting more than capacity', async () => {
      const limiter = new RateLimiter(10, 60000);
      await expect(limiter.acquire(11)).rejects.toThrow('Cannot acquire 11 tokens, capacity is 10');
    });

    it('waits when tokens are exhausted', async () => {
      const limiter = new RateLimiter(2, 60000); // 2 tokens per minute

      await limiter.acquire(2); // Use all tokens
      expect(limiter.getRemainingTokens()).toBe(0);

      // Start acquiring - should wait
      const acquirePromise = limiter.acquire(1);

      // Fast-forward time to allow refill
      vi.advanceTimersByTime(30001); // Half a minute = 1 token

      await acquirePromise;
      expect(limiter.getRemainingTokens()).toBe(0);
    });
  });

  describe('tryAcquire', () => {
    it('returns true when tokens are available', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getRemainingTokens()).toBe(9);
    });

    it('returns false when tokens are exhausted', () => {
      const limiter = new RateLimiter(2, 60000);
      limiter.tryAcquire(2);
      expect(limiter.tryAcquire()).toBe(false);
      expect(limiter.getRemainingTokens()).toBe(0);
    });

    it('returns false when requesting more than capacity', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.tryAcquire(11)).toBe(false);
    });

    it('throws error for non-positive token request', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(() => limiter.tryAcquire(0)).toThrow('Tokens required must be greater than 0');
    });
  });

  describe('getRemainingTokens', () => {
    it('returns current token count', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getRemainingTokens()).toBe(10);
      limiter.tryAcquire(3);
      expect(limiter.getRemainingTokens()).toBe(7);
    });

    it('includes refilled tokens based on elapsed time', () => {
      const limiter = new RateLimiter(60, 60000); // 1 token per second
      limiter.tryAcquire(30);
      expect(limiter.getRemainingTokens()).toBe(30);

      vi.advanceTimersByTime(10000); // 10 seconds = 10 tokens
      expect(limiter.getRemainingTokens()).toBe(40);
    });
  });

  describe('getCapacity', () => {
    it('returns the configured capacity', () => {
      const limiter = new RateLimiter(150, 60000);
      expect(limiter.getCapacity()).toBe(150);
    });
  });

  describe('getTimeUntilNextToken', () => {
    it('returns 0 when tokens are available', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getTimeUntilNextToken()).toBe(0);
    });

    it('returns time until next token when exhausted', () => {
      const limiter = new RateLimiter(60, 60000); // 1 token per second
      limiter.tryAcquire(60);
      expect(limiter.getRemainingTokens()).toBe(0);

      const timeUntil = limiter.getTimeUntilNextToken();
      expect(timeUntil).toBeGreaterThan(0);
      expect(timeUntil).toBeLessThanOrEqual(1000); // Less than 1 second
    });
  });

  describe('getTimeUntilTokens', () => {
    it('returns 0 when sufficient tokens are available', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getTimeUntilTokens(5)).toBe(0);
    });

    it('returns 0 for non-positive token request', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getTimeUntilTokens(0)).toBe(0);
      expect(limiter.getTimeUntilTokens(-1)).toBe(0);
    });

    it('returns Infinity when requesting more than capacity', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getTimeUntilTokens(11)).toBe(Infinity);
    });

    it('returns time until sufficient tokens when partially exhausted', () => {
      const limiter = new RateLimiter(60, 60000); // 1 token per second
      limiter.tryAcquire(55);
      expect(limiter.getRemainingTokens()).toBe(5);

      const timeUntil = limiter.getTimeUntilTokens(10);
      expect(timeUntil).toBeGreaterThan(0);
      expect(timeUntil).toBeLessThanOrEqual(5000); // Need 5 more tokens = 5 seconds
    });
  });

  describe('reset', () => {
    it('restores tokens to full capacity', () => {
      const limiter = new RateLimiter(10, 60000);
      limiter.tryAcquire(8);
      expect(limiter.getRemainingTokens()).toBe(2);

      limiter.reset();
      expect(limiter.getRemainingTokens()).toBe(10);
    });
  });

  describe('getStatus', () => {
    it('returns current status object', () => {
      const limiter = new RateLimiter(100, 3600000); // 100 per hour
      limiter.tryAcquire(20);

      const status = limiter.getStatus();
      expect(status.availableTokens).toBe(80);
      expect(status.capacity).toBe(100);
      expect(status.refillInterval).toBe(3600000);
      expect(status.timeUntilNextToken).toBe(0);
      expect(typeof status.lastRefillTime).toBe('number');
      expect(typeof status.refillRate).toBe('number');
    });
  });

  describe('token refill', () => {
    it('refills tokens over time', () => {
      const limiter = new RateLimiter(100, 100000); // 100 tokens per 100 seconds = 1/s
      limiter.tryAcquire(50);
      expect(limiter.getRemainingTokens()).toBe(50);

      vi.advanceTimersByTime(25000); // 25 seconds = 25 tokens
      expect(limiter.getRemainingTokens()).toBe(75);

      vi.advanceTimersByTime(25000); // Another 25 seconds = 25 more tokens
      expect(limiter.getRemainingTokens()).toBe(100); // Capped at capacity
    });

    it('does not exceed capacity when refilling', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getRemainingTokens()).toBe(10);

      vi.advanceTimersByTime(120000); // 2 minutes
      expect(limiter.getRemainingTokens()).toBe(10); // Still at capacity
    });
  });
});

describe('createYnabRateLimiter', () => {
  it('creates a limiter with YNAB defaults (200 tokens per hour)', () => {
    const limiter = createYnabRateLimiter();
    expect(limiter.getCapacity()).toBe(200);
    expect(limiter.getRemainingTokens()).toBe(200);
  });
});
