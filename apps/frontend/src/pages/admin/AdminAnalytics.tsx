import React, { useEffect, useState, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Users, FileStack,
  Calendar, CreditCard, Share2, BarChart3, Activity,
  Download, ChevronDown, ArrowUpRight, ArrowDownRight, Minus,
  UserPlus, Zap, AlertTriangle, CheckCircle, Target,
  Bell, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, CartesianGrid, ReferenceLine,
  ReferenceArea, PieChart as RechartsPie, Pie, Cell
} from 'recharts';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface MetricTarget {
  target: number;
  warning: number;
  danger: number;
  unit?: string;
  description?: string;
}

interface TargetsConfig {
  dailySignups: MetricTarget;
  dailyActiveUsers: MetricTarget;
  dailyDecksCreated: MetricTarget;
  dailyCreditsUsed: MetricTarget;
  weeklyRetention: MetricTarget;
  avgSlidesPerDeck: MetricTarget;
}

const DEFAULT_TARGETS: TargetsConfig = {
  dailySignups: { target: 10, warning: 5, danger: 2, description: 'Daily new user signups' },
  dailyActiveUsers: { target: 50, warning: 25, danger: 10, description: 'Daily active users' },
  dailyDecksCreated: { target: 20, warning: 10, danger: 5, description: 'Daily decks created' },
  dailyCreditsUsed: { target: 500, warning: 200, danger: 50, description: 'Daily credits consumed' },
  weeklyRetention: { target: 40, warning: 25, danger: 15, unit: '%', description: 'Week 1 retention rate' },
  avgSlidesPerDeck: { target: 8, warning: 5, danger: 3, description: 'Average slides per deck' },
};

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

type TabType = 'overview' | 'users' | 'content' | 'credits' | 'activity';

// ============================================================================
// HELPER FUNCTIONS & COMPONENTS
// ============================================================================

const getHealthStatus = (value: number, target: MetricTarget): 'healthy' | 'warning' | 'danger' => {
  if (value >= target.target) return 'healthy';
  if (value >= target.warning) return 'warning';
  return 'danger';
};

const HealthIndicator: React.FC<{ status: 'healthy' | 'warning' | 'danger' }> = ({ status }) => {
  const config = {
    healthy: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    danger: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  };
  const { icon: Icon, color, bg } = config[status];
  return (
    <div className={cn('p-1 rounded', bg)}>
      <Icon className={cn('h-3.5 w-3.5', color)} />
    </div>
  );
};

const TrendBadge: React.FC<{ change: number; trend: string }> = ({ change, trend }) => {
  if (trend === 'flat' || change === 0) {
    return <span className="text-xs text-[#888] flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0%</span>;
  }
  return (
    <span className={cn("text-xs flex items-center gap-0.5", trend === 'up' ? "text-emerald-500" : "text-red-500")}>
      {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(change)}%
    </span>
  );
};

// Chart with target lines and danger/warning zones
const ChartWithTargets: React.FC<{
  data: any[];
  dataKey: string;
  target: MetricTarget;
  title: string;
  color: string;
  type?: 'area' | 'bar' | 'line';
}> = ({ data, dataKey, target, title, color, type = 'area' }) => {
  const maxValue = Math.max(...data.map(d => d[dataKey] || 0), target.target * 1.2);

  return (
    <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
      <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333] flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/30 rounded" /> Danger</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500/30 rounded" /> Warning</span>
          <span className="flex items-center gap-1"><div className="w-3 h-0.5" style={{ backgroundColor: color }} /> Target: {target.target}</span>
        </div>
      </div>
      <div className="p-4 h-[280px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <ReferenceArea y1={0} y2={target.danger} fill="#ef4444" fillOpacity={0.08} />
                <ReferenceArea y1={target.danger} y2={target.warning} fill="#f59e0b" fillOpacity={0.08} />
                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} domain={[0, maxValue]} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', fontSize: '12px' }} />
                <ReferenceLine y={target.target} stroke={color} strokeDasharray="5 5" strokeWidth={2} />
                <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : type === 'line' ? (
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <ReferenceArea y1={0} y2={target.danger} fill="#ef4444" fillOpacity={0.08} />
                <ReferenceArea y1={target.danger} y2={target.warning} fill="#f59e0b" fillOpacity={0.08} />
                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} domain={[0, maxValue]} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', fontSize: '12px' }} />
                <ReferenceLine y={target.target} stroke={color} strokeDasharray="5 5" strokeWidth={2} />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ReferenceArea y1={0} y2={target.danger} fill="#ef4444" fillOpacity={0.08} />
                <ReferenceArea y1={target.danger} y2={target.warning} fill="#f59e0b" fillOpacity={0.08} />
                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} domain={[0, maxValue]} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', fontSize: '12px' }} />
                <ReferenceLine y={target.target} stroke={color} strokeDasharray="5 5" strokeWidth={2} />
                <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#gradient-${title.replace(/\s/g, '')})`} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[#888]">No data available</div>
        )}
      </div>
    </div>
  );
};

