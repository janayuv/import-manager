/**
 * Heuristic for "DeepSeek API key" UI warning. The real secret is only read by
 * Rust; this uses Vite build flags and optional VITE_DEEPSEEK_API_CONFIGURED.
 */
export function isDeepseekApiKeyConfiguredForUi(): boolean {
  if (import.meta.env.VITE_PLAYWRIGHT === '1') return true;
  const u = import.meta.env.VITE_DEEPSEEK_API_CONFIGURED;
  if (u === 'true' || u === '1') return true;
  const s = import.meta.env.IMPORT_MANAGER_DEEPSEEK_ENV_OK;
  if (s === 'true' || s === '1') return true;
  return false;
}
