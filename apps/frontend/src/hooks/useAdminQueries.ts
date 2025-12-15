import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { adminApi, CostEstimateResponse } from '@/services/adminApi';

// Query keys for cache management
export const adminQueryKeys = {
  all: ['admin'] as const,
  overview: (startDate: string, endDate: string) => ['admin', 'overview', startDate, endDate] as const,
  userTimeseries: (startDate: string, endDate: string, granularity: string, metric: string) =>
    ['admin', 'userTimeseries', startDate, endDate, granularity, metric] as const,
  deckTimeseries: (startDate: string, endDate: string, granularity: string, metric: string) =>
    ['admin', 'deckTimeseries', startDate, endDate, granularity, metric] as const,
  creditTimeseries: (startDate: string, endDate: string, granularity: string) =>
    ['admin', 'creditTimeseries', startDate, endDate, granularity] as const,
  userSegments: (startDate: string, endDate: string, segmentBy: string) =>
    ['admin', 'userSegments', startDate, endDate, segmentBy] as const,
  userCohorts: (startDate: string, endDate: string, cohortSize: string) =>
    ['admin', 'userCohorts', startDate, endDate, cohortSize] as const,
  topUsers: (startDate: string, endDate: string, metric: string, limit: number) =>
    ['admin', 'topUsers', startDate, endDate, metric, limit] as const,
  contentDistribution: (startDate: string, endDate: string) =>
    ['admin', 'contentDistribution', startDate, endDate] as const,
  sharingAnalytics: (startDate: string, endDate: string) =>
    ['admin', 'sharingAnalytics', startDate, endDate] as const,
  creditBreakdown: (startDate: string, endDate: string) =>
    ['admin', 'creditBreakdown', startDate, endDate] as const,
  recentActivity: (limit: number) => ['admin', 'recentActivity', limit] as const,
  serviceHealth: () => ['admin', 'serviceHealth'] as const,
  costEstimate: (decksPerDay: number, slidesPerDeck: number) =>
    ['admin', 'costEstimate', decksPerDay, slidesPerDeck] as const,
  financialActuals: (startDate: string, endDate: string) =>
    ['admin', 'financialActuals', startDate, endDate] as const,
  usagePatterns: (startDate: string, endDate: string) =>
    ['admin', 'usagePatterns', startDate, endDate] as const,
};

// Default cache config for admin queries
const defaultOptions = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes (previously cacheTime)
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
};

// ==================== Overview ====================

export function useAdminOverview(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.overview(startDate, endDate),
    queryFn: () => adminApi.getAnalyticsOverviewV2(startDate, endDate),
    enabled,
    ...defaultOptions,
  });
}

// ==================== Time Series ====================

export function useUserTimeseries(
  startDate: string,
  endDate: string,
  granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
  metric: 'signups' | 'logins' | 'active' | 'cumulative' = 'signups',
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.userTimeseries(startDate, endDate, granularity, metric),
    queryFn: () => adminApi.getUserTimeseries(startDate, endDate, granularity, metric),
    enabled,
    ...defaultOptions,
  });
}

export function useDeckTimeseries(
  startDate: string,
  endDate: string,
  granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
  metric: 'created' | 'cumulative' | 'slides' = 'created',
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.deckTimeseries(startDate, endDate, granularity, metric),
    queryFn: () => adminApi.getDeckTimeseries(startDate, endDate, granularity, metric),
    enabled,
    ...defaultOptions,
  });
}

export function useCreditTimeseries(
  startDate: string,
  endDate: string,
  granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.creditTimeseries(startDate, endDate, granularity),
    queryFn: () => adminApi.getCreditTimeseries(startDate, endDate, granularity),
    enabled,
    ...defaultOptions,
  });
}

// ==================== User Analytics ====================

export function useUserSegments(
  startDate: string,
  endDate: string,
  segmentBy: 'activity' | 'plan' | 'role' | 'signup_source' = 'activity',
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.userSegments(startDate, endDate, segmentBy),
    queryFn: () => adminApi.getUserSegments(startDate, endDate, segmentBy),
    enabled,
    ...defaultOptions,
  });
}

