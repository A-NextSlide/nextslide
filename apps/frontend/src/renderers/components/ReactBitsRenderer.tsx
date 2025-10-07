/**
 * ReactBits Component Renderer
 *
 * Renders ReactBits animated components within slides
 */

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { RendererProps } from '../index';
import { REACTBITS_CATALOG } from '@/integrations/reactbits/catalog';
import { loadComponent } from '@/integrations/reactbits/loader';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Lazy-loaded ReactBits component wrappers
 * These are imported dynamically based on the component ID
 */

// Placeholder components for when source isn't loaded yet
const LoadingPlaceholder: React.FC<{ name: string }> = ({ name }) => (
  <div className="w-full h-full flex items-center justify-center bg-muted/20 border-2 border-dashed border-muted">
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin" />
      <p className="text-sm">Loading {name}...</p>
    </div>
  </div>
);

const ErrorPlaceholder: React.FC<{ name: string; error: string }> = ({ name, error }) => (
  <div className="w-full h-full flex items-center justify-center bg-destructive/10 border-2 border-dashed border-destructive/50 rounded">
    <div className="flex flex-col items-center gap-2 text-destructive p-4 text-center">
      <AlertCircle className="w-8 h-8" />
      <p className="text-sm font-medium">{name}</p>
      <p className="text-xs">{error}</p>
    </div>
  </div>
);

/**
 * Demo components to show until dynamic loading is fully implemented
 * These provide visual feedback for the ReactBits components
 */
const DemoBlurText: React.FC<any> = ({ text, className }) => (
  <div
    className={className}
    style={{
      animation: 'blur-in 0.8s ease-out forwards',
    }}
  >
    <style>
      {`
        @keyframes blur-in {
          from {
            filter: blur(10px);
            opacity: 0;
          }
          to {
            filter: blur(0);
            opacity: 1;
          }
        }
      `}
    </style>
    {text}
  </div>
);

const DemoCountUp: React.FC<any> = ({ from = 0, to = 100, duration = 2, separator = ',', className }) => {
  const [count, setCount] = useState(from);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);

      const currentCount = Math.floor(from + (to - from) * progress);
      setCount(currentCount);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [from, to, duration]);

  const formattedCount = separator ? count.toLocaleString() : count.toString();

  return <div className={className}>{formattedCount}</div>;
};

const DemoGlitchText: React.FC<any> = ({ children, className, speed = 0.5 }) => (
  <div
    className={`${className} relative`}
    style={{
      animation: `glitch ${2 / speed}s infinite`,
    }}
  >
    <style>
      {`
        @keyframes glitch {
          0%, 100% {
            text-shadow: 0 0 0 transparent;
          }
          10%, 30%, 50%, 70%, 90% {
            text-shadow:
              -2px 0 #ff00de,
              2px 0 #00fff9,
              0 0 #fff;
          }
          15%, 35%, 55%, 75%, 95% {
            text-shadow:
              2px 0 #ff00de,
              -2px 0 #00fff9,
              0 0 #fff;
          }
        }
      `}
    </style>
    {children}
  </div>
);

const DemoGradientText: React.FC<any> = ({ children, colors, className, animationSpeed = 3 }) => (
  <div
    className={className}
    style={{
      background: `linear-gradient(90deg, ${colors.join(', ')})`,
      backgroundSize: '200% 200%',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      animation: `gradient ${animationSpeed}s ease infinite`,
    }}
  >
    <style>
      {`
        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}
    </style>
    {children}
  </div>
);

const DemoAurora: React.FC<any> = ({ colorStops, className }) => (
  <div
    className={className}
    style={{
      background: `linear-gradient(90deg, ${colorStops.join(', ')})`,
      backgroundSize: '200% 200%',
      animation: 'aurora 8s ease infinite',
    }}
  >
    <style>
      {`
        @keyframes aurora {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}
    </style>
  </div>
);

const DemoParticles: React.FC<any> = ({ className }) => (
  <div className={`${className} relative overflow-hidden bg-black/5`}>
    {Array.from({ length: 20 }).map((_, i) => (
      <div
        key={i}
        className="absolute w-1 h-1 bg-white rounded-full"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `float ${3 + Math.random() * 3}s ease-in-out infinite`,
          animationDelay: `${Math.random() * 2}s`,
        }}
      />
    ))}
    <style>
      {`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(${Math.random() * 40 - 20}px, ${Math.random() * 40 - 20}px);
          }
        }
      `}
    </style>
  </div>
);

