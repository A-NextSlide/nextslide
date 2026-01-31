import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Users, FileStack, Calendar, CreditCard, Share2, BarChart3, Activity,
  Download, ChevronDown, ArrowUpRight, ArrowDownRight, Minus, UserPlus, Zap,
  AlertTriangle, CheckCircle, Target, TrendingUp, Database,
  Clock, Eye, Layers, PieChart, Settings2, ArrowRight, Palette, Server
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminData, DATE_RANGE_PRESETS, GRANULARITY_OPTIONS } from '@/context/AdminDataContext';
import {
  useAdminOverview, useUserTimeseries, useDeckTimeseries, useUserSegments,
  useTopUsers, useContentDistribution, useCreditBreakdown, useRecentActivity,
  useServiceHealth, invalidateAllAdminData, useAdminQueryClient
} from '@/hooks/useAdminQueries';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, CartesianGrid, ReferenceLine,
  ComposedChart
} from 'recharts';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface MetricTarget {
  target: number;
  warning: number;
  danger: number;
  unit?: string;
}

interface Milestone {
  name: string;
  users: number;
  revenue: number;
  description: string;
  achieved?: boolean;
}

// Startup milestones with revenue projections
const MILESTONES: Milestone[] = [
  { name: 'MVP', users: 100, revenue: 0, description: 'Product validation' },
  { name: 'Early Traction', users: 500, revenue: 1000, description: '~$2/user MRR' },
  { name: 'Product-Market Fit', users: 1000, revenue: 5000, description: '$5K MRR' },
  { name: 'Growth', users: 5000, revenue: 25000, description: '$25K MRR' },
  { name: 'Scale', users: 10000, revenue: 75000, description: '$75K MRR' },
  { name: 'Series A Ready', users: 25000, revenue: 200000, description: '$200K MRR' },
];

// Progressive startup targets (scale with user growth)
const getTargets = (totalUsers: number) => ({
  dailySignups: { target: Math.max(1, Math.ceil(totalUsers * 0.02)), warning: Math.max(1, Math.ceil(totalUsers * 0.01)), danger: 0 },
  dailyActiveUsers: { target: Math.max(5, Math.ceil(totalUsers * 0.1)), warning: Math.max(2, Math.ceil(totalUsers * 0.05)), danger: 0 },
  dailyDecksCreated: { target: Math.max(2, Math.ceil(totalUsers * 0.05)), warning: Math.max(1, Math.ceil(totalUsers * 0.02)), danger: 0 },
  dailyCreditsUsed: { target: Math.max(50, totalUsers * 5), warning: Math.max(20, totalUsers * 2), danger: 0 },
  weeklyRetention: { target: 40, warning: 25, danger: 15, unit: '%' },
  avgSlidesPerDeck: { target: 8, warning: 5, danger: 3 },
});

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

// Shared design tokens (match AdminServices)
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

type TabType = 'overview' | 'users' | 'content' | 'credits' | 'activity';

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const getHealthStatus = (value: number, target: MetricTarget): 'healthy' | 'warning' | 'danger' => {
  if (value >= target.target) return 'healthy';
  if (value >= target.warning) return 'warning';
  return 'danger';
};

const TrendBadge: React.FC<{ change: number; trend: string; compact?: boolean }> = ({ change, trend, compact }) => {
  if (trend === 'flat' || change === 0) {
    return <span className={cn("text-[#888] flex items-center gap-0.5", compact ? "text-[10px]" : "text-xs")}><Minus className="h-3 w-3" />0%</span>;
  }
  return (
    <span className={cn("flex items-center gap-0.5", compact ? "text-[10px]" : "text-xs", trend === 'up' ? "text-emerald-500" : "text-red-500")}>
      {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(change).toFixed(0)}%
    </span>
  );
};

