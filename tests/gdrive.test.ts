import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveProvider } from '../src/server/services/storage/gdrive.ts';
import { StorageError } from '../src/server/services/storage/types.ts';
import type { Env } from '../src/server/types.ts';

const ROOT_ID = '17p6bKfYSoXevyRjzcH90COqLO0U1wURF';

function makeEnv(): Env {
  return {
    AUTH_USERNAME: 'admin',
    AUTH_PEPPER: 'pepper',
    AUTH_PASSWORD_HASH: 'hash',
    JWT_SECRET: 'secret',
    GOOGLE_CLIENT_ID: 'client-test',
    GOOGLE_CLIENT_SECRET: 'secret-test',
    GOOGLE_REFRESH_TOKEN: `refresh-${Math.random().toString(36).slice(2)}`,
    GDRIVE_ROOT_FOLDER_ID: ROOT_ID,
  };
}

describe('GoogleDriveProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists files inside root folder and prevents IDOR outside root', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'mock-access', expires_in: 3600 }), {
          status: 200,
        });
      }
      if (url.includes(`/files/${ROOT_ID}?`)) {
        return new Response(
          JSON.stringify({
            id: ROOT_ID,
            name: 'Hub Root',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes('/files/outsideFolder999?')) {
        return new Response(
          JSON.stringify({
            id: 'outsideFolder999',
            name: 'Private Other Folder',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['anotherRoot123'],
            trashed: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes('/files/anotherRoot123?')) {
        return new Response(
          JSON.stringify({
            id: 'anotherRoot123',
            name: 'My Drive',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes('/files?')) {
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'file12345678',
                name: 'tailieu.pdf',
                mimeType: 'application/pdf',
                size: '2048',
                modifiedTime: '2026-11-12T00:00:00.000Z',
                parents: [ROOT_ID],
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const provider = new GoogleDriveProvider(makeEnv());
    const list = await provider.listFiles({});
    expect(list.folderId).toBe(ROOT_ID);
    expect(list.breadcrumbs).toEqual([{ id: ROOT_ID, name: 'Thư mục gốc' }]);
    expect(list.files).toHaveLength(1);
    expect(list.files[0].name).toBe('tailieu.pdf');

    await expect(provider.listFiles({ folderId: 'outsideFolder999' })).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('creates resumable upload session forwarding Origin and protects root from deletion', async () => {
    let capturedOrigin = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'mock-access', expires_in: 3600 }), {
          status: 200,
        });
      }
      if (url.includes(`/files/${ROOT_ID}?`)) {
        return new Response(
          JSON.stringify({
            id: ROOT_ID,
            name: 'Hub Root',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes('uploadType=resumable')) {
        const headers = new Headers(init?.headers);
        capturedOrigin = headers.get('Origin') ?? '';
        return new Response(null, {
          status: 200,
          headers: {
            Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc',
          },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const provider = new GoogleDriveProvider(makeEnv());
    const session = await provider.createUploadSession({
      name: 'backup.zip',
      size: 50_000_000,
      mimeType: 'application/zip',
      origin: 'https://hub.example.workers.dev',
    });

    expect(capturedOrigin).toBe('https://hub.example.workers.dev');
    expect(session.uploadUrl).toContain('upload_id=abc');
    await expect(provider.deleteFile(ROOT_ID)).rejects.toBeInstanceOf(StorageError);
  });

  it('neutralizes inline HTML responses during download to prevent same-origin XSS', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'mock-access', expires_in: 3600 }), {
          status: 200,
        });
      }
      if (url.includes('/files/htmlFile12345?fields=')) {
        return new Response(
          JSON.stringify({
            id: 'htmlFile12345',
            name: 'note.html',
            mimeType: 'text/html',
            parents: [ROOT_ID],
            trashed: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes(`/files/${ROOT_ID}?`)) {
        return new Response(
          JSON.stringify({
            id: ROOT_ID,
            name: 'Hub Root',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes('alt=media')) {
        return new Response('<script>alert(1)</script>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const provider = new GoogleDriveProvider(makeEnv());
    const res = await provider.downloadFile('htmlFile12345', { inline: true });
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });
});

