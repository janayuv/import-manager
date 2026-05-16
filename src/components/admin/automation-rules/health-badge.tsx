export function automationHealthBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'HEALTHY')
    return <span className="im-status-pill is-active">ACTIVE</span>;
  if (s === 'OFF')
    return <span className="im-status-pill is-neutral">PAUSED</span>;
  if (s === 'WARNING')
    return <span className="im-status-pill is-warn">WARNING</span>;
  if (s === 'ERROR')
    return <span className="im-status-pill is-bad">ERROR</span>;
  return <span className="im-status-pill is-neutral">{status}</span>;
}
