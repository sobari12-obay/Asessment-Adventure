interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function recordFailedAttempt(
  key: string,
  maxFailures: number,
  windowMs: number
): RateLimitResult {
  return checkRateLimit(`fail:${key}`, maxFailures, windowMs);
}

export function peekFailedAttempts(
  key: string,
  maxFailures: number
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(`fail:${key}`);
  if (!existing || now >= existing.resetAt) {
    return {
      allowed: true,
      remaining: maxFailures,
      retryAfterSeconds: 0,
    };
  }
  if (existing.count >= maxFailures) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, maxFailures - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function clearFailedAttempts(key: string): void {
  buckets.delete(`fail:${key}`);
}

export function getClientIpKey(headers: Record<string, string | string[] | undefined>, fallbackIp?: string): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',')[0].trim();
  }
  return fallbackIp || 'unknown-client';
}
