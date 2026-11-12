export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | null;

export function getPreviewKind(mimeType: string, name: string): PreviewKind {
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') return 'image';
  if (mimeType === 'application/pdf' || mimeType === 'application/vnd.google-apps.document' || mimeType === 'application/vnd.google-apps.presentation') {
    return 'pdf';
  }
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    (mimeType.startsWith('text/') && mimeType !== 'text/html') ||
    mimeType === 'application/json' ||
    /\.(txt|md|json|log|csv|xml|yml|yaml|ts|tsx|js|css)$/i.test(name)
  ) {
    return 'text';
  }
  return null;
}
