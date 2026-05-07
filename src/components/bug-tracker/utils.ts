import type { BugContext, BugNote } from '@/types/bug-note';

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

/**
 * Generates a ready-to-paste bug report for Cursor chat.
 * Keeps output plain text so users can paste it anywhere.
 */
export function formatBugForCursorChat(bug: BugNote): string {
  const contextLines = bug.context
    ? (
        Object.entries(bug.context).filter(
          ([, value]) => typeof value === 'string' && value.trim().length > 0
        ) as Array<[string, string]>
      )
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')
    : '';

  return [
    'Bug report for Cursor',
    '',
    `Title: ${bug.title}`,
    `Status: ${bug.status}`,
    `Created at (unix ms): ${bug.createdAt}`,
    `Updated at (unix ms): ${bug.updatedAt}`,
    '',
    'Description:',
    bug.description?.trim() || '(no description)',
    '',
    'Context:',
    contextLines || '- (not provided)',
    '',
    'Screenshot path:',
    bug.screenshotPath || '(not provided)',
    '',
    'Please help me fix this bug. Share root cause and patch.',
  ].join('\n');
}

const GITHUB_ISSUES_BASE_URL =
  'https://github.com/janayuv/import-manager/issues/new';

export function buildGitHubIssueUrlForBug(bug: BugNote): string {
  const contextLines = bug.context
    ? (
        Object.entries(bug.context).filter(
          ([, value]) => typeof value === 'string' && value.trim().length > 0
        ) as Array<[string, string]>
      )
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')
    : '- (not provided)';

  const body = [
    '## Bug Description',
    bug.description?.trim() || '(no description)',
    '',
    '## Current Status',
    bug.status,
    '',
    '## Context',
    contextLines,
    '',
    '## Screenshot Path',
    bug.screenshotPath || '(not provided)',
    '',
    '## Metadata',
    `- Local bug id: ${bug.id}`,
    `- Created at (unix ms): ${bug.createdAt}`,
    `- Updated at (unix ms): ${bug.updatedAt}`,
  ].join('\n');

  const params = new URLSearchParams({
    title: `[Bug] ${bug.title}`,
    body,
  });
  return `${GITHUB_ISSUES_BASE_URL}?${params.toString()}`;
}
