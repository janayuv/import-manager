import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  addExceptionNote,
  bulkResolveExceptionCases,
  getExceptionLifecycleEvents,
  listExceptionNotes,
  recordExceptionViewed,
  updateExceptionCase,
  type ExceptionNoteRow,
  type LifecycleEventRow,
} from '@/lib/exception-workflow';
import type {
  EntityExceptionDto,
  ExceptionWorkflowSummary,
} from '@/types/dashboard-metrics';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

function slaBadgeVariant(
  s: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'BREACHED') return 'destructive';
  if (s === 'AT_RISK') return 'secondary';
  return 'outline';
}

type Props = {
  workflow?: ExceptionWorkflowSummary;
  entityExceptions: EntityExceptionDto[];
  userId: string;
  onRefresh: () => void;
};

export function ExceptionOperationsPanel({
  workflow,
  entityExceptions,
  userId,
  onRefresh,
}: Props) {
  const wf = workflow;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [events, setEvents] = useState<LifecycleEventRow[]>([]);
  const [notes, setNotes] = useState<ExceptionNoteRow[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [priorityEdit, setPriorityEdit] = useState('MEDIUM');
  const [assignEdit, setAssignEdit] = useState('');

  const detailRow = entityExceptions.find(e => e.exceptionCaseId === detailId);

  const openDetail = useCallback(
    async (caseId: string) => {
      setDetailId(caseId);
      setNoteDraft('');
      try {
        await recordExceptionViewed(caseId, userId);
        const [ev, nt] = await Promise.all([
          getExceptionLifecycleEvents(caseId),
          listExceptionNotes(caseId),
        ]);
        setEvents(ev);
        setNotes(nt);
        const row = entityExceptions.find(e => e.exceptionCaseId === caseId);
        setPriorityEdit(row?.priority ?? 'MEDIUM');
        setAssignEdit(row?.assignedTo ?? '');
      } catch (e) {
        toast.error(String(e));
        setEvents([]);
        setNotes([]);
      }
    },
    [entityExceptions, userId]
  );

  useEffect(() => {
    if (!detailId) return;
    const row = entityExceptions.find(e => e.exceptionCaseId === detailId);
    if (row) {
      setPriorityEdit(row.priority);
      setAssignEdit(row.assignedTo ?? '');
    }
  }, [detailId, entityExceptions]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === entityExceptions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entityExceptions.map(e => e.exceptionCaseId)));
    }
  };

  const handleBulkResolve = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.message('Select at least one exception');
      return;
    }
    try {
      const n = await bulkResolveExceptionCases({
        caseIds: ids,
        userId,
        status: 'RESOLVED',
        notes: 'Bulk resolve from dashboard',
      });
      toast.success(`Resolved ${n} exception(s)`);
      setSelected(new Set());
      onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleResolveOne = async (caseId: string) => {
    try {
      await updateExceptionCase({
        id: caseId,
        status: 'RESOLVED',
        userId,
      });
      toast.success('Marked resolved');
      setDetailId(null);
      onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleInProgress = async (caseId: string) => {
    try {
      await updateExceptionCase({
        id: caseId,
        status: 'IN_PROGRESS',
        userId,
      });
      toast.success('Status: in progress');
      onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSaveAssignment = async () => {
    if (!detailId) return;
    try {
      await updateExceptionCase({
        id: detailId,
        priority: priorityEdit,
        assignedTo: assignEdit.trim() || undefined,
        userId,
      });
      toast.success('Assignment updated');
      onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleAddNote = async () => {
    if (!detailId || !noteDraft.trim()) return;
    try {
      await addExceptionNote({
        exceptionCaseId: detailId,
        userId,
        noteText: noteDraft.trim(),
      });
      setNoteDraft('');
      const nt = await listExceptionNotes(detailId);
      setNotes(nt);
      onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const ageBadgeClass = (days: number, status: string) => {
    if (status === 'RESOLVED' || status === 'IGNORED') return '';
    if (days >= 14)
      return 'border-amber-500 text-amber-800 dark:text-amber-200';
    if (days >= 7) return 'border-orange-400';
    return '';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Exception workflow summary
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-wrap gap-4 text-sm">
          <div>
            Open:{' '}
            <span className="text-foreground font-semibold">
              {wf?.openCount ?? 0}
            </span>
          </div>
          <div>
            Resolved today:{' '}
            <span className="text-foreground font-semibold">
              {wf?.resolvedTodayCount ?? 0}
            </span>
          </div>
          <div>
            SLA breached:{' '}
            <span className="text-destructive font-semibold">
              {wf?.slaBreachedCount ?? 0}
            </span>
          </div>
          <div>
            Avg resolution (days):{' '}
            <span className="text-foreground font-semibold">
              {wf?.avgResolutionDays != null
                ? wf.avgResolutionDays.toFixed(1)
                : '—'}
            </span>
          </div>
          {(wf?.byType?.length ?? 0) > 0 && (
            <div className="w-full pt-2">
              <span className="text-foreground font-medium">By type: </span>
              {wf!.byType!.map(t => (
                <Badge key={t.exceptionType} variant="outline" className="mr-1">
                  {t.exceptionType}: {t.count}
                </Badge>
              ))}
            </div>
          )}
          {(wf?.byPriority?.length ?? 0) > 0 && (
            <div className="w-full">
              <span className="text-foreground font-medium">By priority: </span>
              {wf!.byPriority!.map(p => (
                <Badge key={p.priority} variant="secondary" className="mr-1">
                  {p.priority}: {p.count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {entityExceptions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              Shipment exceptions (scoped)
            </CardTitle>
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.size === 0}
              onClick={() => void handleBulkResolve()}
            >
              Bulk resolve ({selected.size})
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        entityExceptions.length > 0 &&
                        selected.size === entityExceptions.length
                      }
                      onCheckedChange={() => toggleAll()}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Prio</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entityExceptions.map(ex => (
                  <TableRow key={ex.exceptionCaseId}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(ex.exceptionCaseId)}
                        onCheckedChange={() => toggle(ex.exceptionCaseId)}
                        aria-label={`Select ${ex.exceptionCaseId}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      {ex.exceptionType}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">
                      <Link
                        className="text-primary underline"
                        to={ex.navigationUrl}
                        onClick={() =>
                          void recordExceptionViewed(ex.exceptionCaseId, userId)
                        }
                      >
                        {ex.entityId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ex.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={slaBadgeVariant(ex.slaStatus)}>
                        {ex.slaStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(ex.escalationLevel ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            Escalated
                          </Badge>
                        )}
                        {(ex.workflowTimeoutFlag ?? 0) === 1 && (
                          <Badge variant="outline" className="text-[10px]">
                            Timeout
                          </Badge>
                        )}
                        {(ex.recurrenceFlag ?? 0) === 1 && (
                          <Badge variant="secondary" className="text-[10px]">
                            Repeat
                          </Badge>
                        )}
                        {(ex.escalationLevel ?? 0) === 0 &&
                          (ex.workflowTimeoutFlag ?? 0) === 0 &&
                          (ex.recurrenceFlag ?? 0) === 0 && (
                            <span className="text-muted-foreground text-[10px]">
                              —
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ageBadgeClass(ex.ageDays, ex.status)}
                      >
                        {ex.ageDays}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{ex.priority}</TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      {ex.assignedTo ?? '—'}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => void openDetail(ex.exceptionCaseId)}
                      >
                        Timeline
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() =>
                          void handleInProgress(ex.exceptionCaseId)
                        }
                      >
                        In progress
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        type="button"
                        onClick={() =>
                          void handleResolveOne(ex.exceptionCaseId)
                        }
                      >
                        Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detailId} onOpenChange={o => !o && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exception timeline</DialogTitle>
            {detailRow && (
              <p className="text-muted-foreground text-xs">
                {detailRow.exceptionType} · {detailRow.entityId}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Lifecycle</Label>
              <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-xs">
                {events.map(ev => (
                  <li key={ev.id}>
                    <span className="font-medium">{ev.eventType}</span>
                    {ev.userId ? ` · ${ev.userId}` : ''} — {ev.createdAt}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Priority</Label>
                <Select value={priorityEdit} onValueChange={setPriorityEdit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assigned to (user id)</Label>
                <Input
                  value={assignEdit}
                  onChange={e => setAssignEdit(e.target.value)}
                  placeholder="e.g. admin-001"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveAssignment()}
            >
              Save assignment
            </Button>
            <div>
              <Label className="text-xs">Notes</Label>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs">
                {notes.map(n => (
                  <li key={n.noteId} className="border-b pb-1">
                    <span className="text-muted-foreground">{n.createdAt}</span>{' '}
                    <span className="font-medium">{n.userId}</span>:{' '}
                    {n.noteText}
                  </li>
                ))}
              </ul>
              <Textarea
                className="mt-2"
                rows={3}
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Add a note…"
              />
              <Button
                type="button"
                size="sm"
                className="mt-2"
                variant="secondary"
                onClick={() => void handleAddNote()}
              >
                Add note
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {detailId && (
              <Button type="button" variant="outline" asChild>
                <Link to={detailRow?.navigationUrl ?? '#'}>Open shipment</Link>
              </Button>
            )}
            <Button
              type="button"
              onClick={() => detailId && void handleResolveOne(detailId)}
            >
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
