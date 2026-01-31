/**
 * Per-Deck Analytics Page
 *
 * Route: /analytics/:deckId
 *
 * Shows detailed analytics for a single presentation including:
 * - Summary cards (total views, unique viewers, avg duration)
 * - Views over time chart
 * - Slide-by-slide engagement
 * - Device breakdown
 * - Source breakdown
 * - Geography
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ArrowLeft, Eye, Users, Clock, TrendingUp, TrendingDown, Lock, BarChart3, Monitor, Smartphone, Tablet, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useCredits } from '@/context/CreditsContext';
import { trackEvent } from '@/services/analytics';
import {
  getDeckAnalytics,
  type DeckAnalytics as DeckAnalyticsType,
} from '@/services/analyticsApi';

const PERIOD_OPTIONS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

const CHART_COLORS = ['#FF6B00', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];

const PIE_COLORS = {
  desktop: '#3B82F6',
  mobile: '#FF6B00',
  tablet: '#10B981',
  direct: '#3B82F6',
  social: '#FF6B00',
  embed: '#10B981',
  search: '#8B5CF6',
  email: '#F59E0B',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  return `${minutes}m ${remainingSec}s`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// ---------------------------------------------------------------------------
// Plan Gating Component
// ---------------------------------------------------------------------------

function UpgradeOverlay({ feature }: { feature: string }) {
  const navigate = useNavigate();
  return (
    <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-lg">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground text-center max-w-[200px]">
        Upgrade to unlock {feature}
      </p>
      <Button size="sm" onClick={() => navigate('/pricing')}>
        View Plans
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Card Skeleton
// ---------------------------------------------------------------------------

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32 mt-2" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const DeckAnalytics: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { balance } = useCredits();

  const [analytics, setAnalytics] = useState<DeckAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');

  const isPaidPlan = balance?.plan_id === 'starter' || balance?.plan_id === 'pro' || balance?.plan_id === 'enterprise';

  const fetchAnalytics = useCallback(async () => {
    if (!deckId || !session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDeckAnalytics(deckId, period);
      setAnalytics(data);
    } catch (err: any) {
      console.error('[DeckAnalytics] Failed to fetch:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [deckId, period, session]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (deckId) {
      trackEvent('analytics_deck_viewed', { deckId });
    }
  }, [deckId]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    trackEvent('analytics_period_changed', { period: newPeriod, deckId });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{error}</p>
              <Button className="mt-4" onClick={fetchAnalytics}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Presentation Analytics</h1>
              <p className="text-sm text-muted-foreground">Track how your audience engages</p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={period === opt.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handlePeriodChange(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {loading ? (
            <>
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Total Views
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(analytics?.total_views || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card className="relative">
                {!isPaidPlan && <UpgradeOverlay feature="viewer insights" />}
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Unique Viewers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(analytics?.unique_viewers || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card className="relative">
                {!isPaidPlan && <UpgradeOverlay feature="duration tracking" />}
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Avg Duration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatDuration(analytics?.avg_duration_ms || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card className="relative">
                {!isPaidPlan && <UpgradeOverlay feature="slide insights" />}
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Slides Tracked
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics?.top_slides?.length || 0}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Views Over Time Chart */}
        <Card className="mb-6 relative">
          {!isPaidPlan && <UpgradeOverlay feature="detailed charts" />}
          <CardHeader>
            <CardTitle className="text-base">Views Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={analytics?.views_over_time || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => {
                      const date = new Date(d);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                    formatter={(value: number) => [value, 'Views']}
                  />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#FF6B00"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Slide-by-Slide Engagement */}
        <Card className="mb-6 relative">
          {!isPaidPlan && <UpgradeOverlay feature="slide engagement data" />}
          <CardHeader>
            <CardTitle className="text-base">Slide-by-Slide Engagement</CardTitle>
            <CardDescription>Average time spent per slide</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : analytics?.top_slides && analytics.top_slides.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, (analytics.top_slides.length * 36) + 40)}>
                <BarChart
                  data={analytics.top_slides}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(ms: number) => formatDuration(ms)}
                  />
                  <YAxis
                    type="category"
                    dataKey="slide_index"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(idx: number) => `Slide ${idx + 1}`}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatDuration(value), 'Avg Time']}
                    labelFormatter={(idx: number) => `Slide ${idx + 1}`}
                  />
                  <Bar dataKey="avg_time_ms" fill="#FF6B00" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No slide engagement data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device + Source Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Device Breakdown */}
          <Card className="relative">
            {!isPaidPlan && <UpgradeOverlay feature="device insights" />}
            <CardHeader>
              <CardTitle className="text-base">Device Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : analytics?.device_breakdown && Object.keys(analytics.device_breakdown).length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie
                        data={Object.entries(analytics.device_breakdown).map(([name, value]) => ({
                          name,
                          value,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        dataKey="value"
                        stroke="none"
                      >
                        {Object.keys(analytics.device_breakdown).map((key) => (
                          <Cell
                            key={key}
                            fill={(PIE_COLORS as Record<string, string>)[key] || '#94A3B8'}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2">
                    {Object.entries(analytics.device_breakdown).map(([device, count]) => {
                      const Icon = device === 'mobile' ? Smartphone : device === 'tablet' ? Tablet : Monitor;
                      return (
                        <div key={device} className="flex items-center gap-2 text-sm">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: (PIE_COLORS as Record<string, string>)[device] || '#94A3B8',
                            }}
                          />
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="capitalize">{device}</span>
                          <span className="text-muted-foreground ml-auto">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                  No device data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source Breakdown */}
          <Card className="relative">
            {!isPaidPlan && <UpgradeOverlay feature="traffic source data" />}
            <CardHeader>
              <CardTitle className="text-base">Traffic Sources</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : analytics?.source_breakdown && Object.keys(analytics.source_breakdown).length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie
                        data={Object.entries(analytics.source_breakdown).map(([name, value]) => ({
                          name,
                          value,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        dataKey="value"
                        stroke="none"
                      >
                        {Object.keys(analytics.source_breakdown).map((key) => (
                          <Cell
                            key={key}
                            fill={(PIE_COLORS as Record<string, string>)[key] || '#94A3B8'}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2">
                    {Object.entries(analytics.source_breakdown).map(([source, count]) => (
                      <div key={source} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: (PIE_COLORS as Record<string, string>)[source] || '#94A3B8',
                          }}
                        />
                        <span className="capitalize">{source}</span>
                        <span className="text-muted-foreground ml-auto">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                  No source data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Geography */}
        <Card className="mb-6 relative">
          {!isPaidPlan && <UpgradeOverlay feature="geographic insights" />}
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Geography
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[150px] w-full" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Countries */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Top Countries</h4>
                  {analytics?.geography?.countries && analytics.geography.countries.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.geography.countries.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{c.name}</span>
                          <span className="text-muted-foreground">{c.views} views</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No country data yet</p>
                  )}
                </div>

                {/* Cities */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Top Cities</h4>
                  {analytics?.geography?.cities && analytics.geography.cities.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.geography.cities.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{c.name}</span>
                          <span className="text-muted-foreground">{c.views} views</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No city data yet</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back to deck link */}
        <div className="flex justify-center pb-8">
          <Button variant="outline" asChild>
            <Link to={`/deck/${deckId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Deck
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeckAnalytics;
