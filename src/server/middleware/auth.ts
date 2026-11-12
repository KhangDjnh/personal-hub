import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppVariables, Env } from '../types.ts';
import { verifyJwt } from '../services/crypto.ts';

export const SESSION_COOKIE_NAME = 'hub_session';

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'Vui lòng đăng nhập để truy cập Hub.' }, 401);
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.' }, 401);
  }

  c.set('user', { username: payload.sub });
  await next();
};