const DemoWaves: React.FC<any> = ({ waveColor, waveOpacity, className }) => (
  <div className={`${className} relative overflow-hidden`}>
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={waveColor} stopOpacity={waveOpacity * 0.5} />
          <stop offset="100%" stopColor={waveColor} stopOpacity={waveOpacity} />
        </linearGradient>
      </defs>
      <path
        fill="url(#wave-gradient)"
        d="M0,100 Q25,80 50,100 T100,100 V200 H0 Z"
        className="animate-wave"
      >
        <animateTransform
          attributeName="transform"
          type="translate"
          from="-100 0"
          to="0 0"
          dur="3s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  </div>
);

const DemoScrambledText: React.FC<any> = ({ text = 'Decrypting...', speed = 50, className }) => {
  const [displayText, setDisplayText] = useState('');
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= text.length) {
        const scrambled = text
          .split('')
          .map((char, i) => {
            if (i < currentIndex) return char;
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('');
        setDisplayText(scrambled);
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return <div className={className}>{displayText}</div>;
};

const DemoTypewriterText: React.FC<any> = ({ text = 'Hello!', speed = 10, showCursor = true, cursorColor = '#000', className }) => {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <div className={className}>
      {displayText}
      {showCursor && (
        <span
          className="inline-block w-0.5 ml-1 animate-pulse"
          style={{ backgroundColor: cursorColor, height: '1em' }}
        />
      )}
    </div>
  );
};

const DemoNeonText: React.FC<any> = ({ text = 'NEON', glowColor = '#00ff00', intensity = 20, flicker = false, className }) => {
  return (
    <div
      className={className}
      style={{
        color: glowColor,
        textShadow: `0 0 ${intensity}px ${glowColor}, 0 0 ${intensity * 2}px ${glowColor}, 0 0 ${intensity * 3}px ${glowColor}`,
        animation: flicker ? 'neon-flicker 2s infinite alternate' : 'none',
      }}
    >
      <style>
        {`
          @keyframes neon-flicker {
            0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% {
              opacity: 1;
            }
            20%, 24%, 55% {
              opacity: 0.4;
            }
          }
        `}
      </style>
      {text}
    </div>
  );
};

const DemoDotsPattern: React.FC<any> = ({ dotColor = '#888', dotSize = 2, spacing = 20, animate = false }) => {
  return (
    <div
      className="w-full h-full"
      style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
        animation: animate ? 'dots-pulse 2s ease-in-out infinite' : 'none',
      }}
    >
      <style>
        {`
          @keyframes dots-pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};

const DemoGradientMesh: React.FC<any> = ({ color1 = '#6366f1', color2 = '#a855f7', color3 = '#ec4899', speed = 1, blur = 60 }) => {
  return (
    <div className="w-full h-full relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(45deg, ${color1}, ${color2}, ${color3})`,
          backgroundSize: '200% 200%',
          filter: `blur(${blur}px)`,
          animation: `mesh-gradient ${10 / speed}s ease infinite`,
        }}
      />
      <style>
        {`
          @keyframes mesh-gradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
        `}
      </style>
    </div>
  );
};

