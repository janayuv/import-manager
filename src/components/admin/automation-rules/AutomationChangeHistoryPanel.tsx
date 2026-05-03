import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { WorkflowRuleChangeRow } from '@/lib/automation-console';

export interface AutomationChangeHistoryPanelProps {
  changes: WorkflowRuleChangeRow[];
}

export const AutomationChangeHistoryPanel = memo(
  function AutomationChangeHistoryPanel({
    changes,
  }: AutomationChangeHistoryPanelProps) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rule change history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Prev → New</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map(c => (
                <TableRow key={c.changeId}>
                  <TableCell className="text-xs">{c.changedAt}</TableCell>
                  <TableCell className="text-xs">{c.ruleId || '—'}</TableCell>
                  <TableCell className="text-xs">{c.changeType}</TableCell>
                  <TableCell className="text-xs">{c.changedBy}</TableCell>
                  <TableCell className="text-xs">
                    {c.previousValue} → {c.newValue}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }
);
