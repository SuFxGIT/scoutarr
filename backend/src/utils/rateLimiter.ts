/**
 * Simple rate limiter using sliding window algorithm
 * Ensures we don't exceed a maximum number of requests per time window
 */
export class RateLimiter {
  private requestTimes: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  /**
   * @param maxRequests Maximum number of requests allowed in the time window
   * @param windowMs Time window in milliseconds (default: 60000ms = 1 minute)
   */
  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Get current request count in the window
   */
  getCurrentCount(): number {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.windowMs
    );
    return this.requestTimes.length;
  }

  /**
   * Wait if necessary to respect rate limit, then record this request
   */
  async acquire(): Promise<void> {
    const now = Date.now();

    // Remove requests outside the current window
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.windowMs
    );

    // If we're at the limit, calculate how long to wait
    if (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // +100ms buffer

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Recursively try again after waiting
        return this.acquire();
      }
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requestTimes = [];
  }
}

// Global rate limiters for each *arr service
// Sonarr/Radarr default: 60 requests per minute
const rateLimiters = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for a specific service instance
 * @param instanceId Unique identifier for the service instance
 * @param maxRequests Maximum requests per window (default: 60)
 * @param windowMs Time window in milliseconds (default: 60000)
 */
export function getRateLimiter(
  instanceId: string,
  maxRequests: number = 60,
  windowMs: number = 60000
): RateLimiter {
  if (!rateLimiters.has(instanceId)) {
    rateLimiters.set(instanceId, new RateLimiter(maxRequests, windowMs));
  }
  return rateLimiters.get(instanceId)!;
}

/**
 * Clear all rate limiters (useful for testing)
 */
export function clearRateLimiters(): void {
  rateLimiters.clear();
}
