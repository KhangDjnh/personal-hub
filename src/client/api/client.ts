import type {
  ApiErrorResponse,
  AuthUser,
  FileItem,
  FileListResponse,
  QuotaInfo,
  SortDirection,
  SortField,
  UploadSessionResponse,
} from '../../shared/types.ts';

const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MiB (strict multiple of 256 KiB required by Google Drive)

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Yêu cầu thất bại (${res.status})`;
    try {
      const errData = (await res.json()) as Partial<ApiErrorResponse>;
      if (errData.error) message = errData.error;
    } catch {
      // Fallback to default message.
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export async function getSession(): Promise<{ authenticated: boolean; user: AuthUser | null }> {
  return requestJson('/api/auth/me');
}

export async function login(username: string, password: string): Promise<{ user: AuthUser }> {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await requestJson('/api/auth/logout', { method: 'POST' });
}

export async function listFiles(params: {
  folderId?: string;
  query?: string;
  sort?: SortField;
  order?: SortDirection;
  pageToken?: string;
}): Promise<FileListResponse> {
  const sp = new URLSearchParams();
  if (params.folderId) sp.set('folderId', params.folderId);
  if (params.query) sp.set('q', params.query);
  if (params.sort) sp.set('sort', params.sort);
  if (params.order) sp.set('order', params.order);
  if (params.pageToken) sp.set('pageToken', params.pageToken);
  const qs = sp.toString();
  return requestJson(`/api/files${qs ? `?${qs}` : ''}`);
}

export async function getQuota(): Promise<QuotaInfo> {
  return requestJson('/api/files/quota');
}

export async function createFolder(name: string, parentId?: string): Promise<FileItem> {
  return requestJson('/api/files/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
}

export async function renameFile(fileId: string, name: string): Promise<FileItem> {
  return requestJson(`/api/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteFile(fileId: string): Promise<void> {
  await requestJson(`/api/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
}

export function getDownloadUrl(fileId: string, inline = false): string {
  return `/api/files/${encodeURIComponent(fileId)}/download${inline ? '?inline=1' : ''}`;
}

function uploadChunkWithXhr(params: {
  uploadUrl: string;
  body: Blob;
  contentRange?: string;
  signal: AbortSignal;
  onChunkProgress: (loadedBytes: number) => void;
}): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    if (params.signal.aborted) {
      reject(new DOMException('Upload đã bị hủy.', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', params.uploadUrl, true);
    if (params.contentRange) {
      xhr.setRequestHeader('Content-Range', params.contentRange);
    }

    const onAbort = () => xhr.abort();
    params.signal.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        params.onChunkProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      params.signal.removeEventListener('abort', onAbort);
      if (xhr.status === 200 || xhr.status === 201 || xhr.status === 308) {
        resolve({ status: xhr.status });
      } else {
        reject(new Error(`Google Drive từ chối dữ liệu (${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      params.signal.removeEventListener('abort', onAbort);
      reject(new Error('Lỗi kết nối mạng hoặc CORS khi tải file lên Google Drive.'));
    };

    xhr.onabort = () => {
      params.signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Upload đã bị hủy.', 'AbortError'));
    };

    xhr.send(params.body);
  });
}

export async function uploadFileDirectToDrive(options: {
  file: File;
  parentId?: string;
  signal: AbortSignal;
  onPhaseChange: (phase: 'preparing' | 'uploading') => void;
  onProgress: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<void> {
  options.onPhaseChange('preparing');

  const session = await requestJson<UploadSessionResponse>('/api/files/upload-session', {
    method: 'POST',
    signal: options.signal,
    body: JSON.stringify({
      name: options.file.name,
      size: options.file.size,
      mimeType: options.file.type || 'application/octet-stream',
      parentId: options.parentId,
    }),
  });

  options.onPhaseChange('uploading');

  const totalSize = options.file.size;
  if (totalSize === 0 || totalSize <= CHUNK_SIZE) {
    await uploadChunkWithXhr({
      uploadUrl: session.uploadUrl,
      body: options.file,
      signal: options.signal,
      onChunkProgress: (loaded) => options.onProgress(loaded, Math.max(1, totalSize)),
    });
    options.onProgress(totalSize, Math.max(1, totalSize));
    return;
  }

  let offset = 0;
  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = options.file.slice(offset, end);
    const contentRange = `bytes ${offset}-${end - 1}/${totalSize}`;

    const result = await uploadChunkWithXhr({
      uploadUrl: session.uploadUrl,
      body: chunk,
      contentRange,
      signal: options.signal,
      onChunkProgress: (loaded) => options.onProgress(offset + loaded, totalSize),
    });

    offset = end;
    options.onProgress(offset, totalSize);

    if (result.status === 200 || result.status === 201) {
      break;
    }
  }
}

