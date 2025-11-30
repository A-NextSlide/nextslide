import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Users,
  FileStack,
  Activity,
  TrendingUp,
  UserPlus,
  FilePlus,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi, ServiceHealthResponse } from '@/services/adminApi';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardMetrics {
  users: {
    total: number;
    active24h: number;
    active7d: number;
    active30d: number;
    growthRate: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
  };
  decks: {
    total: number;
    createdToday: number;
    createdThisWeek: number;
    createdThisMonth: number;
    averagePerUser: number;
    totalSlides: number;
    averageSlidesPerDeck: number;
  };
  storage: {
    totalUsed: number;
    averagePerUser: number;
    averagePerDeck: number;
  };
  collaboration: {
    activeSessions: number;
    totalCollaborations: number;
    averageCollaboratorsPerDeck: number;
  };
  activity: {
    loginsToday: number;
    apiCallsToday: number;
    errorRate: number;
  };
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  href?: string;
  iconClassName?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  href,
  iconClassName = 'text-slate-600 dark:text-slate-400',
}) => {
  const content = (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
            {subtitle && (
              <p className="text-sm text-slate-500">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                'flex items-center gap-1 text-sm font-medium',
                trend.isPositive ? 'text-emerald-600' : 'text-red-600'
              )}>
                {trend.isPositive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                <span>{Math.abs(trend.value)}%</span>
                <span className="text-slate-400 font-normal">vs last week</span>
              </div>
            )}
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            <Icon className={cn('h-5 w-5', iconClassName)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm text-slate-600 dark:text-slate-400">
            {entry.name}: <span className="font-medium" style={{ color: entry.color }}>{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const AdminDashboardV2: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userTrends, setUserTrends] = useState<any[]>([]);
  const [deckTrends, setDeckTrends] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealthResponse | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [metricsData, userTrendsData, deckTrendsData, healthData] = await Promise.all([
        adminApi.getAnalyticsOverview(),
        adminApi.getUserTrends(),
        adminApi.getDeckTrends(),
        adminApi.getServicesHealth().catch(() => null),
      ]);

      setMetrics(metricsData);
      setUserTrends(userTrendsData);
      setDeckTrends(deckTrendsData);
      setServiceHealth(healthData);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      setError(error.message || 'Failed to fetch dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const renderSkeletons = () => (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const operationalServices = serviceHealth?.services.filter(s => s.status === 'operational').length || 0;
  const totalServices = serviceHealth?.services.length || 0;
  const hasIssues = serviceHealth?.services.some(s => s.status === 'down' || s.status === 'degraded');

  return (
    <AdminLayoutV2>
      <div className="space-y-6">
        {/* Error State */}
        {error && (
          <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">Error Loading Dashboard</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDashboardData()}
                  className="ml-auto"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Service Status Banner */}
        {serviceHealth && (
          <Card className={cn(
            'border',
            hasIssues
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
          )}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {hasIssues ? (
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <div>
                    <p className={cn(
                      'font-medium',
                      hasIssues ? 'text-amber-900 dark:text-amber-100' : 'text-emerald-900 dark:text-emerald-100'
                    )}>
                      {hasIssues ? 'Some Services Need Attention' : 'All Systems Operational'}
                    </p>
                    <p className={cn(
                      'text-sm',
                      hasIssues ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
                    )}>
                      {operationalServices} of {totalServices} services running
                    </p>
                  </div>
                </div>
                <Link to="/admin/services">
                  <Button variant="ghost" size="sm" className="gap-1">
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Primary Metrics */}
        {isLoading ? renderSkeletons() : metrics && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Users"
              value={metrics.users.total.toLocaleString()}
              subtitle={`${metrics.users.newToday} new today`}
              icon={Users}
              trend={{
                value: metrics.users.growthRate,
                isPositive: metrics.users.growthRate > 0
              }}
              href="/admin/users"
              iconClassName="text-blue-600"
            />
            <MetricCard
              title="Active Users (24h)"
              value={metrics.users.active24h.toLocaleString()}
              subtitle={`${metrics.users.active7d} this week`}
              icon={Activity}
              iconClassName="text-emerald-600"
            />
            <MetricCard
              title="Total Decks"
              value={metrics.decks.total.toLocaleString()}
              subtitle={`${metrics.decks.createdToday} created today`}
              icon={FileStack}
              href="/admin/decks"
              iconClassName="text-purple-600"
            />
            <MetricCard
              title="Avg per User"
              value={metrics.decks.averagePerUser.toFixed(1)}
              subtitle="decks per user"
              icon={TrendingUp}
              iconClassName="text-amber-600"
            />
          </div>
        )}

        {/* Secondary Metrics */}
        {!isLoading && metrics && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="New Users Today"
              value={metrics.users.newToday}
              subtitle={`${metrics.users.newThisWeek} this week`}
              icon={UserPlus}
              iconClassName="text-teal-600"
            />
            <MetricCard
              title="Decks Created Today"
              value={metrics.decks.createdToday}
              subtitle={`${metrics.decks.createdThisWeek} this week`}
              icon={FilePlus}
              iconClassName="text-indigo-600"
            />
            <MetricCard
              title="Total Slides"
              value={metrics.decks.totalSlides.toLocaleString()}
              subtitle={`${metrics.decks.averageSlidesPerDeck.toFixed(1)} avg per deck`}
              icon={FileStack}
              iconClassName="text-rose-600"
            />
            <MetricCard
              title="Monthly Active"
              value={metrics.users.active30d.toLocaleString()}
              subtitle="users this month"
              icon={Activity}
              iconClassName="text-cyan-600"
            />
          </div>
        )}

        {/* Charts */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* User Activity Chart */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">User Activity</CardTitle>
              <CardDescription>Signups and logins over the past week</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={userTrends}>
                      <defs>
                        <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="signups"
                        stroke="#6366f1"
                        fillOpacity={1}
                        fill="url(#colorSignups)"
                        strokeWidth={2}
                        name="Signups"
                      />
                      <Area
                        type="monotone"
                        dataKey="logins"
                        stroke="#10b981"
                        fillOpacity={1}
                        fill="url(#colorLogins)"
                        strokeWidth={2}
                        name="Logins"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deck Creation Chart */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Deck Creation</CardTitle>
              <CardDescription>Decks created over the past week</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deckTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="created"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                        name="Decks Created"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Link to="/admin/users">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">Manage Users</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/admin/decks">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <FileStack className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">View Decks</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/admin/services">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">Service Status</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/admin/analytics">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">Analytics</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminDashboardV2;
