import type { BugContext } from '@/types/bug-note';

/** Drop empty strings so optional JSON context stays minimal. */
export function trimBugContext(c: BugContext): BugContext | null {
  const out: BugContext = {};
  if (c.module?.trim()) out.module = c.module.trim();
  if (c.page?.trim()) out.page = c.page.trim();
  if (c.component?.trim()) out.component = c.component.trim();
  if (c.function?.trim()) out.function = c.function.trim();
  return Object.keys(out).length ? out : null;
}

/** Prefer Module › Component; fallbacks keep list rows readable. */
export function formatContextBreadcrumb(
  ctx: BugContext | null | undefined
): string {
  if (!ctx) return '';
  const m = ctx.module?.trim();
  const p = ctx.page?.trim();
  const c = ctx.component?.trim();
  const f = ctx.function?.trim();
  if (m && c) return `${m} › ${c}`;
  if (m && p) return `${m} › ${p}`;
  if (p && f) return `${p} › ${f}`;
  const parts = [m, p, c, f].filter(Boolean) as string[];
  return parts.join(' › ');
}
