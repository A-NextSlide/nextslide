/**
 * IntegrationIcon Component
 *
 * Centralized icon component for integrations.
 * Maps integration IDs to appropriate icons (Lucide icons or custom SVGs).
 */

import React from 'react';
import {
  Linkedin,
  Building2,
  Cloud,
  Mail,
  Calendar,
  HardDrive,
  FileText,
  MessageCircle,
  CheckSquare,
  Layers,
  ClipboardList,
  Trello,
  Github,
  Figma,
  BarChart3,
  Video,
  Youtube,
  Users,
  Database,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Icon mapping for integrations
const INTEGRATION_ICONS: Record<string, LucideIcon> = {
  // Social
  linkedin: Linkedin,
  twitter: MessageCircle, // No X icon in lucide yet

  // CRM
  salesforce: Cloud,
  hubspot: Building2,
  pipedrive: Building2,
  apollo: Database,

  // Email
  gmail: Mail,
  'google-mail': Mail,
  outlook: Mail,
  'microsoft-outlook': Mail,

  // Calendar
  'google-calendar': Calendar,

  // Storage
  'google-drive': HardDrive,
  dropbox: HardDrive,
  onedrive: HardDrive,
  'microsoft-onedrive': HardDrive,

  // Docs
  notion: FileText,
  confluence: FileText,

  // Communication
  slack: MessageCircle,
  discord: MessageCircle,
  teams: Users,
  'microsoft-teams': Users,

  // Project
  asana: CheckSquare,
  linear: Layers,
  jira: ClipboardList,
  trello: Trello,

  // Dev Tools
  github: Github,
  figma: Figma,

  // Analytics
  'google-analytics': BarChart3,

  // Video
  zoom: Video,
  youtube: Youtube,
};

// Brand colors for integrations (for colored variants)
const INTEGRATION_COLORS: Record<string, string> = {
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  salesforce: '#00A1E0',
  hubspot: '#FF7A59',
  pipedrive: '#1C2832',
  apollo: '#6366F1',
  gmail: '#EA4335',
  'google-mail': '#EA4335',
  outlook: '#0078D4',
  'microsoft-outlook': '#0078D4',
  'google-calendar': '#4285F4',
  'google-drive': '#4285F4',
  dropbox: '#0061FF',
  onedrive: '#0078D4',
  'microsoft-onedrive': '#0078D4',
  notion: '#000000',
  confluence: '#172B4D',
  slack: '#4A154B',
  discord: '#5865F2',
  teams: '#6264A7',
  'microsoft-teams': '#6264A7',
  asana: '#F06A6A',
  linear: '#5E6AD2',
  jira: '#0052CC',
  trello: '#0079BF',
  github: '#181717',
  figma: '#F24E1E',
  'google-analytics': '#E37400',
  zoom: '#2D8CFF',
  youtube: '#FF0000',
};

export interface IntegrationIconProps {
  integrationId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'colored' | 'muted';
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
};

export function IntegrationIcon({
  integrationId,
  size = 'md',
  variant = 'default',
  className,
}: IntegrationIconProps) {
  const Icon = INTEGRATION_ICONS[integrationId] || Plug;
  const color = INTEGRATION_COLORS[integrationId];

  const sizeClass = SIZE_MAP[size];

  const style: React.CSSProperties = {};
  let variantClass = '';

  switch (variant) {
    case 'colored':
      if (color) {
        style.color = color;
      }
      break;
    case 'muted':
      variantClass = 'text-muted-foreground';
      break;
    default:
      variantClass = 'text-foreground';
  }

  return (
    <Icon
      className={cn(sizeClass, variantClass, className)}
      style={style}
    />
  );
}

/**
 * Get the brand color for an integration
 */
export function getIntegrationColor(integrationId: string): string | undefined {
  return INTEGRATION_COLORS[integrationId];
}

/**
 * Check if an integration has a dedicated icon
 */
export function hasIntegrationIcon(integrationId: string): boolean {
  return integrationId in INTEGRATION_ICONS;
}

export default IntegrationIcon;
