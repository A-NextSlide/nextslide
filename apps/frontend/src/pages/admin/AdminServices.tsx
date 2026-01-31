import React, { useEffect, useState, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { adminApi, ServiceHealthResponse, ModelConfigResponse, ServiceStatus } from '@/services/adminApi';
import {
  RefreshCw,
  Loader2,
  Search,
  GitBranch,
  Layers,
  Image,
  Globe,
  Database,
  Palette,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminIntegrationsPanel from '@/components/admin/AdminIntegrationsPanel';

// ---------------------------------------------------------------------------
// Pipeline configuration – maps each generation step to a health service name
// ---------------------------------------------------------------------------
const PIPELINE_STEPS = [
  { key: 'research', label: 'Research', service: 'Perplexity API', icon: Search, model: 'sonar-pro' },
  { key: 'routing', label: 'Routing', service: 'Anthropic API', icon: GitBranch, model: 'haiku' },
  { key: 'slide_gen', label: 'Slide Gen', service: 'Google Gemini', icon: Layers, model: 'gemini-3-pro' },
  { key: 'image_gen', label: 'Image Gen', service: 'OpenAI API', icon: Image, model: 'gpt-image-1' },
  { key: 'image_search', label: 'Image Search', service: 'SerpAPI', icon: Globe },
  { key: 'storage', label: 'Storage', service: 'Supabase Storage', icon: Database },
  { key: 'brand', label: 'Brand Data', service: 'Brandfetch API', icon: Palette },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

function statusDotColor(status: string) {
  if (status === 'operational') return 'bg-emerald-500';
  if (status === 'degraded') return 'bg-amber-500';
  if (status === 'down') return 'bg-red-500';
  return 'bg-[#999]';
}

function latencyColor(ms: number | undefined | null) {
  if (ms == null) return '';
  if (ms < 200) return 'text-emerald-600';
  if (ms < 500) return 'text-amber-600';
  return 'text-red-600';
}

function findService(services: ServiceStatus[], name: string): ServiceStatus | undefined {
  return services.find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const AdminServices: React.FC = () => {
  const [healthData, setHealthData] = useState<ServiceHealthResponse | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [health, config] = await Promise.all([
        adminApi.getServicesHealth(),
        adminApi.getServicesConfig().catch(() => null),
      ]);
      setHealthData(health);
      setModelConfig(config);
    } catch (error) {
      console.error('Error fetching services data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const operationalCount = healthData?.services.filter(s => s.status === 'operational').length || 0;
  const totalCount = healthData?.services.length || 0;

  // ------- Loading state -------
  if (loading) {
    return (
      <AdminLayoutV2>
        <div className="w-full flex items-center justify-center h-[40vh]">
          <Loader2 className="h-5 w-5 animate-spin text-[#666]" />
        </div>
      </AdminLayoutV2>
    );
  }

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-3">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              System
            </h1>
            <span className="text-[11px] font-mono text-[#666] dark:text-[#888]">
              {operationalCount}/{totalCount}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-7 text-xs px-2.5"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* ── Generation Pipeline ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
            Generation Pipeline
          </h2>
          <div className={cn(cardClass, "mt-1.5 pt-10 pb-4 px-3 overflow-x-auto")}>
            <div className="flex items-end gap-1 min-w-max">
              {PIPELINE_STEPS.map((step, idx) => {
                const svc = healthData ? findService(healthData.services, step.service) : undefined;
                const Icon = step.icon;
                // Podium arc: center node (idx 3) is highest, tapers to edges
                const center = (PIPELINE_STEPS.length - 1) / 2;
                const dist = Math.abs(idx - center);
                const lift = Math.round((center - dist) * 10); // 0, 10, 20, 30, 20, 10, 0
                const isCenter = idx === Math.round(center);
                return (
                  <React.Fragment key={step.key}>
                    {/* Node */}
                    <div
                      className="flex flex-col items-center w-[92px] shrink-0 transition-transform"
                      style={{ transform: `translateY(-${lift}px)` }}
                    >
                      <div
                        className={cn(
                          "relative rounded-xl border flex items-center justify-center transition-all",
                          isCenter
                            ? "w-16 h-16 border-[#FF4301]/40 shadow-[0_0_0_2px_rgba(255,67,1,0.08)]"
                            : "w-14 h-14 border-[#eaeaea] dark:border-[#333]",
                          "hover:border-[#FF4301]/50 hover:shadow-[0_0_0_1px_rgba(255,67,1,0.1)]",
                        )}
                      >
                        <Icon className={cn(
                          isCenter ? "h-6 w-6 text-[#FF4301]" : "h-5 w-5 text-[#666] dark:text-[#aaa]",
                        )} />
                        {/* Status dot */}
                        <span
                          className={cn(
                            "absolute -top-1 -right-1 rounded-full ring-2 ring-white dark:ring-[#111]",
                            isCenter ? "h-3 w-3" : "h-2.5 w-2.5",
                            svc ? statusDotColor(svc.status) : 'bg-[#ccc] dark:bg-[#555]',
                          )}
                        />
                      </div>
                      <span className={cn(
                        "mt-1.5 font-medium text-center leading-tight",
                        isCenter ? "text-xs text-[#FF4301]" : "text-[11px]",
                      )}>{step.label}</span>
                      {svc?.latency_ms != null ? (
                        <span className={cn("mt-0.5 text-[10px] font-mono", latencyColor(svc.latency_ms))}>
                          {svc.latency_ms.toFixed(0)}ms
                        </span>
                      ) : (
                        <span className="mt-0.5 text-[10px] font-mono text-[#ccc] dark:text-[#555]">—</span>
                      )}
                    </div>
                    {/* Arrow connector — follows the arc between adjacent nodes */}
                    {idx < PIPELINE_STEPS.length - 1 && (() => {
                      const nextDist = Math.abs(idx + 1 - center);
                      const avgLift = Math.round(((center - dist) + (center - nextDist)) / 2 * 10);
                      return (
                        <div
                          className="flex items-center shrink-0 transition-transform"
                          style={{ transform: `translateY(-${avgLift}px)` }}
                        >
                          <ChevronRight className="h-3.5 w-3.5 text-[#ccc] dark:text-[#555]" />
                        </div>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── All Services ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
            All Services
          </h2>
          <div className={cn(cardClass, "mt-1.5 divide-y divide-[#eaeaea] dark:divide-[#333]")}>
            {healthData?.services.map((service) => (
              <div
                key={service.name}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[#fafafa] dark:hover:bg-[#1a1a1a] transition-colors"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotColor(service.status))} />
                <span className="text-sm font-medium flex-1 truncate">{service.name}</span>
                {service.latency_ms != null && (
                  <span className={cn("text-xs font-mono tabular-nums", latencyColor(service.latency_ms))}>
                    {service.latency_ms.toFixed(0)}ms
                  </span>
                )}
                {service.error && (
                  <span className="text-[10px] text-red-500 truncate max-w-[180px]">{service.error}</span>
                )}
              </div>
            ))}
            {(!healthData?.services || healthData.services.length === 0) && (
              <div className="px-3 py-4 text-xs text-[#999] text-center">No services reported</div>
            )}
          </div>
        </section>

        {/* ── Models + Feature Flags (side-by-side) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-start">
          {/* Models (3/5) */}
          <section className={modelConfig?.models ? "lg:col-span-3" : "lg:col-span-5"}>
            <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Models
            </h2>
            <div className={cn(cardClass, "mt-1.5 divide-y divide-[#eaeaea] dark:divide-[#333] overflow-hidden")}>
              {modelConfig?.models ? Object.entries(modelConfig.models).map(([key, config]) => (
                <div
                  key={key}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#fafafa] dark:hover:bg-[#1a1a1a] transition-colors"
                >
                  <span className="text-sm flex-1 capitalize truncate">{key.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-[10px] bg-[#f5f5f5] dark:bg-[#1a1a1a] px-1.5 py-0.5 rounded">
                    {config.model}
                  </span>
                  {config.enabled === false ? (
                    <span className="text-[10px] text-[#999]">off</span>
                  ) : (
                    <span className="text-[10px] text-emerald-600">on</span>
                  )}
                </div>
              )) : (
                <div className="px-3 py-4 text-xs text-[#999] text-center">No model config</div>
              )}
            </div>
          </section>

          {/* Feature Flags (2/5) */}
          <section className={modelConfig?.models ? "lg:col-span-2" : "lg:col-span-5"}>
            <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Feature Flags
            </h2>
            <div className={cn(cardClass, "mt-1.5 p-3 overflow-hidden")}>
              {modelConfig?.feature_flags ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(modelConfig.feature_flags).map(([key, value]) => (
                    <span
                      key={key}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full",
                        value
                          ? "bg-[#FF4301]/10 text-[#FF4301]"
                          : "bg-[#f0f0f0] text-[#999] dark:bg-[#222]",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1 w-1 rounded-full",
                          value ? "bg-[#FF4301]" : "bg-[#ccc] dark:bg-[#555]",
                        )}
                      />
                      {key}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#999] text-center py-1">No flags</div>
              )}
            </div>
          </section>
        </div>

        {/* ── Integrations ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
            Integrations
          </h2>
          <div className="mt-1.5">
            <AdminIntegrationsPanel />
          </div>
        </section>
      </div>
    </AdminLayoutV2>
  );
};

export default AdminServices;
