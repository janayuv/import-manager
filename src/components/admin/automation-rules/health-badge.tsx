import { Badge } from '@/components/ui/badge';

export function automationHealthBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'HEALTHY')
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">ACTIVE</Badge>
    );
  if (s === 'OFF') return <Badge variant="secondary">PAUSED</Badge>;
  if (s === 'WARNING')
    return <Badge className="bg-amber-600 hover:bg-amber-600">WARNING</Badge>;
  if (s === 'ERROR') return <Badge variant="destructive">ERROR</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
