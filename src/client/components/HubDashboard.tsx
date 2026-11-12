import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronRight, FolderPlus, HardDrive, LogOut, RefreshCw, Search } from 'lucide-react';
import type {
  AuthUser,
  BreadcrumbItem,
  FileItem,
  QuotaInfo,
  SortDirection,
  SortField,
} from '../../shared/types.ts';
import {
  ApiError,
  createFolder,
  deleteFile,
  getQuota,
  listFiles,
  logout,
  renameFile,
  uploadFileDirectToDrive,
} from '../api/client.ts';
import {
  DeleteConfirmDialog,
  FolderDialog,
  PreviewDialog,
  RenameDialog,
} from './Dialogs.tsx';
import { FileTable } from './FileTable.tsx';
import { QuotaBar } from './QuotaBar.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import { UploadDropzone, type UploadTask } from './UploadDropzone.tsx';

interface HubDashboardProps {
  user: AuthUser;
  onUnauthorized: () => void;
}

export function HubDashboard({ user, onUnauthorized }: HubDashboardProps) {
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [sort, setSort] = useState<SortField>('modifiedTime');
  const [order, setOrder] = useState<SortDirection>('desc');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<FileItem | null>(null);

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : fallback);
    },
    [onUnauthorized]
  );

  const loadDirectory = useCallback(
    async (opts?: { appendPageToken?: string }) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await listFiles({
          folderId,
          query: activeQuery || undefined,
          sort,
          order,
          pageToken: opts?.appendPageToken,
        });
        setBreadcrumbs(res.breadcrumbs);
        setNextPageToken(res.nextPageToken);
        setFiles((prev) => (opts?.appendPageToken ? [...prev, ...res.files] : res.files));
      } catch (err) {
        handleApiError(err, 'Không thể tải danh sách file.');
      } finally {
        setLoading(false);
      }
    },
    [activeQuery, folderId, handleApiError, order, sort]
  );

  const refreshQuota = useCallback(async () => {
    try {
      setQuota(await getQuota());
    } catch {
      // Non-critical indicator; avoid blocking dashboard if quota fails.
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const handleSelectFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    for (const file of incoming) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const controller = new AbortController();

      const newTask: UploadTask = {
        id,
        fileName: file.name,
        size: file.size,
        percent: 0,
        status: 'preparing',
        controller,
      };
      setUploadTasks((prev) => [newTask, ...prev]);

      uploadFileDirectToDrive({
        file,
        parentId: folderId,
        signal: controller.signal,
        onPhaseChange: (phase) => {
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: phase } : t))
          );
        },
        onProgress: (uploaded, total) => {
          const percent = Math.min(100, Math.round((uploaded / total) * 100));
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, percent } : t))
          );
        },
      })
        .then(() => {
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: 'done', percent: 100 } : t))
          );
          setStatusMsg(`Đã tải lên thành công ${file.name}`);
          loadDirectory();
          refreshQuota();
        })
        .catch((err) => {
          const aborted = err instanceof DOMException && err.name === 'AbortError';
          if (err instanceof ApiError && err.status === 401) {
            onUnauthorized();
            return;
          }
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status: aborted ? 'aborted' : 'error',
                    errorMessage: aborted ? undefined : err instanceof Error ? err.message : 'Lỗi tải lên',
                  }
                : t
            )
          );
        });
    }
  };

  const handleCancelUpload = (taskId: string) => {
    const target = uploadTasks.find((t) => t.id === taskId);
    target?.controller.abort();
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    onUnauthorized();
  };

  return (
    <div className="hub-shell">
      <header className="hub-header">
        <div className="hub-brand">
          <HardDrive size={24} aria-hidden="true" style={{ color: 'var(--accent)' }} />
          <div>
            <h1>Hub Cá Nhân</h1>
            <small>Tài khoản: {user.username}</small>
          </div>
        </div>

        <div className="hub-header-actions">
          <QuotaBar quota={quota} />
          <ThemeToggle />
          <button type="button" className="btn" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" className="visually-hidden">
        {statusMsg}
      </div>

      {errorMsg && (
        <div role="alert" className="alert-error">
          {errorMsg}
        </div>
      )}

      <UploadDropzone
        tasks={uploadTasks}
        onSelectFiles={handleSelectFiles}
        onCancelTask={handleCancelUpload}
        onClearFinished={() =>
          setUploadTasks((prev) =>
            prev.filter((t) => t.status === 'preparing' || t.status === 'uploading')
          )
        }
      />

      <div className="toolbar">
        <nav aria-label="Đường dẫn thư mục" className="breadcrumbs">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={crumb.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {idx > 0 && <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />}
                {isLast ? (
                  <span className="crumb-current" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="crumb-btn"
                    onClick={() => setFolderId(idx === 0 ? undefined : crumb.id)}
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>

        <div className="toolbar-controls">
          <search>
            <form className="search-form" onSubmit={handleSearchSubmit}>
              <label htmlFor="hub-search-input" className="visually-hidden">
                Tìm kiếm file theo tên
              </label>
              <input
                id="hub-search-input"
                type="search"
                className="search-input"
                placeholder="Tìm tên file..."
                value={searchInput}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (!e.target.value && activeQuery) {
                    setActiveQuery('');
                  }
                }}
              />
              <button type="submit" className="btn btn-icon" aria-label="Tìm kiếm">
                <Search size={16} aria-hidden="true" />
              </button>
            </form>
          </search>

          <label htmlFor="hub-sort-select" className="visually-hidden">
            Sắp xếp theo
          </label>
          <select
            id="hub-sort-select"
            className="sort-select"
            value={`${sort}:${order}`}
            onChange={(e) => {
              const [nextSort, nextOrder] = e.target.value.split(':') as [SortField, SortDirection];
              setSort(nextSort);
              setOrder(nextOrder);
            }}
          >
            <option value="modifiedTime:desc">Mới cập nhật nhất</option>
            <option value="modifiedTime:asc">Cũ nhất</option>
            <option value="name:asc">Tên A → Z</option>
            <option value="name:desc">Tên Z → A</option>
            <option value="size:desc">Dung lượng lớn nhất</option>
          </select>

          <button type="button" className="btn" onClick={() => setFolderModalOpen(true)}>
            <FolderPlus size={16} aria-hidden="true" />
            Thư mục mới
          </button>

          <button
            type="button"
            className="btn btn-icon"
            aria-label="Làm mới danh sách"
            title="Làm mới"
            onClick={() => loadDirectory()}
            disabled={loading}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <FileTable
        files={files}
        loading={loading}
        onOpenFolder={(folder) => setFolderId(folder.id)}
        onPreview={(file) => setPreviewTarget(file)}
        onRename={(file) => setRenameTarget(file)}
        onDelete={(file) => setDeleteTarget(file)}
      />

      {nextPageToken && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() => loadDirectory({ appendPageToken: nextPageToken })}
          >
            {loading ? 'Đang tải...' : 'Tải thêm file'}
          </button>
        </div>
      )}

      <FolderDialog
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onSubmit={async (name) => {
          await createFolder(name, folderId);
          setStatusMsg(`Đã tạo thư mục ${name}`);
          await loadDirectory();
        }}
      />

      <RenameDialog
        item={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSubmit={async (id, newName) => {
          await renameFile(id, newName);
          setStatusMsg(`Đã đổi tên thành ${newName}`);
          await loadDirectory();
        }}
      />

      <DeleteConfirmDialog
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (id) => {
          await deleteFile(id);
          setStatusMsg('Đã chuyển vào thùng rác');
          await loadDirectory();
          await refreshQuota();
        }}
      />

      <PreviewDialog item={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}

