import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ThemeGeneratingUIProps {
  isDarkMode: boolean;
  progress: number;
  message?: string;
  className?: string;
}

interface Line {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  duration: number;
  direction: 'horizontal' | 'vertical';
  createdAt: number;
}

interface ImagePlaceholder {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
  finalRotation?: number;
  scale?: number;
}

// Template sketch definitions with creative layouts
interface SketchPath {
  id: string;
  d: string;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
  strokeDasharray?: string;
  opacity?: number;
}

interface TemplateSketch {
  id: string;
  name: string;
  paths: SketchPath[];
  viewBox: string;
}

const templateSketches: TemplateSketch[] = [
  {
    id: 'modern-hero',
    name: 'Modern Hero',
    viewBox: '0 0 300 200',
    paths: [
      // Outer frame with organic corners
      { id: 'frame', d: 'M20,20 Q20,10 30,10 L270,10 Q280,10 280,20 L280,180 Q280,190 270,190 L30,190 Q20,190 20,180 Z', strokeWidth: 2.5, delay: 0, duration: 2 },
      // Asymmetric title block
      { id: 'title-bg', d: 'M40,35 L180,35 Q190,35 190,45 L190,65 Q190,75 180,75 L40,75 Q30,75 30,65 L30,45 Q30,35 40,35', strokeWidth: 1.5, delay: 0.5, duration: 1.2, opacity: 0.3 },
      // Title lines with varying widths
      { id: 'title1', d: 'M50,50 L170,50', strokeWidth: 4, delay: 1, duration: 0.6, strokeDasharray: '180 20' },
      { id: 'title2', d: 'M50,60 L140,60', strokeWidth: 3, delay: 1.2, duration: 0.5 },
      // Floating elements
      { id: 'float1', d: 'M210,40 Q210,30 220,30 L250,30 Q260,30 260,40 L260,60 Q260,70 250,70 L220,70 Q210,70 210,60 Z', strokeWidth: 1, delay: 1.5, duration: 0.8, opacity: 0.6 },
      { id: 'float2', d: 'M220,45 L250,45 M220,55 L240,55', strokeWidth: 0.8, delay: 1.8, duration: 0.4 },
      // Content area with wave
      { id: 'wave', d: 'M30,100 Q60,95 90,100 T150,100 T210,100 T270,100', strokeWidth: 1.5, delay: 2, duration: 1.5, opacity: 0.4 },
      // Text blocks
      { id: 'text1', d: 'M40,120 L120,120', strokeWidth: 1, delay: 2.2, duration: 0.4 },
      { id: 'text2', d: 'M40,130 L100,130', strokeWidth: 1, delay: 2.3, duration: 0.3 },
      { id: 'text3', d: 'M40,140 L110,140', strokeWidth: 1, delay: 2.4, duration: 0.35 },
      // CTA button with shadow effect
      { id: 'cta-shadow', d: 'M42,162 L122,162 L122,182 L42,182 Z', strokeWidth: 0.5, delay: 2.5, duration: 0.5, opacity: 0.2 },
      { id: 'cta', d: 'M40,160 L120,160 L120,180 L40,180 Z', strokeWidth: 2, delay: 2.6, duration: 0.6 },
    ]
  },
  {
    id: 'creative-grid',
    name: 'Creative Grid',
    viewBox: '0 0 300 200',
    paths: [
      // Tilted frame
      { id: 'frame', d: 'M15,25 L285,15 L290,185 L10,195 Z', strokeWidth: 2, delay: 0, duration: 2 },
      // Overlapping grid cells
      { id: 'grid1', d: 'M40,50 L100,48 L102,108 L42,110 Z', strokeWidth: 1.5, delay: 0.5, duration: 0.7 },
      { id: 'grid2', d: 'M110,47 L170,45 L172,105 L112,107 Z', strokeWidth: 1.5, delay: 0.7, duration: 0.7 },
      { id: 'grid3', d: 'M180,44 L240,42 L242,102 L182,104 Z', strokeWidth: 1.5, delay: 0.9, duration: 0.7 },
      // Second row with overlap
      { id: 'grid4', d: 'M45,120 L145,116 L147,176 L47,180 Z', strokeWidth: 1.5, delay: 1.1, duration: 0.9 },
      { id: 'grid5', d: 'M135,117 L235,113 L237,173 L137,177 Z', strokeWidth: 1.5, delay: 1.3, duration: 0.9, opacity: 0.8 },
      // Decorative circles
      { id: 'circle1', d: 'M70,75 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0', strokeWidth: 1, delay: 1.8, duration: 0.6 },
      { id: 'circle2', d: 'M210,70 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 1, delay: 1.9, duration: 0.4 },
      // Connecting lines
      { id: 'connect1', d: 'M78,75 L132,73', strokeWidth: 0.5, delay: 2.1, duration: 0.5, strokeDasharray: '2 3' },
      { id: 'connect2', d: 'M188,71 L205,70', strokeWidth: 0.5, delay: 2.2, duration: 0.3, strokeDasharray: '2 3' },
    ]
  },
  {
    id: 'organic-flow',
    name: 'Organic Flow',
    viewBox: '0 0 300 200',
    paths: [
      // Organic blob frame
      { id: 'blob', d: 'M50,30 Q20,30 20,60 L20,140 Q20,170 50,170 L250,170 Q280,170 280,140 L280,60 Q280,30 250,30 Z', strokeWidth: 2, delay: 0, duration: 2.5 },
      // Flowing title area
      { id: 'title-flow', d: 'M60,50 Q90,45 120,50 T180,50 Q210,50 220,55', strokeWidth: 3, delay: 0.8, duration: 1.2 },
      { id: 'subtitle', d: 'M80,65 Q100,63 120,65 T160,65', strokeWidth: 2, delay: 1.2, duration: 0.8 },
      // Organic shapes
      { id: 'shape1', d: 'M40,90 Q60,85 80,90 T120,90 Q140,90 140,110 T120,130 Q100,130 80,130 T40,130 Q20,130 20,110 T40,90', strokeWidth: 1.5, delay: 1.5, duration: 1.5, opacity: 0.6 },
      { id: 'shape2', d: 'M160,95 Q180,90 200,95 T240,95 Q260,95 260,115 T240,135 Q220,135 200,135 T160,135 Q140,135 140,115 T160,95', strokeWidth: 1.5, delay: 1.8, duration: 1.5, opacity: 0.4 },
      // Flowing lines
      { id: 'flow1', d: 'M50,110 Q70,105 90,110 T130,110', strokeWidth: 1, delay: 2.3, duration: 0.6 },
      { id: 'flow2', d: 'M170,115 Q190,110 210,115 T250,115', strokeWidth: 1, delay: 2.4, duration: 0.6 },
      // Bottom accent
      { id: 'accent', d: 'M80,150 Q150,145 220,150', strokeWidth: 2, delay: 2.7, duration: 0.8, strokeDasharray: '5 5' },
    ]
  },
  {
    id: 'dynamic-showcase',
    name: 'Dynamic Showcase',
    viewBox: '0 0 300 200',
    paths: [
      // Perspective frame
      { id: 'frame', d: 'M10,20 L290,10 L285,190 L15,180 Z', strokeWidth: 2.5, delay: 0, duration: 2 },
      // Central showcase area
      { id: 'showcase', d: 'M80,50 L220,45 L225,125 L85,130 Z', strokeWidth: 2, delay: 0.6, duration: 1.2 },
      // Inner detail lines creating depth
      { id: 'depth1', d: 'M90,60 L210,55', strokeWidth: 0.5, delay: 1.2, duration: 0.4, opacity: 0.5 },
      { id: 'depth2', d: 'M92,70 L212,65', strokeWidth: 0.5, delay: 1.3, duration: 0.4, opacity: 0.4 },
      { id: 'depth3', d: 'M94,80 L214,75', strokeWidth: 0.5, delay: 1.4, duration: 0.4, opacity: 0.3 },
      // Side elements
      { id: 'side1', d: 'M30,60 L60,59 L61,119 L31,120 Z', strokeWidth: 1.5, delay: 1.6, duration: 0.6 },
      { id: 'side2', d: 'M240,54 L270,53 L269,113 L239,114 Z', strokeWidth: 1.5, delay: 1.8, duration: 0.6 },
      // Bottom navigation dots
      { id: 'nav1', d: 'M130,150 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0', strokeWidth: 1, delay: 2.1, duration: 0.3 },
      { id: 'nav2', d: 'M150,150 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0', strokeWidth: 1, delay: 2.2, duration: 0.3 },
      { id: 'nav3', d: 'M170,150 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0', strokeWidth: 1, delay: 2.3, duration: 0.3 },
      // Decorative swoosh
      { id: 'swoosh', d: 'M20,160 Q60,155 100,160 T180,160 Q220,160 260,155', strokeWidth: 1.5, delay: 2.5, duration: 1, strokeDasharray: '10 5' },
    ]
  },
  {
    id: 'minimalist-zen',
    name: 'Minimalist Zen',
    viewBox: '0 0 300 200',
    paths: [
      // Clean frame
      { id: 'frame', d: 'M30,30 L270,30 L270,170 L30,170 Z', strokeWidth: 1, delay: 0, duration: 2.5 },
      // Zen circle
      { id: 'zen-circle', d: 'M150,60 m-25,0 a25,25 0 1,0 50,0 a25,25 0 1,0 -50,0', strokeWidth: 2, delay: 0.8, duration: 1.5, opacity: 0.6 },
      // Horizontal balance lines
      { id: 'balance1', d: 'M50,100 L130,100', strokeWidth: 0.8, delay: 1.5, duration: 0.6 },
      { id: 'balance2', d: 'M170,100 L250,100', strokeWidth: 0.8, delay: 1.6, duration: 0.6 },
      // Vertical element
      { id: 'vertical', d: 'M150,110 L150,150', strokeWidth: 1.5, delay: 1.8, duration: 0.5 },
      // Minimal text indicators
      { id: 'text1', d: 'M80,130 L120,130', strokeWidth: 0.5, delay: 2.1, duration: 0.3 },
      { id: 'text2', d: 'M180,130 L220,130', strokeWidth: 0.5, delay: 2.2, duration: 0.3 },
      { id: 'text3', d: 'M100,140 L200,140', strokeWidth: 0.5, delay: 2.3, duration: 0.4 },
    ]
  },
  {
    id: 'burst-energy',
    name: 'Burst Energy',
    viewBox: '0 0 300 200',
    paths: [
      // Dynamic frame
      { id: 'frame', d: 'M20,20 L280,20 L280,180 L20,180 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Central burst
      { id: 'burst-center', d: 'M150,100 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 2, delay: 0.5, duration: 0.5 },
      // Radiating lines
      { id: 'ray1', d: 'M150,100 L150,60', strokeWidth: 1.5, delay: 0.7, duration: 0.3 },
      { id: 'ray2', d: 'M150,100 L180,80', strokeWidth: 1.5, delay: 0.8, duration: 0.3 },
      { id: 'ray3', d: 'M150,100 L190,100', strokeWidth: 1.5, delay: 0.9, duration: 0.3 },
      { id: 'ray4', d: 'M150,100 L180,120', strokeWidth: 1.5, delay: 1, duration: 0.3 },
      { id: 'ray5', d: 'M150,100 L150,140', strokeWidth: 1.5, delay: 1.1, duration: 0.3 },
      { id: 'ray6', d: 'M150,100 L120,120', strokeWidth: 1.5, delay: 1.2, duration: 0.3 },
      { id: 'ray7', d: 'M150,100 L110,100', strokeWidth: 1.5, delay: 1.3, duration: 0.3 },
      { id: 'ray8', d: 'M150,100 L120,80', strokeWidth: 1.5, delay: 1.4, duration: 0.3 },
      // Outer elements
      { id: 'corner1', d: 'M40,40 L60,40 L60,60', strokeWidth: 1, delay: 1.6, duration: 0.4 },
      { id: 'corner2', d: 'M240,40 L260,40 L260,60', strokeWidth: 1, delay: 1.7, duration: 0.4 },
      { id: 'corner3', d: 'M40,160 L40,140 L60,140', strokeWidth: 1, delay: 1.8, duration: 0.4 },
      { id: 'corner4', d: 'M260,160 L260,140 L240,140', strokeWidth: 1, delay: 1.9, duration: 0.4 },
      // Title area
      { id: 'title', d: 'M80,30 L220,30', strokeWidth: 2, delay: 2.1, duration: 0.6, strokeDasharray: '140 20' },
    ]
  },
  {
    id: 'split-screen',
    name: 'Split Screen',
    viewBox: '0 0 300 200',
    paths: [
      // Main frame
      { id: 'frame', d: 'M10,10 L290,10 L290,190 L10,190 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Vertical split
      { id: 'split', d: 'M150,10 L150,190', strokeWidth: 2, delay: 0.5, duration: 0.8, strokeDasharray: '10 5' },
      // Left section header
      { id: 'left-header', d: 'M10,50 L150,50', strokeWidth: 1, delay: 0.8, duration: 0.5, opacity: 0.5 },
      { id: 'left-title', d: 'M30,30 L130,30', strokeWidth: 3, delay: 1, duration: 0.6 },
      // Left content blocks
      { id: 'left-block1', d: 'M30,70 L130,70 L130,100 L30,100 Z', strokeWidth: 1.5, delay: 1.3, duration: 0.7 },
      { id: 'left-block2', d: 'M30,110 L130,110 L130,140 L30,140 Z', strokeWidth: 1.5, delay: 1.5, duration: 0.7 },
      { id: 'left-block3', d: 'M30,150 L130,150 L130,170 L30,170 Z', strokeWidth: 1.5, delay: 1.7, duration: 0.7 },
      // Right section
      { id: 'right-circle', d: 'M220,100 m-40,0 a40,40 0 1,0 80,0 a40,40 0 1,0 -80,0', strokeWidth: 2, delay: 1.2, duration: 1, opacity: 0.8 },
      { id: 'right-inner', d: 'M220,100 m-20,0 a20,20 0 1,0 40,0 a20,20 0 1,0 -40,0', strokeWidth: 1.5, delay: 1.8, duration: 0.6 },
      // Right details
      { id: 'right-line1', d: 'M170,160 L270,160', strokeWidth: 1, delay: 2, duration: 0.4 },
      { id: 'right-line2', d: 'M180,170 L260,170', strokeWidth: 1, delay: 2.1, duration: 0.4 },
    ]
  },
  {
    id: 'zigzag-layout',
    name: 'Zigzag Layout',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M20,20 L280,20 L280,180 L20,180 Z', strokeWidth: 2, delay: 0, duration: 1.8 },
      // Zigzag elements
      { id: 'zig1', d: 'M40,40 L120,40 L120,80 L40,80 Z', strokeWidth: 1.5, delay: 0.5, duration: 0.6 },
      { id: 'zag1', d: 'M180,60 L260,60 L260,100 L180,100 Z', strokeWidth: 1.5, delay: 0.8, duration: 0.6 },
      { id: 'zig2', d: 'M40,120 L120,120 L120,160 L40,160 Z', strokeWidth: 1.5, delay: 1.1, duration: 0.6 },
      { id: 'zag2', d: 'M180,140 L260,140 L260,170 L180,170 Z', strokeWidth: 1.5, delay: 1.4, duration: 0.6 },
      // Connecting lines
      { id: 'connect1', d: 'M120,60 L180,80', strokeWidth: 1, delay: 1.7, duration: 0.4, strokeDasharray: '3 3' },
      { id: 'connect2', d: 'M120,140 L180,155', strokeWidth: 1, delay: 1.9, duration: 0.4, strokeDasharray: '3 3' },
      // Text indicators
      { id: 'text1', d: 'M50,55 L110,55', strokeWidth: 0.8, delay: 2.1, duration: 0.3 },
      { id: 'text2', d: 'M50,65 L100,65', strokeWidth: 0.8, delay: 2.2, duration: 0.3 },
      { id: 'text3', d: 'M190,75 L250,75', strokeWidth: 0.8, delay: 2.3, duration: 0.3 },
      { id: 'text4', d: 'M190,85 L240,85', strokeWidth: 0.8, delay: 2.4, duration: 0.3 },
    ]
  },
  {
    id: 'pyramid-hierarchy',
    name: 'Pyramid Hierarchy',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M10,10 L290,10 L290,190 L10,190 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Pyramid levels
      { id: 'top', d: 'M120,40 L180,40 L180,60 L120,60 Z', strokeWidth: 2, delay: 0.5, duration: 0.6 },
      { id: 'middle-left', d: 'M80,80 L130,80 L130,100 L80,100 Z', strokeWidth: 1.5, delay: 0.8, duration: 0.6 },
      { id: 'middle-right', d: 'M170,80 L220,80 L220,100 L170,100 Z', strokeWidth: 1.5, delay: 1, duration: 0.6 },
      { id: 'bottom-left', d: 'M40,120 L90,120 L90,140 L40,140 Z', strokeWidth: 1.5, delay: 1.2, duration: 0.6 },
      { id: 'bottom-center', d: 'M110,120 L190,120 L190,140 L110,140 Z', strokeWidth: 1.5, delay: 1.4, duration: 0.6 },
      { id: 'bottom-right', d: 'M210,120 L260,120 L260,140 L210,140 Z', strokeWidth: 1.5, delay: 1.6, duration: 0.6 },
      // Connecting lines
      { id: 'connect1', d: 'M150,60 L105,80', strokeWidth: 1, delay: 1.8, duration: 0.4 },
      { id: 'connect2', d: 'M150,60 L195,80', strokeWidth: 1, delay: 1.9, duration: 0.4 },
      { id: 'connect3', d: 'M105,100 L65,120', strokeWidth: 1, delay: 2, duration: 0.3 },
      { id: 'connect4', d: 'M105,100 L150,120', strokeWidth: 1, delay: 2.1, duration: 0.3 },
      { id: 'connect5', d: 'M195,100 L150,120', strokeWidth: 1, delay: 2.2, duration: 0.3 },
      { id: 'connect6', d: 'M195,100 L235,120', strokeWidth: 1, delay: 2.3, duration: 0.3 },
      // Bottom text
      { id: 'bottom-text', d: 'M80,165 L220,165', strokeWidth: 1, delay: 2.5, duration: 0.5, opacity: 0.6 },
    ]
  },
  {
    id: 'circular-flow',
    name: 'Circular Flow',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M20,20 L280,20 L280,180 L20,180 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Central circle
      { id: 'center', d: 'M150,100 m-30,0 a30,30 0 1,0 60,0 a30,30 0 1,0 -60,0', strokeWidth: 2, delay: 0.5, duration: 1 },
      // Orbital elements
      { id: 'orbit1', d: 'M150,40 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0', strokeWidth: 1.5, delay: 0.8, duration: 0.5 },
      { id: 'orbit2', d: 'M210,100 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0', strokeWidth: 1.5, delay: 1, duration: 0.5 },
      { id: 'orbit3', d: 'M150,160 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0', strokeWidth: 1.5, delay: 1.2, duration: 0.5 },
      { id: 'orbit4', d: 'M90,100 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0', strokeWidth: 1.5, delay: 1.4, duration: 0.5 },
      // Connecting curves
      { id: 'curve1', d: 'M150,70 Q180,85 180,100', strokeWidth: 1, delay: 1.6, duration: 0.6, strokeDasharray: '2 2' },
      { id: 'curve2', d: 'M180,100 Q165,130 150,130', strokeWidth: 1, delay: 1.8, duration: 0.6, strokeDasharray: '2 2' },
      { id: 'curve3', d: 'M150,130 Q120,115 120,100', strokeWidth: 1, delay: 2, duration: 0.6, strokeDasharray: '2 2' },
      { id: 'curve4', d: 'M120,100 Q135,70 150,70', strokeWidth: 1, delay: 2.2, duration: 0.6, strokeDasharray: '2 2' },
      // Title
      { id: 'title', d: 'M60,30 L240,30', strokeWidth: 2, delay: 2.4, duration: 0.6 },
    ]
  },
  {
    id: 'diagonal-split',
    name: 'Diagonal Split',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M10,10 L290,10 L290,190 L10,190 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Diagonal line
      { id: 'diagonal', d: 'M10,10 L290,190', strokeWidth: 2, delay: 0.5, duration: 1, opacity: 0.5 },
      // Upper triangle content
      { id: 'upper-title', d: 'M40,30 L120,30', strokeWidth: 3, delay: 0.8, duration: 0.5 },
      { id: 'upper-line1', d: 'M40,50 L100,50', strokeWidth: 1, delay: 1, duration: 0.4 },
      { id: 'upper-line2', d: 'M40,60 L90,60', strokeWidth: 1, delay: 1.1, duration: 0.4 },
      { id: 'upper-box', d: 'M40,80 L140,80 L140,120 L40,120 Z', strokeWidth: 1.5, delay: 1.3, duration: 0.7 },
      // Lower triangle content
      { id: 'lower-circle', d: 'M220,120 m-25,0 a25,25 0 1,0 50,0 a25,25 0 1,0 -50,0', strokeWidth: 2, delay: 1.5, duration: 0.8 },
      { id: 'lower-line1', d: 'M160,160 L260,160', strokeWidth: 1, delay: 1.8, duration: 0.4 },
      { id: 'lower-line2', d: 'M170,170 L250,170', strokeWidth: 1, delay: 1.9, duration: 0.4 },
      // Decorative elements
      { id: 'deco1', d: 'M260,40 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 1, delay: 2.1, duration: 0.3 },
      { id: 'deco2', d: 'M30,160 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 1, delay: 2.2, duration: 0.3 },
    ]
  }
];

const ThemeGeneratingUI: React.FC<ThemeGeneratingUIProps> = ({ 
  isDarkMode, 
  progress, 
  message = "Generating theme", 
  className 
}) => {
  const [currentSketchIndex, setCurrentSketchIndex] = useState(0);
  const [visibleImages, setVisibleImages] = useState<ImagePlaceholder[]>([]);
  const isComponentVisibleRef = useRef(true);
  
  // Clean up on unmount
  useEffect(() => {
    isComponentVisibleRef.current = true;
    
    return () => {
      isComponentVisibleRef.current = false;
    };
  }, []);
  
  useEffect(() => {
    // Cycle through template sketches during 0-20% progress (stop when images start)
    if (progress < 20) {
      const cycleTime = 3500; // Time to show each sketch
      const interval = setInterval(() => {
        if (isComponentVisibleRef.current) {
          setCurrentSketchIndex((prev) => (prev + 1) % templateSketches.length);
        }
      }, cycleTime);
      
      return () => clearInterval(interval);
    }
  }, [progress]);

  useEffect(() => {
      // Show image placeholders plopping in during 20-30%
    if (progress >= 20 && progress < 30) {
      let timeoutId: NodeJS.Timeout;
      
      const generateImages = () => {
        if (!isComponentVisibleRef.current) return; // Stop if component is not visible
        const numImages = Math.floor(Math.random() * 2) + 1; // 1-2 images at a time
        const newImages: ImagePlaceholder[] = [];
        
        for (let i = 0; i < numImages; i++) {
          // Random sizes for variety
          const sizes = [
            { width: 120, height: 140 }, // More portrait-like for polaroid
            { width: 140, height: 160 },
            { width: 100, height: 120 },
            { width: 160, height: 180 }
          ];
          const size = sizes[Math.floor(Math.random() * sizes.length)];
          
          newImages.push({
            id: `img-${Date.now()}-${i}`,
            x: Math.random() * 90 + 5, // 5-95% spread across full area
            y: Math.random() * 90 + 5,
            width: size.width,
            height: size.height,
            delay: i * 0.3 + Math.random() * 0.2, // More scattered timing
            finalRotation: -15 + Math.random() * 30, // Pre-calculate final rotation
            scale: 0.8 + Math.random() * 0.4 // Pre-calculate scale
          });
        }
        
        setVisibleImages(prev => [...prev, ...newImages]);
        
        // Schedule next batch with random delay
        timeoutId = setTimeout(generateImages, 800 + Math.random() * 500); // 800-1300ms
      };
      
      // Start the first batch
      generateImages();
      
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [progress]);

  const backgroundColor = isDarkMode ? '#1a1a1a' : '#fafafa';
  const lineColor = '#FF4301'; // Orange from landing page
  const textColor = isDarkMode ? '#e0e0e0' : '#333333';

  // Get current sketch
  const currentSketch = templateSketches[currentSketchIndex];

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)} style={{ backgroundColor }}>
      {/* Template sketching animation (0-20% only) */}
      {progress < 20 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg 
            viewBox={currentSketch.viewBox} 
            className="w-4/5 h-4/5 max-w-[600px] max-h-[400px]"
            preserveAspectRatio="xMidYMid meet"
          >
          <AnimatePresence mode="sync">
              {currentSketch.paths.map((path) => (
                <motion.path
                  key={`${currentSketch.id}-${path.id}`}
                  d={path.d}
                  fill="none"
                stroke={lineColor}
                  strokeWidth={path.strokeWidth || 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={path.strokeDasharray}
                  opacity={path.opacity || 1}
                  initial={{ pathLength: 0, opacity: 0 }}
                animate={{ 
                    pathLength: 1, 
                    opacity: path.opacity || 1,
                }}
                exit={{ 
                    opacity: 0,
                }}
                transition={{ 
                    pathLength: { 
                      delay: path.delay || 0, 
                      duration: path.duration || 0.5,
                      ease: "easeInOut"
                  },
                  opacity: {
                      delay: path.delay || 0, 
                      duration: 0.2 
                  }
                }}
                style={{
                    filter: 'none',
                }}
              />
            ))}
          </AnimatePresence>
        </svg>
        </div>
      )}

      {/* Polaroid-style images (20-30%) */}
      {progress >= 20 && progress < 30 && (
        <div className="absolute inset-0">
            {visibleImages.map((img) => (
              <motion.div
                key={img.id}
              className="absolute"
                style={{ 
                  left: `${img.x}%`,
                  top: `${img.y}%`,
                }}
                initial={{ 
                  scale: 0, 
                  opacity: 0, 
                rotate: -180,
                y: -300, // Start from above
                x: '-50%'
                }}
              animate={{ 
                scale: 1, 
                opacity: 1, 
                rotate: img.finalRotation, // Use pre-calculated rotation
                y: '-50%',
                x: '-50%'
              }}
                transition={{ 
                duration: 0.6, 
                  delay: img.delay,
                  type: "spring",
                stiffness: 300,
                damping: 20,
                rotate: {
                  duration: 0.8,
                  ease: "easeOut"
                }
                }}
              >
                {/* Polaroid frame */}
                <div 
                  className="bg-white p-2 shadow-2xl"
                  style={{
                    filter: 'none',
                    transform: `scale(${img.scale})`
                  }}
                >
                  {/* Image area */}
                  <div 
                    style={{
                      width: `${img.width}px`,
                      height: `${img.height * 0.75}px`, // Photo area is 75% of height
                      background: `linear-gradient(135deg, ${isDarkMode ? '#2a2a2a' : '#f0f0f0'} 0%, ${isDarkMode ? '#1a1a1a' : '#e0e0e0'} 100%)`,
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Simple image icon */}
                  <svg 
                      className="absolute inset-0 m-auto w-12 h-12 opacity-20" 
                    fill="none" 
                      stroke={lineColor}
                    viewBox="0 0 24 24"
                  >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                    
                    {/* Subtle gradient overlay */}
                    <div 
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                  </div>
                  
                  {/* Polaroid bottom space for "text" */}
                  <div 
                    className="h-8 flex items-center justify-center"
                  >
                    <div 
                      className="h-1 bg-gray-300 rounded"
                      style={{ 
                        width: `${50 + (parseInt(img.id.split('-')[1]) % 30)}%` // Consistent width based on id
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
        </div>
      )}

      {/* Progress and message - Always visible */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center justify-between mb-2">
          <span 
            className="text-sm font-black tracking-wider"
            style={{ 
              color: textColor,
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              textTransform: 'uppercase',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale'
            }}
          >
            {message}
          </span>
          <span 
            className="text-sm font-bold"
            style={{ 
              color: lineColor,
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
            }}
          >
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-1.5 rounded-full relative"
            style={{ backgroundColor: lineColor }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {/* Shimmer effect on progress bar */}
            <div 
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)`,
                animation: 'shimmer 1.5s infinite'
              }}
            />
          </motion.div>
        </div>
      </div>
      
      {/* Add shimmer animation keyframes */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        `
      }} />
    </div>
  );
};

export default ThemeGeneratingUI; 