export function useUserCohorts(
  startDate: string,
  endDate: string,
  cohortSize: 'day' | 'week' | 'month' = 'week',
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.userCohorts(startDate, endDate, cohortSize),
    queryFn: () => adminApi.getUserCohorts(startDate, endDate, cohortSize),
    enabled,
    ...defaultOptions,
  });
}

export function useTopUsers(
  startDate: string,
  endDate: string,
  metric: 'decks' | 'credits' | 'logins' | 'shares' = 'decks',
  limit = 20,
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.topUsers(startDate, endDate, metric, limit),
    queryFn: () => adminApi.getTopUsers(startDate, endDate, metric, limit),
    enabled,
    ...defaultOptions,
  });
}

// ==================== Content Analytics ====================

export function useContentDistribution(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.contentDistribution(startDate, endDate),
    queryFn: () => adminApi.getContentDistribution(startDate, endDate),
    enabled,
    ...defaultOptions,
  });
}

export function useSharingAnalytics(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.sharingAnalytics(startDate, endDate),
    queryFn: () => adminApi.getSharingAnalytics(startDate, endDate),
    enabled,
    ...defaultOptions,
  });
}

// ==================== Credit Analytics ====================

export function useCreditBreakdown(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.creditBreakdown(startDate, endDate),
    queryFn: () => adminApi.getCreditBreakdown(startDate, endDate),
    enabled,
    ...defaultOptions,
  });
}

// ==================== Activity ====================

export function useRecentActivity(limit = 50, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.recentActivity(limit),
    queryFn: () => adminApi.getRecentActivity(limit),
    enabled,
    staleTime: 30 * 1000, // 30 seconds for activity (more fresh)
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ==================== Services ====================

export function useServiceHealth(enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.serviceHealth(),
    queryFn: () => adminApi.getServicesHealth(),
    enabled,
    staleTime: 30 * 1000, // 30 seconds for health checks
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ==================== Costs ====================

export function useCostEstimate(
  decksPerDay: number = 10,
  slidesPerDeck: number = 10,
  enabled = true
) {
  return useQuery({
    queryKey: adminQueryKeys.costEstimate(decksPerDay, slidesPerDeck),
    queryFn: () => adminApi.getCostEstimate(decksPerDay, slidesPerDeck),
    enabled,
    ...defaultOptions,
  });
}

// ==================== Financial (for new costs page) ====================

export interface FinancialActuals {
  period: { start: string; end: string };
  users: {
    total: number;
    active30d: number;
    newThisMonth: number;
    churnedThisMonth: number;
  };
  decks: {
    total: number;
    createdThisMonth: number;
    avgPerUser: number;
    avgSlidesPerDeck: number;
  };
  credits: {
    usedThisMonth: number;
    avgPerDeck: number;
    avgPerUser: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    paidUsers: number;
    arpu: number;
  };
  monthlyHistory: Array<{
    month: string;
    users: number;
    decks: number;
    revenue: number;
    costs: number;
  }>;
}

export function useFinancialActuals(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.financialActuals(startDate, endDate),
    queryFn: async (): Promise<FinancialActuals> => {
      try {
        // Use the real backend endpoint that queries subscriptions table
        const data = await adminApi.getFinancialActuals(startDate, endDate);
        return {
          period: data.period || { start: startDate, end: endDate },
          users: {
            total: data.users?.total || 0,
            active30d: data.users?.active_30d || 0,
            newThisMonth: data.users?.new_this_month || 0,
            churnedThisMonth: data.users?.churned_this_month || 0,
          },
          decks: {
            total: data.decks?.total || 0,
            createdThisMonth: data.decks?.created_this_month || 0,
            avgPerUser: data.decks?.avg_per_user || 0,
            avgSlidesPerDeck: data.decks?.avg_slides_per_deck || 0,
          },
          credits: {
            usedThisMonth: data.credits?.used_this_month || 0,
            avgPerDeck: data.credits?.avg_per_deck || 0,
            avgPerUser: data.credits?.avg_per_user || 0,
          },
          revenue: {
            mrr: data.revenue?.mrr || 0,
            arr: data.revenue?.arr || 0,
            paidUsers: data.revenue?.paid_users || 0,
            arpu: data.revenue?.arpu || 0,
          },
          monthlyHistory: data.monthly_history || [],
        };
      } catch (error) {
        console.error('Failed to fetch financial actuals:', error);
        // Fallback to empty data
        return {
          period: { start: startDate, end: endDate },
          users: { total: 0, active30d: 0, newThisMonth: 0, churnedThisMonth: 0 },
          decks: { total: 0, createdThisMonth: 0, avgPerUser: 0, avgSlidesPerDeck: 0 },
          credits: { usedThisMonth: 0, avgPerDeck: 0, avgPerUser: 0 },
          revenue: { mrr: 0, arr: 0, paidUsers: 0, arpu: 0 },
          monthlyHistory: [],
        };
      }
    },
    enabled,
    ...defaultOptions,
  });
}

