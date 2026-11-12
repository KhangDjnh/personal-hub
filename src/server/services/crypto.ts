const PBKDF2_ITERATIONS = 50_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Constant-time comparison for two equally sized byte arrays.
 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Constant-time comparison for UTF-8 strings (leaks at most length equality after padding).
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const maxLen = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

async function derivePbkdf2Bits(
  password: string,
  pepper: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${pepper}:${password}`),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePbkdf2Bits(password, pepper, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyPassword(
  password: string,
  pepper: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 100_000) {
    // Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
    return false;
  }

  const salt = fromHex(parts[2]);
  const expectedHash = fromHex(parts[3]);
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = await derivePbkdf2Bits(password, pepper, salt, iterations);
  return timingSafeEqualBytes(actualHash, expectedHash);
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

export async function signJwt(
  subject: string,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = toBase64Url(
    encoder.encode(JSON.stringify({ sub: subject, iat: now, exp: now + ttlSeconds }))
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret, 'sign');
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes) return null;

  const key = await importHmacKey(secret, 'verify');
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    encoder.encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;

  const headerBytes = fromBase64Url(headerB64);
  const payloadBytes = fromBase64Url(payloadB64);
  if (!headerBytes || !payloadBytes) return null;

  try {
    const header = JSON.parse(decoder.decode(headerBytes)) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const payload = JSON.parse(decoder.decode(payloadBytes)) as Partial<JwtPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp <= now) {
      return null;
    }

    return {
      sub: payload.sub,
      iat: typeof payload.iat === 'number' ? payload.iat : now,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
