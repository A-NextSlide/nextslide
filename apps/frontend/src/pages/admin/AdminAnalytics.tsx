import React, { useEffect, useState, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users, FileStack, Loader2, TrendingUp, TrendingDown, Calendar, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi, AnalyticsOverview } from '@/services/adminApi';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const AdminAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [userTrends, setUserTrends] = useState<Array<{ date: string; signups: number; logins: number }>>([]);
  const [deckTrends, setDeckTrends] = useState<Array<{ date: string; created: number }>>([]);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [overviewData, userTrendsData, deckTrendsData] = await Promise.all([
        adminApi.getAnalyticsOverview(),
        adminApi.getUserTrends(),
        adminApi.getDeckTrends(),
      ]);
      setOverview(overviewData);
      setUserTrends(userTrendsData);
      setDeckTrends(deckTrendsData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AdminLayoutV2>
        <div className="p-6 flex items-center justify-center h-[60vh]">
          <Loader2 className="h-5 w-5 animate-spin text-[#666]" />
        </div>
      </AdminLayoutV2>
    );
  }

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const GrowthIndicator = ({ value, label }: { value: number; label: string }) => {
    if (value === 0) return <span className="text-xs text-[#999]">{label}</span>;
    const isPositive = value > 0;
    return (
      <span className={cn(
        "text-xs flex items-center gap-0.5",
        isPositive ? "text-emerald-600" : "text-red-500"
      )}>
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(value)}% {label}
      </span>
    );
  };

  return (
    <AdminLayoutV2>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Analytics</h1>
            <p className="text-xs text-[#666] dark:text-[#888]">Platform metrics</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs">Total Users</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(overview?.users.total || 0)}
            </p>
            <div className="mt-1">
              <GrowthIndicator value={overview?.users.growthRate || 0} label="this month" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Calendar className="h-4 w-4" />
              <span className="text-xs">Active (30d)</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(overview?.users.active30d || 0)}
            </p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              {overview?.users.active24h || 0} today
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <FileStack className="h-4 w-4" />
              <span className="text-xs">Total Decks</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(overview?.decks.total || 0)}
            </p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              {overview?.decks.createdThisWeek || 0} this week
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Layers className="h-4 w-4" />
              <span className="text-xs">Total Slides</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(overview?.decks.totalSlides || 0)}
            </p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              ~{(overview?.decks.averageSlidesPerDeck || 0).toFixed(1)} per deck
            </p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* User Activity */}
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
            <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]">
              <span className="text-sm font-medium">User Activity</span>
              <span className="text-xs text-[#666] dark:text-[#888] ml-2">Last 7 days</span>
            </div>
            <div className="p-4 h-[200px]">
              {userTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userTrends} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="signupsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="loginsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#999' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#999' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111',
                        border: '1px solid #333',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#888' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="signups"
                      stroke="#8b5cf6"
                      strokeWidth={1.5}
                      fill="url(#signupsGradient)"
                      name="Signups"
                    />
                    <Area
                      type="monotone"
                      dataKey="logins"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      fill="url(#loginsGradient)"
                      name="Logins"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#999]">
                  No data available
                </div>
              )}
            </div>
            <div className="px-4 pb-3 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                Signups
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                Logins
              </span>
            </div>
          </div>

          {/* Deck Creation */}
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
            <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]">
              <span className="text-sm font-medium">Deck Creation</span>
              <span className="text-xs text-[#666] dark:text-[#888] ml-2">Last 7 days</span>
            </div>
            <div className="p-4 h-[200px]">
              {deckTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={deckTrends} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="decksGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#999' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#999' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111',
                        border: '1px solid #333',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#888' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      fill="url(#decksGradient)"
                      name="Decks Created"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#999]">
                  No data available
                </div>
              )}
            </div>
            <div className="px-4 pb-3 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                Decks Created
              </span>
            </div>
          </div>
        </div>

        {/* Stats Table */}
        <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]">
            <span className="text-sm font-medium">Summary</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4">
            <div className="p-4 border-b md:border-b-0 md:border-r border-[#eaeaea] dark:border-[#333]">
              <p className="text-xs text-[#666] dark:text-[#888] mb-1">New Users Today</p>
              <p className="text-lg font-semibold tabular-nums">{overview?.users.newToday || 0}</p>
            </div>
            <div className="p-4 border-b md:border-b-0 md:border-r border-[#eaeaea] dark:border-[#333]">
              <p className="text-xs text-[#666] dark:text-[#888] mb-1">New This Week</p>
              <p className="text-lg font-semibold tabular-nums">{overview?.users.newThisWeek || 0}</p>
            </div>
            <div className="p-4 border-b md:border-b-0 md:border-r border-[#eaeaea] dark:border-[#333]">
              <p className="text-xs text-[#666] dark:text-[#888] mb-1">Decks Today</p>
              <p className="text-lg font-semibold tabular-nums">{overview?.decks.createdToday || 0}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-[#666] dark:text-[#888] mb-1">Avg Decks/User</p>
              <p className="text-lg font-semibold tabular-nums">
                {(overview?.decks.averagePerUser || 0).toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminAnalytics;