// Compact metric card for dense display
const CompactMetric: React.FC<{
  label: string;
  value: number | string;
  subValue?: string;
  trend?: { change_percent: number; trend: string };
  status?: 'healthy' | 'warning' | 'danger';
  icon?: React.ReactNode;
  prefix?: string;
  suffix?: string;
}> = ({ label, value, subValue, trend, status, icon, prefix = '', suffix = '' }) => (
  <div className={cn(
    "bg-white dark:bg-[#111] border rounded-xl p-2.5 min-w-0",
    status === 'danger' ? "border-red-500/50" : status === 'warning' ? "border-amber-500/50" : "border-[#eaeaea] dark:border-[#333]"
  )}>
    <div className="flex items-center justify-between gap-1 mb-1">
      <span className="text-[10px] text-[#888] truncate flex items-center gap-1">
        {icon}
        {label}
      </span>
      {trend && <TrendBadge change={trend.change_percent} trend={trend.trend} compact />}
    </div>
    <div className="text-lg font-semibold tabular-nums leading-tight">
      {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
    </div>
    {subValue && <div className="text-[10px] text-[#888] mt-0.5">{subValue}</div>}
  </div>
);

// Mini chart for sparklines
const MiniChart: React.FC<{ data: any[]; dataKey: string; color: string; height?: number }> = ({ data, dataKey, color, height = 40 }) => (
  <div style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`mini-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#mini-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

// Milestone progress tracker
const MilestoneTracker: React.FC<{ milestones: Milestone[]; currentUsers: number; currentMRR: number }> = ({ milestones, currentUsers, currentMRR }) => {
  const currentMilestoneIdx = milestones.findIndex(m => currentUsers < m.users);
  const nextMilestone = milestones[currentMilestoneIdx] || milestones[milestones.length - 1];
  const prevMilestone = milestones[Math.max(0, currentMilestoneIdx - 1)];
  const progress = currentMilestoneIdx === -1 ? 100 : Math.min(100, ((currentUsers - (prevMilestone?.users || 0)) / (nextMilestone.users - (prevMilestone?.users || 0))) * 100);

  return (
    <div className={cn(cardClass, "p-3")}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-[#FF4301]" />Milestone Progress</span>
        <span className="text-xs text-[#888]">{currentUsers.toLocaleString()} users / ${currentMRR.toLocaleString()} MRR</span>
      </div>
      <div className="flex items-center gap-1 mb-2">
        {milestones.map((m, i) => (
          <div key={m.name} className={cn(
            "flex-1 h-1.5 rounded-full transition-all",
            currentUsers >= m.users ? "bg-[#FF4301]" : currentMilestoneIdx === i ? "bg-[#FF4301]/30" : "bg-[#eee] dark:bg-[#333]"
          )} />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#FF4301] font-medium">Next: {nextMilestone.name}</span>
        <span className="text-[#888]">{nextMilestone.users.toLocaleString()} users needed ({Math.max(0, nextMilestone.users - currentUsers).toLocaleString()} to go)</span>
      </div>
    </div>
  );
};


// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Quick access cards for dashboard
const QUICK_ACCESS_CARDS = [
  { title: 'Users', description: 'Manage user accounts', href: '/admin/users', icon: Users, color: 'text-blue-500' },
  { title: 'Decks', description: 'Browse all decks', href: '/admin/decks', icon: FileStack, color: 'text-emerald-500' },
  { title: 'Brands', description: 'Manage brand styles', href: '/admin/brands', icon: Palette, color: 'text-[#FF4301]' },
  { title: 'Services', description: 'Monitor services', href: '/admin/services', icon: Server, color: 'text-amber-500' },
];

// System health banner component
const SystemHealthBanner: React.FC<{ health: any; isLoading: boolean }> = ({ health, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3 animate-pulse">
        <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
    );
  }

  const services = health?.services || [];
  const operationalCount = services.filter((s: any) => s.status === 'operational').length;
  const totalCount = services.length;
  const allOperational = operationalCount === totalCount && totalCount > 0;

  return (
    <div className={cn(
      "rounded-xl p-3 flex items-center justify-between",
      allOperational
        ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30"
        : "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30"
    )}>
      <div className="flex items-center gap-2">
        {allOperational ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
        <span className={cn("text-xs font-medium", allOperational ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
          {allOperational ? 'All Systems Operational' : 'Some Services Need Attention'}
        </span>
        <span className="text-[10px] text-[#888]">
          {operationalCount}/{totalCount} services running
        </span>
      </div>
      <Link to="/admin/services" className="text-[10px] text-[#888] hover:text-[#333] dark:hover:text-white flex items-center gap-1">
        View details <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
};

// Quick access card component
const QuickAccessCard: React.FC<{ title: string; description: string; href: string; icon: any; color: string }> = ({ title, description, href, icon: Icon, color }) => (
  <Link to={href} className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3 hover:border-[#FF4301]/40 dark:hover:border-[#FF4301]/40 transition-colors group">
    <div className="flex items-start justify-between">
      <div>
        <Icon className={cn("h-4 w-4 mb-2", color)} />
        <h3 className="text-xs font-medium">{title}</h3>
        <p className="text-[10px] text-[#888] mt-0.5">{description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[#888] group-hover:text-[#333] dark:group-hover:text-white transition-colors" />
    </div>
  </Link>
);

const AdminAnalytics: React.FC = () => {
  const queryClient = useAdminQueryClient();
  const { dateRange, setPreset, granularity, setGranularity, refreshAllData, isRefreshing } = useAdminData();
  const { startDate, endDate, preset } = dateRange;

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // React Query hooks - data is prefetched by AdminDataProvider
  const { data: overview, isLoading: overviewLoading } = useAdminOverview(startDate, endDate);
  const { data: userTimeseries } = useUserTimeseries(startDate, endDate, granularity, 'signups');
  const { data: deckTimeseries } = useDeckTimeseries(startDate, endDate, granularity, 'created');
  const { data: userSegments } = useUserSegments(startDate, endDate, 'activity');
  const { data: serviceHealth, isLoading: healthLoading } = useServiceHealth();

  // Tab-specific data - only fetched when tab is active
  const { data: topUsers } = useTopUsers(startDate, endDate, 'decks', 10, activeTab === 'users');
  const { data: contentDist } = useContentDistribution(startDate, endDate, activeTab === 'content');
  const { data: creditBreakdown } = useCreditBreakdown(startDate, endDate, activeTab === 'credits');
  const { data: recentActivity } = useRecentActivity(50, activeTab === 'activity');

  const loading = overviewLoading && !overview;

  // Computed values
  const totalUsers = overview?.metrics?.users?.total || 0;
  const targets = useMemo(() => getTargets(totalUsers), [totalUsers]);

  // Handle refresh - invalidates all queries and refetches
  const handleRefresh = useCallback(() => {
    invalidateAllAdminData(queryClient);
    refreshAllData();
  }, [queryClient, refreshAllData]);

  // Handle date preset selection
  const handleDatePresetChange = useCallback((presetValue: string) => {
    setPreset(presetValue as any);
    setShowDatePicker(false);
  }, [setPreset]);

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n?.toLocaleString() ?? '0';
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: 'users', label: 'Users', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'content', label: 'Content', icon: <FileStack className="h-3.5 w-3.5" /> },
    { id: 'credits', label: 'Credits', icon: <CreditCard className="h-3.5 w-3.5" /> },
    { id: 'activity', label: 'Activity', icon: <Activity className="h-3.5 w-3.5" /> },
  ];

  if (loading && !overview) {
    return (
      <AdminLayoutV2>
        <div className="space-y-3 animate-pulse">
          <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="grid grid-cols-4 gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded" />)}</div>
          <div className="grid grid-cols-2 gap-2">{[...Array(2)].map((_, i) => <div key={i} className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded" />)}</div>
        </div>
      </AdminLayoutV2>
    );
  }

  const metrics = overview?.metrics;

  return (
    <AdminLayoutV2>
      <div className="space-y-3">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Overview</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowDatePicker(!showDatePicker)} className="h-7 text-[11px] gap-1 px-2">
                <Calendar className="h-3 w-3" />
                {DATE_RANGE_PRESETS.find(p => p.value === preset)?.label || 'Last 30 days'}
                <ChevronDown className="h-2.5 w-2.5" />
              </Button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg shadow-lg p-2 min-w-[180px]">
                  <div className="space-y-0.5">
                    {DATE_RANGE_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => handleDatePresetChange(p.value)}
                        className={cn(
                          "w-full px-2 py-1.5 text-[11px] rounded hover:bg-[#f5f5f5] dark:hover:bg-[#222] text-left",
                          preset === p.value && "bg-[#f5f5f5] dark:bg-[#222] font-medium"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as any)}
              className="h-7 px-1.5 text-[11px] border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#111]"
            >
              {GRANULARITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="h-7 w-7 p-0">
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-0.5 border-b border-[#eaeaea] dark:border-[#333] overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap", activeTab === tab.id ? "border-[#FF4301] text-[#FF4301]" : "border-transparent text-[#666] hover:text-[#333] dark:hover:text-white")}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {/* System Health Banner */}
            <SystemHealthBanner health={serviceHealth} isLoading={healthLoading} />

            {/* Milestone tracker */}
            <MilestoneTracker milestones={MILESTONES} currentUsers={totalUsers} currentMRR={0} />

            {/* Key Metrics Grid - 6 columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <CompactMetric label="Total Users" value={totalUsers} icon={<Users className="h-3 w-3" />} trend={metrics?.users?.new_signups} />
              <CompactMetric label="New Signups" value={metrics?.users?.new_signups?.current || 0} subValue={`Target: ${targets.dailySignups.target}`} icon={<UserPlus className="h-3 w-3" />} status={getHealthStatus(metrics?.users?.new_signups?.current || 0, targets.dailySignups)} />
              <CompactMetric label="Active Users" value={metrics?.users?.active_in_period || 0} icon={<Activity className="h-3 w-3" />} />
              <CompactMetric label="Total Decks" value={metrics?.decks?.total || 0} icon={<FileStack className="h-3 w-3" />} />
              <CompactMetric label="Decks Created" value={metrics?.decks?.created?.current || 0} subValue={`Target: ${targets.dailyDecksCreated.target}`} icon={<Layers className="h-3 w-3" />} trend={metrics?.decks?.created} status={getHealthStatus(metrics?.decks?.created?.current || 0, targets.dailyDecksCreated)} />
              <CompactMetric label="Credits Used" value={metrics?.credits?.used?.current || 0} icon={<Zap className="h-3 w-3" />} trend={metrics?.credits?.used} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {/* User Signups Chart */}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">User Signups</span>
                  <span className="text-[10px] text-[#888]">Target: {targets.dailySignups.target}/day</span>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={userTimeseries?.data || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ fontSize: '11px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} />
                      <ReferenceLine y={targets.dailySignups.target} stroke="#8b5cf6" strokeDasharray="3 3" strokeWidth={1} />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Deck Creation Chart */}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Deck Creation</span>
                  <span className="text-[10px] text-[#888]">Target: {targets.dailyDecksCreated.target}/day</span>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={deckTimeseries?.data || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ fontSize: '11px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} />
                      <ReferenceLine y={targets.dailyDecksCreated.target} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} />
                      <Area type="monotone" dataKey="value" fill="#10b98133" stroke="#10b981" strokeWidth={1.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Quick Access Cards */}
            <div className="mt-4">
              <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Quick Access</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {QUICK_ACCESS_CARDS.map((card) => (
                  <QuickAccessCard key={card.href} {...card} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <CompactMetric label="Total Users" value={totalUsers} icon={<Users className="h-3 w-3" />} />
              <CompactMetric label="New This Period" value={metrics?.users?.new_signups?.current || 0} trend={metrics?.users?.new_signups} icon={<UserPlus className="h-3 w-3" />} />
              <CompactMetric label="Active Users" value={metrics?.users?.active_in_period || 0} icon={<Activity className="h-3 w-3" />} />
              <CompactMetric label="Decks per User" value={(metrics?.decks?.total || 0) / Math.max(1, totalUsers)} suffix="" icon={<FileStack className="h-3 w-3" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {/* User Segments */}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
                <div className="text-xs font-medium mb-2">Activity Segments</div>
                <div className="space-y-2">
                  {(userSegments?.segments || []).map((seg: any, i: number) => (
                    <div key={seg.segment}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span>{seg.segment}</span>
                        <span className="font-medium">{seg.count} ({seg.percentage}%)</span>
                      </div>
                      <div className="h-1.5 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${seg.percentage}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Users */}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
                <div className="text-xs font-medium mb-2">Top Users by Decks</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(topUsers?.users || []).map((user: any, i: number) => (
                    <div key={user.id} className="flex items-center justify-between py-1 border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-[#888] w-4">{i + 1}.</span>
                        <span className="text-[11px] truncate">{user.email}</span>
                      </div>
                      <span className="text-[11px] font-semibold">{user.metric_value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <CompactMetric label="Total Decks" value={metrics?.decks?.total || 0} icon={<FileStack className="h-3 w-3" />} />
              <CompactMetric label="Total Slides" value={metrics?.decks?.total_slides || 0} icon={<Layers className="h-3 w-3" />} />
              <CompactMetric label="Avg Slides/Deck" value={metrics?.decks?.avg_slides_per_deck || 0} icon={<BarChart3 className="h-3 w-3" />} />
              <CompactMetric label="Share Views" value={metrics?.sharing?.total_views || 0} icon={<Eye className="h-3 w-3" />} />
            </div>

            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
              <div className="text-xs font-medium mb-2">Deck Creation Trend</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={deckTimeseries?.data || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="deckGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: '11px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} />
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#deckGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Credits Tab */}
        {activeTab === 'credits' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <CompactMetric label="Credits Used" value={metrics?.credits?.used?.current || 0} trend={metrics?.credits?.used} icon={<Zap className="h-3 w-3" />} />
              <CompactMetric label="Total Balance" value={metrics?.credits?.total_balance || 0} icon={<Database className="h-3 w-3" />} />
              <CompactMetric label="Credits/User" value={((metrics?.credits?.used?.current || 0) / Math.max(1, totalUsers)).toFixed(1)} icon={<Users className="h-3 w-3" />} />
              <CompactMetric label="Credits/Deck" value={((metrics?.credits?.used?.current || 0) / Math.max(1, metrics?.decks?.created?.current || 1)).toFixed(1)} icon={<FileStack className="h-3 w-3" />} />
            </div>

            {creditBreakdown && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
                  <div className="text-xs font-medium mb-2">Credit Consumption by Type</div>
                  <div className="space-y-2">
                    {(creditBreakdown?.consumption_breakdown || []).map((item: any, i: number) => (
                      <div key={item.type}>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span>{item.type}</span>
                          <span className="font-medium">{formatNumber(item.total_credits)} ({item.percentage}%)</span>
                        </div>
                        <div className="h-1.5 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3">
                  <div className="text-xs font-medium mb-2">Credit Additions</div>
                  <div className="space-y-2">
                    {(creditBreakdown?.additions_breakdown || []).map((item: any, i: number) => (
                      <div key={item.type}>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span>{item.type}</span>
                          <span className="font-medium text-emerald-500">+{formatNumber(item.total_credits)}</span>
                        </div>
                        <div className="h-1.5 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className={cn(cardClass, "overflow-hidden")}>
            <div className="px-3 py-2 border-b border-[#eaeaea] dark:border-[#333]">
              <span className="text-xs font-medium">Recent Activity</span>
            </div>
            <div className="divide-y divide-[#eaeaea] dark:divide-[#333] max-h-[500px] overflow-y-auto">
              {(recentActivity?.activities || []).length > 0 ? (
                recentActivity.activities.map((activity: any, i: number) => (
                  <div key={i} className="px-3 py-2 flex items-start gap-2 hover:bg-[#fafafa] dark:hover:bg-[#161616]">
                    <div className="mt-0.5">
                      {activity.type === 'signup' && <UserPlus className="h-3.5 w-3.5 text-emerald-500" />}
                      {activity.type === 'deck_created' && <FileStack className="h-3.5 w-3.5 text-blue-500" />}
                      {activity.type === 'share_created' && <Share2 className="h-3.5 w-3.5 text-[#FF4301]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px]">{activity.description}</div>
                      {activity.user_email && <div className="text-[10px] text-[#888]">{activity.user_email}</div>}
                    </div>
                    <div className="text-[10px] text-[#888] whitespace-nowrap">
                      {(() => {
                        const diff = Date.now() - new Date(activity.timestamp).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return 'Now';
                        if (mins < 60) return `${mins}m`;
                        const hours = Math.floor(diff / 3600000);
                        if (hours < 24) return `${hours}h`;
                        return `${Math.floor(diff / 86400000)}d`;
                      })()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-8 text-center text-[11px] text-[#888]">No recent activity</div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayoutV2>
  );
};

export default AdminAnalytics;
