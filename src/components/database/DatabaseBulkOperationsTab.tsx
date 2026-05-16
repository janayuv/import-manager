import { memo } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const IM = {
  bg: '#0A0A0A',
  panel: '#101010',
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  faint: '#56544E',
  rule: '#1F1E1A',
  hover: '#161513',
  accent: '#E8A23A',
  accentBg: 'rgba(232,162,58,0.10)',
  accentBdr: 'rgba(232,162,58,0.25)',
  bad: '#F87171',
  badBg: 'rgba(248,113,113,0.09)',
  badBdr: 'rgba(248,113,113,0.20)',
  mono: "Consolas, 'Courier New', monospace",
} as const;

const panelStyle: React.CSSProperties = {
  border: `1px solid ${IM.rule}`,
  background: IM.panel,
  display: 'flex',
  flexDirection: 'column',
};

const panelHeaderStyle: React.CSSProperties = {
  background: IM.header,
  borderBottom: `1px solid ${IM.rule}`,
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap' as const,
};

const panelTitleStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 11,
  fontWeight: 700,
  color: IM.text,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const panelSubStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 10,
  color: IM.muted,
  letterSpacing: '0.04em',
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontFamily: IM.mono,
  fontSize: 10.5,
  fontWeight: 700,
  color: IM.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${IM.rule}`,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0 12px',
  fontSize: 12,
  color: IM.text,
  fontFamily: IM.mono,
  borderBottom: `1px solid ${IM.rule}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 200,
};

const labelStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 10,
  color: IM.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: 4,
};

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Search controls panel */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={panelTitleStyle}>Bulk Search &amp; Delete</span>
              <span style={panelSubStyle}>
                Search for multiple records and perform bulk operations
              </span>
            </div>
          </div>

          <div
            style={{
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Controls row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <Label htmlFor="bulk-table-select" style={labelStyle}>
                  Table
                </Label>
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

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingBottom: 2,
                }}
              >
                <Checkbox
                  id="bulk-include-deleted"
                  checked={includeDeleted}
                  disabled={bulkBulkControlsDisabled}
                  onCheckedChange={(checked: boolean) => {
                    onIncludeDeletedChange(Boolean(checked));
                  }}
                />
                <label
                  htmlFor="bulk-include-deleted"
                  style={{
                    fontFamily: IM.mono,
                    fontSize: 11,
                    color: IM.muted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                >
                  Include Deleted
                </label>
              </div>

              <Button
                onClick={() => void onBulkSearch()}
                disabled={bulkBulkControlsDisabled}
                useAccentColor
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${bulkOperationInProgress ? 'animate-spin' : ''}`}
                />
                Search
              </Button>
            </div>

            {/* Filters grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              <div>
                <Label htmlFor="filter-name" style={labelStyle}>
                  Name Filter
                </Label>
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
              <div>
                <Label htmlFor="filter-status" style={labelStyle}>
                  Status Filter
                </Label>
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
              <div>
                <Label htmlFor="filter-description" style={labelStyle}>
                  Description Filter
                </Label>
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
          </div>
        </div>

        {/* Search results panel */}
        {bulkSearchResults && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={panelTitleStyle}>Search Results</span>
                <span style={panelSubStyle}>
                  {bulkSearchResults.totalCount} records found
                  {totalSelectedRecords > 0 && (
                    <span style={{ color: IM.accent, marginLeft: 8 }}>
                      · {totalSelectedRecords} selected
                    </span>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>
                    Delete Type:
                  </span>
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
                  Delete ({totalSelectedRecords})
                </Button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: IM.header }}>
                    <th style={{ ...thStyle, width: 40, paddingLeft: 16 }}>
                      <Checkbox
                        checked={
                          bulkSearchResults.totalCount > 0 &&
                          totalSelectedRecords === bulkSearchResults.totalCount
                        }
                        disabled={bulkBulkControlsDisabled}
                        onCheckedChange={() => void onSelectAll()}
                      />
                    </th>
                    {(Array.isArray(bulkSearchResults.columns)
                      ? bulkSearchResults.columns
                      : []
                    ).map((column, index) => (
                      <th key={index} style={thStyle}>
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
                    const isSelected = selectAllActive
                      ? !excludedRecordIds.has(recordId)
                      : selectedRecords.has(recordId);
                    return (
                      <tr
                        key={rowIndex}
                        style={{
                          height: 36,
                          background: isSelected
                            ? IM.accentBg
                            : rowIndex % 2 === 0
                              ? IM.panel
                              : IM.alt,
                          boxShadow: isSelected
                            ? `inset 2px 0 0 ${IM.accent}`
                            : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => onSelectRecord(recordId)}
                      >
                        <td style={{ ...tdStyle, paddingLeft: 16, width: 40 }}>
                          <Checkbox
                            checked={isSelected}
                            disabled={bulkBulkControlsDisabled}
                            onCheckedChange={() => onSelectRecord(recordId)}
                          />
                        </td>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} style={tdStyle}>
                            {formatBulkCell(cell)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }
);
