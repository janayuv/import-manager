/** User-visible line for the batch progress indicator. */
export function formatBatchProgressLine(
  current: number,
  total: number,
  fileName: string
): string {
  return `Processing file ${current} of ${total}... (${fileName})`;
}