const DemoStarfield: React.FC<any> = ({ starCount = 100, starColor = '#ffffff', speed = 0.5, twinkle = true }) => {
  const stars = Array.from({ length: starCount }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 3 + 2,
  }));

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            backgroundColor: starColor,
            animation: twinkle ? `twinkle ${star.duration}s ease-in-out infinite` : 'none',
          }}
        />
      ))}
      <style>
        {`
          @keyframes twinkle {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};

// ========== NEW COMPONENTS ==========

const DemoShinyText: React.FC<any> = ({ text, shimmerColor, speed, className }) => (
  <div className={className} style={{ position: 'relative', display: 'inline-block' }}>
    <style>
      {`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .shiny-text {
          background: linear-gradient(90deg,
            currentColor 0%,
            ${shimmerColor || '#ffffff'} 50%,
            currentColor 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer ${speed || 2}s infinite;
        }
      `}
    </style>
    <span className="shiny-text">{text}</span>
  </div>
);

const DemoRotatingText: React.FC<any> = ({ words, interval, className }) => {
  const wordArray = (words || 'Amazing,Stunning,Beautiful').split(',');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % wordArray.length);
    }, (interval || 2) * 1000);
    return () => clearInterval(timer);
  }, [wordArray.length, interval]);

  return (
    <div className={className}>
      <style>
        {`
          @keyframes rotateIn {
            0% { opacity: 0; transform: rotateX(-90deg); }
            100% { opacity: 1; transform: rotateX(0deg); }
          }
          .rotating-word {
            animation: rotateIn 0.6s ease-out;
            display: inline-block;
            transform-origin: 50% 50%;
          }
        `}
      </style>
      <span key={currentIndex} className="rotating-word">
        {wordArray[currentIndex]}
      </span>
    </div>
  );
};

const DemoBeams: React.FC<any> = ({ beamColor, beamCount, speed, opacity }) => {
  const beams = Array.from({ length: beamCount || 5 });
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>
        {`
          @keyframes beam-move {
            0% { transform: translateX(-100%) rotate(-45deg); }
            100% { transform: translateX(200%) rotate(-45deg); }
          }
        `}
      </style>
      {beams.map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: '200px',
            height: '100%',
            background: `linear-gradient(90deg, transparent, ${beamColor || '#6366f1'}, transparent)`,
            opacity: opacity || 0.3,
            left: `${i * 20}%`,
            animation: `beam-move ${10 / (speed || 1)}s linear infinite`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
};

const DemoRippleGrid: React.FC<any> = ({ gridColor, rippleColor, cellSize, speed }) => {
  return (
    <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
      <style>
        {`
          @keyframes ripple {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          .ripple-grid {
            background-image:
              linear-gradient(${gridColor || '#333'} 1px, transparent 1px),
              linear-gradient(90deg, ${gridColor || '#333'} 1px, transparent 1px);
            background-size: ${cellSize || 40}px ${cellSize || 40}px;
          }
          .ripple-grid::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 50% 50%, ${rippleColor || '#6366f1'} 0%, transparent 70%);
            animation: ripple ${3 / (speed || 1)}s ease-in-out infinite;
          }
        `}
      </style>
      <div className="ripple-grid absolute inset-0" />
    </div>
  );
};

const DemoSpotlightCard: React.FC<any> = ({ title, content, spotlightColor, width }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        width: width || 300,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.5)',
        padding: '24px',
      }}
    >
      {isHovering && (
        <div
          style={{
            position: 'absolute',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${spotlightColor || '#6366f1'}40 0%, transparent 70%)`,
            left: mousePos.x - 100,
            top: mousePos.y - 100,
            pointerEvents: 'none',
            transition: 'opacity 0.3s',
          }}
        />
      )}
      <h3 className="text-xl font-bold mb-2" style={{ position: 'relative', zIndex: 1 }}>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground" style={{ position: 'relative', zIndex: 1 }}>
        {content}
      </p>
    </div>
  );
};

