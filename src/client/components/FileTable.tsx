import { Download, Eye, File, FileArchive, FileImage, FileText, Folder, Pencil, Trash2 } from 'lucide-react';
import type { FileItem } from '../../shared/types.ts';
import { getDownloadUrl } from '../api/client.ts';
import { formatBytes, formatDate, getPreviewKind } from '../utils/format.ts';

interface FileTableProps {
  files: FileItem[];
  loading: boolean;
  onOpenFolder: (folder: FileItem) => void;
  onPreview: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}

function renderFileIcon(item: FileItem) {
  if (item.isFolder) return <Folder size={18} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />;
  if (item.mimeType.startsWith('image/')) return <FileImage size={18} aria-hidden="true" style={{ flexShrink: 0 }} />;
  if (item.mimeType.includes('zip') || item.mimeType.includes('rar') || item.mimeType.includes('tar')) {
    return <FileArchive size={18} aria-hidden="true" style={{ flexShrink: 0 }} />;
  }
  if (item.mimeType.startsWith('text/') || item.mimeType === 'application/pdf') {
    return <FileText size={18} aria-hidden="true" style={{ flexShrink: 0 }} />;
  }
  return <File size={18} aria-hidden="true" style={{ flexShrink: 0 }} />;
}

export function FileTable({
  files,
  loading,
  onOpenFolder,
  onPreview,
  onRename,
  onDelete,
}: FileTableProps) {
  if (loading && files.length === 0) {
    return (
      <div className="table-card">
        <div className="empty-state">Đang tải danh sách file từ Google Drive...</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="table-card">
        <div className="empty-state">Thư mục này chưa có file nào. Hãy tải file lên hoặc tạo thư mục mới.</div>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="files-table-caption"
        className="table-wrapper"
      >
        <table className="files-table">
          <caption id="files-table-caption" className="visually-hidden">
            Danh sách file và thư mục trong Hub cá nhân
          </caption>
          <thead>
            <tr>
              <th scope="col">Tên</th>
              <th scope="col">Dung lượng</th>
              <th scope="col">Cập nhật</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {files.map((item) => {
              const previewable = !item.isFolder && getPreviewKind(item.mimeType, item.name) !== null;
              return (
                <tr key={item.id}>
                  <th scope="row">
                    <div className="file-name-cell">
                      {renderFileIcon(item)}
                      {item.isFolder ? (
                        <button
                          type="button"
                          className="file-link-btn"
                          title={item.name}
                          onClick={() => onOpenFolder(item)}
                        >
                          {item.name}
                        </button>
                      ) : (
                        <span className="file-name-text" title={item.name}>
                          {item.name}
                        </span>
                      )}
                    </div>
                  </th>
                  <td>{item.isFolder ? 'Thư mục' : formatBytes(item.size)}</td>
                  <td>{formatDate(item.modifiedTime)}</td>
                  <td>
                    <div className="row-actions">
                      {!item.isFolder && (
                        <a
                          className="btn btn-icon"
                          href={getDownloadUrl(item.id, false)}
                          download={item.name}
                          aria-label={`Tải về ${item.name}`}
                          title="Tải về"
                        >
                          <Download size={15} aria-hidden="true" />
                        </a>
                      )}
                      {previewable && (
                        <button
                          type="button"
                          className="btn btn-icon"
                          aria-label={`Xem trước ${item.name}`}
                          title="Xem trước"
                          onClick={() => onPreview(item)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label={`Đổi tên ${item.name}`}
                        title="Đổi tên"
                        onClick={() => onRename(item)}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label={`Xóa ${item.name}`}
                        title="Chuyển vào thùng rác"
                        onClick={() => onDelete(item)}
                      >
                        <Trash2 size={15} aria-hidden="true" style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

