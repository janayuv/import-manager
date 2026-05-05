import { navItems } from '@/components/layout/nav-data';
import type { BugNote } from '@/types/bug-note';

export type ContextField = 'module' | 'page' | 'component' | 'function';

export type SuggestionOption = { value: string; label: string };

const CACHE_KEY = 'import-manager.bug-context-cache.v1';
const MAX_CACHE_PER_FIELD = 50;

type CacheShape = Record<ContextField, string[]>;

function emptyCache(): CacheShape {
  return { module: [], page: [], component: [], function: [] };
}

export function loadContextCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return emptyCache();
    const parsed = JSON.parse(raw) as Partial<CacheShape>;
    return {
      module: Array.isArray(parsed.module) ? parsed.module : [],
      page: Array.isArray(parsed.page) ? parsed.page : [],
      component: Array.isArray(parsed.component) ? parsed.component : [],
      function: Array.isArray(parsed.function) ? parsed.function : [],
    };
  } catch {
    return emptyCache();
  }
}

export function pushContextCache(field: ContextField, value: string): void {
  const v = value.trim();
  if (!v) return;
  const cache = loadContextCache();
  const list = cache[field].filter(x => x !== v);
  list.unshift(v);
  cache[field] = list.slice(0, MAX_CACHE_PER_FIELD);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}

export function staticModuleSuggestions(): SuggestionOption[] {
  const titles = navItems.map(n => n.title.trim()).filter(Boolean);
  return [...new Set(titles)]
    .sort((a, b) => a.localeCompare(b))
    .map(t => ({ value: t, label: t }));
}

export function staticPageSuggestions(): SuggestionOption[] {
  const paths = new Set<string>();
  for (const n of navItems) {
    paths.add(n.url);
    n.items?.forEach(it => paths.add(it.url));
  }
  return [...paths]
    .sort((a, b) => a.localeCompare(b))
    .map(p => ({ value: p, label: p }));
}

export function distinctFromBugs(
  bugs: BugNote[],
  field: ContextField
): string[] {
  const s = new Set<string>();
  for (const b of bugs) {
    const raw = b.context?.[field]?.trim();
    if (raw) s.add(raw);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function mergeOptionLists(groups: SuggestionOption[][]): SuggestionOption[] {
  const seen = new Set<string>();
  const out: SuggestionOption[] = [];
  for (const group of groups) {
    for (const opt of group) {
      if (!opt?.value?.trim()) continue;
      const key = opt.value;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: key, label: opt.label || opt.value });
    }
  }
  return out;
}

/** Merge static nav, bug-derived values, session cache, and current input for combobox display. */
export function buildFieldOptions(
  field: ContextField,
  bugs: BugNote[],
  currentValue: string
): SuggestionOption[] {
  const cache = loadContextCache();
  const fromBugs = distinctFromBugs(bugs, field).map(v => ({
    value: v,
    label: v,
  }));
  const fromCache = cache[field].map(v => ({ value: v, label: v }));

  let staticOpts: SuggestionOption[] = [];
  if (field === 'module') staticOpts = staticModuleSuggestions();
  if (field === 'page') staticOpts = staticPageSuggestions();

  const currentOpt = currentValue.trim()
    ? [{ value: currentValue.trim(), label: currentValue.trim() }]
    : [];

  return mergeOptionLists([staticOpts, fromBugs, fromCache, currentOpt]);
}
