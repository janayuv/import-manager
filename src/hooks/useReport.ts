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

    console.log('=== useReport: fetchData called ===');
    console.log('Filters:', filters);

    try {
      const response: ReportResponse = await invoke('get_report', { filters });
      console.log('=== useReport: Response received ===');
      console.log('Response:', response);
      console.log('Rows count:', response.rows?.length || 0);
      console.log('Total rows:', response.totalRows);
      console.log('Totals:', response.totals);

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
    console.log('=== useReport: useEffect triggered ===');
    fetchData();
  }, [fetchData]);

  const updateFilters = useCallback((newFilters: Partial<ReportFilters>) => {
    console.log('=== useReport: updateFilters called ===');
    console.log('New filters:', newFilters);
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const goToPage = useCallback((page: number) => {
    console.log('=== useReport: goToPage called ===');
    console.log('Page:', page);
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
