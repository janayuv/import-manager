import { memo } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  BulkManageableTable,
  BulkSearchFilters,
  TableData,
} from '@/components/database/types';
import { formatBulkCell } from '@/components/database/types';

export interface DatabaseBulkOperationsTabProps {
  selectedTable: string;
  bulkTableOptions: BulkManageableTable[];
  bulkBulkControlsDisabled: boolean;
  onBulkTableChange: (value: string) => void;
  includeDeleted: boolean;
  onIncludeDeletedChange: (checked: boolean) => void;
  onBulkSearch: () => void;
  bulkOperationInProgress: boolean;
  bulkFilters: BulkSearchFilters;
  onBulkFiltersChange: (
    updater: (prev: BulkSearchFilters) => BulkSearchFilters
  ) => void;
  bulkSearchResults: TableData | null;
  totalSelectedRecords: number;
  selectAllActive: boolean;
  excludedRecordIds: Set<string>;
  selectedRecords: Set<string>;
  bulkDeleteType: 'soft' | 'hard';
  onBulkDeleteTypeChange: (value: 'soft' | 'hard') => void;
  onSelectAll: () => void;
  onBulkDelete: () => void;
  onSelectRecord: (recordId: string) => void;
}

export const DatabaseBulkOperationsTab = memo(
  function DatabaseBulkOperationsTab({
    selectedTable,
    bulkTableOptions,
    bulkBulkControlsDisabled,
    onBulkTableChange,
    includeDeleted,
    onIncludeDeletedChange,
    onBulkSearch,
    bulkOperationInProgress,
    bulkFilters,
    onBulkFiltersChange,
    bulkSearchResults,
    totalSelectedRecords,
    selectAllActive,
    excludedRecordIds,
    selectedRecords,
    bulkDeleteType,
    onBulkDeleteTypeChange,
    onSelectAll,
    onBulkDelete,
    onSelectRecord,
  }: DatabaseBulkOperationsTabProps) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Bulk Search & Delete</CardTitle>
            <CardDescription>
              Search for multiple records and perform bulk operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="bulk-table-select">Table:</Label>
                <Select
                  value={selectedTable}
                  disabled={bulkBulkControlsDisabled}
                  onValueChange={onBulkTableChange}
                >
                  <SelectTrigger id="bulk-table-select" className="w-48">
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
                <Checkbox
                  id="bulk-include-deleted"
                  checked={includeDeleted}
                  disabled={bulkBulkControlsDisabled}
                  onCheckedChange={(checked: boolean) => {
                    onIncludeDeletedChange(Boolean(checked));
                  }}
                />
                <Label htmlFor="bulk-include-deleted">Include Deleted</Label>
              </div>

              <Button
                onClick={() => void onBulkSearch()}
                disabled={bulkBulkControlsDisabled}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${bulkOperationInProgress ? 'animate-spin' : ''}`}
                />
                Search
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="filter-name">Name Filter</Label>
                <Input
                  id="filter-name"
                  placeholder="Search by name..."
                  value={String(bulkFilters.name ?? '')}
                  disabled={bulkBulkControlsDisabled}
                  onChange={e => {
                    onBulkFiltersChange(prev => ({
                      ...prev,
                      name: e.target.value || null,
                    }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-status">Status Filter</Label>
                <Input
                  id="filter-status"
                  placeholder="Search by status..."
                  value={String(bulkFilters.status ?? '')}
                  disabled={bulkBulkControlsDisabled}
                  onChange={e => {
                    onBulkFiltersChange(prev => ({
                      ...prev,
                      status: e.target.value || null,
                    }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-description">Description Filter</Label>
                <Input
                  id="filter-description"
                  placeholder="Search by description..."
                  value={String(bulkFilters.description ?? '')}
                  disabled={bulkBulkControlsDisabled}
                  onChange={e => {
                    onBulkFiltersChange(prev => ({
                      ...prev,
                      description: e.target.value || null,
                    }));
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {bulkSearchResults && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Search Results</CardTitle>
                  <CardDescription>
                    Found {bulkSearchResults.totalCount} records
                    {totalSelectedRecords > 0 &&
                      ` • ${totalSelectedRecords} selected`}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onSelectAll()}
                    disabled={bulkBulkControlsDisabled}
                  >
                    {selectAllActive || totalSelectedRecords > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="delete-type">Delete Type:</Label>
                    <Select
                      value={bulkDeleteType}
                      disabled={bulkBulkControlsDisabled}
                      onValueChange={(value: 'soft' | 'hard') =>
                        onBulkDeleteTypeChange(value)
                      }
                    >
                      <SelectTrigger id="delete-type" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soft">Soft Delete</SelectItem>
                        <SelectItem value="hard">Hard Delete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onBulkDelete}
                    disabled={
                      totalSelectedRecords === 0 || bulkBulkControlsDisabled
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({totalSelectedRecords})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-3 py-2 text-left">
                        <Checkbox
                          checked={
                            bulkSearchResults.totalCount > 0 &&
                            totalSelectedRecords ===
                              bulkSearchResults.totalCount
                          }
                          disabled={bulkBulkControlsDisabled}
                          onCheckedChange={() => void onSelectAll()}
                        />
                      </th>
                      {(Array.isArray(bulkSearchResults.columns)
                        ? bulkSearchResults.columns
                        : []
                      ).map((column, index) => (
                        <th
                          key={index}
                          className="border border-gray-300 px-3 py-2 text-left font-medium"
                        >
                          {column.charAt(0).toUpperCase() + column.slice(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(bulkSearchResults.rows)
                      ? bulkSearchResults.rows
                      : []
                    ).map((row, rowIndex) => {
                      if (!Array.isArray(row)) return null;
                      const recordId = row[0]?.toString() || '';
                      return (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-3 py-2">
                            <Checkbox
                              checked={
                                selectAllActive
                                  ? !excludedRecordIds.has(recordId)
                                  : selectedRecords.has(recordId)
                              }
                              disabled={bulkBulkControlsDisabled}
                              onCheckedChange={() => onSelectRecord(recordId)}
                            />
                          </td>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="border border-gray-300 px-3 py-2"
                            >
                              {formatBulkCell(cell)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
);
