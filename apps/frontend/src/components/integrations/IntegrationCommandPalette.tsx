/**
 * Integration Command Palette
 *
 * A "/" triggered command palette for quickly accessing integrations.
 * Shows connected apps and their available actions.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Cloud,
  Mail,
  FileText,
  MessageCircle,
  Search,
  Plus,
  Check,
  User,
  Building2,
  FolderOpen,
  Database,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getUserIntegrations,
  getConnectedIntegrations,
  type IntegrationInfo,
} from '@/services/integrationsApi';

interface IntegrationAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  integrationId: string;
  action: string;
}

interface IntegrationCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (action: IntegrationAction) => void;
  onManageIntegrations: () => void;
  /** Anchor element for positioning */
  anchorRef?: React.RefObject<HTMLElement>;
  /** Position relative to anchor */
  position?: 'above' | 'below';
}

// Define actions for each integration type
const INTEGRATION_ACTIONS: Record<string, Omit<IntegrationAction, 'integrationId'>[]> = {
  linkedin: [
    {
      id: 'linkedin_person',
      label: 'Look up person',
      description: 'Find LinkedIn profile by name or URL',
      icon: User,
      action: 'linkedin_lookup',
    },
    {
      id: 'linkedin_company',
      label: 'Research company',
      description: 'Get company info and employees',
      icon: Building2,
      action: 'linkedin_company',
    },
  ],
  salesforce: [
    {
      id: 'sf_contact',
      label: 'Find contact',
      description: 'Search Salesforce contacts',
      icon: User,
      action: 'salesforce_contact',
    },
    {
      id: 'sf_account',
      label: 'Find account',
      description: 'Search Salesforce accounts',
      icon: Building2,
      action: 'salesforce_account',
    },
    {
      id: 'sf_deal',
      label: 'Find opportunity',
      description: 'Search deals and opportunities',
      icon: Database,
      action: 'salesforce_opportunity',
    },
  ],
  hubspot: [
    {
      id: 'hs_contact',
      label: 'Find contact',
      description: 'Search HubSpot contacts',
      icon: User,
      action: 'hubspot_contact',
    },
    {
      id: 'hs_company',
      label: 'Find company',
      description: 'Search HubSpot companies',
      icon: Building2,
      action: 'hubspot_company',
    },
  ],
  'google-mail': [
    {
      id: 'gmail_search',
      label: 'Search emails',
      description: 'Find relevant email threads',
      icon: Mail,
      action: 'gmail_search',
    },
  ],
  gmail: [
    {
      id: 'gmail_search',
      label: 'Search emails',
      description: 'Find relevant email threads',
      icon: Mail,
      action: 'gmail_search',
    },
  ],
  'google-drive': [
    {
      id: 'gdrive_search',
      label: 'Search files',
      description: 'Find documents and files',
      icon: FolderOpen,
      action: 'gdrive_search',
    },
    {
      id: 'gdrive_recent',
      label: 'Recent files',
      description: 'Show recently modified files',
      icon: FileText,
      action: 'gdrive_recent',
    },
  ],
  notion: [
    {
      id: 'notion_search',
      label: 'Search pages',
      description: 'Find Notion pages and databases',
      icon: Search,
      action: 'notion_search',
    },
  ],
  slack: [
    {
      id: 'slack_search',
      label: 'Search messages',
      description: 'Find Slack conversations',
      icon: MessageCircle,
      action: 'slack_search',
    },
  ],
};

// Icon mapping for integrations
const INTEGRATION_ICONS: Record<string, React.ElementType> = {
  linkedin: User,
  salesforce: Cloud,
  hubspot: Cloud,
  'google-mail': Mail,
  gmail: Mail,
  'google-drive': FolderOpen,
  notion: FileText,
  slack: MessageCircle,
};

