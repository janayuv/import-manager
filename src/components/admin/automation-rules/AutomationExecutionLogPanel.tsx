import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { AutomationLogRow } from '@/lib/automation-console';

export interface AutomationExecutionLogPanelProps {
  logRuleId: string;
  logAction: string;
  logFrom: string;
  logTo: string;
  logStatus: string;
  logSearch: string;
  logRows: AutomationLogRow[];
  onLogRuleIdChange: (v: string) => void;
  onLogActionChange: (v: string) => void;
  onLogFromChange: (v: string) => void;
  onLogToChange: (v: string) => void;
  onLogStatusChange: (v: string) => void;
  onLogSearchChange: (v: string) => void;
  onApplyFilters: () => void;
}

export const AutomationExecutionLogPanel = memo(
  function AutomationExecutionLogPanel({
    logRuleId,
    logAction,
    logFrom,
    logTo,
    logStatus,
    logSearch,
    logRows,
    onLogRuleIdChange,
    onLogActionChange,
    onLogFromChange,
    onLogToChange,
    onLogStatusChange,
    onLogSearchChange,
    onApplyFilters,
  }: AutomationExecutionLogPanelProps) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation execution log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Rule ID</Label>
              <Input
                value={logRuleId}
                onChange={e => onLogRuleIdChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Input
                value={logAction}
                onChange={e => onLogActionChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Result status</Label>
              <Select value={logStatus} onValueChange={onLogStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  <SelectItem value="OK">OK</SelectItem>
                  <SelectItem value="WARN">WARN</SelectItem>
                  <SelectItem value="ERROR">ERROR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date from</Label>
              <Input
                type="date"
                value={logFrom}
                onChange={e => onLogFromChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date to</Label>
              <Input
                type="date"
                value={logTo}
                onChange={e => onLogToChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Search target / payload</Label>
              <Input
                value={logSearch}
                onChange={e => onLogSearchChange(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void onApplyFilters()}
          >
            Apply log filters
          </Button>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Executed</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="text-right">Res</TableHead>
                <TableHead className="text-right">Δh</TableHead>
                <TableHead className="text-right">ms</TableHead>
                <TableHead className="text-right">CU</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logRows.map(row => (
                <TableRow key={row.automationId}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {row.executedAt}
                  </TableCell>
                  <TableCell className="text-xs">{row.ruleId || '—'}</TableCell>
                  <TableCell className="text-xs">{row.actionTaken}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-xs">
                    {row.targetEntity}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {row.casesResolved ?? 0}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {(row.resolutionTimeReductionHours ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {row.actualExecutionTimeMs ?? 0}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {(row.estimatedCostUnits ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">
                    {row.executionResult}
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
