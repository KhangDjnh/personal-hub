import type {
  BreadcrumbItem,
  FileItem,
  FileListResponse,
  QuotaInfo,
  SortDirection,
  SortField,
  UploadSessionResponse,
} from '../../../shared/types.ts';
import type { Env } from '../../types.ts';
import {
  StorageError,
  type CreateUploadSessionOptions,
  type DownloadFileOptions,
  type ListFilesOptions,
  type StorageProvider,
} from './types.ts';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const KV_TOKEN_KEY = 'gdrive:access_token';
const MAX_TREE_DEPTH = 16;

interface DriveRawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  trashed?: boolean;
}

interface CachedToken {
  cacheKey: string;
  token: string;
  expiresAt: number;
}

let memoryTokenCache: CachedToken | null = null;

const GOOGLE_EXPORT_MAP: Record<string, { mimeType: string; ext: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', ext: '.pdf' },
};

function assertValidDriveId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) {
    throw new StorageError(400, 'ID file hoặc thư mục không hợp lệ.');
  }
  return id;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new StorageError(400, 'Tên file hoặc thư mục không hợp lệ.');
  }
  if (cleaned.length > 255) {
    throw new StorageError(400, 'Tên file hoặc thư mục vượt quá 255 ký tự.');
  }
  return cleaned;
}

function encodeContentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function mapDriveFile(raw: DriveRawFile): FileItem {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    isFolder: raw.mimeType === FOLDER_MIME,
    size: raw.size !== undefined ? Number(raw.size) : null,
    modifiedTime: raw.modifiedTime ?? new Date(0).toISOString(),
    parents: raw.parents,
  };
}

function buildOrderBy(sort: SortField = 'modifiedTime', order: SortDirection = 'desc'): string {
  const dir = order === 'asc' ? 'asc' : 'desc';
  const field =
    sort === 'name'
      ? 'name_natural'
      : sort === 'size'
        ? 'quotaBytesUsed'
        : 'modifiedTime';
  return `folder,${field} ${dir}`;
}

export class GoogleDriveProvider implements StorageProvider {
  private readonly env: Env;
  private readonly rootFolderId: string;

