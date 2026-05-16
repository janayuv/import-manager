'use client';

import type { SavedBoe } from '@/types/boe-entry';

const statusStyles: Record<
  SavedBoe['status'],
  { color: string; bg: string; border: string; label: string }
> = {
  'Awaiting BOE Data': {
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.20)',
    label: 'Awaiting BOE Data',
  },
  'Discrepancy Found': {
    color: '#F87171',
    bg: 'rgba(248,113,113,0.09)',
    border: 'rgba(248,113,113,0.20)',
    label: 'Discrepancy Found',
  },
  Reconciled: {
    color: '#5FCB7D',
    bg: 'rgba(95,203,125,0.10)',
    border: 'rgba(95,203,125,0.22)',
    label: 'Reconciled',
  },
  Investigation: {
    color: '#E8A23A',
    bg: 'rgba(232,162,58,0.10)',
    border: 'rgba(232,162,58,0.25)',
    label: 'Investigation',
  },
  Closed: {
    color: '#8C8A82',
    bg: 'rgba(140,138,130,0.10)',
    border: 'rgba(140,138,130,0.20)',
    label: 'Closed',
  },
};

export function StatusBadge({ status }: { status: SavedBoe['status'] }) {
  const s = statusStyles[status] ?? statusStyles['Awaiting BOE Data'];
  return (
    <span
      style={{
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 8px',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {s.label}
    </span>
  );
}
