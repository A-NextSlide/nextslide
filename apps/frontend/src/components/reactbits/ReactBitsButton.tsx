/**
 * ReactBits Toolbar Button Component
 *
 * Beautiful dropdown UI for adding ReactBits animated components to slides
 */

import React, { useState } from 'react';
import { Zap, Sparkles, Wand2, Type, Image as ImageIcon, Grid3x3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { REACTBITS_CATALOG, getComponentsByCategory, getCategorySummary } from '@/integrations/reactbits/catalog';
import { ReactBitsCategory } from '@/integrations/reactbits/types';
import { loadComponent } from '@/integrations/reactbits/loader';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { createComponent } from '@/utils/componentUtils';
import { v4 as uuidv4 } from 'uuid';

interface ReactBitsButtonProps {
  onComponentAdded?: (componentId: string) => void;
}

/**
 * Get icon for each category
 */
const getCategoryIcon = (category: ReactBitsCategory) => {
  switch (category) {
    case 'text-animations':
      return <Type className="w-4 h-4" />;
    case 'animations':
      return <Sparkles className="w-4 h-4" />;
    case 'backgrounds':
      return <ImageIcon className="w-4 h-4" />;
    case 'components':
      return <Grid3x3 className="w-4 h-4" />;
    default:
      return <Wand2 className="w-4 h-4" />;
  }
};

/**
 * Format category name for display
 */
const formatCategoryName = (category: ReactBitsCategory): string => {
  const names: Record<ReactBitsCategory, string> = {
    'text-animations': 'Text Animations',
    'animations': 'Animations',
    'backgrounds': 'Backgrounds',
    'components': 'Components',
    'buttons': 'Buttons',
    'forms': 'Forms',
    'loaders': 'Loaders',
  };
  return names[category];
};

/**
 * Get quality badge color
 */
const getQualityColor = (quality?: number): string => {
  if (!quality) return 'bg-gray-500';
  if (quality >= 9) return 'bg-green-500';
  if (quality >= 7) return 'bg-blue-500';
  return 'bg-yellow-500';
};

/**
 * Component card with animated preview
 */
const ComponentCard: React.FC<{
  id: string;
  comp: any;
  isLoading: boolean;
  onClick: () => void;
}> = ({ id, comp, isLoading, onClick }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  // Get preview animation based on component type
  const getPreviewContent = () => {
    const name = comp.displayName;

    // Text animations with live previews
    if (name === 'Blur Text') {
      return <span className="text-lg font-bold" style={{
        animation: isHovered ? 'blur-in 1s ease-out infinite' : 'none',
        filter: isHovered ? 'blur(0)' : 'blur(8px)',
        transition: 'filter 1s ease-out'
      }}>Blur Text</span>;
    }
    if (name === 'Count Up') {
      return <span className="text-2xl font-bold">{isHovered ? '100' : '0'}</span>;
    }
    if (name === 'Glitch Text') {
      return (
        <span className="text-lg font-bold relative" style={{
          animation: isHovered ? 'glitch 0.5s infinite' : 'none',
          color: isHovered ? '#f0f' : 'currentColor',
        }}>Glitch</span>
      );
    }
    if (name === 'Gradient Text') {
      return (
        <span className="text-lg font-bold" style={{
          background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundSize: '200% 100%',
          animation: isHovered ? 'gradient-shift 2s linear infinite' : 'none',
        }}>Gradient</span>
      );
    }
    if (name === 'Scrambled Text') {
      return <span className="text-lg font-bold">{isHovered ? 'Scramble' : '########'}</span>;
    }
    if (name === 'Typewriter Text') {
      return <span className="text-base font-mono">{isHovered ? 'Type...|' : 'Type'}</span>;
    }
    if (name === 'Neon Text') {
      return (
        <span className="text-lg font-bold" style={{
          color: '#0f0',
          textShadow: isHovered ? '0 0 10px #0f0, 0 0 20px #0f0, 0 0 30px #0f0' : 'none',
          animation: isHovered ? 'pulse 1s ease-in-out infinite' : 'none',
        }}>Neon</span>
      );
    }
    if (name === 'Shiny Text') {
      return (
        <span className="text-lg font-bold" style={{
          background: 'linear-gradient(90deg, #666, #fff, #666)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundSize: '200% 100%',
          animation: isHovered ? 'shimmer 1.5s linear infinite' : 'none',
        }}>Shiny</span>
      );
    }
    if (name === 'Rotating Text') {
      return <span className="text-base font-semibold">{isHovered ? 'Hello → World → Hello' : 'Rotating'}</span>;
    }
    if (name === 'Split Text') {
      return (
        <div className="text-base font-bold flex gap-0.5">
          {isHovered ? 'SPLIT'.split('').map((c, i) => (
            <span key={i} style={{
              animation: `fade-in 0.3s ease-out ${i * 0.1}s forwards`,
              opacity: 0
            }}>{c}</span>
          )) : 'Split'}
        </div>
      );
    }
    if (name === 'Circular Text') {
      return (
        <div className="text-xs font-semibold relative w-12 h-12">
          {isHovered && 'CIRCULAR'.split('').map((c, i) => (
            <span key={i} className="absolute" style={{
              left: '50%',
              top: '50%',
              transform: `rotate(${i * 50}deg) translateY(-20px)`,
              transformOrigin: '0 0'
            }}>{c}</span>
          ))}
          {!isHovered && <span className="absolute inset-0 flex items-center justify-center">Circle</span>}
        </div>
      );
    }
    if (name === 'Falling Text') {
      return (
        <div className="text-base font-bold">
          {isHovered ? 'Falling'.split('').map((c, i) => (
            <span key={i} style={{
              animation: `fall 0.5s ease-out ${i * 0.1}s forwards`,
              display: 'inline-block',
              transform: 'translateY(-20px)',
              opacity: 0
            }}>{c}</span>
          )) : 'Falling'}
        </div>
      );
    }
    if (name === 'Shuffle Text') {
      return (
        <span className="text-base font-bold" style={{
          animation: isHovered ? 'shuffle 0.5s ease-out infinite' : 'none',
        }}>{isHovered ? '░▒▓█' : 'Shuffle'}</span>
      );
    }
    if (name === 'Decrypted Text') {
      return (
        <span className="text-base font-mono" style={{
          color: '#0f0',
          animation: isHovered ? 'decrypt 1s steps(4) infinite' : 'none',
        }}>{isHovered ? '01█1' : 'Decrypt'}</span>
      );
    }
    if (name === 'Loop Text') {
      return (
        <div className="w-full h-full overflow-hidden relative">
          <div className="text-xs font-semibold whitespace-nowrap" style={{
            animation: isHovered ? 'loop-scroll 3s linear infinite' : 'none',
          }}>Loop Text • Loop Text • Loop Text</div>
        </div>
      );
    }
    if (name === 'Wavy Text') {
      return (
        <div className="flex gap-0.5">
          {'WAVY'.split('').map((c, i) => (
            <span key={i} className="text-base font-bold" style={{
              animation: isHovered ? `wavy 1s ease-in-out ${i * 0.1}s infinite` : 'none',
              display: 'inline-block',
            }}>{c}</span>
          ))}
        </div>
      );
    }

    // Background previews
    if (name === 'Aurora') {
      return (
        <div className="w-full h-full" style={{
          background: 'linear-gradient(45deg, #6366f1, #a855f7, #ec4899)',
          backgroundSize: '200% 200%',
          animation: isHovered ? 'gradient-shift 3s ease infinite' : 'none',
        }} />
      );
    }
    if (name === 'Starfield') {
      return (
        <div className="w-full h-full bg-black relative overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: isHovered ? `twinkle ${1 + Math.random() * 2}s infinite` : 'none',
                animationDelay: `${Math.random() * 2}s`,
                opacity: isHovered ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Particles') {
      return (
        <div className="w-full h-full relative overflow-hidden" style={{ background: 'radial-gradient(circle, #1a1a2e 0%, #0a0a0f 100%)' }}>
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 bg-primary/60 rounded-full"
              style={{
                left: `${20 + Math.random() * 60}%`,
                top: `${20 + Math.random() * 60}%`,
                animation: isHovered ? `float ${2 + Math.random() * 2}s ease-in-out infinite` : 'none',
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Waves') {
      return (
        <div className="w-full h-full bg-blue-500/20 relative overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="absolute bottom-0 w-full h-4 bg-blue-500/30 rounded-t-full"
              style={{
                animation: isHovered ? `wave ${2 + i * 0.5}s ease-in-out infinite` : 'none',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Dots Pattern') {
      return (
        <div className="w-full h-full relative overflow-hidden grid grid-cols-6 gap-2 p-2">
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 bg-primary/40 rounded-full"
              style={{
                animation: isHovered ? `pulse ${1 + (i % 3) * 0.5}s ease-in-out infinite` : 'none',
                animationDelay: `${(i % 4) * 0.1}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Gradient Mesh') {
      return (
        <div className="w-full h-full" style={{
          background: 'radial-gradient(circle at 30% 30%, #6366f1, transparent), radial-gradient(circle at 70% 70%, #ec4899, transparent)',
          filter: isHovered ? 'blur(20px)' : 'blur(30px)',
          transition: 'filter 0.5s',
        }} />
      );
    }
    if (name === 'Light Beams') {
      return (
        <div className="w-full h-full bg-black relative overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="absolute h-full w-4 bg-gradient-to-b from-transparent via-primary/30 to-transparent"
              style={{
                left: `${i * 33}%`,
                animation: isHovered ? `beam-move ${2 + i * 0.5}s ease-in-out infinite` : 'none',
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Ripple Grid') {
      return (
        <div className="w-full h-full relative overflow-hidden" style={{
          backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(99, 102, 241, .2) 25%, rgba(99, 102, 241, .2) 26%, transparent 27%, transparent), linear-gradient(90deg, transparent 24%, rgba(99, 102, 241, .2) 25%, rgba(99, 102, 241, .2) 26%, transparent 27%, transparent)',
          backgroundSize: '20px 20px',
          animation: isHovered ? 'ripple 2s ease-in-out infinite' : 'none',
        }} />
      );
    }
    if (name === 'Grid Motion') {
      return (
        <div className="w-full h-full relative overflow-hidden" style={{
          backgroundImage: 'linear-gradient(rgba(99, 102, 241, .1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, .1) 1px, transparent 1px)',
          backgroundSize: '15px 15px',
          animation: isHovered ? 'grid-pulse 1.5s ease-in-out infinite' : 'none',
        }} />
      );
    }
    if (name === 'Plasma Effect') {
      return (
        <div className="w-full h-full" style={{
          background: 'linear-gradient(45deg, #f06, #6f0, #06f, #f06)',
          backgroundSize: '400% 400%',
          animation: isHovered ? 'plasma 4s ease infinite' : 'none',
        }} />
      );
    }
    if (name === 'Chroma Grid') {
      return (
        <div className="w-full h-full relative overflow-hidden" style={{
          backgroundImage: 'linear-gradient(rgba(255, 0, 255, .3) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, .3) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          animation: isHovered ? 'chroma-shift 2s ease infinite' : 'none',
        }} />
      );
    }
    if (name === '3D Cubes') {
      return (
        <div className="w-full h-full flex items-center justify-center gap-1">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 bg-primary/40 border border-primary/60"
              style={{
                transform: isHovered ? 'rotateY(45deg) rotateX(30deg)' : 'rotateY(0deg)',
                animation: isHovered ? `cube-rotate 2s ease-in-out ${i * 0.2}s infinite` : 'none',
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Ball Pit') {
      return (
        <div className="w-full h-full relative overflow-hidden bg-gradient-to-b from-primary/5 to-primary/20">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                left: `${10 + (i % 4) * 25}%`,
                top: `${20 + Math.floor(i / 4) * 40}%`,
                background: ['#f06', '#6f0', '#06f', '#ff0'][i % 4],
                animation: isHovered ? `ball-bounce ${1 + (i % 3) * 0.3}s ease-in-out infinite` : 'none',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Retro Grid') {
      return (
        <div className="w-full h-full relative overflow-hidden bg-gradient-to-b from-purple-900 to-black">
          <div className="absolute bottom-0 w-full h-3/4" style={{
            backgroundImage: 'linear-gradient(#ff00ff 1px, transparent 1px), linear-gradient(90deg, #ff00ff 1px, transparent 1px)',
            backgroundSize: '15px 15px',
            transform: 'perspective(100px) rotateX(60deg)',
            transformOrigin: 'bottom',
            animation: isHovered ? 'retro-scroll 2s linear infinite' : 'none',
          }} />
        </div>
      );
    }

    // Interactive components
    if (name === 'Click Spark') {
      return (
        <div className="w-full h-full flex items-center justify-center relative">
          {isHovered && [...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-primary rounded-full"
              style={{
                animation: `spark-out 0.8s ease-out infinite`,
                animationDelay: `${i * 0.1}s`,
                transform: `rotate(${i * 45}deg) translateX(0)`,
              }}
            />
          ))}
          <span className="text-xs">✨</span>
        </div>
      );
    }
    if (name === 'Blob Cursor') {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-8 h-8 bg-primary/30 rounded-full" style={{
            animation: isHovered ? 'blob-morph 2s ease-in-out infinite' : 'none',
          }} />
        </div>
      );
    }
    if (name === 'Spotlight Card') {
      return (
        <div className="w-full h-full bg-card border border-border rounded relative overflow-hidden">
          {isHovered && (
            <div className="absolute inset-0 bg-gradient-radial from-primary/20 to-transparent" style={{
              animation: 'spotlight 2s ease-in-out infinite',
            }} />
          )}
        </div>
      );
    }
    if (name === 'Magnetic Hover') {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-xs font-semibold px-2 py-1 bg-primary/20 rounded" style={{
            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            transition: 'transform 0.3s ease',
          }}>Magnet</div>
        </div>
      );
    }
    if (name === 'Bounce Cards') {
      return (
        <div className="w-full h-full flex items-center justify-center gap-1">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-4 h-6 bg-primary/30 rounded"
              style={{
                animation: isHovered ? `bounce 0.6s ease-in-out infinite` : 'none',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Circular Gallery') {
      return (
        <div className="w-full h-full relative flex items-center justify-center">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-primary/40 rounded-full"
              style={{
                transform: `rotate(${i * 60}deg) translateY(-15px)`,
                animation: isHovered ? `rotate-gallery 4s linear infinite` : 'none',
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Star Border') {
      return (
        <div className="w-full h-full border-2 border-primary/20 rounded relative">
          {isHovered && [...Array(4)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-primary"
              style={{
                top: i < 2 ? '0' : 'auto',
                bottom: i >= 2 ? '0' : 'auto',
                left: i % 2 === 0 ? '0' : 'auto',
                right: i % 2 === 1 ? '0' : 'auto',
                animation: `twinkle 1s ease-in-out infinite`,
                animationDelay: `${i * 0.25}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Splash Cursor') {
      return (
        <div className="w-full h-full flex items-center justify-center relative">
          {isHovered && [...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 bg-primary/60 rounded-full"
              style={{
                animation: `splash 1s ease-out infinite`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
          <span className="text-xs">💧</span>
        </div>
      );
    }
    if (name === 'macOS Dock') {
      return (
        <div className="w-full h-full flex items-end justify-center gap-1 p-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-2 h-4 bg-primary/40 rounded"
              style={{
                transform: isHovered && i === 1 ? 'scale(1.5) translateY(-2px)' : 'scale(1)',
                transition: 'transform 0.2s ease',
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Magic Bento') {
      return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1 p-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-primary/20 rounded"
              style={{
                animation: isHovered ? `pulse ${1 + i * 0.2}s ease-in-out infinite` : 'none',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Carousel') {
      return (
        <div className="w-full h-full flex items-center justify-center gap-1">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-3 h-4 bg-primary/30 rounded"
              style={{
                opacity: isHovered && i === 1 ? 1 : 0.4,
                transform: isHovered && i === 1 ? 'scale(1.2)' : 'scale(0.9)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Animated List') {
      return (
        <div className="w-full h-full flex flex-col gap-1 justify-center p-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-full h-1.5 bg-primary/30 rounded"
              style={{
                animation: isHovered ? `slide-in 0.3s ease-out ${i * 0.1}s forwards` : 'none',
                opacity: isHovered ? 1 : 0.5,
                transform: isHovered ? 'translateX(0)' : 'translateX(-10px)',
              }}
            />
          ))}
        </div>
      );
    }
    if (name === 'Card Swap') {
      return (
        <div className="w-full h-full flex items-center justify-center relative">
          <div className="absolute w-8 h-10 bg-primary/20 border border-primary/40 rounded" style={{
            transform: isHovered ? 'translateX(-8px) rotate(-10deg)' : 'translateX(0) rotate(0)',
            transition: 'all 0.3s ease',
            zIndex: isHovered ? 2 : 1,
          }} />
          <div className="absolute w-8 h-10 bg-primary/40 border border-primary/60 rounded" style={{
            transform: isHovered ? 'translateX(8px) rotate(10deg)' : 'translateX(0) rotate(0)',
            transition: 'all 0.3s ease',
            zIndex: isHovered ? 1 : 2,
          }} />
        </div>
      );
    }
    if (name === 'Morph Card') {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-10 h-8 bg-primary/30 border border-primary/50" style={{
            borderRadius: isHovered ? '50%' : '4px',
            transform: isHovered ? 'scale(0.9)' : 'scale(1)',
            transition: 'all 0.5s ease',
          }} />
        </div>
      );
    }
    if (name === 'Flip Card') {
      return (
        <div className="w-full h-full flex items-center justify-center" style={{ perspective: '200px' }}>
          <div className="w-10 h-8 bg-primary/30 border border-primary/50 rounded flex items-center justify-center text-[8px]" style={{
            transform: isHovered ? 'rotateY(180deg)' : 'rotateY(0)',
            transition: 'transform 0.6s',
            transformStyle: 'preserve-3d',
          }}>
            {isHovered ? '←' : '→'}
          </div>
        </div>
      );
    }

    // Default preview with component icon/name
    return <div className="text-sm font-semibold text-muted-foreground flex items-center justify-center w-full h-full">{name.split(' ')[0]}</div>;
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group cursor-pointer rounded-xl border-2 border-border bg-card hover:bg-accent hover:border-primary/50 transition-all duration-300 overflow-hidden hover:shadow-xl hover:scale-[1.02]"
    >
      {/* Animated preview area */}
      <div className="h-24 bg-gradient-to-br from-primary/10 via-primary/5 to-background flex items-center justify-center p-3 border-b-2 border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative z-10 flex items-center justify-center w-full h-full text-center">
          {getPreviewContent()}
        </div>
      </div>

      {/* Component info */}
      <div className="p-2.5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-semibold text-xs leading-tight">{comp.displayName}</h4>
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin shrink-0 mt-0.5 text-primary" />
          ) : (
            <div
              className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${getQualityColor(comp.quality)} ring-2 ring-background shadow-sm`}
              title={`Quality: ${comp.quality}/10`}
            />
          )}
        </div>
        <p className="text-[10px] text-muted-foreground line-clamp-1 leading-relaxed mb-1.5">
          {comp.description}
        </p>
        {comp.tags && comp.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {comp.tags.slice(0, 2).map((tag: string) => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hover overlay with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
};

export const ReactBitsButton: React.FC<ReactBitsButtonProps> = ({ onComponentAdded }) => {
  const { addComponent } = useActiveSlide();
  const [loadingComponent, setLoadingComponent] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const categorySummary = getCategorySummary();

  // Add keyframes for animations
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
      @keyframes twinkle {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
      @keyframes gradient-shift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes blur-in {
        0% { filter: blur(10px); opacity: 0; }
        100% { filter: blur(0); opacity: 1; }
      }
      @keyframes glitch {
        0%, 100% { transform: translate(0); }
        25% { transform: translate(-2px, 2px); }
        50% { transform: translate(2px, -2px); }
        75% { transform: translate(-2px, -2px); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fall {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes wave {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      @keyframes ripple {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(1.1); opacity: 0.5; }
      }
      @keyframes grid-pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
      }
      @keyframes plasma {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes beam-move {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(30px); }
      }
      @keyframes spark-out {
        0% { transform: scale(1) translateX(0); opacity: 1; }
        100% { transform: scale(0) translateX(20px); opacity: 0; }
      }
      @keyframes blob-morph {
        0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
        50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
      }
      @keyframes spotlight {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(20px, 20px); }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      @keyframes rotate-gallery {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes splash {
        0% { transform: scale(0) translate(0, 0); opacity: 1; }
        100% { transform: scale(2) translate(var(--x, 10px), var(--y, 10px)); opacity: 0; }
      }
      @keyframes shuffle {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
      }
      @keyframes decrypt {
        0% { opacity: 0.3; }
        100% { opacity: 1; }
      }
      @keyframes loop-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-33.33%); }
      }
      @keyframes wavy {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes chroma-shift {
        0%, 100% { filter: hue-rotate(0deg); }
        50% { filter: hue-rotate(180deg); }
      }
      @keyframes cube-rotate {
        0%, 100% { transform: rotateY(45deg) rotateX(30deg); }
        50% { transform: rotateY(135deg) rotateX(30deg); }
      }
      @keyframes ball-bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      @keyframes retro-scroll {
        0% { background-position: 0 0; }
        100% { background-position: 0 15px; }
      }
      @keyframes slide-in {
        from { transform: translateX(-10px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /**
   * Handle adding a ReactBits component to the slide
   */
  const handleAddComponent = async (componentId: string) => {
    setLoadingComponent(componentId);

    try {
      const catalogEntry = REACTBITS_CATALOG[componentId];
      if (!catalogEntry) {
        console.error('Component not found in catalog:', componentId);
        setLoadingComponent(null);
        return;
      }

      // Load component (this now just validates and caches)
      const result = await loadComponent(componentId);

      if (!result.success || !result.component) {
        console.error('Failed to load component:', result.error);
        setLoadingComponent(null);
        return;
      }

      // Create a ReactBits component instance
      const componentInstance = {
        id: uuidv4(),
        type: 'ReactBits', // Special type for ReactBits components
        props: {
          reactBitsId: componentId, // Store the ReactBits component ID in props
          ...catalogEntry.defaultProps,
          position: { x: 100, y: 100 },
          width: 400,
          height: 300,
        },
      };

      // Add to slide
      addComponent(componentInstance as any);

      // Notify parent
      if (onComponentAdded) {
        onComponentAdded(componentInstance.id);
      }

      // Close dropdown
      setIsOpen(false);
    } catch (error) {
      console.error('Error adding ReactBits component:', error);
    } finally {
      setLoadingComponent(null);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Zap className="w-4 h-4" />
                <span className="hidden md:inline">Dynamic</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add ReactBits animated components</p>
          </TooltipContent>

          <DropdownMenuContent className="w-[420px]" align="start" side="bottom">
            <div className="p-4 pb-3 border-b border-border bg-gradient-to-br from-primary/5 to-primary/10">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-primary" />
                <span className="font-bold text-lg">Dynamic Components</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Add stunning animated components to your slides
              </p>
              <Badge variant="secondary" className="mt-2 text-xs px-2 py-0.5">
                {Object.keys(REACTBITS_CATALOG).length} components available
              </Badge>
            </div>

            <div className="max-h-[420px] overflow-y-auto py-1">
              {/* Text Animations */}
              {categorySummary['text-animations'] > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 py-3 hover:bg-primary/5">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getCategoryIcon('text-animations')}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Text Animations</div>
                        <div className="text-[10px] text-muted-foreground">Animated text effects</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {categorySummary['text-animations']}
                    </Badge>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-[480px] max-h-[550px] overflow-y-auto p-1" sideOffset={8}>
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {getComponentsByCategory('text-animations').map((id) => {
                        const comp = REACTBITS_CATALOG[id];
                        const isLoading = loadingComponent === id;
                        return (
                          <ComponentCard
                            key={id}
                            id={id}
                            comp={comp}
                            isLoading={isLoading}
                            onClick={() => handleAddComponent(id)}
                          />
                        );
                      })}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Backgrounds */}
              {categorySummary['backgrounds'] > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 py-3 hover:bg-primary/5">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getCategoryIcon('backgrounds')}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Backgrounds</div>
                        <div className="text-[10px] text-muted-foreground">Animated backgrounds</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {categorySummary['backgrounds']}
                    </Badge>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-[480px] max-h-[550px] overflow-y-auto p-1" sideOffset={8}>
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {getComponentsByCategory('backgrounds').map((id) => {
                        const comp = REACTBITS_CATALOG[id];
                        const isLoading = loadingComponent === id;
                        return (
                          <ComponentCard
                            key={id}
                            id={id}
                            comp={comp}
                            isLoading={isLoading}
                            onClick={() => handleAddComponent(id)}
                          />
                        );
                      })}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Animations */}
              {categorySummary['animations'] > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 py-3 hover:bg-primary/5">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getCategoryIcon('animations')}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Animations</div>
                        <div className="text-[10px] text-muted-foreground">Interactive animations</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {categorySummary['animations']}
                    </Badge>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-[480px] max-h-[550px] overflow-y-auto p-1" sideOffset={8}>
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {getComponentsByCategory('animations').map((id) => {
                        const comp = REACTBITS_CATALOG[id];
                        const isLoading = loadingComponent === id;
                        return (
                          <ComponentCard
                            key={id}
                            id={id}
                            comp={comp}
                            isLoading={isLoading}
                            onClick={() => handleAddComponent(id)}
                          />
                        );
                      })}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Components */}
              {categorySummary['components'] > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 py-3 hover:bg-primary/5">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getCategoryIcon('components')}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Components</div>
                        <div className="text-[10px] text-muted-foreground">Interactive UI components</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {categorySummary['components']}
                    </Badge>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-[480px] max-h-[550px] overflow-y-auto p-1" sideOffset={8}>
                    <div className="grid grid-cols-2 gap-2 p-2">
                      {getComponentsByCategory('components').map((id) => {
                        const comp = REACTBITS_CATALOG[id];
                        const isLoading = loadingComponent === id;
                        return (
                          <ComponentCard
                            key={id}
                            id={id}
                            comp={comp}
                            isLoading={isLoading}
                            onClick={() => handleAddComponent(id)}
                          />
                        );
                      })}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </Tooltip>
    </TooltipProvider>
  );
};
