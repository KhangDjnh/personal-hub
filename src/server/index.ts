import { Hono } from 'hono';
import type { AppVariables, Env } from './types.ts';
import { authRoutes } from './routes/auth.ts';
import { fileRoutes } from './routes/files.ts';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use('/api/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRoutes);
app.route('/api/files', fileRoutes);

app.all('/api/*', (c) => c.json({ error: 'API endpoint không tồn tại.' }, 404));

export default app;

