import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Users, FileStack, Server, BarChart3, Loader2, RefreshCw, ArrowRight, CheckCircle, AlertTriangle, Palette, TrendingUp, Layers, UserPlus, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi, ServiceHealthResponse, AnalyticsOverview } from '@/services/adminApi';

const AdminDashboardV2: React.FC = () => {
  const [metrics, setMetrics] = useState<AnalyticsOverview | null>(null);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsData, healthData] = await Promise.all([
        adminApi.getAnalyticsOverview(),
        adminApi.getServicesHealth().catch(() => null),
      ]);
      setMetrics(metricsData);
      setServiceHealth(healthData);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const operationalCount = serviceHealth?.services.filter(s => s.status === 'operational').length || 0;
  const totalServices = serviceHealth?.services.length || 0;
  const hasIssues = serviceHealth?.services.some(s => s.status === 'down' || s.status === 'degraded');

  if (loading) {
    return (
      <AdminLayoutV2>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-5 w-5 animate-spin text-[#666]" />
        </div>
      </AdminLayoutV2>
    );
  }

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Status */}
        <div className={cn(
          "w-full flex items-center justify-between p-4 rounded-lg border",
          hasIssues
            ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
            : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
        )}>
          <div className="flex items-center gap-3">
            {hasIssues ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            )}
            <span className="text-sm font-medium">
              {hasIssues ? 'Some services need attention' : 'All systems operational'}
            </span>
            <span className="text-xs text-[#666] dark:text-[#888]">
              {operationalCount}/{totalServices} services
            </span>
          </div>
          <Link to="/admin/services" className="text-xs text-blue-600 hover:underline">
            View status
          </Link>
        </div>

        {/* Key Metrics - Row 1 */}
        <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs">Total Users</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{metrics?.users.total.toLocaleString() || 0}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              {metrics?.users.growthRate || 0}% growth this week
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Activity className="h-4 w-4" />
              <span className="text-xs">Active Users (7d)</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{metrics?.users.active7d || 0}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              {metrics?.users.active24h || 0} active today
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <FileStack className="h-4 w-4" />
              <span className="text-xs">Total Decks</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{metrics?.decks.total.toLocaleString() || 0}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              {metrics?.decks.createdThisWeek || 0} created this week
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Layers className="h-4 w-4" />
              <span className="text-xs">Total Slides</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{metrics?.decks.totalSlides?.toLocaleString() || 0}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              ~{metrics?.decks.averageSlidesPerDeck || 0} per deck
            </p>
          </div>
        </div>

        {/* Key Metrics - Row 2 */}
        <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <UserPlus className="h-4 w-4" />
              <span className="text-xs">New Users</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{metrics?.users.newThisWeek || 0}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              {metrics?.users.newToday || 0} today
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Decks/User</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{metrics?.decks.averagePerUser || 0}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">
              average per user
            </p>
          </div>

          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <Server className="h-4 w-4" />
              <span className="text-xs">Services</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{operationalCount}/{totalServices}</p>
            <p className="text-xs text-[#666] dark:text-[#888] mt-1">operational</p>
          </div>

          <Link to="/admin/analytics" className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4 hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
            <div className="flex items-center gap-2 text-[#666] dark:text-[#888] mb-2">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs">Analytics</span>
            </div>
            <p className="text-sm text-[#666] dark:text-[#888]">View details</p>
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              Open <ArrowRight className="h-3 w-3" />
            </p>
          </Link>
        </div>

        {/* Quick Links */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/admin/analytics" className="flex items-center justify-between p-4 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 text-[#666]" />
              <span className="text-sm font-medium">Analytics</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#999]" />
          </Link>
          <Link to="/admin/users" className="flex items-center justify-between p-4 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-[#666]" />
              <span className="text-sm font-medium">Users</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#999]" />
          </Link>
          <Link to="/admin/decks" className="flex items-center justify-between p-4 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
            <div className="flex items-center gap-3">
              <FileStack className="h-4 w-4 text-[#666]" />
              <span className="text-sm font-medium">Decks</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#999]" />
          </Link>
          <Link to="/admin/brands" className="flex items-center justify-between p-4 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
            <div className="flex items-center gap-3">
              <Palette className="h-4 w-4 text-[#666]" />
              <span className="text-sm font-medium">Brands</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#999]" />
          </Link>
          <Link to="/admin/services" className="flex items-center justify-between p-4 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-[#666]" />
              <span className="text-sm font-medium">Services</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#999]" />
          </Link>
        </div>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminDashboardV2;
