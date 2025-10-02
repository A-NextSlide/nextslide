import React from 'react';
import { ComponentInstance } from '@/types/components';
import * as LucideIcons from 'lucide-react';
import * as HeroIcons from '@heroicons/react/24/outline';
import * as HeroIconsSolid from '@heroicons/react/24/solid';
import * as TablerIcons from '@tabler/icons-react';
import * as FeatherIcons from 'react-feather';

interface IconRendererProps {
  component: ComponentInstance;
  isEditing?: boolean;
  isSelected?: boolean;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ component, isEditing, isSelected }) => {
  const {
    iconLibrary = 'lucide',
    iconName = 'Star',
    color = '#000000',
    strokeWidth = 2,
    filled = false,
    opacity = 1,
    width = 100,
    height = 100,
  } = component.props;

  const toPascalCase = (rawName: string): string => {
    if (!rawName) return '';
    // Remove common suffix and separators, then PascalCase
    let base = String(rawName)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[-_]+/g, ' ')
      .replace(/icon$/i, '');
    return base
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  };

  const normalizedName = toPascalCase(iconName);

  // Get the icon component dynamically
  const getIconComponent = () => {
    try {
      switch (iconLibrary) {
        case 'lucide': {
          // Lucide icons are exported as PascalCase without 'Icon' suffix
          const IconComponent = (LucideIcons[normalizedName as keyof typeof LucideIcons] ||
            LucideIcons[iconName as keyof typeof LucideIcons]) as any;
          if (IconComponent) return IconComponent as React.ComponentType<any>;
          
          return null;
        }
        case 'heroicons': {
          // Hero icons end with 'Icon'
          const base = normalizedName || iconName.replace(/Icon$/,'');
          const candidateName = base.endsWith('Icon') ? base : `${base}Icon`;
          if (filled) {
            const SolidIcon = HeroIconsSolid[candidateName as keyof typeof HeroIconsSolid] as any;
            if (SolidIcon) return SolidIcon as React.ComponentType<any>;
          }
          const OutlineIcon = HeroIcons[candidateName as keyof typeof HeroIcons] as any;
          if (OutlineIcon) return OutlineIcon as React.ComponentType<any>;
          return null;
        }
        case 'tabler': {
          // Tabler icons have 'Icon' prefix
          const tablerIconName = `Icon${normalizedName || iconName}`;
          const TablerIcon = TablerIcons[tablerIconName as keyof typeof TablerIcons] as any;
          if (TablerIcon) return TablerIcon as React.ComponentType<any>;
          return null;
        }
        case 'feather': {
          const FeatherIcon = (FeatherIcons[normalizedName as keyof typeof FeatherIcons] ||
            FeatherIcons[iconName as keyof typeof FeatherIcons]) as any;
          if (FeatherIcon) return FeatherIcon as React.ComponentType<any>;
          return null;
        }
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error loading icon ${iconLibrary}/${iconName}:`, error);
      return null;
    }
  };

  const IconComponent = getIconComponent();
  const computedSize = Math.min(width, height) * 0.8;
  
  if (!IconComponent) {
    // Fallback to a star icon if the specified one isn't found
    const FallbackIcon = LucideIcons.Star;
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          pointerEvents: isEditing ? 'none' : 'auto',
        }}
      >
        <FallbackIcon
          size={Math.min(width, height) * 0.8}
          color={color}
          strokeWidth={2}
          fill={'none'}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        pointerEvents: isEditing ? 'none' : 'auto',
      }}
    >
      {iconLibrary === 'heroicons' ? (
        <IconComponent
          width={computedSize}
          height={computedSize}
          stroke={color}
          fill={filled ? color : 'none'}
        />
      ) : (
        <IconComponent
          size={computedSize}
          color={color}
          strokeWidth={['lucide', 'tabler', 'feather'].includes(iconLibrary) ? strokeWidth : undefined}
          fill={'none'}
        />
      )}
    </div>
  );
};

// Register the renderer
import type { RendererFunction } from '../index';
import { registerRenderer } from '../utils';

const IconRendererWrapper: RendererFunction = (props) => {
  return <IconRenderer 
    component={props.component}
    isEditing={props.isEditing}
    isSelected={props.isSelected}
  />;
};

// Register the Icon renderer
registerRenderer('Icon', IconRendererWrapper);

export default IconRendererWrapper; 