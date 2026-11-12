import { useId, useRef, useState, type DragEvent } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { formatBytes } from '../utils/format.ts';

export interface UploadTask {
  id: string;
  fileName: string;
  size: number;
  percent: number;
  status: 'preparing' | 'uploading' | 'done' | 'error' | 'aborted';
  errorMessage?: string;
  controller: AbortController;
}

interface UploadDropzoneProps {
  tasks: UploadTask[];
  onSelectFiles: (files: FileList | File[]) => void;
  onCancelTask: (taskId: string) => void;
  onClearFinished: () => void;
}

export function UploadDropzone({
  tasks,
  onSelectFiles,
  onCancelTask,
  onClearFinished,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      onSelectFiles(e.dataTransfer.files);
    }
  };

  const hasFinished = tasks.some(
    (t) => t.status === 'done' || t.status === 'error' || t.status === 'aborted'
  );

  return (
    <>
      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="dropzone-info">
          <UploadCloud size={26} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <p>Kéo và thả file vào đây để đẩy thẳng lên Google Drive</p>
            <small>Hỗ trợ nhiều file cùng lúc, không giới hạn 4.5 MB, tải thẳng lên thư mục gốc của bạn.</small>
          </div>
        </div>

        <div>
          <label htmlFor={inputId} className="visually-hidden">
            Chọn file để tải lên
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            className="visually-hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                onSelectFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={16} aria-hidden="true" />
            Chọn file tải lên
          </button>
        </div>
      </div>

      {tasks.length > 0 && (
        <section className="upload-queue" aria-label="Tiến trình tải lên">
          <div className="upload-queue-header">
            <span>Hàng đợi tải lên ({tasks.length})</span>
            {hasFinished && (
              <button type="button" className="btn btn-icon" onClick={onClearFinished}>
                Dọn danh sách xong
              </button>
            )}
          </div>

          {tasks.map((task) => {
            const labelId = `upload-label-${task.id}`;
            const isIndeterminate = task.status === 'preparing';
            const isActive = task.status === 'preparing' || task.status === 'uploading';

            return (
              <div key={task.id} className="upload-item">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                  <div className="upload-item-meta">
                    <span id={labelId} className="upload-item-name" title={task.fileName}>
                      {task.fileName} ({formatBytes(task.size)})
                    </span>
                    <span
                      className={`upload-item-status${
                        task.status === 'error'
                          ? ' is-error'
                          : task.status === 'done'
                            ? ' is-done'
                            : ''
                      }`}
                    >
                      {task.status === 'preparing' && 'Đang khởi tạo phiên...'}
                      {task.status === 'uploading' && `${task.percent}%`}
                      {task.status === 'done' && 'Hoàn tất'}
                      {task.status === 'aborted' && 'Đã hủy'}
                      {task.status === 'error' && (task.errorMessage || 'Lỗi tải lên')}
                    </span>
                  </div>
                  <progress
                    max={100}
                    value={isIndeterminate ? undefined : task.percent}
                    aria-labelledby={labelId}
                  />
                </div>

                {isActive && (
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label={`Hủy tải lên ${task.fileName}`}
                    title="Hủy tải lên"
                    onClick={() => onCancelTask(task.id)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

