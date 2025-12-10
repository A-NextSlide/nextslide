/**
 * Integrations Dialog
 *
 * Modal for managing user integrations.
 * Handles OAuth connection flow via Nango Connect UI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Filter } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { IntegrationCard } from './IntegrationCard';
import {
  getUserIntegrations,
  createConnectSession,
  disconnectIntegration,
  createReconnectSession,
  groupByCategory,
  getConnectedIntegrations,
  getCategoryInfo,
  type IntegrationInfo,
  type IntegrationCategory,
} from '@/services/integrationsApi';

interface IntegrationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a specific integration to connect */
  preselectedIntegration?: string;
}

export function IntegrationsDialog({
  open,
  onOpenChange,
  preselectedIntegration,
}: IntegrationsDialogProps) {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [categories, setCategories] = useState<IntegrationCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Load integrations
  const loadIntegrations = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getUserIntegrations();
      setIntegrations(data.integrations);
      setCategories(data.categories);
    } catch (error) {
      console.error('Failed to load integrations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load integrations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      loadIntegrations();
    }
  }, [open, loadIntegrations]);

  // Handle preselected integration
  useEffect(() => {
    if (open && preselectedIntegration && integrations.length > 0) {
      const integration = integrations.find(
        (i) => i.id === preselectedIntegration
      );
      if (integration && !integration.connected) {
        handleConnect(integration);
      }
    }
  }, [open, preselectedIntegration, integrations]);

  // Open Nango Connect UI
  const openNangoConnect = async (token: string) => {
    try {
      // Dynamically import Nango frontend SDK
      const { default: Nango } = await import('@nangohq/frontend');
      const nango = new Nango();

      return new Promise<boolean>((resolve) => {
        const connect = nango.openConnectUI({
          onEvent: (event: any) => {
            if (event.type === 'close') {
              resolve(false);
            } else if (event.type === 'connect') {
              resolve(true);
            }
          },
        });

        connect.setSessionToken(token);
      });
    } catch (error) {
      console.error('Failed to open Nango Connect:', error);
      throw error;
    }
  };

  // Connect an integration
  const handleConnect = async (integration: IntegrationInfo) => {
    try {
      setIsConnecting(true);

      // Create session for this specific integration
      const session = await createConnectSession([integration.id]);

      // Open Nango Connect UI
      const success = await openNangoConnect(session.token);

      if (success) {
        toast({
          title: 'Connected',
          description: `Successfully connected to ${integration.name}`,
        });
        // Reload to get updated status
        await loadIntegrations();
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      toast({
        title: 'Connection Failed',
        description: `Failed to connect to ${integration.name}. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect an integration
  const handleDisconnect = async (integration: IntegrationInfo) => {
    try {
      setIsConnecting(true);
      await disconnectIntegration(integration.id);

      toast({
        title: 'Disconnected',
        description: `Disconnected from ${integration.name}`,
      });

      // Reload to get updated status
      await loadIntegrations();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast({
        title: 'Error',
        description: `Failed to disconnect from ${integration.name}`,
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Reconnect an expired integration
  const handleReconnect = async (integration: IntegrationInfo) => {
    try {
      setIsConnecting(true);

      const session = await createReconnectSession(integration.id);
      const success = await openNangoConnect(session.token);

      if (success) {
        toast({
          title: 'Reconnected',
          description: `Successfully reconnected to ${integration.name}`,
        });
        await loadIntegrations();
      }
    } catch (error) {
      console.error('Failed to reconnect:', error);
      toast({
        title: 'Reconnection Failed',
        description: `Failed to reconnect to ${integration.name}. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Filter integrations
  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearch =
      !searchQuery ||
      integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'all' || integration.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const connectedIntegrations = getConnectedIntegrations(filteredIntegrations);
  const groupedIntegrations = groupByCategory(filteredIntegrations);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Integrations</DialogTitle>
          <DialogDescription>
            Connect your apps to pull data directly into your presentations
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filter */}
        <div className="flex gap-3 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-md border bg-background text-sm"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="all">
                All ({filteredIntegrations.length})
              </TabsTrigger>
              <TabsTrigger value="connected">
                Connected ({connectedIntegrations.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[50vh]">
                {Object.keys(groupedIntegrations).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No integrations found
                  </div>
                ) : (
                  <div className="space-y-6 pr-4">
                    {Object.entries(groupedIntegrations).map(
                      ([category, items]) => (
                        <div key={category}>
                          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                            {getCategoryInfo(category).label}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {items.map((integration) => (
                              <IntegrationCard
                                key={integration.id}
                                integration={integration}
                                onConnect={handleConnect}
                                onDisconnect={handleDisconnect}
                                onReconnect={handleReconnect}
                                isLoading={isConnecting}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="connected" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-[50vh]">
                {connectedIntegrations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No integrations connected yet</p>
                    <p className="text-sm mt-1">
                      Connect an app to start pulling data into your
                      presentations
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
                    {connectedIntegrations.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        onReconnect={handleReconnect}
                        isLoading={isConnecting}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
