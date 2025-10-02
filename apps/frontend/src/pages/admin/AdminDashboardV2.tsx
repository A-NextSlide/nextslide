import React, { useEffect, useState } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  FileStack, 
  Activity, 
  TrendingUp, 
  HardDrive,
  Clock,
  UserPlus,
  FilePlus,
  Share2,
  CheckCircle,
  AlertTriangle,
  Server,
  Sparkles,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

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
  description?: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  iconColor?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
  iconColor = "text-violet-600 dark:text-violet-400",
}) => {
  return (
    <Card className={cn(
      "relative overflow-hidden border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all duration-300 group",
      className
    )}>
      <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-purple-600/10 dark:from-violet-600/20 dark:to-purple-600/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
      </div>
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {title}
        </CardTitle>
        <div className={cn(
          "p-2 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:scale-110 transition-transform duration-300",
        )}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div 
          className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100"
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
        >
          {value}
        </div>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {description}
          </p>
        )}
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-sm font-medium mt-3",
            trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          )}>
            {trend.isPositive ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
            <span>{Math.abs(trend.value)}%</span>
            <span className="text-gray-500 dark:text-gray-400 font-normal">vs last week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-900 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
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
  const [animateNumbers, setAnimateNumbers] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (metrics && !animateNumbers) {
      setTimeout(() => setAnimateNumbers(true), 100);
    }
  }, [metrics]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const metricsData = await adminApi.getAnalyticsOverview();
      setMetrics(metricsData);

      const userTrendsData = await adminApi.getUserTrends();
      setUserTrends(userTrendsData);

      const deckTrendsData = await adminApi.getDeckTrends();
      setDeckTrends(deckTrendsData);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      setError(error.message || "Failed to fetch dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderSkeletons = (count: number) => (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 w-full">
      {[...Array(count)].map((_, i) => (
        <Card key={i} className="border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
  
  return (
    <AdminLayoutV2>
      <div className="space-y-8 w-full">
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 p-8 text-white">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 
                className="text-3xl font-bold tracking-tight mb-2"
                style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
              >
                Welcome back!
              </h1>
              <p className="text-violet-100 max-w-xl">
                Here's what's happening with your platform today.
              </p>
            </div>
            <Sparkles className="h-12 w-12 text-white/20" />
          </div>
        </div>

        {error && (
          <Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-red-900 dark:text-red-100">An Error Occurred</CardTitle>
                <CardDescription className="text-red-700 dark:text-red-300">
                  {error}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        )}
        
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-gray-100 dark:bg-gray-800 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900">
              Overview
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900">
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            {isLoading ? renderSkeletons(8) : metrics && (
              <>
                {/* Primary Metrics */}
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 w-full">
                  <MetricCard
                    title="Total Users"
                    value={animateNumbers ? metrics.users.total.toLocaleString() : '0'}
                    description={`${metrics.users.newToday} new today`}
                    icon={Users}
                    trend={{
                      value: metrics.users.growthRate,
                      isPositive: metrics.users.growthRate > 0
                    }}
                  />
                  <MetricCard
                    title="Active Users (24h)"
                    value={animateNumbers ? metrics.users.active24h.toLocaleString() : '0'}
                    description={`${metrics.users.active7d} this week`}
                    icon={Activity}
                    iconColor="text-green-600 dark:text-green-400"
                  />
                  <MetricCard
                    title="Total Decks"
                    value={animateNumbers ? metrics.decks.total.toLocaleString() : '0'}
                    description={`${metrics.decks.createdToday} created today`}
                    icon={FileStack}
                    iconColor="text-blue-600 dark:text-blue-400"
                  />
                  <MetricCard
                    title="Storage Used"
                    value={animateNumbers ? formatBytes(metrics.storage.totalUsed) : '0 Bytes'}
                    description={`${formatBytes(metrics.storage.averagePerUser)} per user`}
                    icon={HardDrive}
                    iconColor="text-orange-600 dark:text-orange-400"
                  />
                </div>

                {/* Secondary Metrics */}
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 w-full">
                  <MetricCard
                    title="New Users Today"
                    value={animateNumbers ? metrics.users.newToday : '0'}
                    description={`${metrics.users.newThisWeek} this week`}
                    icon={UserPlus}
                    iconColor="text-teal-600 dark:text-teal-400"
                  />
                  <MetricCard
                    title="Decks Created Today"
                    value={animateNumbers ? metrics.decks.createdToday : '0'}
                    description={`${metrics.decks.averagePerUser.toFixed(1)} avg per user`}
                    icon={FilePlus}
                    iconColor="text-indigo-600 dark:text-indigo-400"
                  />
                  <MetricCard
                    title="Active Collaborations"
                    value={animateNumbers ? metrics.collaboration.activeSessions : '0'}
                    description={`${metrics.collaboration.totalCollaborations} total`}
                    icon={Share2}
                    iconColor="text-pink-600 dark:text-pink-400"
                  />
                  <MetricCard
                    title="API Calls Today"
                    value={animateNumbers ? metrics.activity.apiCallsToday.toLocaleString() : '0'}
                    description={`${metrics.activity.errorRate.toFixed(2)}% error rate`}
                    icon={Activity}
                    iconColor="text-purple-600 dark:text-purple-400"
                  />
                </div>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="analytics" className="space-y-6 mt-6">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 w-full">
              <Card className="border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle 
                    style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                  >
                    User Activity
                  </CardTitle>
                  <CardDescription>Signups and logins over the past week</CardDescription>
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={userTrends}>
                      <defs>
                        <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="signups" 
                        stroke="#8b5cf6" 
                        fillOpacity={1} 
                        fill="url(#colorSignups)" 
                        strokeWidth={2}
                        name="Signups"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="logins" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorLogins)" 
                        strokeWidth={2}
                        name="Logins"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle 
                    style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                  >
                    Deck Creation
                  </CardTitle>
                  <CardDescription>Decks created over the past week</CardDescription>
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deckTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar 
                        dataKey="created" 
                        fill="#8b5cf6" 
                        radius={[8, 8, 0, 0]}
                        name="Decks Created"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="activity" className="space-y-6 mt-6">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle 
                  style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                >
                  System Status
                </CardTitle>
                <CardDescription>Real-time operational status of key services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 w-full">
                  {[
                    { name: 'API Server', icon: Server, status: 'operational' },
                    { name: 'Database', icon: HardDrive, status: 'operational' },
                    { name: 'Authentication', icon: Users, status: 'operational' },
                    { name: 'WebSocket', icon: Activity, status: 'operational' },
                  ].map((service) => (
                    <div key={service.name} className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-br from-green-600/10 to-emerald-600/10 dark:from-green-600/20 dark:to-emerald-600/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative flex items-center gap-4 p-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
                        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                          <service.icon className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {service.name}
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                            <CheckCircle className="h-3 w-3" />
                            Operational
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle 
                  style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                >
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest platform events and user actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 mx-auto">
                      <Clock className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Activity feed coming soon</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                      Real-time events will appear here
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminDashboardV2;