  constructor(env: Env) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
      throw new StorageError(
        500,
        'Server chưa được cấu hình đầy đủ thông tin Google Drive OAuth2.'
      );
    }
    this.env = env;
    this.rootFolderId = assertValidDriveId(env.GDRIVE_ROOT_FOLDER_ID);
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    const cacheKey = `${this.env.GOOGLE_CLIENT_ID}:${this.env.GOOGLE_REFRESH_TOKEN.slice(-12)}`;

    if (
      !forceRefresh &&
      memoryTokenCache &&
      memoryTokenCache.cacheKey === cacheKey &&
      memoryTokenCache.expiresAt - now > 60_000
    ) {
      return memoryTokenCache.token;
    }

    if (!forceRefresh && this.env.HUB_KV) {
      const kvRaw = await this.env.HUB_KV.get(KV_TOKEN_KEY);
      if (kvRaw) {
        try {
          const parsed = JSON.parse(kvRaw) as CachedToken;
          if (parsed.cacheKey === cacheKey && parsed.token && parsed.expiresAt - now > 60_000) {
            memoryTokenCache = parsed;
            return parsed.token;
          }
        } catch {
          // Ignore malformed cache entry and refresh below.
        }
      }
    }

    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.GOOGLE_CLIENT_ID,
        client_secret: this.env.GOOGLE_CLIENT_SECRET,
        refresh_token: this.env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      if (errText.includes('invalid_grant')) {
        throw new StorageError(
          502,
          'Google Refresh Token đã hết hạn hoặc bị thu hồi. Hãy chạy lại script lấy token.'
        );
      }
      throw new StorageError(502, `Không thể làm mới Google Access Token (${tokenRes.status}).`);
    }

    const data = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new StorageError(502, 'Google OAuth2 không trả về access_token.');
    }

    const expiresInSec = Math.max(120, data.expires_in ?? 3600);
    const cached: CachedToken = {
      cacheKey,
      token: data.access_token,
      expiresAt: now + expiresInSec * 1000,
    };
    memoryTokenCache = cached;

    if (this.env.HUB_KV) {
      const ttl = Math.max(60, expiresInSec - 120);
      await this.env.HUB_KV.put(KV_TOKEN_KEY, JSON.stringify(cached), { expirationTtl: ttl });
    }

    return cached.token;
  }

  private async driveFetch(url: string, init: RequestInit = {}, retryAuth = true): Promise<Response> {
    const token = await this.getAccessToken(false);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...init, headers });

    if (response.status === 401 && retryAuth) {
      const refreshed = await this.getAccessToken(true);
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshed}`);
      return fetch(url, { ...init, headers: retryHeaders });
    }

    return response;
  }

  private async getRawFile(fileId: string): Promise<DriveRawFile> {
    const safeId = assertValidDriveId(fileId);
    const url = `${DRIVE_API_BASE}/files/${safeId}?fields=id,name,mimeType,size,modifiedTime,parents,trashed&supportsAllDrives=true`;
    const res = await this.driveFetch(url);

    if (res.status === 404) {
      throw new StorageError(404, 'Không tìm thấy file hoặc thư mục.');
    }
    if (!res.ok) {
      throw new StorageError(502, `Lỗi Google Drive API (${res.status}).`);
    }

    const raw = (await res.json()) as DriveRawFile;
    if (raw.trashed) {
      throw new StorageError(404, 'File hoặc thư mục đã bị chuyển vào thùng rác.');
    }
    return raw;
  }

  /**
   * Verifies that targetId is either the configured root folder or a descendant of it.
   * Prevents IDOR access to unrelated files in the owner's Google Drive.
   */
  private async resolveWithinRoot(
    targetId: string
  ): Promise<{ item: DriveRawFile; breadcrumbs: BreadcrumbItem[] }> {
    const chain: BreadcrumbItem[] = [];
    const visited = new Set<string>();
    let currentId = assertValidDriveId(targetId);
    let targetItem: DriveRawFile | null = null;

    for (let depth = 0; depth < MAX_TREE_DEPTH; depth += 1) {
      if (visited.has(currentId)) {
        throw new StorageError(403, 'Cấu trúc thư mục không hợp lệ.');
      }
      visited.add(currentId);

      const raw = await this.getRawFile(currentId);
      if (!targetItem) {
        targetItem = raw;
      }

      if (raw.id === this.rootFolderId) {
        chain.unshift({ id: raw.id, name: 'Thư mục gốc' });
        return { item: targetItem, breadcrumbs: chain };
      }

      chain.unshift({ id: raw.id, name: raw.name });

      const parentId = raw.parents?.[0];
      if (!parentId) {
        throw new StorageError(403, 'Không được phép truy cập ngoài thư mục gốc của Hub.');
      }
      currentId = parentId;
    }

    throw new StorageError(403, 'Độ sâu thư mục vượt quá giới hạn cho phép.');
  }

  async listFiles(options: ListFilesOptions): Promise<FileListResponse> {
    const targetFolderId = options.folderId
      ? assertValidDriveId(options.folderId)
      : this.rootFolderId;

    const { item, breadcrumbs } = await this.resolveWithinRoot(targetFolderId);
    if (item.mimeType !== FOLDER_MIME) {
      throw new StorageError(400, 'ID được chọn không phải là thư mục.');
    }

    let query = `'${escapeDriveQuery(targetFolderId)}' in parents and trashed = false`;
    const search = options.query?.trim();
    if (search) {
      query += ` and name contains '${escapeDriveQuery(search)}'`;
    }

    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
      orderBy: buildOrderBy(options.sort, options.order),
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    const res = await this.driveFetch(`${DRIVE_API_BASE}/files?${params.toString()}`);
    if (!res.ok) {
      throw new StorageError(502, `Không thể tải danh sách file từ Google Drive (${res.status}).`);
    }

    const data = (await res.json()) as {
      files?: DriveRawFile[];
      nextPageToken?: string;
    };

    return {
      folderId: targetFolderId,
      breadcrumbs,
      files: (data.files ?? []).map(mapDriveFile),
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  async getQuota(): Promise<QuotaInfo> {
    const res = await this.driveFetch(`${DRIVE_API_BASE}/about?fields=storageQuota`);
    if (!res.ok) {
      throw new StorageError(502, `Không thể đọc thông tin dung lượng Drive (${res.status}).`);
    }

    const data = (await res.json()) as {
      storageQuota?: {
        limit?: string;
        usage?: string;
        usageInDrive?: string;
      };
    };

    return {
      limit: data.storageQuota?.limit ? Number(data.storageQuota.limit) : null,
      usage: Number(data.storageQuota?.usage ?? 0),
      usageInDrive: Number(data.storageQuota?.usageInDrive ?? 0),
    };
  }

  async createFolder(name: string, parentId?: string): Promise<FileItem> {
    const targetParentId = parentId ? assertValidDriveId(parentId) : this.rootFolderId;
    const { item } = await this.resolveWithinRoot(targetParentId);
    if (item.mimeType !== FOLDER_MIME) {
      throw new StorageError(400, 'Thư mục cha không hợp lệ.');
    }

    const cleanName = sanitizeFileName(name);
    const res = await this.driveFetch(
      `${DRIVE_API_BASE}/files?fields=id,name,mimeType,size,modifiedTime,parents&supportsAllDrives=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          name: cleanName,
          mimeType: FOLDER_MIME,
          parents: [targetParentId],
        }),
      }
    );

    if (!res.ok) {
      throw new StorageError(502, `Không thể tạo thư mục mới (${res.status}).`);
    }

    return mapDriveFile((await res.json()) as DriveRawFile);
  }

  async createUploadSession(options: CreateUploadSessionOptions): Promise<UploadSessionResponse> {
    const targetParentId = options.parentId
      ? assertValidDriveId(options.parentId)
      : this.rootFolderId;

    const { item } = await this.resolveWithinRoot(targetParentId);
    if (item.mimeType !== FOLDER_MIME) {
      throw new StorageError(400, 'Thư mục đích không hợp lệ.');
    }

    const cleanName = sanitizeFileName(options.name);
    const contentType = options.mimeType?.trim() || 'application/octet-stream';
    const size = Math.max(0, Math.floor(options.size));

    const res = await this.driveFetch(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Origin: options.origin,
          'X-Upload-Content-Type': contentType,
          'X-Upload-Content-Length': String(size),
        },
        body: JSON.stringify({
          name: cleanName,
          parents: [targetParentId],
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new StorageError(502, `Không thể khởi tạo phiên upload Google Drive (${res.status}): ${detail}`);
    }

    const uploadUrl = res.headers.get('Location');
    if (!uploadUrl) {
      throw new StorageError(502, 'Google Drive không trả về Resumable Upload URI.');
    }

    return {
      uploadUrl,
      fileName: cleanName,
    };
  }

  async downloadFile(fileId: string, options: DownloadFileOptions): Promise<Response> {
    const { item } = await this.resolveWithinRoot(fileId);
    if (item.mimeType === FOLDER_MIME) {
      throw new StorageError(400, 'Không thể tải trực tiếp thư mục. Hãy mở thư mục để tải từng file.');
    }

    const exportTarget = GOOGLE_EXPORT_MAP[item.mimeType];
    const dispositionType = options.inline ? 'inline' : 'attachment';

    if (exportTarget) {
      const exportUrl = `${DRIVE_API_BASE}/files/${item.id}/export?mimeType=${encodeURIComponent(
        exportTarget.mimeType
      )}`;
      const upstream = await this.driveFetch(exportUrl);
      if (!upstream.ok || !upstream.body) {
        throw new StorageError(502, `Không thể xuất file Google Workspace (${upstream.status}).`);
      }

      const outName = item.name.endsWith(exportTarget.ext)
        ? item.name
        : `${item.name}${exportTarget.ext}`;
      const headers = new Headers();
      headers.set('Content-Type', exportTarget.mimeType);
      headers.set('Content-Disposition', encodeContentDisposition(dispositionType, outName));
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'private, no-store');
      return new Response(upstream.body, { status: 200, headers });
    }

    if (item.mimeType.startsWith('application/vnd.google-apps.')) {
      throw new StorageError(400, 'Loại file Google Workspace này chưa hỗ trợ tải về trực tiếp.');
    }

    const fetchHeaders = new Headers();
    if (options.rangeHeader) {
      fetchHeaders.set('Range', options.rangeHeader);
    }

    const upstream = await this.driveFetch(
      `${DRIVE_API_BASE}/files/${item.id}?alt=media&supportsAllDrives=true`,
      { headers: fetchHeaders }
    );

    if (!upstream.ok && upstream.status !== 206) {
      throw new StorageError(502, `Không thể tải file từ Google Drive (${upstream.status}).`);
    }

    const rawContentType =
      upstream.headers.get('Content-Type') || item.mimeType || 'application/octet-stream';
    const isActiveContent =
      /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)/i.test(rawContentType);
    // Neutralize active HTML/SVG payloads if requested inline so scripts cannot run on our origin.
    const safeContentType =
      options.inline && isActiveContent ? 'text/plain; charset=utf-8' : rawContentType;
    const safeDisposition =
      options.inline && isActiveContent ? 'attachment' : dispositionType;

    const headers = new Headers();
    headers.set('Content-Type', safeContentType);
    headers.set('Content-Disposition', encodeContentDisposition(safeDisposition, item.name));
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');

    for (const passthrough of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
      const value = upstream.headers.get(passthrough);
      if (value) headers.set(passthrough, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  }

  async renameFile(fileId: string, newName: string): Promise<FileItem> {
    const safeId = assertValidDriveId(fileId);
    if (safeId === this.rootFolderId) {
      throw new StorageError(403, 'Không thể đổi tên thư mục gốc của Hub.');
    }

    await this.resolveWithinRoot(safeId);
    const cleanName = sanitizeFileName(newName);

    const res = await this.driveFetch(
      `${DRIVE_API_BASE}/files/${safeId}?fields=id,name,mimeType,size,modifiedTime,parents&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name: cleanName }),
      }
    );

    if (!res.ok) {
      throw new StorageError(502, `Không thể đổi tên (${res.status}).`);
    }

    return mapDriveFile((await res.json()) as DriveRawFile);
  }

  async deleteFile(fileId: string): Promise<void> {
    const safeId = assertValidDriveId(fileId);
    if (safeId === this.rootFolderId) {
      throw new StorageError(403, 'Không thể xóa thư mục gốc của Hub.');
    }

    await this.resolveWithinRoot(safeId);

    // Move to Trash instead of permanent deletion so accidental deletes can be recovered in Drive.
    const res = await this.driveFetch(
      `${DRIVE_API_BASE}/files/${safeId}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ trashed: true }),
      }
    );

    if (!res.ok) {
      throw new StorageError(502, `Không thể xóa mục đã chọn (${res.status}).`);
    }
  }
}
