import React, { useState, useEffect } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DollarSign, TrendingUp, Calculator, RefreshCw, AlertCircle, CheckCircle2,
  Loader2, ArrowUpRight, ArrowDownRight, Minus, PieChart, BarChart3,
  Zap, Brain, Search, Palette, Sparkles
} from 'lucide-react';
import { adminApi, CostsResponse, CostEstimateResponse, ModelPricing } from '@/services/adminApi';
import { cn } from '@/lib/utils';

// Provider colors and icons
const PROVIDER_CONFIG: Record<string, { color: string; bgColor: string; icon: React.ReactNode }> = {
  anthropic: { color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950', icon: <Brain className="h-4 w-4" /> },
  google: { color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950', icon: <Sparkles className="h-4 w-4" /> },
  openai: { color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950', icon: <Zap className="h-4 w-4" /> },
  perplexity: { color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-950', icon: <Search className="h-4 w-4" /> },
  groq: { color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-950', icon: <Zap className="h-4 w-4" /> },
};

const AdminCosts: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [costsData, setCostsData] = useState<CostsResponse | null>(null);
  const [estimateData, setEstimateData] = useState<CostEstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estimate calculator inputs
  const [decksPerDay, setDecksPerDay] = useState(10);
  const [slidesPerDeck, setSlidesPerDeck] = useState(10);
  const [calculatingEstimate, setCalculatingEstimate] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [costs, estimate] = await Promise.all([
        adminApi.getCosts(),
        adminApi.getCostEstimate(decksPerDay, slidesPerDeck)
      ]);
      setCostsData(costs);
      setEstimateData(estimate);
    } catch (err) {
      console.error('Error loading costs data:', err);
      setError('Failed to load costs data');
    } finally {
      setLoading(false);
    }
  };

  const recalculateEstimate = async () => {
    setCalculatingEstimate(true);
    try {
      const estimate = await adminApi.getCostEstimate(decksPerDay, slidesPerDeck);
      setEstimateData(estimate);
    } catch (err) {
      console.error('Error calculating estimate:', err);
    } finally {
      setCalculatingEstimate(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatCurrency = (amount: number) => {
    if (amount < 0.01) return `$${amount.toFixed(4)}`;
    if (amount < 1) return `$${amount.toFixed(3)}`;
    return `$${amount.toFixed(2)}`;
  };

  const getStatusIcon = (source: string) => {
    switch (source) {
      case 'api':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'estimated':
        return <Calculator className="h-4 w-4 text-amber-500" />;
      case 'no_api_key':
      case 'no_admin_key':
      case 'no_billing_api':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'error':
      case 'api_error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (source: string) => {
    switch (source) {
      case 'api':
        return { text: 'Live Data', className: 'border-emerald-500 text-emerald-600 bg-emerald-50' };
      case 'no_admin_key':
        return { text: 'Setup Required', className: 'border-amber-500 text-amber-600 bg-amber-50' };
      case 'no_billing_api':
        return { text: 'Manual Check', className: 'border-blue-500 text-blue-600 bg-blue-50' };
      case 'no_api_key':
        return { text: 'Not Configured', className: 'border-slate-300 text-slate-500 bg-slate-50' };
      case 'error':
      case 'api_error':
        return { text: 'Error', className: 'border-red-500 text-red-600 bg-red-50' };
      default:
        return { text: 'Unknown', className: 'border-slate-300 text-slate-500' };
    }
  };

  if (loading) {
    return (
      <AdminLayoutV2>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading costs data...</p>
          </div>
        </div>
      </AdminLayoutV2>
    );
  }

  return (
    <AdminLayoutV2>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Costs & Usage</h1>
            <p className="text-muted-foreground mt-1">
              Monitor API spending and estimate future costs
            </p>
          </div>
          <Button onClick={loadData} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="overview" className="gap-2">
              <PieChart className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="calculator" className="gap-2">
              <Calculator className="h-4 w-4" />
              Estimator
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Pricing
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Provider Status Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {costsData && Object.entries(costsData.providers).map(([provider, info]) => {
                const config = PROVIDER_CONFIG[provider] || { color: 'text-slate-600', bgColor: 'bg-slate-50', icon: <DollarSign className="h-4 w-4" /> };
                const statusBadge = getStatusBadge(info.source);
                const setupUrl = info.setup_url || info.console_url;

                return (
                  <Card key={provider} className="relative overflow-hidden hover:shadow-md transition-shadow">
                    <div className={cn("absolute inset-0 opacity-30", config.bgColor)} />
                    <CardContent className="relative p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className={cn("p-2.5 rounded-xl", config.bgColor, config.color)}>
                          {config.icon}
                        </div>
                        {getStatusIcon(info.source)}
                      </div>
                      <h3 className="font-semibold capitalize text-lg">{provider}</h3>

                      {info.source === 'api' && info.total_usd !== undefined ? (
                        <>
                          <p className="text-3xl font-bold mt-1 text-primary">
                            {formatCurrency(info.total_usd)}
                          </p>
                          {info.usage && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {((info.usage.total_input_tokens || 0) / 1000000).toFixed(2)}M input / {((info.usage.total_output_tokens || 0) / 1000000).toFixed(2)}M output tokens
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {info.note || 'No data available'}
                        </p>
                      )}

                      <div className="mt-4 flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", statusBadge.className)}>
                          {statusBadge.text}
                        </Badge>
                        {setupUrl && (
                          <a
                            href={setupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            {info.source === 'no_admin_key' ? 'Get Admin Key' : 'View Console'}
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Data Source Notice */}
            <Card className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-dashed">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h4 className="font-medium">About Cost Data</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {costsData?.data_source === 'api'
                        ? 'Real-time cost data is being fetched from provider APIs.'
                        : 'Cost estimates are based on model pricing. To get actual spending data, configure the Anthropic Admin API key (ANTHROPIC_ADMIN_API_KEY).'}
                    </p>
                    {costsData?.estimation_note && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {costsData.estimation_note}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Period Info */}
            {costsData?.period && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Reporting Period</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-sm">
                      {new Date(costsData.period.start).toLocaleDateString()} - {new Date(costsData.period.end).toLocaleDateString()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Calculator Tab */}
          <TabsContent value="calculator" className="space-y-6">
            {/* Input Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Cost Estimator
                </CardTitle>
                <CardDescription>
                  Estimate monthly costs based on expected usage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Decks per Day */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base">Decks per Day</Label>
                      <span className="text-2xl font-bold text-primary">{decksPerDay}</span>
                    </div>
                    <Slider
                      value={[decksPerDay]}
                      onValueChange={(v) => setDecksPerDay(v[0])}
                      max={100}
                      min={1}
                      step={1}
                      className="py-2"
                    />
                    <p className="text-sm text-muted-foreground">
                      {decksPerDay * 30} decks/month
                    </p>
                  </div>

                  {/* Slides per Deck */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base">Slides per Deck</Label>
                      <span className="text-2xl font-bold text-primary">{slidesPerDeck}</span>
                    </div>
                    <Slider
                      value={[slidesPerDeck]}
                      onValueChange={(v) => setSlidesPerDeck(v[0])}
                      max={50}
                      min={1}
                      step={1}
                      className="py-2"
                    />
                    <p className="text-sm text-muted-foreground">
                      {decksPerDay * 30 * slidesPerDeck} slides/month
                    </p>
                  </div>
                </div>

                <Button
                  onClick={recalculateEstimate}
                  disabled={calculatingEstimate}
                  className="w-full md:w-auto"
                >
                  {calculatingEstimate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Calculate Estimate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Estimate Results */}
            {estimateData && (
              <>
                {/* Total Cost Card */}
                <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <CardContent className="py-8">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-2">Estimated Monthly Cost</p>
                      <p className="text-5xl font-bold text-primary">
                        ${estimateData.total_monthly_usd.toFixed(2)}
                      </p>
                      <p className="text-muted-foreground mt-2">
                        Based on {estimateData.input.decks_per_month.toLocaleString()} decks and {estimateData.input.slides_per_month.toLocaleString()} slides
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* By Provider */}
                <div className="grid gap-4 md:grid-cols-4">
                  {Object.entries(estimateData.by_provider).map(([provider, cost]) => {
                    const config = PROVIDER_CONFIG[provider] || { color: 'text-slate-600', bgColor: 'bg-slate-50', icon: <DollarSign className="h-4 w-4" /> };
                    const percentage = (cost / estimateData.total_monthly_usd) * 100;
                    return (
                      <Card key={provider}>
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={cn("p-2 rounded-lg", config.bgColor, config.color)}>
                              {config.icon}
                            </div>
                            <span className="font-medium capitalize">{provider}</span>
                          </div>
                          <p className="text-2xl font-bold">{formatCurrency(cost)}</p>
                          <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", config.bgColor.replace('/50', ''))}
                              style={{ width: `${percentage}%`, backgroundColor: config.color.replace('text-', '').replace('-600', '') }}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">
                            {percentage.toFixed(1)}% of total
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Breakdown Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Cost Breakdown by Operation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {estimateData.breakdown.map((item, idx) => {
                        const config = PROVIDER_CONFIG[item.provider] || { color: 'text-slate-600', bgColor: 'bg-slate-50', icon: <DollarSign className="h-4 w-4" /> };
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between py-4 border-b last:border-0"
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn("p-2 rounded-lg", config.bgColor, config.color)}>
                                {config.icon}
                              </div>
                              <div>
                                <p className="font-medium">{item.operation}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="outline" className="text-xs">
                                    {item.model}
                                  </Badge>
                                  <span>{item.calls_per_month.toLocaleString()} calls/mo</span>
                                </div>
                              </div>
                            </div>
                            <p className="text-xl font-semibold">{formatCurrency(item.cost_usd)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Model Pricing Reference
                </CardTitle>
                <CardDescription>
                  Current pricing per million tokens (as of latest update)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-6">
                    {costsData?.model_pricing && Object.entries(
                      Object.entries(costsData.model_pricing).reduce((acc, [model, pricing]) => {
                        if (!acc[pricing.provider]) acc[pricing.provider] = [];
                        acc[pricing.provider].push({ model, ...pricing });
                        return acc;
                      }, {} as Record<string, (ModelPricing & { model: string })[]>)
                    ).map(([provider, models]) => {
                      const config = PROVIDER_CONFIG[provider] || { color: 'text-slate-600', bgColor: 'bg-slate-50', icon: <DollarSign className="h-4 w-4" /> };
                      return (
                        <div key={provider}>
                          <div className="flex items-center gap-2 mb-4">
                            <div className={cn("p-2 rounded-lg", config.bgColor, config.color)}>
                              {config.icon}
                            </div>
                            <h3 className="text-lg font-semibold capitalize">{provider}</h3>
                          </div>
                          <div className="grid gap-3">
                            {models.map((model) => (
                              <div
                                key={model.model}
                                className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div>
                                  <p className="font-medium font-mono text-sm">{model.model}</p>
                                  {model.per_request && (
                                    <Badge variant="outline" className="mt-1 text-xs">
                                      ${model.per_request}/request
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center gap-4">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Input</p>
                                      <p className="font-semibold text-emerald-600">${model.input.toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Output</p>
                                      <p className="font-semibold text-amber-600">${model.output.toFixed(2)}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminCosts;
