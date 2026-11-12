import { describe, expect, it } from 'vitest';
import app from '../src/server/index.ts';
import {
  hashPassword,
  signJwt,
  timingSafeEqualStrings,
  verifyJwt,
  verifyPassword,
} from '../src/server/services/crypto.ts';
import type { Env } from '../src/server/types.ts';

async function makeTestEnv(overrides: Partial<Env> = {}): Promise<Env> {
  const pepper = 'test-pepper-1234567890';
  const passwordHash = await hashPassword('super-secret-pass', pepper);
  return {
    AUTH_USERNAME: 'khang',
    AUTH_PEPPER: pepper,
    AUTH_PASSWORD_HASH: passwordHash,
    JWT_SECRET: 'jwt-secret-key-for-tests-only-1234567890',
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REFRESH_TOKEN: 'refresh-token',
    GDRIVE_ROOT_FOLDER_ID: '17p6bKfYSoXevyRjzcH90COqLO0U1wURF',
    ...overrides,
  };
}

describe('crypto helpers', () => {
  it('verifies hashed passwords with pepper and rejects wrong password or pepper', async () => {
    const pepper = 'pepper-abc';
    const hash = await hashPassword('my-password-99', pepper);

    expect(hash.startsWith('pbkdf2$50000$')).toBe(true);
    expect(await verifyPassword('my-password-99', pepper, hash)).toBe(true);
    expect(await verifyPassword('wrong-password', pepper, hash)).toBe(false);
    expect(await verifyPassword('my-password-99', 'wrong-pepper', hash)).toBe(false);
  });

  it('rejects PBKDF2 iteration counts above Cloudflare Workers 100k limit', async () => {
    expect(await verifyPassword('x', 'p', 'pbkdf2$600000$001122$334455')).toBe(false);
  });

  it('signs and verifies HS256 JWTs and rejects tampering or expiration', async () => {
    const secret = 'secret-123';
    const token = await signJwt('khang', secret, 3600);
    const payload = await verifyJwt(token, secret);
    expect(payload?.sub).toBe('khang');

    expect(await verifyJwt(`${token}tampered`, secret)).toBeNull();
    expect(await verifyJwt(token, 'wrong-secret')).toBeNull();

    const expired = await signJwt('khang', secret, -10);
    expect(await verifyJwt(expired, secret)).toBeNull();
  });

  it('compares strings in constant time style', () => {
    expect(timingSafeEqualStrings('admin', 'admin')).toBe(true);
    expect(timingSafeEqualStrings('admin', 'admiN')).toBe(false);
    expect(timingSafeEqualStrings('admin', 'admin123')).toBe(false);
  });
});

describe('auth API routes & protected endpoints', () => {
  it('blocks /api/files when unauthenticated', async () => {
    const env = await makeTestEnv();
    const res = await app.request('https://hub.example.com/api/files', {}, env);
    expect(res.status).toBe(401);

    const uploadRes = await app.request(
      'https://hub.example.com/api/files/upload-session',
      { method: 'POST', body: JSON.stringify({ name: 'a.txt', size: 10 }) },
      env
    );
    expect(uploadRes.status).toBe(401);
  });

  it('logs in with valid credentials, sets HttpOnly cookie, and allows /api/auth/me', async () => {
    const env = await makeTestEnv();

    const meBefore = await app.request('https://hub.example.com/api/auth/me', {}, env);
    expect(await meBefore.json()).toEqual({ authenticated: false, user: null });

    const loginRes = await app.request(
      'https://hub.example.com/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' },
        body: JSON.stringify({ username: 'khang', password: 'super-secret-pass' }),
      },
      env
    );
    expect(loginRes.status).toBe(200);
    const setCookieHeader = loginRes.headers.get('Set-Cookie') ?? '';
    expect(setCookieHeader).toContain('hub_session=');
    expect(setCookieHeader).toContain('HttpOnly');

    const cookiePair = setCookieHeader.split(';')[0];
    const meAfter = await app.request(
      'https://hub.example.com/api/auth/me',
      { headers: { Cookie: cookiePair } },
      env
    );
    expect(await meAfter.json()).toEqual({
      authenticated: true,
      user: { username: 'khang' },
    });
  });

  it('rate-limits repeated failed login attempts per IP', async () => {
    const env = await makeTestEnv();
    const ip = '203.0.113.55';

    for (let i = 0; i < 5; i += 1) {
      const res = await app.request(
        'https://hub.example.com/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ username: 'khang', password: 'wrong' }),
        },
        env
      );
      expect(res.status).toBe(401);
    }

    const blocked = await app.request(
      'https://hub.example.com/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ username: 'khang', password: 'super-secret-pass' }),
      },
      env
    );
    expect(blocked.status).toBe(429);
  });
});

