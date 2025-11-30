import React, { useEffect, useState, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminApi, ServiceStatus, ServiceHealthResponse, ModelConfigResponse } from '@/services/adminApi';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Zap,
  Clock,
  Database,
  Bot,
  Image,
  Mail,
  Search,
  Globe,
  Bug,
  Brain,
  Palette,
  Cpu,
  Sparkles,
  FileText,
  Wand2,
  Eye,
  PenTool,
  Settings,
  ToggleRight,
  ToggleLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const serviceIcons: Record<string, React.ElementType> = {
  'Supabase Database': Database,
  'OpenAI API': Bot,
  'Anthropic API': Brain,
  'Brandfetch API': Palette,
  'Unsplash API': Image,
  'Pexels API': Image,
  'SerpAPI': Search,
  'Resend Email': Mail,
  'Perplexity API': Search,
  'Google Gemini': Bot,
  'Firecrawl': Globe,
  'Sentry': Bug,
};

const modelIcons: Record<string, React.ElementType> = {
  slide_generation: Sparkles,
  theme_generation: Palette,
  outline_planning: FileText,
  outline_content: FileText,
  presentation_outline: FileText,
  research: Search,
  image_generation: Image,
  custom_components: Wand2,
  quality_evaluation: Eye,
  visual_analysis: Eye,
  editing: PenTool,
  file_analysis: FileText,
};

const statusConfig = {
  operational: {
    label: 'Operational',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    dotColor: 'bg-emerald-500',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    dotColor: 'bg-amber-500',
  },
  down: {
    label: 'Down',
    icon: XCircle,
    className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    dotColor: 'bg-red-500',
  },
  unknown: {
    label: 'Unknown',
    icon: HelpCircle,
    className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dotColor: 'bg-slate-400',
  },
};

// Helper to format model names nicely
const formatModelName = (model: string): string => {
  return model
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace('Perplexity Sonar', 'Perplexity Sonar')
    .replace('Claude Haiku', 'Claude Haiku')
    .replace('Gemini', 'Gemini');
};