export interface UsagePatterns {
  avgDecksPerUser: number;
  avgSlidesPerDeck: number;
  avgEditsPerDeck: number;
  avgResearchCallsPerDeck: number;
  customComponentRate: number;
}

export function useUsagePatterns(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.usagePatterns(startDate, endDate),
    queryFn: async (): Promise<UsagePatterns> => {
      // Aggregate from existing data until we have dedicated endpoint
      const overview = await adminApi.getAnalyticsOverviewV2(startDate, endDate);
      const decks = overview?.metrics?.decks || {};
      const users = overview?.metrics?.users || {};

      return {
        avgDecksPerUser: users.total ? (decks.total / users.total) : 0,
        avgSlidesPerDeck: decks.avg_slides_per_deck || 10,
        avgEditsPerDeck: 3, // Default estimate
        avgResearchCallsPerDeck: 2, // Default estimate
        customComponentRate: 0.3, // 30% default
      };
    },
    enabled,
    ...defaultOptions,
  });
}

// ==================== Prefetch All Admin Data ====================

export async function prefetchAllAdminData(
  queryClient: QueryClient,
  startDate: string,
  endDate: string,
  granularity: 'day' | 'week' | 'month' = 'day'
) {
  // Prefetch all core data in parallel
  await Promise.all([
    // Overview
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.overview(startDate, endDate),
      queryFn: () => adminApi.getAnalyticsOverviewV2(startDate, endDate),
      ...defaultOptions,
    }),
    // User timeseries
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.userTimeseries(startDate, endDate, granularity, 'signups'),
      queryFn: () => adminApi.getUserTimeseries(startDate, endDate, granularity, 'signups'),
      ...defaultOptions,
    }),
    // Deck timeseries
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.deckTimeseries(startDate, endDate, granularity, 'created'),
      queryFn: () => adminApi.getDeckTimeseries(startDate, endDate, granularity, 'created'),
      ...defaultOptions,
    }),
    // User segments
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.userSegments(startDate, endDate, 'activity'),
      queryFn: () => adminApi.getUserSegments(startDate, endDate, 'activity'),
      ...defaultOptions,
    }),
    // Service health
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.serviceHealth(),
      queryFn: () => adminApi.getServicesHealth(),
      staleTime: 30 * 1000,
    }),
    // Top users
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.topUsers(startDate, endDate, 'decks', 10),
      queryFn: () => adminApi.getTopUsers(startDate, endDate, 'decks', 10),
      ...defaultOptions,
    }),
    // Content distribution
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.contentDistribution(startDate, endDate),
      queryFn: () => adminApi.getContentDistribution(startDate, endDate),
      ...defaultOptions,
    }),
    // Credit breakdown
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.creditBreakdown(startDate, endDate),
      queryFn: () => adminApi.getCreditBreakdown(startDate, endDate),
      ...defaultOptions,
    }),
    // Recent activity
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.recentActivity(50),
      queryFn: () => adminApi.getRecentActivity(50),
      staleTime: 30 * 1000,
    }),
    // Cost estimate (default values)
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.costEstimate(10, 10),
      queryFn: () => adminApi.getCostEstimate(10, 10),
      ...defaultOptions,
    }),
  ]);
}

// ==================== Invalidate All Admin Data ====================

export function invalidateAllAdminData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
}

// ==================== Hook to get QueryClient ====================

export function useAdminQueryClient() {
  return useQueryClient();
}
