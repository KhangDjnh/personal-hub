import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppVariables, Env } from '../types.ts';
import {
  signJwt,
  timingSafeEqualStrings,
  verifyJwt,
  verifyPassword,
} from '../services/crypto.ts';
import { SESSION_COOKIE_NAME } from '../middleware/auth.ts';
import {
  checkLoginRateLimit,
  clearFailedLogins,
  getClientIp,
  recordFailedLogin,
} from '../middleware/rateLimit.ts';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function isSecureRequest(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return true;
  }
}

function isLocalLoopback(reqUrl: string, hasCfIp: boolean): boolean {
  if (hasCfIp) return false;
  try {
    const host = new URL(reqUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

authRoutes.get('/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ authenticated: false, user: null }, 200);
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ authenticated: false, user: null }, 200);
  }

  return c.json({ authenticated: true, user: { username: payload.sub } }, 200);
});

authRoutes.post('/login', async (c) => {
  if (
    !c.env.AUTH_USERNAME ||
    !c.env.AUTH_PASSWORD_HASH ||
    !c.env.AUTH_PEPPER ||
    !c.env.JWT_SECRET
  ) {
    return c.json(
      { error: 'Hệ thống chưa được cấu hình thông tin xác thực.' },
      500
    );
  }

  const ip = getClientIp(c.req.raw);
  const skipRateLimit = isLocalLoopback(c.req.url, Boolean(c.req.header('CF-Connecting-IP')));
  if (!skipRateLimit) {
    const limit = await checkLoginRateLimit(c.env.HUB_KV, ip);
    if (!limit.allowed) {
      return c.json(
        {
          error: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(
            limit.retryAfterSeconds / 60
          )} phút.`,
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        429
      );
    }
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Dữ liệu đăng nhập không hợp lệ.' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return c.json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' }, 400);
  }

  const usernameMatches = timingSafeEqualStrings(username, c.env.AUTH_USERNAME);
  const passwordMatches = await verifyPassword(
    password,
    c.env.AUTH_PEPPER,
    c.env.AUTH_PASSWORD_HASH
  );

  if (!usernameMatches || !passwordMatches) {
    if (!skipRateLimit) {
      await recordFailedLogin(c.env.HUB_KV, ip);
    }
    return c.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
  }

  if (!skipRateLimit) {
    await clearFailedLogins(c.env.HUB_KV, ip);
  }
  const jwt = await signJwt(username, c.env.JWT_SECRET, SESSION_TTL_SECONDS);

  setCookie(c, SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: isSecureRequest(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({ user: { username } }, 200);
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(c.req.url),
    sameSite: 'Lax',
  });
  return c.json({ ok: true }, 200);
});

