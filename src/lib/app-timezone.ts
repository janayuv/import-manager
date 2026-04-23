/**
 * India Standard Time — project default for user-visible dates/times and backup schedules.
 * Offset: UTC+05:30
 */
export const APP_TIMEZONE = 'Asia/Kolkata' as const;

export const APP_TIMEZONE_LABEL = 'IST (UTC+05:30)';

const dateOnlyOpts: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const dateTimeOpts: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIMEZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

/** Calendar date in IST (for ISO strings from the backend). */
export function formatAppDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  return date.toLocaleDateString('en-IN', dateOnlyOpts);
}

/** e.g. 23-04-26, 01:56:23 IST (dd-MM-yy, 24h — components aligned with en-IN + IST) */
export function formatAppDateTime(
  dateString: string | null | undefined
): string {
  if (!dateString) {
    return 'N/A';
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  // en-IN + explicit IST gives a consistent local wall time
  return date.toLocaleString('en-IN', dateTimeOpts).replace(/\//g, '-');
}
