import { getDatabaseVersion } from '@/lib/db-version';
import { logInfo } from '@/lib/logger';

let startupLogged = false;

/** Logs build/runtime context once per page load (dev Strict Mode may double-invoke; guard prevents duplicate lines). */
export function logStartupContextOnce(): void {
  if (startupLogged) {
    return;
  }
  startupLogged = true;
  void (async () => {
    const dbv = await getDatabaseVersion();
    const os =
      typeof navigator !== 'undefined'
        ? `${navigator.platform}; ${navigator.userAgent.slice(0, 120)}`
        : 'unknown';
    logInfo(
      `Startup: version=${import.meta.env.VITE_APP_VERSION ?? 'n/a'} buildTime=${import.meta.env.VITE_BUILD_TIME ?? 'n/a'} git=${import.meta.env.VITE_GIT_COMMIT ?? 'n/a'} db_version=${dbv} os=${os}`,
      'startup'
    );
  })();
}
