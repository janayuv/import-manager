/** Display average confidence (0–1) as a percentage with one decimal, or em dash when missing. */
export function formatAvgConfidencePercent(
  avg: number | null | undefined
): string {
  if (avg == null || Number.isNaN(avg)) return '—';
  return `${Math.round(avg * 1000) / 10}%`;
}
