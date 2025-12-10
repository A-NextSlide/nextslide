/**
 * Integration Card Component
 *
 * Displays a single integration with its status and connect/disconnect actions.
 */

import React from 'react';
import {
  Cloud,
  Target,
  Mail,
  Calendar,
  HardDrive,
  FileText,
  MessageCircle,
  Users,
  CheckSquare,
  Layers,
  Clipboard,
  BarChart,
  Video,
  Plug,
  Check,
  X,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IntegrationInfo } from '@/services/integrationsApi';
import { getCategoryInfo } from '@/services/integrationsApi';

interface IntegrationCardProps {
  integration: IntegrationInfo;
  onConnect: (integration: IntegrationInfo) => void;
  onDisconnect: (integration: IntegrationInfo) => void;
  onReconnect?: (integration: IntegrationInfo) => void;
  isLoading?: boolean;
  compact?: boolean;
}

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  salesforce: Cloud,
  hubspot: Target,
  pipedrive: Target,
  linkedin: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  twitter: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  gmail: Mail,
  outlook: Mail,
  'google-calendar': Calendar,
  'google-drive': HardDrive,
  dropbox: HardDrive,
  onedrive: Cloud,
  notion: FileText,
  confluence: FileText,
  slack: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  ),
  discord: MessageCircle,
  teams: Users,
  asana: CheckSquare,
  linear: Layers,
  jira: Clipboard,
  trello: Clipboard,
  github: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  figma: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zM8.148 24c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v4.49c0 2.476-2.014 4.49-4.588 4.49zm-.001-7.509a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.355 3.019 3.019 3.019s3.019-1.355 3.019-3.019v-3.019H8.147zM8.148 8.981c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981H8.148zm-.001-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.355 3.019 3.019 3.019h3.117V1.471H8.147zM8.148 15.019c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98H8.148zm3.117-7.509H8.148a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.355 3.019 3.019 3.019h3.117V7.51zM15.852 15.019h-4.588V6.039h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-3.117-7.509v5.999h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-2.98-3.019-2.98h-3.117z" />
    </svg>
  ),
  'google-analytics': BarChart,
  zoom: Video,
  youtube: Video,
};

function getIcon(iconName: string): React.ElementType {
  return iconMap[iconName] || Plug;
}

export function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  onReconnect,
  isLoading = false,
  compact = false,
}: IntegrationCardProps) {
  const Icon = getIcon(integration.icon);
  const categoryInfo = getCategoryInfo(integration.category);
  const isExpired = integration.status === 'expired';
  const isError = integration.status === 'error';

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-colors',
          integration.connected
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-muted/50 border-border hover:border-primary/50'
        )}
      >
        <div
          className={cn(
            'w-8 h-8 rounded-md flex items-center justify-center',
            integration.connected ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{integration.name}</div>
          {integration.connected && integration.account_email && (
            <div className="text-xs text-muted-foreground truncate">
              {integration.account_email}
            </div>
          )}
        </div>
        {integration.connected ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            onClick={() => onDisconnect(integration)}
            disabled={isLoading}
          >
            <X className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConnect(integration)}
            disabled={isLoading}
          >
            Connect
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col p-4 rounded-xl border transition-all',
        integration.connected
          ? isExpired || isError
            ? 'bg-yellow-500/5 border-yellow-500/20'
            : 'bg-green-500/5 border-green-500/20'
          : 'bg-card border-border hover:border-primary/50 hover:shadow-md'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
            integration.connected
              ? isExpired || isError
                ? 'bg-yellow-500/10 text-yellow-600'
                : 'bg-green-500/10 text-green-600'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {typeof Icon === 'function' && Icon.length === 0 ? (
            <Icon />
          ) : (
            <Icon className="w-6 h-6" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{integration.name}</h3>
            {integration.connected && (
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            )}
          </div>
          <Badge variant="outline" className="mt-1 text-xs">
            {categoryInfo.label}
          </Badge>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
        {integration.description}
      </p>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mt-3">
        {integration.capabilities.slice(0, 3).map((cap) => (
          <span
            key={cap}
            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
          >
            {cap.replace('_', ' ')}
          </span>
        ))}
        {integration.capabilities.length > 3 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            +{integration.capabilities.length - 3}
          </span>
        )}
      </div>

      {/* Connected Account Info */}
      {integration.connected && integration.account_email && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-xs text-muted-foreground">Connected as</div>
          <div className="text-sm font-medium truncate">
            {integration.account_name || integration.account_email}
          </div>
        </div>
      )}

      {/* Status Warning */}
      {integration.connected && (isExpired || isError) && (
        <div className="mt-3 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2 text-yellow-600 text-sm">
            <RefreshCw className="w-4 h-4" />
            <span>
              {isExpired ? 'Connection expired' : 'Connection error'}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 pt-3 border-t border-border/50">
        {integration.connected ? (
          <div className="flex gap-2">
            {(isExpired || isError) && onReconnect ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onReconnect(integration)}
                disabled={isLoading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reconnect
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                'text-red-500 hover:text-red-600 hover:bg-red-500/10',
                isExpired || isError ? '' : 'flex-1'
              )}
              onClick={() => onDisconnect(integration)}
              disabled={isLoading}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={() => onConnect(integration)}
            disabled={isLoading}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Connect {integration.name}
          </Button>
        )}
      </div>
    </div>
  );
}
