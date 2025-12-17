/**
 * Admin Integrations Page
 *
 * Admin page to manage system-wide integrations.
 * Enable/disable integrations and configure their settings.
 */

import React, { useState, useEffect } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  Settings,
  Plug,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  getAllIntegrationsAdmin,
  updateIntegrationSettings,
  type IntegrationSettings,
} from '@/services/integrationsApi';
import { IntegrationIcon, getIntegrationColor } from '@/components/integrations/IntegrationIcon';

const AdminIntegrations: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Load integrations
  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const data = await getAllIntegrationsAdmin();
        setIntegrations(data);
      } catch (error) {
        console.error('Failed to load integrations:', error);
        toast({
          title: 'Error',
          description: 'Failed to load integrations',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchIntegrations();
  }, []);

  const handleToggleIntegration = async (integrationId: string, enabled: boolean) => {
    setUpdating(integrationId);
    try {
      await updateIntegrationSettings(integrationId, { enabled });

      // Update local state
      setIntegrations((prev) =>
        prev.map((int) =>
          int.id === integrationId ? { ...int, enabled } : int
        )
      );

      toast({
        title: enabled ? 'Integration Enabled' : 'Integration Disabled',
        description: `${integrationId} has been ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('Failed to update integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to update integration',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <AdminLayoutV2>
      <div className="p-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold mb-1">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Manage system-wide integration settings. Enable integrations to make them available via @mentions in chat.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : integrations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Plug className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No integrations available</p>
              <p className="text-sm text-muted-foreground">
                Add integrations to the registry to enable them here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Integration Cards */}
            <div className="space-y-3">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  isUpdating={updating === integration.id}
                  onToggle={(enabled) =>
                    handleToggleIntegration(integration.id, enabled)
                  }
                />
              ))}
            </div>

            {/* Info Section */}
            <Separator />
            <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Info className="w-4 h-4" />
                  How Integrations Work
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-700/80 dark:text-blue-300/80 space-y-2">
                <p>
                  Enabled integrations become available in chat via <kbd className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 rounded text-xs font-mono">@mentions</kbd>.
                </p>
                <p>
                  Users can type <kbd className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 rounded text-xs font-mono">@linkedin</kbd> in the chat to trigger LinkedIn profile lookups.
                </p>
                <p>
                  <strong>System integrations</strong> (like LinkedIn via Apollo) use your API key - no user OAuth needed.
                </p>
                <p>
                  <strong>User integrations</strong> (via Nango) require each user to connect their own account.
                </p>
              </CardContent>
            </Card>

            {/* Adding New Integrations */}
            <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <Settings className="w-4 h-4" />
                  Adding New Integrations
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-700/80 dark:text-amber-300/80 space-y-2">
                <p>
                  To add a new integration, update the <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded text-xs font-mono">integration_registry.py</code> file:
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Add the integration config to <code className="text-xs font-mono">INTEGRATION_REGISTRY</code></li>
                  <li>Set the provider (Apollo for system API, Nango for OAuth)</li>
                  <li>Define capabilities and default enabled status</li>
                  <li>Create the corresponding tool in <code className="text-xs font-mono">tools.py</code></li>
                </ol>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayoutV2>
  );
};

// Integration Card Component
interface IntegrationCardProps {
  integration: IntegrationSettings;
  isUpdating: boolean;
  onToggle: (enabled: boolean) => void;
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integration,
  isUpdating,
  onToggle,
}) => {
  const brandColor = getIntegrationColor(integration.id);

  return (
    <Card className={cn(
      'transition-all duration-200',
      integration.enabled && 'ring-1 ring-green-500/30 bg-green-50/30 dark:bg-green-950/10'
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: brandColor ? `${brandColor}15` : 'hsl(var(--muted))',
            }}
          >
            <IntegrationIcon
              integrationId={integration.id}
              size="xl"
              variant="colored"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">{integration.name}</h3>
              {integration.enabled && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              )}
              {!integration.enabled && (
                <Badge variant="secondary" className="text-xs">
                  Disabled
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {integration.description}
            </p>

            {/* Capabilities */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {integration.capabilities.map((cap) => (
                <Badge key={cap} variant="outline" className="text-xs">
                  {cap}
                </Badge>
              ))}
            </div>

            {/* Provider info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                Provider: <span className="font-medium capitalize">{integration.provider}</span>
              </span>
              {!integration.requires_user_connection && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="w-3 h-3" />
                  System API (no user OAuth)
                </span>
              )}
              {integration.requires_user_connection && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  Requires user OAuth
                </span>
              )}
            </div>
          </div>

          {/* Toggle */}
          <div className="shrink-0 flex flex-col items-end gap-1">
            {isUpdating ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={integration.enabled}
                onCheckedChange={onToggle}
                aria-label={`Toggle ${integration.name}`}
              />
            )}
            <span className="text-[10px] text-muted-foreground">
              {integration.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminIntegrations;
