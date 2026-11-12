import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Download, X } from 'lucide-react';
import type { FileItem } from '../../shared/types.ts';
import { getDownloadUrl } from '../api/client.ts';
import { getPreviewKind } from '../utils/format.ts';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  lightDismiss?: boolean;
  children: ReactNode;
}

function ModalDialog({
  open,
  onClose,
  title,
  wide = false,
  lightDismiss = false,
  children,
}: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Progressive fallback for browsers (e.g., Safari) without <dialog closedby="any">.
    if (lightDismiss && !('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [lightDismiss, onClose]);

  const closedByProps = lightDismiss ? ({ closedby: 'any' } as Record<string, string>) : {};

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? 'dialog-wide' : undefined}
      {...closedByProps}
    >
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId} title={title}>
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Đóng hộp thoại"
            onClick={() => ref.current?.close()}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function FolderDialog({ open, onClose, onSubmit }: FolderDialogProps) {
  const inputId = useId();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên thư mục.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo thư mục.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog open={open} onClose={onClose} title="Tạo thư mục mới">
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={inputId}>Tên thư mục</label>
          <input
            id={inputId}
            type="text"
            className="input-control"
            value={name}
            autoFocus
            required
            placeholder="Ví dụ: Tài liệu học tập"
            onChange={(e) => setName(e.target.value)}
          />
          {error && <small style={{ color: 'var(--danger)' }}>{error}</small>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang tạo...' : 'Tạo thư mục'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

interface RenameDialogProps {
  item: FileItem | null;
  onClose: () => void;
  onSubmit: (id: string, newName: string) => Promise<void>;
}

export function RenameDialog({ item, onClose, onSubmit }: RenameDialogProps) {
  const inputId = useId();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setError(null);
      setBusy(false);
    }
  }, [item]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item || !name.trim()) {
      setError('Tên không được để trống.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(item.id, name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi tên.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog open={Boolean(item)} onClose={onClose} title="Đổi tên">
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={inputId}>Tên mới</label>
          <input
            id={inputId}
            type="text"
            className="input-control"
            value={name}
            autoFocus
            required
            onChange={(e) => setName(e.target.value)}
          />
          {error && <small style={{ color: 'var(--danger)' }}>{error}</small>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang lưu...' : 'Lưu tên mới'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

interface DeleteConfirmDialogProps {
  item: FileItem | null;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}

export function DeleteConfirmDialog({ item, onClose, onConfirm }: DeleteConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setBusy(false);
      setError(null);
    }
  }, [item]);

  const handleDelete = async () => {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa mục này.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog open={Boolean(item)} onClose={onClose} title="Xác nhận xóa">
      <p style={{ margin: 0 }}>
        Chuyển <strong>{item?.name}</strong> vào thùng rác trên Google Drive?
      </p>
      {error && <small style={{ color: 'var(--danger)' }}>{error}</small>}
      <div className="dialog-actions">
        <button type="button" className="btn" autoFocus onClick={onClose} disabled={busy}>
          Hủy
        </button>
        <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
          {busy ? 'Đang xóa...' : 'Xóa vào thùng rác'}
        </button>
      </div>
    </ModalDialog>
  );
}

interface PreviewDialogProps {
  item: FileItem | null;
  onClose: () => void;
}

export function PreviewDialog({ item, onClose }: PreviewDialogProps) {
  const kind = item ? getPreviewKind(item.mimeType, item.name) : null;
  const inlineUrl = item ? getDownloadUrl(item.id, true) : '';

  return (
    <ModalDialog
      open={Boolean(item)}
      onClose={onClose}
      title={item?.name ?? 'Xem trước'}
      wide
      lightDismiss
    >
      {item && (
        <>
          <div className="preview-body">
            {kind === 'image' && <img src={inlineUrl} alt={item.name} />}
            {kind === 'pdf' && <iframe src={inlineUrl} title={`Xem trước ${item.name}`} />}
            {kind === 'text' && (
              <iframe src={inlineUrl} sandbox="" title={`Xem trước ${item.name}`} />
            )}
            {kind === 'video' && <video src={inlineUrl} controls preload="metadata" />}
            {kind === 'audio' && <audio src={inlineUrl} controls preload="metadata" />}
            {kind === null && <p>Không hỗ trợ xem trước định dạng này.</p>}
          </div>
          <div className="dialog-actions">
            <a
              className="btn btn-primary"
              href={getDownloadUrl(item.id, false)}
              download={item.name}
            >
              <Download size={16} aria-hidden="true" />
              Tải về máy
            </a>
          </div>
        </>
      )}
    </ModalDialog>
  );
}
