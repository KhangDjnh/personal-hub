export interface AuthUser {
  username: string;
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: string;
  parents?: string[];
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface FileListResponse {
  folderId: string;
  breadcrumbs: BreadcrumbItem[];
  files: FileItem[];
  nextPageToken: string | null;
}

export interface QuotaInfo {
  limit: number | null;
  usage: number;
  usageInDrive: number;
}

export interface UploadSessionResponse {
  uploadUrl: string;
  fileName: string;
}

export interface ApiErrorResponse {
  error: string;
  retryAfterSeconds?: number;
}

export type SortField = 'name' | 'modifiedTime' | 'size';
export type SortDirection = 'asc' | 'desc';

