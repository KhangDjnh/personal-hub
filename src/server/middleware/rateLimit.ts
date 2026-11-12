interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;
const memoryFallback = new Map<string, RateLimitRecord>();

function keyForIp(ip: string): string {
  return `ratelimit:login:${ip}`;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function checkLoginRateLimit(
  kv: KVNamespace | undefined,
  ip: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Date.now();
  const key = keyForIp(ip);

  if (kv) {
    const raw = await kv.get(key);
    if (!raw) return { allowed: true, retryAfterSeconds: 0 };
    try {
      const record = JSON.parse(raw) as RateLimitRecord;
      if (record.count >= MAX_ATTEMPTS && record.resetAt > now) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
        };
      }
    } catch {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const record = memoryFallback.get(key);
  if (record && record.resetAt <= now) {
    memoryFallback.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (record && record.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordFailedLogin(kv: KVNamespace | undefined, ip: string): Promise<void> {
  const now = Date.now();
  const key = keyForIp(ip);

  if (kv) {
    const raw = await kv.get(key);
    let record: RateLimitRecord = { count: 0, resetAt: now + WINDOW_SECONDS * 1000 };
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as RateLimitRecord;
        if (parsed.resetAt > now) {
          record = parsed;
        }
      } catch {
        // Start fresh record.
      }
    }
    record.count += 1;
    const ttl = Math.max(60, Math.ceil((record.resetAt - now) / 1000));
    await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
    return;
  }

  const existing = memoryFallback.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryFallback.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
  } else {
    existing.count += 1;
  }
}

export async function clearFailedLogins(kv: KVNamespace | undefined, ip: string): Promise<void> {
  const key = keyForIp(ip);
  if (kv) {
    await kv.delete(key);
  } else {
    memoryFallback.delete(key);
  }
}

