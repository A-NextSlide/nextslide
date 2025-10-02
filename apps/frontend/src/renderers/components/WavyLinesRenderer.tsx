import React, { useMemo } from 'react';
import { RendererFunction, registerRenderer } from '../index';
import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';

function generateSinePath(width: number, height: number, baseY: number, amplitude: number, frequency: number, phase: number): string {
  const segments = Math.max(32, Math.floor(width / 8));
  const step = width / segments;
  let d = `M 0 ${baseY.toFixed(2)}`;
  for (let i = 1; i <= segments; i++) {
    const x = i * step;
    const y = baseY + Math.sin((i / segments) * Math.PI * 2 * frequency + phase) * amplitude;
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

export const renderWavyLines: RendererFunction = ({ component, styles, containerRef }) => {
  const {
    width = DEFAULT_SLIDE_WIDTH,
    height = DEFAULT_SLIDE_HEIGHT,
    lineColor = '#c32428cc',
    strokeWidth = 2,
    linesCount = 36,
    spacing = 26,
    amplitude = 120,
    frequency = 1.2,
    phase = 0,
    phaseIncrement = 0.12,
    baseY = 720,
    blendMode = 'screen',
  } = (component.props || {}) as any;

  const parseColor = (value: string): { hex: string; opacity: number } => {
    const v = String(value || '').trim();
    // 8-digit hex #RRGGBBAA
    const eight = /^#([0-9a-fA-F]{8})$/;
    const six = /^#([0-9a-fA-F]{6})$/;
    if (eight.test(v)) {
      const hex = v.slice(0, 7);
      const aa = parseInt(v.slice(7, 9), 16);
      return { hex, opacity: aa / 255 };
    }
    if (six.test(v)) return { hex: v, opacity: 1 };
    return { hex: '#c32428', opacity: 1 };
  };

  const paths = useMemo(() => {
    const items: { d: string; y: number; phase: number }[] = [];
    const startIndex = -Math.floor(linesCount / 2);
    for (let i = 0; i < linesCount; i++) {
      const idx = startIndex + i;
      const y = baseY + idx * spacing;
      const ph = phase + i * phaseIncrement;
      const d = generateSinePath(width, height, y, amplitude, frequency, ph);
      items.push({ d, y, phase: ph });
    }
    return items;
  }, [width, height, linesCount, spacing, baseY, amplitude, frequency, phase, phaseIncrement]);

  const { hex: strokeHex, opacity: strokeOpacity } = parseColor(String(lineColor));

  return (
    <div ref={containerRef} style={{ ...styles, overflow: 'hidden', mixBlendMode: blendMode as any }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={strokeHex} strokeOpacity={strokeOpacity} strokeWidth={strokeWidth} />
        ))}
      </svg>
    </div>
  );
};

registerRenderer('WavyLines', renderWavyLines);

export default renderWavyLines;


