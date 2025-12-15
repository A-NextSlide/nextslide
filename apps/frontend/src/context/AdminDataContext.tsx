import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchAllAdminData, invalidateAllAdminData } from '@/hooks/useAdminQueries';

// Date range presets
export type DateRangePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'last90days' | 'thisMonth' | 'lastMonth' | 'custom';

export type Granularity = 'hour' | 'day' | 'week' | 'month';

interface DateRange {
  startDate: string;
  endDate: string;
  preset: DateRangePreset;
}

interface AdminDataContextType {
  // Date range
  dateRange: DateRange;
  setDateRange: (range: Partial<DateRange>) => void;
  setPreset: (preset: DateRangePreset) => void;

  // Granularity
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;

  // Data management
  refreshAllData: () => Promise<void>;
  isRefreshing: boolean;
  lastRefreshed: Date | null;

  // Prefetch status
  isPrefetched: boolean;
}

const AdminDataContext = createContext<AdminDataContextType | null>(null);

// Helper to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper to get date range from preset
function getDateRangeFromPreset(preset: DateRangePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = formatDate(today);

  switch (preset) {
    case 'today': {
      return { startDate: endDate, endDate };
    }
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const d = formatDate(yesterday);
      return { startDate: d, endDate: d };
    }
    case 'last7days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { startDate: formatDate(start), endDate };
    }
    case 'last30days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { startDate: formatDate(start), endDate };
    }
    case 'last90days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      return { startDate: formatDate(start), endDate };
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: formatDate(start), endDate };
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    default:
      // Default to last 30 days
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { startDate: formatDate(start), endDate };
  }
}

// Determine appropriate granularity based on date range
function getDefaultGranularity(startDate: string, endDate: string): Granularity {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (days <= 1) return 'hour';
  if (days <= 14) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

interface AdminDataProviderProps {
  children: React.ReactNode;
}

export function AdminDataProvider({ children }: AdminDataProviderProps) {
  const queryClient = useQueryClient();

  // Initialize with last 30 days
  const initialRange = getDateRangeFromPreset('last30days');
  const [dateRange, setDateRangeState] = useState<DateRange>({
    ...initialRange,
    preset: 'last30days',
  });

  const [granularity, setGranularity] = useState<Granularity>(() =>
    getDefaultGranularity(initialRange.startDate, initialRange.endDate)
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isPrefetched, setIsPrefetched] = useState(false);

  // Set date range
  const setDateRange = useCallback((range: Partial<DateRange>) => {
    setDateRangeState(prev => {
      const newRange = { ...prev, ...range };
      // Auto-adjust granularity when date range changes
      if (range.startDate || range.endDate) {
        const newGranularity = getDefaultGranularity(
          range.startDate || prev.startDate,
          range.endDate || prev.endDate
        );
        setGranularity(newGranularity);
      }
      return newRange;
    });
  }, []);

  // Set preset (updates date range)
  const setPreset = useCallback((preset: DateRangePreset) => {
    const range = getDateRangeFromPreset(preset);
    setDateRangeState({
      ...range,
      preset,
    });
    setGranularity(getDefaultGranularity(range.startDate, range.endDate));
  }, []);

  // Refresh all data
  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all admin queries
      invalidateAllAdminData(queryClient);
      // Prefetch fresh data
      await prefetchAllAdminData(queryClient, dateRange.startDate, dateRange.endDate, granularity);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, dateRange.startDate, dateRange.endDate, granularity]);

  // Prefetch on mount
  useEffect(() => {
    const doPrefetch = async () => {
      try {
        await prefetchAllAdminData(queryClient, dateRange.startDate, dateRange.endDate, granularity);
        setIsPrefetched(true);
        setLastRefreshed(new Date());
      } catch (error) {
        console.error('[AdminDataContext] Prefetch error:', error);
      }
    };

    doPrefetch();
  }, []); // Only on mount

  // Re-prefetch when date range changes
  useEffect(() => {
    if (!isPrefetched) return; // Skip initial mount (handled above)

    const doPrefetch = async () => {
      try {
        await prefetchAllAdminData(queryClient, dateRange.startDate, dateRange.endDate, granularity);
      } catch (error) {
        console.error('[AdminDataContext] Re-prefetch error:', error);
      }
    };

    doPrefetch();
  }, [dateRange.startDate, dateRange.endDate, granularity, isPrefetched, queryClient]);

  const value = useMemo(() => ({
    dateRange,
    setDateRange,
    setPreset,
    granularity,
    setGranularity,
    refreshAllData,
    isRefreshing,
    lastRefreshed,
    isPrefetched,
  }), [dateRange, setDateRange, setPreset, granularity, refreshAllData, isRefreshing, lastRefreshed, isPrefetched]);

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData must be used within an AdminDataProvider');
  }
  return context;
}

// Export preset options for UI
export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 days' },
  { value: 'last30days', label: 'Last 30 days' },
  { value: 'last90days', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
];

export const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];
