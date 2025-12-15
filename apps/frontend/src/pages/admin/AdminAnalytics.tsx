import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Users, FileStack, Calendar, CreditCard, Share2, BarChart3, Activity,
  Download, ChevronDown, ArrowUpRight, ArrowDownRight, Minus, UserPlus, Zap,
  AlertTriangle, CheckCircle, Target, DollarSign, TrendingUp, Cpu, Database,
  Clock, Eye, Layers, PieChart, Settings2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, CartesianGrid, ReferenceLine,
  ComposedChart, Cell, PieChart as RechartsPie, Pie
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

// Actual token pricing per million tokens (USD) - Updated Dec 2025
const TOKEN_PRICING = {
  'gemini-3-pro': { input: 2.00, output: 12.00, label: 'Gemini 3 Pro Preview' },
  'claude-4.5-haiku': { input: 0.80, output: 4.00, label: 'Claude 4.5 Haiku' },
  'claude-4.5-sonnet': { input: 3.00, output: 15.00, label: 'Claude 4.5 Sonnet' },
  'perplexity-sonar-pro': { input: 1.00, output: 5.00, label: 'Perplexity Sonar Pro' },
};

// Actual operations and which models they use (from agents/config.py)
const MODEL_USAGE = {
  slideGenerate: { model: 'gemini-3-pro', avgInputTokens: 3000, avgOutputTokens: 5000 },
  componentCreate: { model: 'gemini-3-pro', avgInputTokens: 2500, avgOutputTokens: 4000 },
  customComponent: { model: 'gemini-3-pro', avgInputTokens: 2000, avgOutputTokens: 3500 },
  themeGenerate: { model: 'gemini-3-pro', avgInputTokens: 1500, avgOutputTokens: 2000 },
  research: { model: 'perplexity-sonar-pro', avgInputTokens: 500, avgOutputTokens: 2000 },
  simpleTasks: { model: 'claude-4.5-haiku', avgInputTokens: 800, avgOutputTokens: 500 },
};

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

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