const DemoDock: React.FC<any> = ({ iconCount, iconSize, magnification }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const icons = Array.from({ length: iconCount || 5 });

  const getScale = (index: number) => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    const mag = magnification || 1.5;
    if (distance === 0) return mag;
    if (distance === 1) return 1 + (mag - 1) * 0.5;
    return 1;
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '12px',
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {icons.map((_, i) => (
        <div
          key={i}
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{
            width: iconSize || 48,
            height: iconSize || 48,
            background: `hsl(${(i * 360) / (iconCount || 5)}, 70%, 60%)`,
            borderRadius: '12px',
            transform: `scale(${getScale(i)})`,
            transition: 'transform 0.2s ease-out',
            transformOrigin: 'bottom',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
};

// ========== MORE NEW COMPONENTS ==========

const DemoSplitText: React.FC<any> = ({ text, delay, className }) => {
  const [visibleChars, setVisibleChars] = useState(0);
  const chars = (text || 'Split').split('');

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleChars(prev => {
        if (prev >= chars.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, (delay || 0.05) * 1000);
    return () => clearInterval(interval);
  }, [text, delay, chars.length]);

  return (
    <div className={className}>
      {chars.map((char, i) => (
        <span
          key={i}
          style={{
            opacity: i < visibleChars ? 1 : 0,
            transform: i < visibleChars ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.3s ease-out',
            display: 'inline-block',
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </div>
  );
};

const DemoGridMotion: React.FC<any> = ({ gridColor, cellSize, speed, opacity }) => {
  return (
    <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
      <style>
        {`
          @keyframes grid-pulse {
            0%, 100% { opacity: ${opacity || 0.3}; }
            50% { opacity: ${(opacity || 0.3) * 1.5}; }
          }
          .animated-grid {
            background-image:
              linear-gradient(${gridColor || '#3b82f6'} 1px, transparent 1px),
              linear-gradient(90deg, ${gridColor || '#3b82f6'} 1px, transparent 1px);
            background-size: ${cellSize || 50}px ${cellSize || 50}px;
            animation: grid-pulse ${2 / (speed || 1)}s ease-in-out infinite;
          }
        `}
      </style>
      <div className="animated-grid absolute inset-0" />
    </div>
  );
};

const DemoPlasma: React.FC<any> = ({ color1, color2, color3, speed }) => {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `linear-gradient(45deg, ${color1 || '#ff0080'}, ${color2 || '#7928ca'}, ${color3 || '#0070f3'})`,
        backgroundSize: '400% 400%',
        animation: `plasma-move ${10 / (speed || 1)}s ease infinite`,
      }}
    >
      <style>
        {`
          @keyframes plasma-move {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}
      </style>
    </div>
  );
};

const DemoBounceCards: React.FC<any> = ({ cardCount, cardWidth, bounceStrength }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const cards = Array.from({ length: cardCount || 3 });

  return (
    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '20px' }}>
      {cards.map((_, i) => (
        <div
          key={i}
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{
            width: cardWidth || 250,
            height: '300px',
            background: `hsl(${(i * 360) / (cardCount || 3)}, 70%, 60%)`,
            borderRadius: '12px',
            transform: hoveredIndex === i ? `scale(${bounceStrength || 1.1})` : 'scale(1)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            cursor: 'pointer',
            boxShadow: hoveredIndex === i ? '0 10px 30px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)',
          }}
        />
      ))}
    </div>
  );
};

const DemoCircularGallery: React.FC<any> = ({ radius, imageSize, autoRotate }) => {
  const [rotation, setRotation] = useState(0);
  const imageCount = 6;
  const angleStep = 360 / imageCount;

  useEffect(() => {
    if (!autoRotate) return;
    const interval = setInterval(() => {
      setRotation(prev => (prev + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, [autoRotate]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: imageCount }).map((_, i) => {
        const angle = i * angleStep + rotation;
        const x = Math.cos((angle - 90) * Math.PI / 180) * (radius || 200);
        const y = Math.sin((angle - 90) * Math.PI / 180) * (radius || 200);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              width: imageSize || 100,
              height: imageSize || 100,
              background: `hsl(${(i * 360) / imageCount}, 70%, 60%)`,
              borderRadius: '12px',
              transition: 'transform 0.3s',
            }}
          />
        );
      })}
    </div>
  );
};

const DemoStarBorder: React.FC<any> = ({ color, speed, starCount }) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset(prev => (prev + (speed || 1)) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, [speed]);

  return (
    <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
      {Array.from({ length: starCount || 20 }).map((_, i) => {
        const angle = ((i * 360) / (starCount || 20) + offset) % 360;
        const isTop = angle < 90 || angle > 270;
        const isRight = angle > 0 && angle < 180;

        let x, y;
        if (angle >= 0 && angle < 90) {
          x = `${(angle / 90) * 100}%`;
          y = '0%';
        } else if (angle >= 90 && angle < 180) {
          x = '100%';
          y = `${((angle - 90) / 90) * 100}%`;
        } else if (angle >= 180 && angle < 270) {
          x = `${100 - ((angle - 180) / 90) * 100}%`;
          y = '100%';
        } else {
          x = '0%';
          y = `${100 - ((angle - 270) / 90) * 100}%`;
        }

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: '4px',
              height: '4px',
              background: color || '#ffd700',
              borderRadius: '50%',
              boxShadow: `0 0 10px ${color || '#ffd700'}`,
              animation: `twinkle ${1 + (i % 3)}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
};

// ========== 12 NEW DEMO COMPONENTS ==========

const DemoShuffleText: React.FC<any> = ({ text, speed, iterations, className }) => {
  const [displayText, setDisplayText] = useState('');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

  useEffect(() => {
    let currentIteration = 0;
    let currentIndex = 0;
    const targetText = text || 'Shuffle';

    const interval = setInterval(() => {
      if (currentIndex >= targetText.length) {
        clearInterval(interval);
        setDisplayText(targetText);
        return;
      }

      const shuffled = targetText
        .split('')
        .map((char, i) => {
          if (i < currentIndex) return char;
          if (i === currentIndex && currentIteration >= (iterations || 8)) {
            return char;
          }
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');

      setDisplayText(shuffled);
      currentIteration++;

      if (currentIteration >= (iterations || 8)) {
        currentIteration = 0;
        currentIndex++;
      }
    }, speed || 30);

    return () => clearInterval(interval);
  }, [text, speed, iterations]);

  return <div className={className}>{displayText}</div>;
};

const DemoDecryptedText: React.FC<any> = ({ text, speed, glitchIntensity, className }) => {
  const [displayText, setDisplayText] = useState('');
  const [glitch, setGlitch] = useState(false);
  const chars = '!<>-_\\/[]{}—=+*^?#________';

  useEffect(() => {
    let currentIndex = 0;
    const targetText = text || 'Access Granted';

    const interval = setInterval(() => {
      if (currentIndex < targetText.length) {
        const decrypted = targetText
          .split('')
          .map((char, i) => {
            if (i < currentIndex) return char;
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('');
        setDisplayText(decrypted);

        if (Math.random() < (glitchIntensity || 0.5)) {
          setGlitch(true);
          setTimeout(() => setGlitch(false), 50);
        }

        currentIndex++;
      } else {
        setDisplayText(targetText);
        clearInterval(interval);
      }
    }, speed || 50);

    return () => clearInterval(interval);
  }, [text, speed, glitchIntensity]);

  return (
    <div
      className={className}
      style={{
        textShadow: glitch ? '2px 0 #ff00de, -2px 0 #00fff9' : 'none',
        transition: 'text-shadow 0.05s',
      }}
    >
      {displayText}
    </div>
  );
};

const DemoLoopText: React.FC<any> = ({ text, speed, direction, className }) => {
  return (
    <div className="w-full h-full overflow-hidden flex items-center">
      <style>
        {`
          @keyframes loop-${direction || 'left'} {
            0% { transform: translateX(${direction === 'right' ? '-100%' : '0'}); }
            100% { transform: translateX(${direction === 'right' ? '0' : '-100%'}); }
          }
          .loop-text {
            animation: loop-${direction || 'left'} ${speed || 10}s linear infinite;
            white-space: nowrap;
            display: inline-block;
          }
        `}
      </style>
      <div className="loop-text">
        <span className={className}>{text || 'Loop Text'}</span>
        <span className={className}>{text || 'Loop Text'}</span>
      </div>
    </div>
  );
};

const DemoWavyText: React.FC<any> = ({ text, amplitude, frequency, className }) => {
  const chars = (text || 'Wavy').split('');

  return (
    <div className={className} style={{ display: 'flex' }}>
      <style>
        {`
          @keyframes wave {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-${amplitude || 20}px); }
          }
        `}
      </style>
      {chars.map((char, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            animation: `wave ${2 / (frequency || 1)}s ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </div>
  );
};

const DemoChromaGrid: React.FC<any> = ({ gridColor, cellSize, aberrationIntensity, speed }) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset(prev => (prev + 1) % 360);
    }, 50 / (speed || 1));
    return () => clearInterval(interval);
  }, [speed]);

  const intensity = aberrationIntensity || 3;

  return (
    <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
      <style>
        {`
          .chroma-grid {
            background-image:
              linear-gradient(${gridColor || '#6366f1'} 1px, transparent 1px),
              linear-gradient(90deg, ${gridColor || '#6366f1'} 1px, transparent 1px);
            background-size: ${cellSize || 50}px ${cellSize || 50}px;
          }
        `}
      </style>
      <div
        className="chroma-grid absolute inset-0"
        style={{
          filter: `drop-shadow(${intensity}px 0 red) drop-shadow(-${intensity}px 0 cyan)`,
          transform: `translateX(${Math.sin(offset * 0.05) * intensity}px)`,
        }}
      />
    </div>
  );
};

const DemoCubes: React.FC<any> = ({ cubeCount, cubeColor, rotationSpeed, perspective }) => {
  const cubes = Array.from({ length: cubeCount || 8 });

  return (
    <div
      className="absolute inset-0 flex flex-wrap items-center justify-center gap-8"
      style={{ perspective: perspective || 1000 }}
    >
      <style>
        {`
          @keyframes rotate-cube {
            0% { transform: rotateX(0deg) rotateY(0deg); }
            100% { transform: rotateX(360deg) rotateY(360deg); }
          }
          .cube {
            width: 60px;
            height: 60px;
            position: relative;
            transform-style: preserve-3d;
            animation: rotate-cube ${10 / (rotationSpeed || 1)}s linear infinite;
          }
          .cube-face {
            position: absolute;
            width: 60px;
            height: 60px;
            background: ${cubeColor || '#6366f1'};
            opacity: 0.8;
            border: 1px solid rgba(255,255,255,0.2);
          }
        `}
      </style>
      {cubes.map((_, i) => (
        <div key={i} className="cube">
          <div className="cube-face" style={{ transform: 'translateZ(30px)' }} />
          <div className="cube-face" style={{ transform: 'rotateY(180deg) translateZ(30px)' }} />
          <div className="cube-face" style={{ transform: 'rotateY(90deg) translateZ(30px)' }} />
          <div className="cube-face" style={{ transform: 'rotateY(-90deg) translateZ(30px)' }} />
          <div className="cube-face" style={{ transform: 'rotateX(90deg) translateZ(30px)' }} />
          <div className="cube-face" style={{ transform: 'rotateX(-90deg) translateZ(30px)' }} />
        </div>
      ))}
    </div>
  );
};

const DemoBallpit: React.FC<any> = ({ ballCount, colors, gravity, bounce }) => {
  const [balls, setBalls] = useState<Array<{
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
  }>>([]);

  useEffect(() => {
    const ballColors = colors || ['#ff0080', '#7928ca', '#0070f3', '#00f260', '#ffb800'];
    const count = ballCount || 20;

    const initialBalls = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 80 + 10,
      y: Math.random() * 50,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      color: ballColors[i % ballColors.length],
      size: Math.random() * 20 + 15,
    }));

    setBalls(initialBalls);

    const interval = setInterval(() => {
      setBalls(prevBalls =>
        prevBalls.map(ball => {
          let newX = ball.x + ball.vx;
          let newY = ball.y + ball.vy;
          let newVx = ball.vx;
          let newVy = ball.vy + (gravity || 0.5);

          if (newY > 90) {
            newY = 90;
            newVy = -newVy * (bounce || 0.8);
          }
          if (newX < 0 || newX > 100) {
            newVx = -newVx;
            newX = Math.max(0, Math.min(100, newX));
          }

          return { ...ball, x: newX, y: newY, vx: newVx, vy: newVy };
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, [ballCount, colors, gravity, bounce]);

  return (
    <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
      {balls.map(ball => (
        <div
          key={ball.id}
          style={{
            position: 'absolute',
            left: `${ball.x}%`,
            top: `${ball.y}%`,
            width: ball.size,
            height: ball.size,
            borderRadius: '50%',
            background: ball.color,
            transition: 'all 0.05s linear',
            boxShadow: `0 4px 8px rgba(0,0,0,0.2)`,
          }}
        />
      ))}
    </div>
  );
};

const DemoRetroGrid: React.FC<any> = ({ gridColor, horizonColor, speed, fogDensity }) => {
  return (
    <div className="absolute inset-0" style={{ overflow: 'hidden', background: '#000' }}>
      <style>
        {`
          @keyframes retro-scroll {
            0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
            100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
          }
          .retro-grid {
            position: absolute;
            bottom: 0;
            left: 50%;
            width: 200%;
            height: 200%;
            transform: perspective(500px) rotateX(60deg) translateX(-50%);
            background-image:
              linear-gradient(${gridColor || '#ff00ff'} 2px, transparent 2px),
              linear-gradient(90deg, ${gridColor || '#ff00ff'} 2px, transparent 2px);
            background-size: 50px 50px;
            animation: retro-scroll ${5 / (speed || 1)}s linear infinite;
          }
          .horizon {
            position: absolute;
            bottom: 50%;
            left: 0;
            right: 0;
            height: 50%;
            background: linear-gradient(to top, ${horizonColor || '#ff0080'}, transparent);
            opacity: ${fogDensity || 0.5};
          }
        `}
      </style>
      <div className="horizon" />
      <div className="retro-grid" />
    </div>
  );
};

const DemoAnimatedList: React.FC<any> = ({ items, staggerDelay, animationType, className }) => {
  const [visibleItems, setVisibleItems] = useState(0);
  const itemList = items || ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'];

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleItems(prev => {
        if (prev >= itemList.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, (staggerDelay || 0.1) * 1000);
    return () => clearInterval(interval);
  }, [staggerDelay, itemList.length]);

  const getAnimationStyle = (index: number, type: string) => {
    const isVisible = index < visibleItems;
    const baseStyle = {
      opacity: isVisible ? 1 : 0,
      transition: 'all 0.5s ease-out',
    };

    switch (type) {
      case 'fade-up':
        return { ...baseStyle, transform: isVisible ? 'translateY(0)' : 'translateY(20px)' };
      case 'fade-left':
        return { ...baseStyle, transform: isVisible ? 'translateX(0)' : 'translateX(-20px)' };
      case 'fade-right':
        return { ...baseStyle, transform: isVisible ? 'translateX(0)' : 'translateX(20px)' };
      case 'scale':
        return { ...baseStyle, transform: isVisible ? 'scale(1)' : 'scale(0.8)' };
      default:
        return baseStyle;
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {itemList.map((item, i) => (
        <div
          key={i}
          className={`${className} p-4 bg-muted/20 rounded-lg border border-border`}
          style={getAnimationStyle(i, animationType || 'fade-up')}
        >
          {item}
        </div>
      ))}
    </div>
  );
};

const DemoCardSwap: React.FC<any> = ({ cards, swapDirection, cardHeight, autoSwap }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardList = cards || ['Card 1', 'Card 2', 'Card 3'];

  useEffect(() => {
    if (!autoSwap) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % cardList.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoSwap, cardList.length]);

  const isHorizontal = swapDirection === 'horizontal';

  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="relative" style={{ width: '80%', height: cardHeight || 200 }}>
        {cardList.map((card, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-xl flex items-center justify-center text-2xl font-bold transition-all duration-500"
            style={{
              background: `hsl(${(i * 360) / cardList.length}, 70%, 60%)`,
              transform: currentIndex === i
                ? 'translate(0, 0) scale(1)'
                : isHorizontal
                ? `translateX(${(i - currentIndex) * 100}%) scale(0.9)`
                : `translateY(${(i - currentIndex) * 100}%) scale(0.9)`,
              opacity: currentIndex === i ? 1 : 0.5,
              zIndex: currentIndex === i ? 10 : 1,
            }}
          >
            {card}
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 flex gap-2">
        {cardList.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === currentIndex ? 'bg-primary w-6' : 'bg-muted-foreground'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

const DemoMorphCard: React.FC<any> = ({ title, content, morphShape, cardColor }) => {
  const [isHovered, setIsHovered] = useState(false);

  const getClipPath = (shape: string, hovered: boolean) => {
    if (!hovered) return 'none';
    switch (shape) {
      case 'circle':
        return 'circle(50% at 50% 50%)';
      case 'hexagon':
        return 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)';
      case 'diamond':
        return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      default:
        return 'none';
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative w-64 h-64 flex flex-col items-center justify-center p-6 text-white cursor-pointer transition-all duration-500"
        style={{
          backgroundColor: cardColor || '#6366f1',
          borderRadius: isHovered ? '0' : '12px',
          clipPath: getClipPath(morphShape || 'circle', isHovered),
        }}
      >
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-sm text-center">{content}</p>
      </div>
    </div>
  );
};

const DemoFlipCard: React.FC<any> = ({ frontTitle, frontContent, backTitle, backContent, flipDirection, cardWidth, cardHeight }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const isHorizontal = flipDirection === 'horizontal';

  return (
    <div className="w-full h-full flex items-center justify-center p-6" style={{ perspective: 1000 }}>
      <div
        onMouseEnter={() => setIsFlipped(true)}
        onMouseLeave={() => setIsFlipped(false)}
        className="relative cursor-pointer"
        style={{
          width: cardWidth || 300,
          height: cardHeight || 400,
          transformStyle: 'preserve-3d',
          transform: isFlipped
            ? isHorizontal
              ? 'rotateY(180deg)'
              : 'rotateX(180deg)'
            : 'rotate(0)',
          transition: 'transform 0.6s',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-xl p-6 flex flex-col items-center justify-center text-white"
          style={{
            backgroundColor: '#6366f1',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          <h3 className="text-2xl font-bold mb-4">{frontTitle}</h3>
          <p className="text-center">{frontContent}</p>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 rounded-xl p-6 flex flex-col items-center justify-center text-white"
          style={{
            backgroundColor: '#a855f7',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: isHorizontal ? 'rotateY(180deg)' : 'rotateX(180deg)',
          }}
        >
          <h3 className="text-2xl font-bold mb-4">{backTitle}</h3>
          <p className="text-center">{backContent}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Demo component map
 */
const DEMO_COMPONENTS: Record<string, React.ComponentType<any>> = {
  // Text Animations
  'blur-text': DemoBlurText,
  'count-up': DemoCountUp,
  'glitch-text': DemoGlitchText,
  'gradient-text': DemoGradientText,
  'scrambled-text': DemoScrambledText,
  'typewriter-text': DemoTypewriterText,
  'neon-text': DemoNeonText,
  'shiny-text': DemoShinyText,
  'rotating-text': DemoRotatingText,
  'split-text': DemoSplitText,
  'shuffle-text': DemoShuffleText,
  'decrypted-text': DemoDecryptedText,
  'loop-text': DemoLoopText,
  'wavy-text': DemoWavyText,

  // Backgrounds
  'aurora': DemoAurora,
  'particles': DemoParticles,
  'waves': DemoWaves,
  'dots-pattern': DemoDotsPattern,
  'gradient-mesh': DemoGradientMesh,
  'starfield': DemoStarfield,
  'beams': DemoBeams,
  'ripple-grid': DemoRippleGrid,
  'grid-motion': DemoGridMotion,
  'plasma': DemoPlasma,
  'chroma-grid': DemoChromaGrid,
  'cubes': DemoCubes,
  'ballpit': DemoBallpit,
  'retro-grid': DemoRetroGrid,

  // Interactive Components
  'spotlight-card': DemoSpotlightCard,
  'dock': DemoDock,
  'bounce-cards': DemoBounceCards,
  'circular-gallery': DemoCircularGallery,
  'star-border': DemoStarBorder,
  'animated-list': DemoAnimatedList,
  'card-swap': DemoCardSwap,
  'morph-card': DemoMorphCard,
  'flip-card': DemoFlipCard,
};

/**
 * Main ReactBits Renderer
 */
export const ReactBitsRenderer: React.FC<RendererProps> = ({
  component,
  isSelected,
  isEditing,
  styles,
}) => {
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const reactBitsId = (component.props as any).reactBitsId;
  const catalogEntry = REACTBITS_CATALOG[reactBitsId];

  useEffect(() => {
    if (!reactBitsId) return;

    setLoadingState('loading');
    loadComponent(reactBitsId)
      .then((result) => {
        if (result.success) {
          setLoadingState('loaded');
        } else {
          setLoadingState('error');
          setError(result.error || 'Unknown error');
        }
      })
      .catch((err) => {
        setLoadingState('error');
        setError(err.message || 'Failed to load component');
      });
  }, [reactBitsId]);

  // Create wrapper styles that properly handle the component positioning
  // The styles prop already contains position, transform, etc. from ComponentRenderer
  const wrapperStyles: React.CSSProperties = {
    ...styles,
    pointerEvents: isEditing ? ('none' as const) : ('auto' as const),
    // Ensure the wrapper fills its container
    width: '100%',
    height: '100%',
    // Remove any default margins/padding that could cause offset
    margin: 0,
    padding: 0,
  };

  if (!catalogEntry) {
    return (
      <div style={wrapperStyles}>
        <ErrorPlaceholder name="Unknown Component" error={`Component ${reactBitsId} not found in catalog`} />
      </div>
    );
  }

  if (loadingState === 'loading') {
    return (
      <div style={wrapperStyles}>
        <LoadingPlaceholder name={catalogEntry.displayName} />
      </div>
    );
  }

  if (loadingState === 'error') {
    return (
      <div style={wrapperStyles}>
        <ErrorPlaceholder name={catalogEntry.displayName} error={error || 'Failed to load'} />
      </div>
    );
  }

  // Use demo component if available
  const DemoComponent = DEMO_COMPONENTS[reactBitsId];
  if (DemoComponent) {
    return (
      <div style={wrapperStyles}>
        <Suspense fallback={<LoadingPlaceholder name={catalogEntry.displayName} />}>
          <DemoComponent {...component.props} />
        </Suspense>
      </div>
    );
  }

  // Fallback: show a placeholder
  return (
    <div style={wrapperStyles}>
      <div className="w-full h-full flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary/50 rounded">
        <div className="text-center p-4">
          <p className="font-semibold text-primary">{catalogEntry.displayName}</p>
          <p className="text-xs text-muted-foreground mt-1">{catalogEntry.description}</p>
          <p className="text-xs text-muted-foreground mt-2">Preview coming soon</p>
        </div>
      </div>
    </div>
  );
};

// Register the ReactBits renderer
import { registerRenderer } from '../utils';
registerRenderer('ReactBits', ReactBitsRenderer);
