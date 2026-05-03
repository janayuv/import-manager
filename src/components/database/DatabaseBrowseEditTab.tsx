import { memo } from 'react';
import { Edit3, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import type {
  BulkManageableTable,
  TableData,
} from '@/components/database/types';

export interface DatabaseBrowseEditTabProps {
  selectedTable: string;
  bulkTableOptions: BulkManageableTable[];
  pinDialogOpen: boolean;
  onTableChange: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  includeDeleted: boolean;
  onIncludeDeletedChange: (checked: boolean) => void;
  onRefreshTable: () => void;
  tableData: TableData | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEditRecord: (recordId: string, recordData: Record<string, unknown>) => void;
  onSoftDelete: (recordId: string) => void;
}

export const DatabaseBrowseEditTab = memo(function DatabaseBrowseEditTab({
  selectedTable,
  bulkTableOptions,
  pinDialogOpen,
  onTableChange,
  pageSize,
  onPageSizeChange,
  includeDeleted,
  onIncludeDeletedChange,
  onRefreshTable,
  tableData,
  currentPage,
  onPageChange,
  onEditRecord,
  onSoftDelete,
}: DatabaseBrowseEditTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Browse & Edit Records</CardTitle>
          <CardDescription>
            Select a table to view and edit records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="table-select">Table:</Label>
              <Select
                value={selectedTable}
                disabled={pinDialogOpen}
                onValueChange={onTableChange}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bulkTableOptions.map(option => (
                    <SelectItem key={option.name} value={option.name}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Label htmlFor="page-size">Page Size:</Label>
              <Select
                value={pageSize.toString()}
                onValueChange={value => onPageSizeChange(Number(value))}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="include-deleted"
                checked={includeDeleted}
                disabled={pinDialogOpen}
                onChange={e => onIncludeDeletedChange(e.target.checked)}
              />
              <Label htmlFor="include-deleted">Include Deleted</Label>
            </div>

            <Button
              onClick={() => void onRefreshTable()}
              variant="outline"
              size="sm"
              disabled={pinDialogOpen}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {tableData &&
        Array.isArray(tableData.columns) &&
        Array.isArray(tableData.rows) && (
          <Card>
            <CardHeader>
              <CardTitle>
                {(tableData.tableName || '').charAt(0).toUpperCase() +
                  (tableData.tableName || '').slice(1)}
                ({Number(tableData.totalCount ?? 0).toLocaleString()} records)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableData.columns.map(column => (
                        <TableHead key={column}>
                          {String(column).replace(/_/g, ' ')}
                        </TableHead>
                      ))}
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.rows.map((row, rowIndex) => {
                      if (!Array.isArray(row)) return null;
                      const recordId = row[0]?.toString() || '';
                      const recordData: Record<string, unknown> = {};
                      tableData.columns.forEach((column, colIndex) => {
                        recordData[column] = row[colIndex];
                      });

                      return (
                        <TableRow key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <TableCell key={cellIndex}>
                              {cell === null ? (
                                <span className="text-muted-foreground">
                                  null
                                </span>
                              ) : typeof cell === 'string' &&
                                cell.length > 50 ? (
                                <span title={cell}>
                                  {cell.substring(0, 50)}...
                                </span>
                              ) : (
                                cell?.toString() || ''
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            <div className="flex space-x-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  onEditRecord(recordId, recordData)
                                }
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onSoftDelete(recordId)}
                                className="text-orange-600 hover:text-orange-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {(tableData.page - 1) * tableData.pageSize + 1} to{' '}
                  {Math.min(
                    tableData.page * tableData.pageSize,
                    tableData.totalCount
                  )}{' '}
                  of {tableData.totalCount} records
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="px-3 py-1 text-sm">
                    Page {currentPage} of{' '}
                    {Math.ceil(
                      tableData.totalCount /
                        Math.max(1, tableData.pageSize || 1)
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={
                      currentPage >=
                      Math.ceil(
                        tableData.totalCount /
                          Math.max(1, tableData.pageSize || 1)
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
});