type TabType = 'overview' | 'users' | 'content' | 'credits' | 'economics' | 'activity';

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
    "bg-white dark:bg-[#111] border rounded p-2.5 min-w-0",
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
    <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-purple-500" />Milestone Progress</span>
        <span className="text-xs text-[#888]">{currentUsers.toLocaleString()} users / ${currentMRR.toLocaleString()} MRR</span>
      </div>
      <div className="flex items-center gap-1 mb-2">
        {milestones.map((m, i) => (
          <div key={m.name} className={cn(
            "flex-1 h-1.5 rounded-full transition-all",
            currentUsers >= m.users ? "bg-purple-500" : currentMilestoneIdx === i ? "bg-purple-500/30" : "bg-[#eee] dark:bg-[#333]"
          )} />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-purple-500 font-medium">Next: {nextMilestone.name}</span>
        <span className="text-[#888]">{nextMilestone.users.toLocaleString()} users needed ({Math.max(0, nextMilestone.users - currentUsers).toLocaleString()} to go)</span>
      </div>
    </div>
  );
};

// Unit economics card
const UnitEconomicsCard: React.FC<{
  costPerDeck: number;
  costPerUser: number;
  revenuePerUser: number;
  ltv: number;
  cac: number;
  grossMargin: number;
}> = ({ costPerDeck, costPerUser, revenuePerUser, ltv, cac, grossMargin }) => {
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const isHealthy = ltvCacRatio >= 3;
  const isWarning = ltvCacRatio >= 1 && ltvCacRatio < 3;

  return (
    <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-medium">Unit Economics</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-emerald-500">${costPerDeck.toFixed(3)}</div>
          <div className="text-[10px] text-[#888]">Cost/Deck</div>
        </div>
        <div>
          <div className="text-lg font-semibold">${revenuePerUser.toFixed(2)}</div>
          <div className="text-[10px] text-[#888]">ARPU</div>
        </div>
        <div>
          <div className={cn("text-lg font-semibold", grossMargin >= 70 ? "text-emerald-500" : grossMargin >= 50 ? "text-amber-500" : "text-red-500")}>
            {grossMargin.toFixed(0)}%
          </div>
          <div className="text-[10px] text-[#888]">Margin</div>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-[#eaeaea] dark:border-[#333] flex items-center justify-between">
        <div className="text-[10px]">
          <span className="text-[#888]">LTV:CAC</span>
          <span className={cn("ml-1 font-medium", isHealthy ? "text-emerald-500" : isWarning ? "text-amber-500" : "text-red-500")}>
            {ltvCacRatio.toFixed(1)}x
          </span>
        </div>
        <div className="text-[10px]">
          <span className="text-[#888]">LTV</span>
          <span className="ml-1 font-medium">${ltv.toFixed(0)}</span>
        </div>
        <div className="text-[10px]">
          <span className="text-[#888]">CAC</span>
          <span className="ml-1 font-medium">${cac.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
};

// Cost breakdown by provider
const CostBreakdownChart: React.FC<{ breakdown: Array<{ name: string; cost: number; color: string }> }> = ({ breakdown }) => {
  const total = breakdown.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Cpu className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs font-medium">API Costs (Est. Monthly)</span>
        <span className="ml-auto text-sm font-semibold">${total.toFixed(2)}</span>
      </div>
      <div className="space-y-1.5">
        {breakdown.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-16 text-[10px] text-[#888] truncate">{item.name}</div>
            <div className="flex-1 h-2 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(item.cost / total) * 100}%`, backgroundColor: item.color }} />
            </div>
            <div className="w-14 text-right text-[10px] font-medium">${item.cost.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const AdminAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [datePreset, setDatePreset] = useState('Last 30 days');
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [userTimeseries, setUserTimeseries] = useState<any>(null);
  const [deckTimeseries, setDeckTimeseries] = useState<any>(null);
  const [userSegments, setUserSegments] = useState<any>(null);
  const [topUsers, setTopUsers] = useState<any>(null);
  const [contentDist, setContentDist] = useState<any>(null);
  const [creditBreakdown, setCreditBreakdown] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any>(null);
  const [costEstimate, setCostEstimate] = useState<any>(null);

  // Adjustable economics settings
  const [economicsSettings, setEconomicsSettings] = useState({
    avgSlidesPerDeck: 10,
    decksPerUserPerMonth: 5,
    researchCallsPerDeck: 2,
    customComponentsPerDeck: 3,
    arpu: 10.00,           // Average revenue per user
    paidConversionRate: 5, // Percentage of users who pay
    cac: 15,               // Customer acquisition cost
    avgUserLifetimeMonths: 12,
  });

  // Debug: Log when overview state changes
  useEffect(() => {
    console.log('[Analytics] Overview state updated:', overview);
    console.log('[Analytics] Computed totalUsers:', overview?.metrics?.users?.total || 0);
  }, [overview]);

  // Computed values
  const totalUsers = overview?.metrics?.users?.total || 0;
  const targets = useMemo(() => getTargets(totalUsers), [totalUsers]);

  // Calculate unit economics using actual model pricing and adjustable settings
  const unitEconomics = useMemo(() => {
    const { avgSlidesPerDeck, researchCallsPerDeck, customComponentsPerDeck, arpu, paidConversionRate, cac, avgUserLifetimeMonths } = economicsSettings;
    const decksPerMonth = (overview?.metrics?.decks?.created?.current || 0) * (30 / Math.max(1, overview?.period?.days || 30));
    const slidesPerDeck = overview?.metrics?.decks?.avg_slides_per_deck || avgSlidesPerDeck;

    // Calculate cost per operation using actual models
    const calcOpCost = (op: keyof typeof MODEL_USAGE) => {
      const { model, avgInputTokens, avgOutputTokens } = MODEL_USAGE[op];
      const pricing = TOKEN_PRICING[model as keyof typeof TOKEN_PRICING];
      return (avgInputTokens * pricing.input / 1_000_000) + (avgOutputTokens * pricing.output / 1_000_000);
    };

    const costPerSlide = calcOpCost('slideGenerate');
    const costPerComponent = calcOpCost('componentCreate');
    const costPerCustomComponent = calcOpCost('customComponent');
    const costPerTheme = calcOpCost('themeGenerate');
    const costPerResearch = calcOpCost('research');
    const costPerSimpleTask = calcOpCost('simpleTasks');

    // Cost per deck = theme + (slides * slideGenerate) + (custom components) + (research calls) + simple tasks (routing, validation)
    const costPerDeck = costPerTheme +
      (costPerSlide * slidesPerDeck) +
      (costPerCustomComponent * customComponentsPerDeck) +
      (costPerResearch * researchCallsPerDeck) +
      (costPerSimpleTask * 3); // ~3 simple tasks per deck (routing, validation, etc)

    const monthlyCost = costPerDeck * decksPerMonth;
    const costPerUser = totalUsers > 0 ? monthlyCost / totalUsers : 0;

    // Revenue calculations using adjustable settings
    const paidUsers = totalUsers * (paidConversionRate / 100);
    const estimatedMRR = paidUsers * arpu;
    const ltv = arpu * avgUserLifetimeMonths * (paidConversionRate / 100);
    const grossMargin = arpu > 0 ? ((arpu - costPerUser) / arpu) * 100 : 0;

    return {
      costPerDeck,
      costPerUser,
      revenuePerUser: arpu,
      ltv,
      cac,
      grossMargin,
      monthlyCost,
      estimatedMRR,
      // Detailed breakdown
      costBreakdown: {
        theme: costPerTheme,
        slides: costPerSlide * slidesPerDeck,
        customComponents: costPerCustomComponent * customComponentsPerDeck,
        research: costPerResearch * researchCallsPerDeck,
        simpleTasks: costPerSimpleTask * 3,
      }
    };
  }, [overview, totalUsers, economicsSettings]);

  // API cost breakdown by model
  const apiCostBreakdown = useMemo(() => {
    const decksPerMonth = Math.max(1, (overview?.metrics?.decks?.created?.current || 1) * (30 / Math.max(1, overview?.period?.days || 30)));

    // Calculate actual costs per model
    const geminiCost = decksPerMonth * (
      unitEconomics.costBreakdown.theme +
      unitEconomics.costBreakdown.slides +
      unitEconomics.costBreakdown.customComponents
    );
    const perplexityCost = decksPerMonth * unitEconomics.costBreakdown.research;
    const haikuCost = decksPerMonth * unitEconomics.costBreakdown.simpleTasks;

    return [
      { name: 'Gemini 3 Pro', cost: geminiCost, color: '#8b5cf6' },
      { name: 'Perplexity Sonar Pro', cost: perplexityCost, color: '#10b981' },
      { name: 'Claude 4.5 Haiku', cost: haikuCost, color: '#f59e0b' },
    ];
  }, [overview, unitEconomics]);

  const applyDatePreset = useCallback((preset: typeof DATE_PRESETS[0]) => {
    const end = new Date();
    let start = new Date();
    if (preset.days === 0) start = new Date();
    else if (preset.days === 1) { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    else start.setDate(start.getDate() - preset.days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setDatePreset(preset.label);
    setShowDatePicker(false);
  }, []);

  // Core data fetch - only depends on date range and granularity
  const fetchCoreData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      console.log('[Analytics] Fetching data for:', startDate, 'to', endDate);
      const [overviewData, userTs, deckTs, segments, costEst] = await Promise.all([
        adminApi.getAnalyticsOverviewV2(startDate, endDate),
        adminApi.getUserTimeseries(startDate, endDate, granularity, 'signups'),
        adminApi.getDeckTimeseries(startDate, endDate, granularity, 'created'),
        adminApi.getUserSegments(startDate, endDate, 'activity'),
        adminApi.getCostEstimate(10, 10).catch(() => null),
      ]);
      console.log('[Analytics] Overview data received:', overviewData);
      console.log('[Analytics] Overview data type:', typeof overviewData);
      console.log('[Analytics] Overview metrics:', overviewData?.metrics);
      console.log('[Analytics] Users object:', overviewData?.metrics?.users);
      console.log('[Analytics] Total users value:', overviewData?.metrics?.users?.total, 'type:', typeof overviewData?.metrics?.users?.total);
      console.log('[Analytics] Decks object:', overviewData?.metrics?.decks);
      console.log('[Analytics] Total decks value:', overviewData?.metrics?.decks?.total, 'type:', typeof overviewData?.metrics?.decks?.total);
      setOverview(overviewData);
      setUserTimeseries(userTs);
      setDeckTimeseries(deckTs);
      setUserSegments(segments);
      setCostEstimate(costEst);
    } catch (error) {
      console.error('Error fetching core analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate, granularity]);

  // Tab-specific data fetch
  const fetchTabData = useCallback(async () => {
    try {
      if (activeTab === 'users' && !topUsers) {
        const topUsersData = await adminApi.getTopUsers(startDate, endDate, 'decks', 10);
        setTopUsers(topUsersData);
      }
      if (activeTab === 'content' && !contentDist) {
        const contentData = await adminApi.getContentDistribution(startDate, endDate);
        setContentDist(contentData);
      }
      if ((activeTab === 'credits' || activeTab === 'economics') && !creditBreakdown) {
        const creditData = await adminApi.getCreditBreakdown(startDate, endDate);
        setCreditBreakdown(creditData);
      }
      if (activeTab === 'activity' && !recentActivity) {
        const activityData = await adminApi.getRecentActivity(50);
        setRecentActivity(activityData);
      }
    } catch (error) {
      console.error('Error fetching tab data:', error);
    }
  }, [activeTab, startDate, endDate, topUsers, contentDist, creditBreakdown, recentActivity]);

  // Fetch core data on mount and date change
  useEffect(() => { fetchCoreData(); }, [fetchCoreData]);

  // Fetch tab-specific data when tab changes
  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  // Manual refresh fetches everything
  const handleRefresh = useCallback(() => {
    // Clear tab-specific data to force refetch
    setTopUsers(null);
    setContentDist(null);
    setCreditBreakdown(null);
    setRecentActivity(null);
    fetchCoreData(true);
  }, [fetchCoreData]);

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n?.toLocaleString() ?? '0';
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: 'economics', label: 'Economics', icon: <DollarSign className="h-3.5 w-3.5" /> },
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
        {/* Header - Compact */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-base font-semibold">Analytics Dashboard</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowDatePicker(!showDatePicker)} className="h-7 text-[11px] gap-1 px-2">
                <Calendar className="h-3 w-3" />{datePreset}<ChevronDown className="h-2.5 w-2.5" />
              </Button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg shadow-lg p-2 min-w-[220px]">
                  <div className="grid grid-cols-2 gap-1">
                    {DATE_PRESETS.map((preset) => (
                      <button key={preset.label} onClick={() => applyDatePreset(preset)} className={cn("px-2 py-1 text-[10px] rounded hover:bg-[#f5f5f5] dark:hover:bg-[#222] text-left", datePreset === preset.label && "bg-[#f5f5f5] dark:bg-[#222] font-medium")}>{preset.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as any)} className="h-7 px-1.5 text-[11px] border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#111]">
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-7 w-7 p-0">
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Tabs - Compact */}
        <div className="flex items-center gap-0.5 border-b border-[#eaeaea] dark:border-[#333] overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-1 px-2.5 py-1.5 text-[11px] border-b-2 transition-colors whitespace-nowrap", activeTab === tab.id ? "border-purple-500 text-purple-500" : "border-transparent text-[#666] hover:text-[#333]")}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {/* Milestone tracker */}
            <MilestoneTracker milestones={MILESTONES} currentUsers={totalUsers} currentMRR={unitEconomics.estimatedMRR} />

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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              {/* User Signups Chart */}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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

              {/* User Segments Pie */}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
                <div className="text-xs font-medium mb-2">User Segments</div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie data={userSegments?.segments || []} dataKey="count" nameKey="segment" cx="50%" cy="50%" innerRadius={20} outerRadius={40}>
                          {(userSegments?.segments || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1">
                    {(userSegments?.segments || []).slice(0, 4).map((seg: any, i: number) => (
                      <div key={seg.segment} className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />{seg.segment}</span>
                        <span className="font-medium">{seg.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row - Economics summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <UnitEconomicsCard {...unitEconomics} />
              <CostBreakdownChart breakdown={apiCostBreakdown} />
            </div>
          </div>
        )}

        {/* Economics Tab */}
        {activeTab === 'economics' && (
          <div className="space-y-3">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <CompactMetric label="Cost per Deck" value={`$${unitEconomics.costPerDeck.toFixed(4)}`} icon={<DollarSign className="h-3 w-3" />} />
              <CompactMetric label="Cost per User/mo" value={`$${unitEconomics.costPerUser.toFixed(4)}`} icon={<Users className="h-3 w-3" />} />
              <CompactMetric label="Est. Monthly Cost" value={`$${unitEconomics.monthlyCost.toFixed(2)}`} icon={<Cpu className="h-3 w-3" />} />
              <CompactMetric label="Gross Margin" value={`${unitEconomics.grossMargin.toFixed(0)}%`} status={unitEconomics.grossMargin >= 70 ? 'healthy' : unitEconomics.grossMargin >= 50 ? 'warning' : 'danger'} icon={<TrendingUp className="h-3 w-3" />} />
            </div>

            {/* Adjustable Settings */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Settings2 className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-xs font-medium">Adjustable Economics Settings</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">Avg Slides/Deck</label>
                  <input type="number" value={economicsSettings.avgSlidesPerDeck} onChange={(e) => setEconomicsSettings(s => ({ ...s, avgSlidesPerDeck: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={1} max={50} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">Custom Components/Deck</label>
                  <input type="number" value={economicsSettings.customComponentsPerDeck} onChange={(e) => setEconomicsSettings(s => ({ ...s, customComponentsPerDeck: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={0} max={20} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">Research Calls/Deck</label>
                  <input type="number" value={economicsSettings.researchCallsPerDeck} onChange={(e) => setEconomicsSettings(s => ({ ...s, researchCallsPerDeck: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={0} max={10} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">ARPU ($/mo)</label>
                  <input type="number" value={economicsSettings.arpu} onChange={(e) => setEconomicsSettings(s => ({ ...s, arpu: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={0} max={100} step={0.5} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">Paid Conversion %</label>
                  <input type="number" value={economicsSettings.paidConversionRate} onChange={(e) => setEconomicsSettings(s => ({ ...s, paidConversionRate: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={0} max={100} step={0.5} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">CAC ($)</label>
                  <input type="number" value={economicsSettings.cac} onChange={(e) => setEconomicsSettings(s => ({ ...s, cac: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={0} max={500} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">Avg User Lifetime (mo)</label>
                  <input type="number" value={economicsSettings.avgUserLifetimeMonths} onChange={(e) => setEconomicsSettings(s => ({ ...s, avgUserLifetimeMonths: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={1} max={60} />
                </div>
                <div>
                  <label className="text-[10px] text-[#888] block mb-1">Decks/User/Month</label>
                  <input type="number" value={economicsSettings.decksPerUserPerMonth} onChange={(e) => setEconomicsSettings(s => ({ ...s, decksPerUserPerMonth: Number(e.target.value) }))} className="w-full h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#0a0a0a]" min={1} max={50} />
                </div>
              </div>
            </div>

            {/* Model Pricing & Operations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
                <div className="text-xs font-medium mb-2">Model Pricing (per 1M tokens)</div>
                <div className="space-y-2">
                  {Object.entries(TOKEN_PRICING).map(([model, pricing]) => (
                    <div key={model} className="flex items-center justify-between py-1.5 border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      <span className="text-[11px] font-medium">{pricing.label}</span>
                      <div className="text-[11px]">
                        <span className="text-emerald-500">${pricing.input.toFixed(2)}</span>
                        <span className="text-[#888] mx-1">/</span>
                        <span className="text-blue-500">${pricing.output.toFixed(2)}</span>
                        <span className="text-[9px] text-[#888] ml-1">(in/out)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
                <div className="text-xs font-medium mb-2">Cost per Operation</div>
                <div className="space-y-2">
                  {Object.entries(MODEL_USAGE).map(([op, config]) => {
                    const pricing = TOKEN_PRICING[config.model as keyof typeof TOKEN_PRICING];
                    const cost = (config.avgInputTokens * pricing.input / 1_000_000) + (config.avgOutputTokens * pricing.output / 1_000_000);
                    return (
                      <div key={op} className="flex items-center justify-between py-1.5 border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                        <div>
                          <span className="text-[11px] font-medium capitalize">{op.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <span className="text-[9px] text-[#888] ml-1">({pricing.label})</span>
                        </div>
                        <span className="text-[11px] font-mono text-emerald-500">${cost.toFixed(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cost Breakdown & Break-Even */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <CostBreakdownChart breakdown={apiCostBreakdown} />
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
                <div className="text-xs font-medium mb-2">Break-Even Analysis</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#888]">Monthly API Cost</span>
                    <span className="font-medium">${unitEconomics.monthlyCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#888]">Est. MRR ({economicsSettings.paidConversionRate}% of {totalUsers} users @ ${economicsSettings.arpu})</span>
                    <span className="font-medium text-emerald-500">${unitEconomics.estimatedMRR.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#888]">LTV:CAC Ratio</span>
                    <span className={cn("font-medium", unitEconomics.ltv / unitEconomics.cac >= 3 ? "text-emerald-500" : unitEconomics.ltv / unitEconomics.cac >= 1 ? "text-amber-500" : "text-red-500")}>
                      {(unitEconomics.ltv / unitEconomics.cac).toFixed(1)}x
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#888]">Break-even Paid Users (@ ${economicsSettings.arpu}/mo)</span>
                    <span className="font-medium">{Math.ceil(unitEconomics.monthlyCost / (economicsSettings.arpu * 0.7))} users</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#888]">Profit/Loss per Month</span>
                    <span className={cn("font-medium", unitEconomics.estimatedMRR - unitEconomics.monthlyCost >= 0 ? "text-emerald-500" : "text-red-500")}>
                      ${(unitEconomics.estimatedMRR - unitEconomics.monthlyCost).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Milestones with Revenue */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
              <div className="text-xs font-medium mb-2">Revenue Milestones</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[#888] border-b border-[#eaeaea] dark:border-[#333]">
                      <th className="text-left py-1.5 pr-2">Milestone</th>
                      <th className="text-right py-1.5 px-2">Users</th>
                      <th className="text-right py-1.5 px-2">MRR Target</th>
                      <th className="text-right py-1.5 px-2">Est. API Cost</th>
                      <th className="text-right py-1.5 pl-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MILESTONES.map((m) => {
                      const estCost = m.users * unitEconomics.costPerUser;
                      const margin = m.revenue > 0 ? ((m.revenue - estCost) / m.revenue * 100) : 0;
                      const achieved = totalUsers >= m.users;
                      return (
                        <tr key={m.name} className={cn("border-b border-[#eaeaea] dark:border-[#333] last:border-0", achieved && "bg-emerald-500/5")}>
                          <td className="py-1.5 pr-2 font-medium">{achieved && <CheckCircle className="h-3 w-3 text-emerald-500 inline mr-1" />}{m.name}</td>
                          <td className="text-right py-1.5 px-2">{m.users.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-2">${m.revenue.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-2">${estCost.toFixed(0)}</td>
                          <td className={cn("text-right py-1.5 pl-2 font-medium", margin >= 70 ? "text-emerald-500" : margin >= 50 ? "text-amber-500" : "text-red-500")}>{margin.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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

            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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
                <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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
                <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
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
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
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
                      {activity.type === 'share_created' && <Share2 className="h-3.5 w-3.5 text-purple-500" />}
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
