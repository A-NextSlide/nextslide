/**
 * Aggregate Analytics Dashboard
 *
 * Route: /analytics
 *
 * Shows aggregate analytics across all presentations for the current user:
 * - Total views across all presentations
 * - Weekly trend chart
 * - Most popular presentations ranked
 * - Unique viewer count
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Eye, Users, TrendingUp, BarChart3, ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useCredits } from '@/context/CreditsContext';
import { trackEvent } from '@/services/analytics';
import {
  getAggregateDashboard,
  type AggregateDashboard as AggregateDashboardType,
} from '@/services/analyticsApi';

const PERIOD_OPTIONS = [
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

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

const AnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { balance } = useCredits();

  const [dashboard, setDashboard] = useState<AggregateDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');

  const isPaidPlan = balance?.plan_id === 'starter' || balance?.plan_id === 'pro' || balance?.plan_id === 'enterprise';

  const fetchDashboard = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAggregateDashboard(period);
      setDashboard(data);
    } catch (err: any) {
      console.error('[AnalyticsDashboard] Failed to fetch:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [session, period]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    trackEvent('analytics_dashboard_viewed');
  }, []);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    trackEvent('analytics_period_changed', { period: newPeriod });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/app')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Decks
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{error}</p>
              <Button className="mt-4" onClick={fetchDashboard}>
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/app')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Analytics Overview</h1>
              <p className="text-sm text-muted-foreground">How your presentations are performing</p>
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {loading ? (
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
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
                  <div className="text-3xl font-bold">
                    {formatNumber(dashboard?.total_views || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across all presentations
                  </p>
                </CardContent>
              </Card>

              <Card className="relative">
                {!isPaidPlan && <UpgradeOverlay feature="audience insights" />}
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Unique Viewers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatNumber(dashboard?.total_unique_viewers || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your audience size
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Presentations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {dashboard?.most_popular_decks?.length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    With views in this period
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Weekly Trend Chart */}
        <Card className="mb-6 relative">
          {!isPaidPlan && <UpgradeOverlay feature="trend charts" />}
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Weekly Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : dashboard?.weekly_trend && dashboard.weekly_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dashboard.weekly_trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(w: string) => {
                      const date = new Date(w);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(w: string) => `Week of ${new Date(w).toLocaleDateString()}`}
                    formatter={(value: number) => [value, 'Views']}
                  />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#FF6B00"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No trend data yet. Share your presentations to see views.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Popular Presentations */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Most Popular Presentations</CardTitle>
            <CardDescription>Ranked by total views</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : dashboard?.most_popular_decks && dashboard.most_popular_decks.length > 0 ? (
              <div className="space-y-2">
                {dashboard.most_popular_decks.map((deck, index) => (
                  <Link
                    key={deck.deck_uuid}
                    to={`/analytics/${deck.deck_uuid}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <span className="text-sm font-bold text-muted-foreground w-6 text-center">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {deck.name || 'Untitled'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      <span>{deck.views}</span>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No presentations with views yet. Share a presentation to start tracking.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back to decks */}
        <div className="flex justify-center pb-8">
          <Button variant="outline" asChild>
            <Link to="/app">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Decks
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
