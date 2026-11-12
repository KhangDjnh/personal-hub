import { Hono, type Context } from 'hono';
import type { SortDirection, SortField } from '../../shared/types.ts';
import type { AppVariables, Env } from '../types.ts';
import { requireAuth } from '../middleware/auth.ts';
import { GoogleDriveProvider } from '../services/storage/gdrive.ts';
import { StorageError, type StorageProvider } from '../services/storage/types.ts';

export const fileRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

fileRoutes.use('*', requireAuth);

function createStorage(env: Env): StorageProvider {
  return new GoogleDriveProvider(env);
}

function handleStorageError(c: Context<{ Bindings: Env; Variables: AppVariables }>, error: unknown) {
  if (error instanceof StorageError) {
    return c.json({ error: error.message }, error.status as 400 | 401 | 403 | 404 | 500 | 502);
  }
  console.error('Unexpected storage error:', error);
  return c.json({ error: 'Đã xảy ra lỗi khi xử lý yêu cầu với kho lưu trữ.' }, 500);
}

fileRoutes.get('/', async (c) => {
  try {
    const folderId = c.req.query('folderId') || undefined;
    const query = c.req.query('q') || undefined;
    const pageToken = c.req.query('pageToken') || undefined;
    const rawSort = c.req.query('sort');
    const rawOrder = c.req.query('order');

    const sort: SortField =
      rawSort === 'name' || rawSort === 'size' || rawSort === 'modifiedTime'
        ? rawSort
        : 'modifiedTime';
    const order: SortDirection = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : 'desc';

    const result = await createStorage(c.env).listFiles({
      folderId,
      query,
      sort,
      order,
      pageToken,
    });
    return c.json(result);
  } catch (err) {
    return handleStorageError(c, err);
  }
});

fileRoutes.get('/quota', async (c) => {
  try {
    const quota = await createStorage(c.env).getQuota();
    return c.json(quota);
  } catch (err) {
    return handleStorageError(c, err);
  }
});

fileRoutes.post('/folders', async (c) => {
  try {
    const body = (await c.req.json()) as { name?: unknown; parentId?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'Vui lòng nhập tên thư mục.' }, 400);
    }
    const parentId = typeof body.parentId === 'string' ? body.parentId : undefined;
    const folder = await createStorage(c.env).createFolder(body.name, parentId);
    return c.json(folder, 201);
  } catch (err) {
    return handleStorageError(c, err);
  }
});

fileRoutes.post('/upload-session', async (c) => {
  try {
    const body = (await c.req.json()) as {
      name?: unknown;
      size?: unknown;
      mimeType?: unknown;
      parentId?: unknown;
    };

    if (typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'Thiếu tên file upload.' }, 400);
    }

    const size = typeof body.size === 'number' && Number.isFinite(body.size) ? body.size : 0;
    const mimeType =
      typeof body.mimeType === 'string' && body.mimeType.trim()
        ? body.mimeType
        : 'application/octet-stream';
    const parentId = typeof body.parentId === 'string' ? body.parentId : undefined;

    const requestOrigin = c.req.header('Origin') || new URL(c.req.url).origin;
    const session = await createStorage(c.env).createUploadSession({
      name: body.name,
      size,
      mimeType,
      parentId,
      origin: requestOrigin,
    });
    return c.json(session, 201);
  } catch (err) {
    return handleStorageError(c, err);
  }
});

fileRoutes.get('/:id/download', async (c) => {
  try {
    const fileId = c.req.param('id');
    const inline = c.req.query('inline') === '1';
    const rangeHeader = c.req.header('Range');
    return await createStorage(c.env).downloadFile(fileId, { rangeHeader, inline });
  } catch (err) {
    return handleStorageError(c, err);
  }
});

fileRoutes.patch('/:id', async (c) => {
  try {
    const fileId = c.req.param('id');
    const body = (await c.req.json()) as { name?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'Tên mới không hợp lệ.' }, 400);
    }
    const updated = await createStorage(c.env).renameFile(fileId, body.name);
    return c.json(updated);
  } catch (err) {
    return handleStorageError(c, err);
  }
});

fileRoutes.delete('/:id', async (c) => {
  try {
    const fileId = c.req.param('id');
    await createStorage(c.env).deleteFile(fileId);
    return c.json({ ok: true });
  } catch (err) {
    return handleStorageError(c, err);
  }
});
