import React, { useEffect, useRef } from 'react';

interface BlueprintAnimationProps {
  slideTitle?: string;
  slideIndex?: number;
}

/**
 * Blueprint-style animation shown during layout_design phase
 * Features animated grid lines and blueprint aesthetic
 */
export const BlueprintAnimation: React.FC<BlueprintAnimationProps> = ({
  slideTitle = 'Slide',
  slideIndex = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Blueprint colors
    const blueprintBlue = '#0066CC';
    const blueprintDark = '#003366';
    const gridColor = 'rgba(255, 255, 255, 0.15)';
    const lineColor = 'rgba(255, 255, 255, 0.8)';

    let frame = 0;
    let drawProgress = 0;

    // Blueprint elements to draw
    const blueprintElements = [
      // Title area
      { x: 0.1, y: 0.1, w: 0.8, h: 0.15, type: 'rect', delay: 0 },
      // Content blocks
      { x: 0.1, y: 0.3, w: 0.35, h: 0.5, type: 'rect', delay: 20 },
      { x: 0.55, y: 0.3, w: 0.35, h: 0.5, type: 'rect', delay: 40 },
      // Measurement lines
      { x1: 0.05, y1: 0.1, x2: 0.05, y2: 0.25, type: 'line', delay: 60 },
      { x1: 0.05, y1: 0.3, x2: 0.05, y2: 0.8, type: 'line', delay: 65 },
      // Dimension markers
      { x: 0.02, y: 0.175, size: 8, type: 'marker', delay: 70 },
      { x: 0.02, y: 0.55, size: 8, type: 'marker', delay: 75 },
    ];

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Clear with blueprint blue background
      ctx.fillStyle = blueprintBlue;
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      const gridSize = 20;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw animated blueprint elements
      ctx.strokeStyle = lineColor;
      ctx.fillStyle = lineColor;
      ctx.lineWidth = 2;

      blueprintElements.forEach((element, idx) => {
        const elementFrame = frame - element.delay;
        if (elementFrame < 0) return;

        const progress = Math.min(elementFrame / 30, 1);

        if (element.type === 'rect') {
          const x = element.x * w;
          const y = element.y * h;
          const width = element.w * w;
          const height = element.h * h;

          // Draw rectangle with animation
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -frame * 0.5;

          // Animate drawing the rectangle
          ctx.beginPath();
          if (progress < 0.25) {
            // Top line
            const lineProgress = progress / 0.25;
            ctx.moveTo(x, y);
            ctx.lineTo(x + width * lineProgress, y);
          } else if (progress < 0.5) {
            // Top + right
            const lineProgress = (progress - 0.25) / 0.25;
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + height * lineProgress);
          } else if (progress < 0.75) {
            // Top + right + bottom
            const lineProgress = (progress - 0.5) / 0.25;
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x + width - width * lineProgress, y + height);
          } else {
            // Complete rectangle
            const lineProgress = (progress - 0.75) / 0.25;
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x, y + height);
            ctx.lineTo(x, y + height - height * lineProgress);
          }
          ctx.stroke();
          ctx.restore();

          // Draw corner markers when complete
          if (progress >= 1) {
            const markerSize = 8;
            ctx.fillRect(x - markerSize/2, y - markerSize/2, markerSize, markerSize);
            ctx.fillRect(x + width - markerSize/2, y - markerSize/2, markerSize, markerSize);
            ctx.fillRect(x - markerSize/2, y + height - markerSize/2, markerSize, markerSize);
            ctx.fillRect(x + width - markerSize/2, y + height - markerSize/2, markerSize, markerSize);
          }
        } else if (element.type === 'line') {
          const x1 = element.x1 * w;
          const y1 = element.y1 * h;
          const x2 = element.x2 * w;
          const y2 = element.y2 * h;

          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress);
          ctx.stroke();
          ctx.restore();

          // Arrow heads
          if (progress >= 1) {
            const arrowSize = 6;
            // Top arrow
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - arrowSize/2, y1 + arrowSize);
            ctx.lineTo(x1 + arrowSize/2, y1 + arrowSize);
            ctx.closePath();
            ctx.fill();
            // Bottom arrow
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - arrowSize/2, y2 - arrowSize);
            ctx.lineTo(x2 + arrowSize/2, y2 - arrowSize);
            ctx.closePath();
            ctx.fill();
          }
        } else if (element.type === 'marker') {
          const x = element.x * w;
          const y = element.y * h;
          const size = element.size * progress;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(frame * 0.05);
          ctx.fillRect(-size/2, -size/2, size, size);
          ctx.restore();
        }
      });

      // Draw title text
      ctx.save();
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = lineColor;
      ctx.textAlign = 'center';
      ctx.fillText('CREATING BLUEPRINT', w / 2, 30);

      ctx.font = '14px monospace';
      ctx.fillText(`Slide ${slideIndex + 1}: ${slideTitle}`, w / 2, 55);
      ctx.restore();

      // Draw progress indicator
      const progressBarWidth = w * 0.6;
      const progressBarX = (w - progressBarWidth) / 2;
      const progressBarY = h - 40;

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, 20);

      ctx.fillStyle = lineColor;
      const progress = (frame % 120) / 120;
      ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, 20);

      frame++;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [slideTitle, slideIndex]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          background: '#0066CC'
        }}
      />
    </div>
  );
};

export default BlueprintAnimation;
