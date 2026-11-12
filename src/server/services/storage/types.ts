import type {
  FileItem,
  FileListResponse,
  QuotaInfo,
  SortDirection,
  SortField,
  UploadSessionResponse,
} from '../../../shared/types.ts';

export class StorageError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
  }
}

export interface ListFilesOptions {
  folderId?: string;
  query?: string;
  sort?: SortField;
  order?: SortDirection;
  pageToken?: string;
}

export interface CreateUploadSessionOptions {
  name: string;
  size: number;
  mimeType: string;
  parentId?: string;
  origin: string;
}

export interface DownloadFileOptions {
  rangeHeader?: string | null;
  inline?: boolean;
}

export interface StorageProvider {
  listFiles(options: ListFilesOptions): Promise<FileListResponse>;
  getQuota(): Promise<QuotaInfo>;
  createFolder(name: string, parentId?: string): Promise<FileItem>;
  createUploadSession(options: CreateUploadSessionOptions): Promise<UploadSessionResponse>;
  downloadFile(fileId: string, options: DownloadFileOptions): Promise<Response>;
  renameFile(fileId: string, newName: string): Promise<FileItem>;
  deleteFile(fileId: string): Promise<void>;
}