// Helper to get provider from model name
const getModelProvider = (model: string): { name: string; color: string } => {
  if (model.includes('claude') || model.includes('haiku') || model.includes('sonnet') || model.includes('opus')) {
    return { name: 'Anthropic', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950' };
  }
  if (model.includes('gpt') || model.includes('openai')) {
    return { name: 'OpenAI', color: 'text-green-600 bg-green-50 dark:bg-green-950' };
  }
  if (model.includes('gemini')) {
    return { name: 'Google', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950' };
  }
  if (model.includes('perplexity') || model.includes('sonar')) {
    return { name: 'Perplexity', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950' };
  }
  return { name: 'Other', color: 'text-slate-600 bg-slate-50 dark:bg-slate-800' };
};

const ServiceCard: React.FC<{ service: ServiceStatus }> = ({ service }) => {
  const config = statusConfig[service.status] || statusConfig.unknown;
  const Icon = serviceIcons[service.name] || Zap;
  const StatusIcon = config.icon;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
            <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{service.name}</h3>
            {service.details?.type && (
              <p className="text-xs text-slate-500">{service.details.type}</p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={cn('text-xs', config.className)}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
      </div>

      <div className="space-y-2">
        {service.latency_ms !== undefined && service.latency_ms !== null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Latency
            </span>
            <span className={cn(
              'font-mono',
              service.latency_ms < 200 ? 'text-emerald-600' :
              service.latency_ms < 500 ? 'text-amber-600' : 'text-red-600'
            )}>
              {service.latency_ms.toFixed(0)}ms
            </span>
          </div>
        )}

        {service.error && (
          <div className="flex items-start gap-2 text-sm p-2 rounded-lg bg-red-50 dark:bg-red-950/50">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-red-700 dark:text-red-300 text-xs">{service.error}</span>
          </div>
        )}

        {service.details && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(service.details).map(([key, value]) => {
                if (key === 'type') return null;
                return (
                  <span key={key} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ModelCard: React.FC<{ name: string; config: { model: string; description: string; enabled?: boolean; provider?: string } }> = ({ name, config }) => {
  const Icon = modelIcons[name] || Cpu;
  const provider = getModelProvider(config.model);
  const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
            <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white text-sm">{displayName}</h3>
            <p className="text-xs text-slate-500">{config.description}</p>
          </div>
        </div>
        {config.enabled !== undefined && (
          config.enabled ? (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              <ToggleRight className="h-3 w-3 mr-1" />
              On
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">
              <ToggleLeft className="h-3 w-3 mr-1" />
              Off
            </Badge>
          )
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Badge className={cn('text-xs font-mono', provider.color)}>
          {provider.name}
        </Badge>
        <code className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
          {config.model}
        </code>
      </div>
    </div>
  );
};

const AdminServices: React.FC = () => {
  const [healthData, setHealthData] = useState<ServiceHealthResponse | null>(null);
  const [usageData, setUsageData] = useState<Record<string, any> | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [health, usage, config] = await Promise.all([
        adminApi.getServicesHealth(),
        adminApi.getServicesUsage(),
        adminApi.getServicesConfig().catch(() => null),
      ]);
      setHealthData(health);
      setUsageData(usage.usage);
      setModelConfig(config);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching services data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const operationalCount = healthData?.services.filter(s => s.status === 'operational').length || 0;
  const totalCount = healthData?.services.length || 0;
  const degradedCount = healthData?.services.filter(s => s.status === 'degraded').length || 0;
  const downCount = healthData?.services.filter(s => s.status === 'down').length || 0;

  return (
    <AdminLayoutV2>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Services & Configuration</h2>
            <p className="text-slate-500 mt-1">Monitor API health and view model configuration</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-sm text-slate-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Overall Status Banner */}
        {!loading && healthData && (
          <Card className={cn(
            'border-2',
            healthData.overall_status === 'operational' && 'border-emerald-200 dark:border-emerald-800',
            healthData.overall_status === 'degraded' && 'border-amber-200 dark:border-amber-800',
          )}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'p-3 rounded-xl',
                    healthData.overall_status === 'operational' && 'bg-emerald-100 dark:bg-emerald-900/30',
                    healthData.overall_status === 'degraded' && 'bg-amber-100 dark:bg-amber-900/30',
                  )}>
                    {healthData.overall_status === 'operational' ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {healthData.overall_status === 'operational' ? 'All Systems Operational' : 'Some Services Need Attention'}
                    </h3>
                    <p className="text-slate-500 text-sm">
                      {operationalCount} of {totalCount} services running normally
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-xl font-bold text-emerald-600">{operationalCount}</div>
                    <div className="text-xs text-slate-500">Operational</div>
                  </div>
                  {degradedCount > 0 && (
                    <div className="text-center">
                      <div className="text-xl font-bold text-amber-600">{degradedCount}</div>
                      <div className="text-xs text-slate-500">Degraded</div>
                    </div>
                  )}
                  {downCount > 0 && (
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-600">{downCount}</div>
                      <div className="text-xs text-slate-500">Down</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="services" className="space-y-4">
          <TabsList>
            <TabsTrigger value="services" className="gap-2">
              <Zap className="h-4 w-4" />
              Services
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <Cpu className="h-4 w-4" />
              Model Config
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <Settings className="h-4 w-4" />
              Usage
            </TabsTrigger>
          </TabsList>

          {/* Services Tab */}
          <TabsContent value="services" className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="space-y-1 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : healthData && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {healthData.services.map((service) => (
                  <ServiceCard key={service.name} service={service} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models" className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : modelConfig?.models ? (
              <>
                {/* Generation Models */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Generation Models
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {['slide_generation', 'theme_generation', 'custom_components', 'image_generation'].map(key => {
                      const config = modelConfig.models[key];
                      if (!config) return null;
                      return <ModelCard key={key} name={key} config={config} />;
                    })}
                  </div>
                </div>

                {/* Research & Planning Models */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Search className="h-5 w-5 text-blue-500" />
                    Research & Planning
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {['outline_planning', 'outline_content', 'presentation_outline', 'research'].map(key => {
                      const config = modelConfig.models[key];
                      if (!config) return null;
                      return <ModelCard key={key} name={key} config={config} />;
                    })}
                  </div>
                </div>

                {/* Analysis & Quality Models */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Eye className="h-5 w-5 text-emerald-500" />
                    Analysis & Quality
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {['quality_evaluation', 'visual_analysis', 'editing', 'file_analysis'].map(key => {
                      const config = modelConfig.models[key];
                      if (!config) return null;
                      return <ModelCard key={key} name={key} config={config} />;
                    })}
                  </div>
                </div>

                {/* Feature Flags */}
                {modelConfig.feature_flags && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Feature Flags
                      </CardTitle>
                      <CardDescription>Current feature toggles</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(modelConfig.feature_flags).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                            {value ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-xs">On</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Off</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">Model configuration not available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Usage Tab */}
          <TabsContent value="usage" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {usageData?.users && (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">
                      {usageData.users.total_users?.toLocaleString() || 0}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">Total Users</div>
                  </CardContent>
                </Card>
              )}
              {usageData?.decks && (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">
                      {usageData.decks.total_decks?.toLocaleString() || 0}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">Total Decks</div>
                  </CardContent>
                </Card>
              )}
              {usageData?.brandfetch && (
                <>
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        {usageData.brandfetch.cached_brands?.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">Cached Brands</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        {usageData.brandfetch.total_cache_hits?.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">Cache Hits</div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Service Categories Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4 text-blue-500" />
                    AI & LLM Services
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {healthData?.services
                    .filter(s => ['OpenAI API', 'Anthropic API', 'Google Gemini', 'Perplexity API'].includes(s.name))
                    .map(s => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">{s.name}</span>
                        <div className={cn('w-2 h-2 rounded-full', statusConfig[s.status].dotColor)} />
                      </div>
                    ))
                  }
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-4 w-4 text-purple-500" />
                    Media Services
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {healthData?.services
                    .filter(s => ['Unsplash API', 'Pexels API', 'SerpAPI', 'Brandfetch API'].includes(s.name))
                    .map(s => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">{s.name}</span>
                        <div className={cn('w-2 h-2 rounded-full', statusConfig[s.status].dotColor)} />
                      </div>
                    ))
                  }
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" />
                    Infrastructure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {healthData?.services
                    .filter(s => ['Supabase Database', 'Resend Email', 'Sentry', 'Firecrawl'].includes(s.name))
                    .map(s => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">{s.name}</span>
                        <div className={cn('w-2 h-2 rounded-full', statusConfig[s.status].dotColor)} />
                      </div>
                    ))
                  }
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminServices;