// Metric card with health indicator
const MetricCardWithHealth: React.FC<{
  title: string;
  value: number;
  target: MetricTarget;
  change?: { change_percent: number; trend: string };
  icon: React.ReactNode;
}> = ({ title, value, target, change, icon }) => {
  const status = getHealthStatus(value, target);
  const percentOfTarget = Math.round((value / target.target) * 100);

  return (
    <div className={cn(
      "bg-white dark:bg-[#111] border rounded-lg p-4 relative overflow-hidden",
      status === 'danger' ? "border-red-500/50" : status === 'warning' ? "border-amber-500/50" : "border-[#eaeaea] dark:border-[#333]"
    )}>
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1",
        status === 'danger' ? "bg-red-500" : status === 'warning' ? "bg-amber-500" : "bg-emerald-500"
      )} />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[#666] dark:text-[#888]">
          {icon}
          <span className="text-xs">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {change && <TrendBadge change={change.change_percent} trend={change.trend} />}
          <HealthIndicator status={status} />
        </div>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-[#888]">Target: {target.target}</span>
        <span className={cn("font-medium", percentOfTarget >= 100 ? "text-emerald-500" : percentOfTarget >= 50 ? "text-amber-500" : "text-red-500")}>
          {percentOfTarget}% of target
        </span>
      </div>
      <div className="mt-1.5 h-1.5 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", status === 'danger' ? "bg-red-500" : status === 'warning' ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(percentOfTarget, 100)}%` }}
        />
      </div>
    </div>
  );
};

// Alerts panel
const AlertsPanel: React.FC<{ alerts: Array<{ metric: string; status: 'warning' | 'danger'; value: number; target: number }> }> = ({ alerts }) => {
  if (alerts.length === 0) return null;
  return (
    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium text-red-900 dark:text-red-400">{alerts.length} Alert{alerts.length > 1 ? 's' : ''} Requiring Attention</span>
      </div>
      <div className="space-y-2">
        {alerts.map((alert, idx) => (
          <div key={idx} className={cn("flex items-center gap-2 px-3 py-2 rounded text-sm", alert.status === 'danger' ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30")}>
            <AlertTriangle className={cn("h-4 w-4", alert.status === 'danger' ? "text-red-500" : "text-amber-500")} />
            <span className={alert.status === 'danger' ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}>
              <strong>{alert.metric}</strong>: {alert.value} (target: {alert.target})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Targets configuration modal
const TargetsConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  targets: TargetsConfig;
  onSave: (targets: TargetsConfig) => void;
}> = ({ isOpen, onClose, targets, onSave }) => {
  const [localTargets, setLocalTargets] = useState(targets);

  if (!isOpen) return null;

  const updateTarget = (key: keyof TargetsConfig, field: 'target' | 'warning' | 'danger', value: number) => {
    setLocalTargets(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-[#111] rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-auto">
        <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333] flex items-center justify-between sticky top-0 bg-white dark:bg-[#111]">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="font-medium">Configure Targets</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#f5f5f5] dark:hover:bg-[#222] rounded"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          {(Object.entries(localTargets) as [keyof TargetsConfig, MetricTarget][]).map(([key, metric]) => (
            <div key={key} className="border border-[#eaeaea] dark:border-[#333] rounded-lg p-3">
              <div className="text-sm font-medium mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
              <div className="text-xs text-[#888] mb-3">{metric.description}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-emerald-500 block mb-1">Target</label>
                  <input type="number" value={metric.target} onChange={(e) => updateTarget(key, 'target', Number(e.target.value))} className="w-full px-2 py-1 text-sm border border-emerald-500/50 rounded bg-transparent" />
                </div>
                <div>
                  <label className="text-xs text-amber-500 block mb-1">Warning</label>
                  <input type="number" value={metric.warning} onChange={(e) => updateTarget(key, 'warning', Number(e.target.value))} className="w-full px-2 py-1 text-sm border border-amber-500/50 rounded bg-transparent" />
                </div>
                <div>
                  <label className="text-xs text-red-500 block mb-1">Danger</label>
                  <input type="number" value={metric.danger} onChange={(e) => updateTarget(key, 'danger', Number(e.target.value))} className="w-full px-2 py-1 text-sm border border-red-500/50 rounded bg-transparent" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#eaeaea] dark:border-[#333] flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-[#111]">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { onSave(localTargets); onClose(); }}>Save Targets</Button>
        </div>
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
  const [granularity, setGranularity] = useState<'hour' | 'day' | 'week' | 'month'>('day');
  const [targets, setTargets] = useState<TargetsConfig>(() => {
    const saved = localStorage.getItem('analytics_targets');
    return saved ? JSON.parse(saved) : DEFAULT_TARGETS;
  });
  const [showTargetsConfig, setShowTargetsConfig] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [userTimeseries, setUserTimeseries] = useState<any>(null);
  const [deckTimeseries, setDeckTimeseries] = useState<any>(null);
  const [creditTimeseries, setCreditTimeseries] = useState<any>(null);
  const [userSegments, setUserSegments] = useState<any>(null);
  const [cohorts, setCohorts] = useState<any>(null);
  const [topUsers, setTopUsers] = useState<any>(null);
  const [contentDist, setContentDist] = useState<any>(null);
  const [sharingAnalytics, setSharingAnalytics] = useState<any>(null);
  const [creditBreakdown, setCreditBreakdown] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any>(null);

  const [userMetric, setUserMetric] = useState<'signups' | 'logins' | 'active' | 'cumulative'>('signups');
  const [topUsersMetric, setTopUsersMetric] = useState<'decks' | 'credits' | 'shares'>('decks');
  const [segmentBy, setSegmentBy] = useState<'activity' | 'plan' | 'role'>('activity');

  const handleSaveTargets = (newTargets: TargetsConfig) => {
    setTargets(newTargets);
    localStorage.setItem('analytics_targets', JSON.stringify(newTargets));
  };

  const alerts = React.useMemo(() => {
    if (!overview?.metrics) return [];
    const result: Array<{ metric: string; status: 'warning' | 'danger'; value: number; target: number }> = [];
    const signupsValue = overview.metrics.users?.new_signups?.current || 0;
    const signupsStatus = getHealthStatus(signupsValue, targets.dailySignups);
    if (signupsStatus !== 'healthy') result.push({ metric: 'Daily Signups', status: signupsStatus, value: signupsValue, target: targets.dailySignups.target });
    const decksValue = overview.metrics.decks?.created?.current || 0;
    const decksStatus = getHealthStatus(decksValue, targets.dailyDecksCreated);
    if (decksStatus !== 'healthy') result.push({ metric: 'Daily Decks Created', status: decksStatus, value: decksValue, target: targets.dailyDecksCreated.target });
    const creditsValue = overview.metrics.credits?.used?.current || 0;
    const creditsStatus = getHealthStatus(creditsValue, targets.dailyCreditsUsed);
    if (creditsStatus !== 'healthy') result.push({ metric: 'Daily Credits Used', status: creditsStatus, value: creditsValue, target: targets.dailyCreditsUsed.target });
    return result;
  }, [overview, targets]);

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
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 1) setGranularity('hour');
    else if (days <= 14) setGranularity('day');
    else setGranularity('day');
  }, []);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const overviewData = await adminApi.getAnalyticsOverviewV2(startDate, endDate);
      setOverview(overviewData);
      if (activeTab === 'overview' || activeTab === 'users') {
        const [userTs, segmentsData] = await Promise.all([
          adminApi.getUserTimeseries(startDate, endDate, granularity, userMetric),
          adminApi.getUserSegments(startDate, endDate, segmentBy),
        ]);
        setUserTimeseries(userTs);
        setUserSegments(segmentsData);
      }
      if (activeTab === 'overview' || activeTab === 'content') {
        const [deckTs, contentData, sharingData] = await Promise.all([
          adminApi.getDeckTimeseries(startDate, endDate, granularity, 'created'),
          adminApi.getContentDistribution(startDate, endDate),
          adminApi.getSharingAnalytics(startDate, endDate),
        ]);
        setDeckTimeseries(deckTs);
        setContentDist(contentData);
        setSharingAnalytics(sharingData);
      }
      if (activeTab === 'users') {
        const [cohortsData, topUsersData] = await Promise.all([
          adminApi.getUserCohorts(startDate, endDate, 'week'),
          adminApi.getTopUsers(startDate, endDate, topUsersMetric, 15),
        ]);
        setCohorts(cohortsData);
        setTopUsers(topUsersData);
      }
      if (activeTab === 'credits') {
        const [creditTs, creditData] = await Promise.all([
          adminApi.getCreditTimeseries(startDate, endDate, granularity),
          adminApi.getCreditBreakdown(startDate, endDate),
        ]);
        setCreditTimeseries(creditTs);
        setCreditBreakdown(creditData);
      }
      if (activeTab === 'activity') {
        const activityData = await adminApi.getRecentActivity(100);
        setRecentActivity(activityData);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate, granularity, activeTab, userMetric, segmentBy, topUsersMetric]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n?.toLocaleString() ?? '0';
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
    { id: 'content', label: 'Content', icon: <FileStack className="h-4 w-4" /> },
    { id: 'credits', label: 'Credits', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
  ];

  if (loading && !overview) {
    return (
      <AdminLayoutV2>
        <div className="w-full space-y-4">
          <div className="h-8 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => <div key={i} className="h-80 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />)}
          </div>
        </div>
      </AdminLayoutV2>
    );
  }

  const metrics = overview?.metrics;

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Analytics</h1>
            <p className="text-xs text-[#666] dark:text-[#888]">Track performance against targets</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowDatePicker(!showDatePicker)} className="h-8 text-xs gap-1.5">
                <Calendar className="h-3.5 w-3.5" />{datePreset}<ChevronDown className="h-3 w-3" />
              </Button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg shadow-lg p-3 min-w-[280px]">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[#666] dark:text-[#888] mb-2">Quick select</div>
                    <div className="grid grid-cols-2 gap-1">
                      {DATE_PRESETS.map((preset) => (
                        <button key={preset.label} onClick={() => applyDatePreset(preset)} className={cn("px-2 py-1.5 text-xs rounded hover:bg-[#f5f5f5] dark:hover:bg-[#222] text-left", datePreset === preset.label && "bg-[#f5f5f5] dark:bg-[#222] font-medium")}>{preset.label}</button>
                      ))}
                    </div>
                    <div className="border-t border-[#eaeaea] dark:border-[#333] pt-2 mt-2">
                      <div className="text-xs font-medium text-[#666] dark:text-[#888] mb-2">Custom range</div>
                      <div className="flex items-center gap-2">
                        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDatePreset('Custom'); }} className="flex-1 px-2 py-1 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-transparent" />
                        <span className="text-xs text-[#888]">to</span>
                        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDatePreset('Custom'); }} className="flex-1 px-2 py-1 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-transparent" />
                      </div>
                      <Button size="sm" className="w-full mt-2 h-7 text-xs" onClick={() => { setShowDatePicker(false); fetchData(true); }}>Apply</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as any)} className="h-8 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded-md bg-white dark:bg-[#111]">
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => setShowTargetsConfig(true)} className="h-8 text-xs gap-1.5"><Target className="h-3.5 w-3.5" />Targets</Button>
            <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing} className="h-8 text-xs"><RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /></Button>
            <Button variant="outline" size="sm" onClick={async () => {
              const data = await adminApi.exportAnalytics(startDate, endDate, 'json');
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `analytics-${startDate}-${endDate}.json`; a.click();
            }} className="h-8 text-xs"><Download className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <AlertsPanel alerts={alerts} />

        <div className="flex items-center gap-1 border-b border-[#eaeaea] dark:border-[#333]">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors", activeTab === tab.id ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-transparent text-[#666] hover:text-[#333] dark:hover:text-[#ccc]")}>{tab.icon}{tab.label}</button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCardWithHealth title="New Signups" value={metrics?.users?.new_signups?.current || 0} target={targets.dailySignups} change={metrics?.users?.new_signups} icon={<UserPlus className="h-4 w-4" />} />
              <MetricCardWithHealth title="Decks Created" value={metrics?.decks?.created?.current || 0} target={targets.dailyDecksCreated} change={metrics?.decks?.created} icon={<FileStack className="h-4 w-4" />} />
              <MetricCardWithHealth title="Credits Used" value={metrics?.credits?.used?.current || 0} target={targets.dailyCreditsUsed} change={metrics?.credits?.used} icon={<Zap className="h-4 w-4" />} />
              <MetricCardWithHealth title="Shares Created" value={metrics?.sharing?.shares_created?.current || 0} target={{ target: 10, warning: 5, danger: 2 }} change={metrics?.sharing?.shares_created} icon={<Share2 className="h-4 w-4" />} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartWithTargets data={userTimeseries?.data || []} dataKey="value" target={targets.dailySignups} title="User Signups" color="#8b5cf6" type="area" />
              <ChartWithTargets data={deckTimeseries?.data || []} dataKey="value" target={targets.dailyDecksCreated} title="Deck Creation" color="#10b981" type="bar" />
            </div>
            {userSegments?.segments && (
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
                <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]"><span className="text-sm font-medium">User Activity Segments</span></div>
                <div className="p-4">
                  <div className="flex items-center gap-6">
                    <div className="w-[200px] h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie><Pie data={userSegments.segments} dataKey="count" nameKey="segment" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>{userSegments.segments.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></RechartsPie>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {userSegments.segments.map((segment: any, index: number) => (
                        <div key={segment.segment} className="flex items-center justify-between">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} /><span className="text-sm">{segment.segment}</span></div>
                          <div className="text-right"><span className="text-sm font-medium">{formatNumber(segment.count)}</span><span className="text-xs text-[#888] ml-2">({segment.percentage}%)</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2"><span className="text-xs text-[#888]">Metric:</span><select value={userMetric} onChange={(e) => setUserMetric(e.target.value as any)} className="h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#111]"><option value="signups">Signups</option><option value="logins">Logins</option><option value="active">Active Users</option><option value="cumulative">Cumulative</option></select></div>
              <div className="flex items-center gap-2"><span className="text-xs text-[#888]">Segment:</span><select value={segmentBy} onChange={(e) => setSegmentBy(e.target.value as any)} className="h-7 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-white dark:bg-[#111]"><option value="activity">Activity</option><option value="plan">Plan</option><option value="role">Role</option></select></div>
            </div>
            <ChartWithTargets data={userTimeseries?.data || []} dataKey="value" target={userMetric === 'signups' ? targets.dailySignups : targets.dailyActiveUsers} title={`${userMetric.charAt(0).toUpperCase() + userMetric.slice(1)} Over Time`} color="#8b5cf6" type="line" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {userSegments?.segments && (
                <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
                  <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]"><span className="text-sm font-medium">User Segments</span></div>
                  <div className="p-4 space-y-3">
                    {userSegments.segments.map((segment: any, index: number) => (
                      <div key={segment.segment}>
                        <div className="flex items-center justify-between mb-1"><span className="text-sm">{segment.segment}</span><span className="text-sm font-medium">{formatNumber(segment.count)} ({segment.percentage}%)</span></div>
                        <div className="h-2 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${segment.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
                <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333] flex items-center justify-between"><span className="text-sm font-medium">Top Users</span><select value={topUsersMetric} onChange={(e) => setTopUsersMetric(e.target.value as any)} className="h-6 px-2 text-xs border border-[#eaeaea] dark:border-[#333] rounded bg-transparent"><option value="decks">Decks</option><option value="credits">Credits</option><option value="shares">Shares</option></select></div>
                <div className="p-4 max-h-[300px] overflow-y-auto space-y-2">
                  {topUsers?.users?.length > 0 ? topUsers.users.map((user: any, index: number) => (
                    <div key={user.id} className="flex items-center justify-between py-1.5 border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      <div className="flex items-center gap-2"><span className="text-xs text-[#888] w-5">{index + 1}.</span><div><div className="text-sm font-medium truncate max-w-[180px]">{user.email}</div></div></div>
                      <span className="text-sm font-semibold">{formatNumber(user.metric_value)}</span>
                    </div>
                  )) : <div className="text-xs text-[#888] text-center py-4">No data</div>}
                </div>
              </div>
            </div>
            {cohorts?.cohorts?.length > 0 && (
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
                <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333] flex items-center justify-between"><div><span className="text-sm font-medium">Cohort Retention</span></div><div className="text-xs"><span className="text-emerald-500 mr-3">Target: {targets.weeklyRetention.target}%+</span><span className="text-red-500">Danger: &lt;{targets.weeklyRetention.danger}%</span></div></div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[#888]"><th className="text-left py-2 pr-4">Cohort</th><th className="text-right py-2 px-2">Size</th>{cohorts.periods?.map((period: string, i: number) => <th key={i} className="text-center py-2 px-2 min-w-[60px]">{period}</th>)}</tr></thead>
                    <tbody>
                      {cohorts.cohorts.map((cohort: any) => (
                        <tr key={cohort.cohort} className="border-t border-[#eaeaea] dark:border-[#333]">
                          <td className="py-2 pr-4 font-medium">{cohort.cohort}</td>
                          <td className="text-right py-2 px-2">{cohort.size}</td>
                          {cohort.retention.map((rate: number, i: number) => {
                            const status = getHealthStatus(rate, targets.weeklyRetention);
                            return <td key={i} className="text-center py-2 px-2"><span className={cn("inline-block px-2 py-0.5 rounded text-xs font-medium", status === 'danger' ? "bg-red-500 text-white" : status === 'warning' ? "bg-amber-500 text-white" : "bg-emerald-500 text-white")}>{rate}%</span></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'content' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCardWithHealth title="Total Decks" value={contentDist?.total_decks || 0} target={{ target: 100, warning: 50, danger: 20 }} icon={<FileStack className="h-4 w-4" />} />
              <MetricCardWithHealth title="Total Slides" value={contentDist?.total_slides || 0} target={{ target: 500, warning: 200, danger: 50 }} icon={<FileStack className="h-4 w-4" />} />
              <MetricCardWithHealth title="Avg Slides/Deck" value={contentDist?.avg_slides_per_deck || 0} target={targets.avgSlidesPerDeck} icon={<BarChart3 className="h-4 w-4" />} />
              <MetricCardWithHealth title="Shares" value={sharingAnalytics?.shares_created || 0} target={{ target: 20, warning: 10, danger: 5 }} icon={<Share2 className="h-4 w-4" />} />
            </div>
            <ChartWithTargets data={deckTimeseries?.data || []} dataKey="value" target={targets.dailyDecksCreated} title="Deck Creation Over Time" color="#10b981" type="area" />
          </div>
        )}

        {activeTab === 'credits' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <MetricCardWithHealth title="Credits Consumed" value={creditBreakdown?.total_consumed || 0} target={targets.dailyCreditsUsed} icon={<Zap className="h-4 w-4" />} />
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4"><div className="text-xs text-[#888] mb-1">Credits Added</div><div className="text-2xl font-semibold text-emerald-500">{formatNumber(creditBreakdown?.total_added || 0)}</div></div>
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4"><div className="text-xs text-[#888] mb-1">Net Change</div><div className={cn("text-2xl font-semibold", (creditBreakdown?.net_change || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>{(creditBreakdown?.net_change || 0) >= 0 ? '+' : ''}{formatNumber(creditBreakdown?.net_change || 0)}</div></div>
            </div>
            <ChartWithTargets data={creditTimeseries?.data || []} dataKey="value" target={targets.dailyCreditsUsed} title="Credit Usage Over Time" color="#f59e0b" type="area" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
                <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]"><span className="text-sm font-medium">Credit Consumption by Type</span></div>
                <div className="p-4 space-y-3">
                  {creditBreakdown?.consumption_breakdown?.map((item: any, index: number) => (
                    <div key={item.type}><div className="flex items-center justify-between mb-1"><span className="text-sm">{item.type}</span><span className="text-sm font-medium">{formatNumber(item.total_credits)} ({item.percentage}%)</span></div><div className="h-2 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: COLORS[index % COLORS.length] }} /></div></div>
                  )) || <div className="text-xs text-[#888] text-center py-4">No data</div>}
                </div>
              </div>
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
                <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]"><span className="text-sm font-medium">Credit Additions by Type</span></div>
                <div className="p-4 space-y-3">
                  {creditBreakdown?.additions_breakdown?.map((item: any, index: number) => (
                    <div key={item.type}><div className="flex items-center justify-between mb-1"><span className="text-sm">{item.type}</span><span className="text-sm font-medium">{formatNumber(item.total_credits)} ({item.percentage}%)</span></div><div className="h-2 bg-[#f5f5f5] dark:bg-[#222] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: COLORS[(index + 3) % COLORS.length] }} /></div></div>
                  )) || <div className="text-xs text-[#888] text-center py-4">No data</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
            <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]"><span className="text-sm font-medium">Recent Activity</span></div>
            <div className="divide-y divide-[#eaeaea] dark:divide-[#333] max-h-[600px] overflow-y-auto">
              {recentActivity?.activities?.length > 0 ? recentActivity.activities.map((activity: any, index: number) => (
                <div key={index} className="px-4 py-3 flex items-start gap-3 hover:bg-[#f9f9f9] dark:hover:bg-[#161616]">
                  <div className="mt-0.5">{activity.type === 'signup' && <UserPlus className="h-4 w-4 text-emerald-500" />}{activity.type === 'deck_created' && <FileStack className="h-4 w-4 text-blue-500" />}{activity.type === 'share_created' && <Share2 className="h-4 w-4 text-purple-500" />}{!['signup', 'deck_created', 'share_created'].includes(activity.type) && <Activity className="h-4 w-4 text-gray-500" />}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm">{activity.description}</div>{activity.user_email && <div className="text-xs text-[#888] mt-0.5">{activity.user_email}</div>}</div>
                  <div className="text-xs text-[#888]">{(() => { const date = new Date(activity.timestamp); const diff = Date.now() - date.getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(diff / 3600000); if (hours < 24) return `${hours}h ago`; return `${Math.floor(diff / 86400000)}d ago`; })()}</div>
                </div>
              )) : <div className="px-4 py-8 text-center text-xs text-[#888]">No recent activity</div>}
            </div>
          </div>
        )}
      </div>
      <TargetsConfigModal isOpen={showTargetsConfig} onClose={() => setShowTargetsConfig(false)} targets={targets} onSave={handleSaveTargets} />
    </AdminLayoutV2>
  );
};

export default AdminAnalytics;
