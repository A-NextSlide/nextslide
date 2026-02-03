import React from 'react';
import { cn } from '@/lib/utils';

type BrandWordmarkProps = {
  tag?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  /** Overall visual height for the letters in pixels. */
  sizePx?: number;
  /** Color of the letters. */
  textColor?: string;
  /** Accent color for the X vector. */
  accentColor?: string;
  /** Optional custom SVG path for the X shape (fill). */
  xSvgPath?: string;
  /** Custom viewBox for the provided X path. */
  xViewBox?: string;
  /** Optional image URL for the X glyph; if provided, it takes precedence. */
  xImageUrl?: string;
  /** Horizontal gap on both sides of the X in px. Can be negative to tuck letters in. */
  gapPx?: number;
  /** Optional override for left-side gap only (px). */
  gapLeftPx?: number;
  /** Optional override for right-side gap only (px). */
  gapRightPx?: number;
  /** Raise/lower the entire wordmark (px). Negative moves up. */
  liftPx?: number;
  /** Raise/lower the left text segment (px). Negative moves up. */
  leftLiftPx?: number;
  /** Raise/lower the X glyph (px). Negative moves up. */
  xLiftPx?: number;
  /** Raise/lower the right text segment (px). Negative moves up. */
  rightLiftPx?: number;
  /** If true, renders NEXT.SLIDE (with dot). Otherwise renders NEXTSLIDE. */
  useDot?: boolean;
  /** Optional click handler for the whole wordmark. */
  onClick?: React.MouseEventHandler;
};

/**
 * Brand wordmark that renders "NE" + oversized vector X + "T.SLIDE"/"TSLIDE".
 * The X is intentionally taller and longer to serve as the hero glyph.
 */
export function BrandWordmark({
  tag = 'div',
  className,
  style,
  sizePx = 19,
  textColor = '#383636',
  accentColor = '#FF4301',
  xSvgPath,
  xViewBox = '0 0 64 64',
  xImageUrl,
  gapPx,
  gapLeftPx,
  gapRightPx,
  liftPx,
  leftLiftPx,
  xLiftPx,
  rightLiftPx,
  useDot = false,
  onClick,
}: BrandWordmarkProps) {
  const Tag = tag as any;

  // The font is used widely across the app in inline styles
  const baseTextStyle: React.CSSProperties = {
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    fontWeight: 900,
    fontSize: `${sizePx}px`,
    lineHeight: '100%',
    letterSpacing: '0%',
    textTransform: 'uppercase',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    color: textColor,
  };

  // Make the X substantially larger than letters, and visibly longer horizontally
  const xHeight = sizePx * 1.9; // significantly taller than letters
  const xWidth = sizePx * 1.3;  // noticeably longer than tall
  const xStroke = Math.max(2, Math.round(sizePx * 0.5));

  return (
    <Tag
      className={cn('inline-flex items-center select-none', className)}
      style={{ position: liftPx !== undefined ? 'relative' as const : undefined, top: liftPx, ...baseTextStyle, ...style }}
      onClick={onClick}
    >
      {/* Left segment: NE */}
      <span style={{ color: textColor, display: 'inline-block', position: 'relative', top: leftLiftPx, zIndex: 1 }}>NE</span>

      {/* Oversized vector X. Stroke-based for crisp scaling and easy color control. */}
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: `${xHeight}px`,
          width: `${xWidth}px`,
          marginLeft: (gapLeftPx !== undefined ? gapLeftPx : (gapPx !== undefined ? gapPx : Math.max(0, Math.round(sizePx * 0.04)))) + 'px',
          marginRight: (gapRightPx !== undefined ? gapRightPx : (gapPx !== undefined ? gapPx : Math.max(0, Math.round(sizePx * 0.04)))) + 'px',
          position: 'relative',
          top: xLiftPx,
          zIndex: 2,
        }}
      >
        {xImageUrl ? (
          <img
            src={xImageUrl}
            alt="Brand X"
            width={xWidth}
            height={xHeight}
            style={{ objectFit: 'contain', display: 'block', opacity: 1 }}
          />
        ) : (
          <svg
            viewBox={xViewBox}
            width={xWidth}
            height={xHeight}
            role="img"
            aria-label="Brand X"
            focusable="false"
            style={{ display: 'block' }}
          >
            {xSvgPath ? (
              <path d={xSvgPath} fill={accentColor} />
            ) : (
              <>
                {/* Two long strokes with round caps to emulate a filled vector X look */}
                <path d="M8 8 L56 56" stroke={accentColor} strokeWidth={xStroke} strokeLinecap="round" />
                <path d="M56 8 L8 56" stroke={accentColor} strokeWidth={xStroke} strokeLinecap="round" />
              </>
            )}
          </svg>
        )}
      </span>

      {/* Right segment: T.SLIDE or TSLIDE */}
      <span style={{ color: textColor, display: 'inline-block', position: 'relative', top: rightLiftPx, zIndex: 1 }}>
        {useDot ? 'T.SLIDE' : 'TSLIDE'}
      </span>
    </Tag>
  );
}

export default BrandWordmark;


