import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { adminApi, ServiceHealthResponse, ModelConfigResponse } from '@/services/adminApi';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminIntegrationsPanel from '@/components/admin/AdminIntegrationsPanel';

const systemTabs = [
  { id: 'health', label: 'Health' },
  { id: 'integrations', label: 'Integrations' },
];

const AdminServices: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialTab = systemTabs.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'health';
  const [activeTab, setActiveTab] = useState(initialTab);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'down':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-[#999]" />;
    }
  };

  const operationalCount = healthData?.services.filter(s => s.status === 'operational').length || 0;
  const totalCount = healthData?.services.length || 0;

  const renderHealth = () => {
    if (loading) {
      return (
        <div className="w-full flex items-center justify-center h-[40vh]">
          <Loader2 className="h-5 w-5 animate-spin text-[#666]" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Health Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#666] dark:text-[#888]">
            {operationalCount}/{totalCount} operational
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {healthData?.services.map((service) => (
            <div
              key={service.name}
              className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{service.name}</span>
                {getStatusIcon(service.status)}
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-[#666] dark:text-[#888]">
                {service.latency_ms !== undefined && service.latency_ms !== null && (
                  <span className={cn(
                    "font-mono",
                    service.latency_ms < 200 && "text-emerald-600",
                    service.latency_ms >= 200 && service.latency_ms < 500 && "text-amber-600",
                    service.latency_ms >= 500 && "text-red-600"
                  )}>
                    {service.latency_ms.toFixed(0)}ms
                  </span>
                )}
                {service.error && (
                  <span className="text-red-500 truncate">{service.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Model Config */}
        {modelConfig?.models && (
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden">
            <div className="p-4 border-b border-[#eaeaea] dark:border-[#333]">
              <h2 className="text-sm font-medium">Model Configuration</h2>
              <p className="text-xs text-[#666] dark:text-[#888]">Active models for each operation</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#eaeaea] dark:border-[#333] text-xs text-[#666] dark:text-[#888]">
                  <th className="text-left p-3 font-medium">Operation</th>
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(modelConfig.models).map(([key, config]) => (
                  <tr key={key} className="border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                    <td className="p-3 capitalize">{key.replace(/_/g, ' ')}</td>
                    <td className="p-3 font-mono text-xs text-[#666] dark:text-[#888]">{config.model}</td>
                    <td className="p-3">
                      {config.enabled === false ? (
                        <span className="text-xs text-[#999]">Disabled</span>
                      ) : (
                        <span className="text-xs text-emerald-600">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Feature Flags */}
        {modelConfig?.feature_flags && (
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden">
            <div className="p-4 border-b border-[#eaeaea] dark:border-[#333]">
              <h2 className="text-sm font-medium">Feature Flags</h2>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(modelConfig.feature_flags).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-[#666] dark:text-[#888] text-xs truncate mr-2">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className={cn(
                    "text-xs font-medium",
                    value ? "text-emerald-600" : "text-[#999]"
                  )}>
                    {value ? 'On' : 'Off'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold">System</h1>
          <p className="text-sm text-[#666] dark:text-[#888]">Service health, models, and integrations</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-[#eaeaea] dark:border-[#333]">
          <div className="flex gap-0 -mb-px">
            {systemTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-black dark:border-white text-black dark:text-white'
                    : 'border-transparent text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'health' ? renderHealth() : <AdminIntegrationsPanel />}
      </div>
    </AdminLayoutV2>
  );
};

export default AdminServices;
