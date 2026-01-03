/**
 * Token bucket rate limiter for YNAB API requests
 * Implements token bucket algorithm with automatic refill based on elapsed time
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly refillInterval: number; // milliseconds between refills

  /**
   * Creates a new RateLimiter instance
   * @param capacity - Maximum number of tokens (default: 200 for YNAB's hourly limit)  
   * @param refillIntervalMs - Time in milliseconds to refill tokens (default: 1 hour)
   */
  constructor(
    capacity: number = 200,
    refillIntervalMs: number = 60 * 60 * 1000 // 1 hour in milliseconds
  ) {
    this.capacity = capacity;
    this.tokens = capacity; // Start with full capacity
    this.refillInterval = refillIntervalMs;
    this.refillRate = capacity / refillIntervalMs; // tokens per millisecond
    this.lastRefillTime = Date.now();
    
    // Validate configuration
    if (capacity <= 0 || refillIntervalMs <= 0) {
      throw new Error('Capacity and refill interval must be positive numbers');
    }
  }

  /**
   * Acquire one or more tokens from the bucket
   * Will wait if insufficient tokens are available
   * @param tokensRequired - Number of tokens to acquire (default: 1)
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(tokensRequired: number = 1): Promise<void> {
    if (tokensRequired <= 0) {
      throw new Error('Tokens required must be greater than 0');
    }

    if (tokensRequired > this.capacity) {
      throw new Error(`Cannot acquire ${tokensRequired} tokens, capacity is ${this.capacity}`);
    }

    // Refill tokens based on elapsed time
    this.refillTokens();

    // If we have enough tokens, consume them and return immediately
    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return;
    }

    // Calculate how long to wait for enough tokens
    const tokensNeeded = tokensRequired - this.tokens;
    const waitTime = Math.ceil(tokensNeeded / this.refillRate);

    // Wait for tokens to become available
    await this.sleep(waitTime);

    // Refill again after waiting and consume tokens
    this.refillTokens();
    
    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
    } else {
      // This should rarely happen, but handle edge case where timing is off
      throw new Error('Unable to acquire tokens after waiting');
    }
  }

  /**
   * Try to acquire tokens without waiting
   * @param tokensRequired - Number of tokens to acquire (default: 1)
   * @returns true if tokens were acquired, false otherwise
   */
  tryAcquire(tokensRequired: number = 1): boolean {
    if (tokensRequired <= 0) {
      throw new Error('Tokens required must be greater than 0');
    }

    if (tokensRequired > this.capacity) {
      return false;
    }

    this.refillTokens();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return true;
    }

    return false;
  }

  /**
   * Get the number of tokens currently available
   * @returns Number of available tokens
   */
  getRemainingTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get the current capacity of the rate limiter
   * @returns Maximum number of tokens
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get the time until the next token becomes available
   * @returns Time in milliseconds until next token, or 0 if tokens are available
   */
  getTimeUntilNextToken(): number {
    this.refillTokens();
    
    if (this.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Get the time until a specific number of tokens become available
   * @param tokensRequired - Number of tokens needed
   * @returns Time in milliseconds until tokens are available, or 0 if already available
   */
  getTimeUntilTokens(tokensRequired: number): number {
    if (tokensRequired <= 0) {
      return 0;
    }

    if (tokensRequired > this.capacity) {
      return Infinity; // Will never be available
    }

    this.refillTokens();
    
    if (this.tokens >= tokensRequired) {
      return 0;
    }

    const tokensNeeded = tokensRequired - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Reset the rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Get current rate limiter status for monitoring
   */
  getStatus() {
    this.refillTokens();
    return {
      availableTokens: Math.floor(this.tokens),
      capacity: this.capacity,
      refillRate: this.refillRate * 1000, // tokens per second for readability
      refillInterval: this.refillInterval,
      lastRefillTime: this.lastRefillTime,
      timeUntilNextToken: this.getTimeUntilNextToken(),
    };
  }

  /**
   * Refill tokens based on elapsed time since last refill
   */
  private refillTokens(): void {
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefillTime;

    if (timeSinceLastRefill > 0) {
      const tokensToAdd = timeSinceLastRefill * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a RateLimiter configured for YNAB API limits
 * YNAB allows 200 requests per hour
 */
export function createYnabRateLimiter(): RateLimiter {
  return new RateLimiter(200, 60 * 60 * 1000); // 200 tokens per hour
}