import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  CalendarIcon,
  Download,
  TrendingUp,
  TrendingDown,
  Users,
  FileStack,
  Activity,
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  Zap
} from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

type TimeRange = '7d' | '30d' | '90d' | 'custom';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

const AdminAnalytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Real data states
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [userTrends, setUserTrends] = useState<any[]>([]);
  const [deckTrends, setDeckTrends] = useState<any[]>([]);
  
  // Placeholder states for features not yet implemented
  const [userRetentionData, setUserRetentionData] = useState<any[]>([]);
  const [deckCreationData, setDeckCreationData] = useState<any[]>([]);
  const [componentUsageData, setComponentUsageData] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange, dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setIsLoading(true);

      // Fetch real data from API
      const [overview, userTrendsData, deckTrendsData] = await Promise.all([
        adminApi.getAnalyticsOverview(),
        adminApi.getUserTrends(),
        adminApi.getDeckTrends()
      ]);

      setAnalyticsData(overview);
      setUserTrends(userTrendsData);
      setDeckTrends(deckTrendsData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockData = () => {
    // No longer used - keeping for reference
    // User growth data
    const userGrowth = [];
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    for (let i = days; i >= 0; i--) {
      const date = subDays(new Date(), i);
      userGrowth.push({
        date: format(date, 'MMM d'),
        signups: Math.floor(Math.random() * 20) + 5,
        activeUsers: Math.floor(Math.random() * 200) + 100,
        totalUsers: 1000 + (days - i) * 15,
      });
    }
    setUserGrowthData(userGrowth);

    // User retention cohorts
    const retention = [
      { cohort: 'Week 1', week1: 100, week2: 85, week3: 72, week4: 65 },
      { cohort: 'Week 2', week1: 100, week2: 82, week3: 70, week4: 63 },
      { cohort: 'Week 3', week1: 100, week2: 88, week3: 75, week4: 68 },
      { cohort: 'Week 4', week1: 100, week2: 90, week3: 78, week4: 71 },
    ];
    setUserRetentionData(retention);

    // Deck creation trends
    const deckCreation = [];
    for (let i = days; i >= 0; i--) {
      const date = subDays(new Date(), i);
      deckCreation.push({
        date: format(date, 'MMM d'),
        decksCreated: Math.floor(Math.random() * 50) + 20,
        slidesCreated: Math.floor(Math.random() * 200) + 100,
      });
    }
    setDeckCreationData(deckCreation);

    // Component usage
    const componentUsage = [
      { name: 'Text', count: 2456, percentage: 35 },
      { name: 'Image', count: 1823, percentage: 26 },
      { name: 'Shape', count: 1267, percentage: 18 },
      { name: 'Chart', count: 845, percentage: 12 },
      { name: 'Table', count: 423, percentage: 6 },
      { name: 'Other', count: 211, percentage: 3 },
    ];
    setComponentUsageData(componentUsage);

    // Feature adoption
    const featureAdoption = [
      { feature: 'AI Generation', adoption: 78, trend: 12 },
      { feature: 'Collaboration', adoption: 65, trend: 8 },
      { feature: 'Templates', adoption: 82, trend: -3 },
      { feature: 'Themes', adoption: 71, trend: 5 },
      { feature: 'Export', adoption: 54, trend: 15 },
      { feature: 'Sharing', adoption: 68, trend: 7 },
    ];
    setFeatureAdoptionData(featureAdoption);
  };

  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    if (value !== 'custom') {
      const days = value === '7d' ? 7 : value === '30d' ? 30 : 90;
      setDateRange({
        from: subDays(new Date(), days),
        to: new Date(),
      });
    }
  };

  const MetricCard: React.FC<{
    title: string;
    value: string | number;
    change?: number;
    icon: React.ElementType;
  }> = ({ title, value, change, icon: Icon }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className={cn(
            "flex items-center text-xs mt-1",
            change > 0 ? "text-green-600" : "text-red-600"
          )}>
            {change > 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {Math.abs(change)}% from last period
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-muted-foreground mt-2">
              Platform insights and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={handleTimeRangeChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {timeRange === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd")} -{" "}
                          {format(dateRange.to, "LLL dd")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 w-full">
              {isLoading ? (
                <>
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </>
              ) : analyticsData ? (
                <>
                  <MetricCard
                    title="Total Users"
                    value={analyticsData.users.total.toLocaleString()}
                    icon={Users}
                    change={analyticsData.users.growthRate}
                  />
                  <MetricCard
                    title="Active Users (30d)"
                    value={analyticsData.users.active30d.toLocaleString()}
                    icon={Activity}
                  />
                  <MetricCard
                    title="Total Decks"
                    value={analyticsData.decks.total.toLocaleString()}
                    icon={FileStack}
                    change={15} // Calculate from data if available
                  />
                  <MetricCard
                    title="API Calls Today"
                    value={analyticsData.activity.apiCallsToday.toLocaleString()}
                    icon={Zap}
                  />
                </>
              ) : null}
            </div>

            {/* User Growth Chart */}
            <Card>
              <CardHeader>
                <CardTitle>User Growth</CardTitle>
                <CardDescription>
                  New signups and active users over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  {isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={userTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="signups"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          name="New Signups"
                        />
                        <Line
                          type="monotone"
                          dataKey="logins"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          name="Logins"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Feature Adoption - Coming Soon */}
            <Card>
              <CardHeader>
                <CardTitle>Feature Adoption</CardTitle>
                <CardDescription>
                  Percentage of users using each feature
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>Feature adoption metrics coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            {/* User Retention Cohorts */}
            <Card>
              <CardHeader>
                <CardTitle>User Retention Cohorts</CardTitle>
                <CardDescription>
                  Weekly retention rates by signup cohort
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  {isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userRetentionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="cohort" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="week1" fill="#8b5cf6" name="Week 1" />
                        <Bar dataKey="week2" fill="#3b82f6" name="Week 2" />
                        <Bar dataKey="week3" fill="#10b981" name="Week 3" />
                        <Bar dataKey="week4" fill="#f59e0b" name="Week 4" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>


          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            {/* Content Analytics - Coming Soon */}
            <Card>
              <CardHeader>
                <CardTitle>Content Analytics</CardTitle>
                <CardDescription>
                  Detailed content creation and usage metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-16 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">Content analytics coming soon</p>
                  <p className="text-sm">This will include deck creation trends, component usage, and template analytics</p>
                </div>
              </CardContent>
            </Card>

            {/* Component Usage */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 w-full">
              <Card>
                <CardHeader>
                  <CardTitle>Component Usage</CardTitle>
                  <CardDescription>
                    Distribution of components across all decks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={componentUsageData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry.name} ${entry.percentage}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="count"
                          >
                            {componentUsageData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </RePieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>


            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            {/* System Performance Metrics */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 w-full">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">API Response Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">124ms</div>
                  <p className="text-xs text-muted-foreground">avg. last 24h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Error Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0.12%</div>
                  <p className="text-xs text-muted-foreground">last 24h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Uptime</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">99.98%</div>
                  <p className="text-xs text-muted-foreground">last 30 days</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">342</div>
                  <p className="text-xs text-muted-foreground">right now</p>
                </CardContent>
              </Card>
            </div>

            {/* API Usage Chart */}
            <Card>
              <CardHeader>
                <CardTitle>API Usage</CardTitle>
                <CardDescription>
                  Requests per hour over the last 24 hours
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <LineChartIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Performance metrics will be available once monitoring is set up</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;