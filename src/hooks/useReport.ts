import { invoke } from '@tauri-apps/api/core';

import { useCallback, useEffect, useState } from 'react';

import type {
  ReportFilters,
  ReportResponse,
  ReportRow,
  ReportTotals,
} from '../types/report';

export function useReport() {
  const [data, setData] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    page: 1,
    pageSize: 50,
    includeTotals: true,
  });
  const [totalRows, setTotalRows] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response: ReportResponse = await invoke('get_report', { filters });

      if (response.rows) {
        setData(response.rows);
        setTotalRows(response.totalRows);
        setTotals(response.totals || null);
      } else {
        console.warn('No rows in response');
        setData([]);
        setTotalRows(0);
        setTotals(null);
      }
    } catch (err) {
      console.error('=== useReport: Error occurred ===');
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setData([]);
      setTotalRows(0);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateFilters = useCallback((newFilters: Partial<ReportFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);

  return {
    data,
    totals,
    loading,
    error,
    filters,
    totalRows,
    updateFilters,
    goToPage,
    refresh: fetchData,
  };
}
