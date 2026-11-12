import { useId } from 'react';
import type { QuotaInfo } from '../../shared/types.ts';
import { formatBytes } from '../utils/format.ts';

interface QuotaBarProps {
  quota: QuotaInfo | null;
}

export function QuotaBar({ quota }: QuotaBarProps) {
  const labelId = useId();
  if (!quota) return null;

  const limit = quota.limit;
  const pct = limit && limit > 0 ? Math.min(100, Math.round((quota.usage / limit) * 100)) : null;

  return (
    <div className="quota-pill">
      <span id={labelId}>
        Drive: {formatBytes(quota.usage)}
        {limit ? ` / ${formatBytes(limit)} (${pct}%)` : ''}
      </span>
      {limit !== null && (
        <progress max={100} value={pct ?? 0} aria-labelledby={labelId} />
      )}
    </div>
  );
}