export function IntegrationCommandPalette({
  open,
  onOpenChange,
  onSelectAction,
  onManageIntegrations,
  anchorRef,
  position = 'above',
}: IntegrationCommandPaletteProps) {
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Load connected integrations
  useEffect(() => {
    if (open) {
      loadIntegrations();
    }
  }, [open]);

  const loadIntegrations = async () => {
    try {
      setIsLoading(true);
      const data = await getUserIntegrations();
      setIntegrations(getConnectedIntegrations(data.integrations));
    } catch (error) {
      console.error('Failed to load integrations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Build available actions from connected integrations
  const availableActions = useMemo(() => {
    const actions: IntegrationAction[] = [];

    for (const integration of integrations) {
      const integrationActions = INTEGRATION_ACTIONS[integration.id];
      if (integrationActions) {
        for (const action of integrationActions) {
          actions.push({
            ...action,
            integrationId: integration.id,
          });
        }
      }
    }

    return actions;
  }, [integrations]);

  // Filter actions by search
  const filteredActions = useMemo(() => {
    if (!searchValue) return availableActions;

    const query = searchValue.toLowerCase();
    return availableActions.filter(
      (action) =>
        action.label.toLowerCase().includes(query) ||
        action.description.toLowerCase().includes(query)
    );
  }, [availableActions, searchValue]);

  // Group actions by integration
  const groupedActions = useMemo(() => {
    const groups: Record<string, IntegrationAction[]> = {};

    for (const action of filteredActions) {
      if (!groups[action.integrationId]) {
        groups[action.integrationId] = [];
      }
      groups[action.integrationId].push(action);
    }

    return groups;
  }, [filteredActions]);

  const handleSelect = useCallback(
    (action: IntegrationAction) => {
      onSelectAction(action);
      onOpenChange(false);
      setSearchValue('');
    },
    [onSelectAction, onOpenChange]
  );

  const getIntegrationName = (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    return integration?.name || id;
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span className="sr-only">Integration commands</span>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        align="start"
        side={position === 'above' ? 'top' : 'bottom'}
        sideOffset={8}
      >
        <Command className="rounded-lg border-0">
          <CommandInput
            placeholder="Search integrations..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            {integrations.length === 0 && !isLoading ? (
              <CommandEmpty>
                <div className="py-6 text-center">
                  <Plug className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No integrations connected
                  </p>
                  <button
                    onClick={() => {
                      onManageIntegrations();
                      onOpenChange(false);
                    }}
                    className="text-sm text-primary hover:underline mt-2"
                  >
                    Connect an app
                  </button>
                </div>
              </CommandEmpty>
            ) : filteredActions.length === 0 ? (
              <CommandEmpty>No matching actions found</CommandEmpty>
            ) : (
              <>
                {Object.entries(groupedActions).map(
                  ([integrationId, actions], index) => (
                    <React.Fragment key={integrationId}>
                      {index > 0 && <CommandSeparator />}
                      <CommandGroup
                        heading={
                          <div className="flex items-center gap-2">
                            {React.createElement(
                              INTEGRATION_ICONS[integrationId] || Plug,
                              { className: 'w-4 h-4' }
                            )}
                            <span>{getIntegrationName(integrationId)}</span>
                            <Check className="w-3 h-3 text-green-500" />
                          </div>
                        }
                      >
                        {actions.map((action) => (
                          <CommandItem
                            key={action.id}
                            value={`${action.integrationId}-${action.id}`}
                            onSelect={() => handleSelect(action)}
                            className="flex items-center gap-3 py-2"
                          >
                            <action.icon className="w-4 h-4 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{action.label}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {action.description}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </React.Fragment>
                  )
                )}
              </>
            )}

            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onManageIntegrations();
                  onOpenChange(false);
                }}
                className="flex items-center gap-3 py-2"
              >
                <Plus className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">Manage integrations</div>
                  <div className="text-xs text-muted-foreground">
                    Connect or disconnect apps
                  </div>
                </div>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Hook to detect "/" command and show the palette
 */
export function useIntegrationCommand(
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
) {
  const [showPalette, setShowPalette] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!inputRef.current) return;

      // Check if "/" is typed at the start or after a space
      if (e.key === '/') {
        const input = inputRef.current;
        const pos = input.selectionStart || 0;
        const text = input.value;

        // Show palette if "/" is at start or after whitespace
        if (pos === 0 || /\s/.test(text[pos - 1] || '')) {
          e.preventDefault();
          setCursorPosition(pos);
          setShowPalette(true);
        }
      }

      // Close on Escape
      if (e.key === 'Escape' && showPalette) {
        setShowPalette(false);
      }
    },
    [inputRef, showPalette]
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  }, [inputRef, handleKeyDown]);

  return {
    showPalette,
    setShowPalette,
    cursorPosition,
  };
}
