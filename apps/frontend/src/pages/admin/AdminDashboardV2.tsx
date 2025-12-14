import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Users, FileStack, Server, BarChart3, RefreshCw, Palette, TrendingUp, Layers, UserPlus, Activity, Zap, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi, ServiceHealthResponse, AnalyticsOverview } from '@/services/adminApi';
import { StatCard, DashboardHeader, QuickActionCard } from '@/components/admin/AdminComponents';
import { motion } from 'framer-motion';

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
        <div className="w-full max-w-[1600px] mx-auto space-y-4">
          <div className="h-8 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-16 w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </AdminLayoutV2>
    );
  }

  return (
    <AdminLayoutV2>
      <div className="w-full max-w-[1600px] mx-auto space-y-4 h-full flex flex-col">
        {/* Header */}
        <DashboardHeader
          title="Admin Dashboard"
          description="Overview of system performance, user growth, and content generation."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="h-9 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </DashboardHeader>

        {/* System Health Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={cn(
            "w-full flex items-center justify-between p-4 rounded-xl border backdrop-blur-sm shrink-0",
            hasIssues
              ? "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-900/30"
              : "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200/50 dark:border-emerald-900/30"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-full",
              hasIssues ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"
            )}>
              {hasIssues ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div>
              <h3 className={cn("font-semibold", hasIssues ? "text-amber-900 dark:text-amber-400" : "text-emerald-900 dark:text-emerald-400")}>
                {hasIssues ? 'System Attention Needed' : 'All Systems Operational'}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {operationalCount}/{totalServices} services running smoothly
              </p>
            </div>
          </div>
          <Link to="/admin/services">
            <Button variant="ghost" size="sm" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
              View Status <Zap className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </motion.div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <StatCard
            title="Total Users"
            value={metrics?.users.total.toLocaleString() || 0}
            subValue={`${metrics?.users.growthRate || 0}% growth this week`}
            icon={Users}
            trend="up"
            trendValue={`+${metrics?.users.newThisWeek || 0}`}
            delay={0.1}
          />
          <StatCard
            title="Active Users (7d)"
            value={metrics?.users.active7d || 0}
            subValue={`${metrics?.users.active24h || 0} active today`}
            icon={Activity}
            trend="neutral"
            trendValue="Stable"
            delay={0.2}
          />
          <StatCard
            title="Total Decks"
            value={metrics?.decks.total.toLocaleString() || 0}
            subValue={`${metrics?.decks.createdThisWeek || 0} created this week`}
            icon={FileStack}
            trend="up"
            trendValue="Growing"
            delay={0.3}
          />
          <StatCard
            title="Total Slides"
            value={metrics?.decks.totalSlides?.toLocaleString() || 0}
            subValue={`~${metrics?.decks.averageSlidesPerDeck || 0} per deck`}
            icon={Layers}
            delay={0.4}
          />
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <StatCard
            title="New Users Today"
            value={metrics?.users.newToday || 0}
            icon={UserPlus}
            className="bg-zinc-50 dark:bg-zinc-900/30"
            delay={0.5}
          />
          <StatCard
            title="Avg Decks / User"
            value={metrics?.decks.averagePerUser || 0}
            icon={TrendingUp}
            className="bg-zinc-50 dark:bg-zinc-900/30"
            delay={0.6}
          />
          <StatCard
            title="Service Health"
            value={`${Math.round((operationalCount / totalServices) * 100)}%`}
            subValue="Uptime"
            icon={Server}
            className="bg-zinc-50 dark:bg-zinc-900/30"
            delay={0.7}
          />
        </div>

        {/* Quick Actions */}
        <div className="flex-1 min-h-0 flex flex-col">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3 px-1 shrink-0">Quick Access</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
            <QuickActionCard
              title="Analytics"
              description="Deep dive into user behavior and system usage stats."
              icon={BarChart3}
              to="/admin/analytics"
              delay={0.8}
            />
            <QuickActionCard
              title="User Management"
              description="View, edit, and manage user accounts and permissions."
              icon={Users}
              to="/admin/users"
              delay={0.9}
            />
            <QuickActionCard
              title="Deck Explorer"
              description="Browse all generated decks and their content."
              icon={FileStack}
              to="/admin/decks"
              delay={1.0}
            />
            <QuickActionCard
              title="Brand Styles"
              description="Manage brand themes, colors, and assets."
              icon={Palette}
              to="/admin/brands"
              delay={1.1}
            />
          </div>
        </div>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminDashboardV2;
