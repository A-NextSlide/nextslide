import React from 'react';

export type LogoPlaceholderProps = {
  width: number;
  height: number;
  primaryColor?: string;
  textColor?: string;
  fontFamily?: string;
  splatOpacity?: number; // 0.12–0.2 looks good
  layout?: 'overlay' | 'inline';
};

export function LogoPlaceholder({
  width,
  height,
  primaryColor = '#FF4301',
  textColor = '#6B6B6B',
  fontFamily = 'HK Grotesk Wide, Hanken Grotesk, sans-serif',
  splatOpacity = 1,
  layout = 'overlay',
}: LogoPlaceholderProps) {
  const w = Math.max(48, Number.isFinite(width as number) ? (width as number) : 120);
  const h = Math.max(48, Number.isFinite(height as number) ? (height as number) : 120);
  const fill = primaryColor;

  if (layout === 'inline') {
    // Inline layout using the PaintSplatter3 path from SplatterLoadingOverlay, scaled to 1000x1000 icon box
    const baseH = 1000;
    // Icon source path viewBox is 201 x 250
    const srcW = 201;
    const srcH = 250;
    const iconBoxW = 1000;
    const iconBoxH = 1000;
    const gapW = 160;
    const textW = 1200; // visual width for the word "Logo"
    const baseW = iconBoxW + gapW + textW;

    // Scale to fit path into icon box while preserving aspect ratio
    const scaleIcon = Math.min(iconBoxW / srcW, iconBoxH / srcH);
    const iconOffsetX = (iconBoxW - srcW * scaleIcon) / 2;
    const iconOffsetY = (iconBoxH - srcH * scaleIcon) / 2;

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${baseW} ${baseH}`} role="img" aria-label="Logo placeholder">
        {/* Icon (splat) */}
        <g transform={`translate(${iconOffsetX}, ${iconOffsetY}) scale(${scaleIcon})`}>
          <path d="M103.263 8.19154C103.263 -1.52039 117.315 -2.83998 119.123 6.70216L130.476 66.6178C131.718 73.173 139.966 75.4171 144.358 70.3949L186.123 22.6377C192.598 15.2337 204.134 23.7788 198.938 32.1302L167.361 82.8822C164.046 88.2111 167.878 95.1083 174.154 95.1083H175.622C182.28 95.1083 185.96 102.831 181.767 108.002C178.377 112.182 180.06 118.455 185.088 120.375L187.629 121.346C194.489 123.966 194.489 133.672 187.629 136.292L182.909 138.095C178.575 139.751 176.553 144.734 178.509 148.941L179.539 151.158C182.004 156.46 178.132 162.53 172.285 162.53H170.31C165.01 162.53 161.175 167.59 162.608 172.693L181.178 238.818C183.832 248.269 170.415 253.269 166.237 244.386L146.124 201.627C142.649 194.239 131.64 196.191 130.916 204.324L129.357 221.851C128.167 235.218 108.632 235.218 107.443 221.851L105.161 196.202C104.505 188.829 95.0489 186.225 90.7106 192.223L77.2473 210.836C71.8714 218.268 60.2517 212.28 63.1854 203.589L71.3843 179.3C73.5862 172.777 67.0678 166.704 60.7168 169.361L57.8659 170.554C50.2556 173.738 43.3905 164.716 48.4887 158.23L52.4672 153.169C56.4564 148.094 53.1021 140.627 46.6588 140.239L8.00076 137.911C-1.82236 137.319 -2.11432 122.956 7.67664 121.966L29.7764 119.73C37.8251 118.916 39.3061 107.816 31.7523 104.92C23.3048 101.682 26.431 89.0494 35.4137 90.1247L63.0758 93.4361C69.2371 94.1736 73.8559 87.9201 71.3392 82.2482L55.9936 47.6632C52.1642 39.0328 63.8253 32.0542 69.6213 39.5076L88.9478 64.3606C93.6241 70.374 103.263 67.0673 103.263 59.4497V8.19154Z"
            fill={fill}
            fillOpacity={splatOpacity}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={4 / scaleIcon}
          />
        </g>
        {/* Text block */}
        <text
          x={iconBoxW + gapW}
          y={baseH / 2}
          textAnchor="start"
          dominantBaseline="central"
          fill={textColor}
          lengthAdjust="spacingAndGlyphs"
          textLength={textW}
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 520,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          LOGO
        </text>
      </svg>
    );
  }

  // Default overlay layout using PaintSplatter3 path centered in a 1000x1000 viewBox
  const srcW = 201;
  const srcH = 250;
  const scaleIcon = Math.min(1000 / srcW, 1000 / srcH);
  const iconOffsetX = (1000 - srcW * scaleIcon) / 2;
  const iconOffsetY = (1000 - srcH * scaleIcon) / 2;
  return (
    <svg width="100%" height="100%" viewBox="0 0 1000 1000" role="img" aria-label="Logo placeholder">
      <g transform={`translate(${iconOffsetX}, ${iconOffsetY}) scale(${scaleIcon})`}>
        <path
          d="M94.993 8.07456C94.993 -1.80364 109.389 -2.91031 110.899 6.85184L118.221 54.1956C119.317 61.2852 128.471 63.4597 132.638 57.6206L161.161 17.6584C166.91 9.60444 179.286 17.1054 174.806 25.9282L155.247 64.4457C151.968 70.9023 159.17 77.6311 165.389 73.9225C172.11 69.9148 179.517 77.9608 174.968 84.3281L162.643 101.579C159.737 105.648 161.233 111.356 165.761 113.475L169.562 115.254C175.707 118.13 175.707 126.869 169.562 129.745L168.662 130.167C163.304 132.674 162.427 139.929 167.033 143.641L183.216 156.685C190.322 162.412 183.836 173.66 175.32 170.379L162.692 165.513C155.941 162.912 149.48 169.895 152.596 176.424L159.951 191.836C163.958 200.23 152.829 207.55 146.708 200.546L133.838 185.82C129.161 180.469 120.35 183.417 119.835 190.505L119.079 200.915C118.092 214.519 98.1251 214.519 97.1373 200.915L96.8471 196.919C96.2791 189.098 85.9656 186.678 81.979 193.431L76.2093 203.205C71.4602 211.25 59.1262 206.019 61.6075 197.013L66.7419 178.377C68.689 171.309 60.8964 165.563 54.7201 169.512L14.541 195.199C6.17829 200.545 -2.50901 188.896 5.0008 182.406L44.5685 148.21C49.9582 143.553 47.0305 134.704 39.9263 134.179L7.41816 131.78C-2.22028 131.069 -2.56833 117.051 7.02293 115.863L49.0643 110.652C54.2069 110.015 57.3959 104.731 55.5633 99.8837L49.436 83.6767C48.073 80.0714 51.8276 76.6591 55.2865 78.3596C59.3569 80.3607 63.3115 75.4478 60.487 71.8989L34.2637 38.9504C28.1028 31.2095 38.7146 21.3746 45.9656 28.1052L81.5506 61.1355C86.6697 65.8872 94.993 62.2567 94.993 55.2721V8.07456Z"
          fill={fill}
          fillOpacity={splatOpacity}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={4 / scaleIcon}
        />
      </g>
      <text
        x={500}
        y={500}
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: 280,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        LOGO
      </text>
    </svg>
  );
}


