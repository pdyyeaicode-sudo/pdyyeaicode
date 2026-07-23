import { useEffect, useRef, useMemo } from 'react';

interface RulerOverlayProps {
  viewport: { zoom: number; panX: number; panY: number };
  artboardBounds: { x: number; y: number; width: number; height: number };
  orientation: 'horizontal' | 'vertical';
  height: number;  // Ruler thickness (20px)
  mousePosition?: { x: number; y: number } | null;
  theme?: 'light' | 'dark';
}

export function RulerOverlay({ 
  viewport, 
  artboardBounds, 
  orientation, 
  height,
  mousePosition,
  theme = 'light'
}: RulerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Colors based on theme
  const colors = useMemo(() => ({
    background: theme === 'dark' ? '#1e1e1e' : '#f5f5f5',
    text: theme === 'dark' ? '#e0e0e0' : '#333333',
    tick: theme === 'dark' ? '#666666' : '#999999',
    indicator: theme === 'dark' ? '#4a9eff' : '#0078d4'
  }), [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size with device pixel ratio
    if (orientation === 'horizontal') {
      canvas.width = window.innerWidth * dpr;
      canvas.height = height * dpr;
    } else {
      canvas.width = height * dpr;
      canvas.height = window.innerHeight * dpr;
    }
    
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Ruler configuration based on zoom level to prevent overlap and browser hang
    let targetInterval = 100 / viewport.zoom;
    const magnitude = Math.pow(10, Math.floor(Math.log10(targetInterval)));
    const normalized = targetInterval / magnitude;
    let step;
    if (normalized <= 1.2) step = 1;
    else if (normalized <= 2.5) step = 2;
    else if (normalized <= 5) step = 5;
    else step = 10;
    
    let labelInterval = step * magnitude;
    
    // Choose tick interval based on label interval
    let tickInterval = labelInterval / 10;
    if (tickInterval * viewport.zoom < 5) {
      tickInterval = labelInterval / 5;
    }
    if (tickInterval * viewport.zoom < 5) {
      tickInterval = labelInterval / 2;
    }

    const majorTickHeight = height * 0.6;
    const minorTickHeight = height * 0.3;

    ctx.strokeStyle = colors.tick;
    ctx.fillStyle = colors.text;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    // Calculate visible range
    const start = orientation === 'horizontal'
      ? Math.floor((-viewport.panX) / viewport.zoom)
      : Math.floor((-viewport.panY) / viewport.zoom);
    
    const end = orientation === 'horizontal'
      ? start + Math.ceil((canvas.width / dpr) / viewport.zoom)
      : start + Math.ceil((canvas.height / dpr) / viewport.zoom);

    // Draw ticks and labels
    for (let i = Math.floor(start / tickInterval) * tickInterval; i <= end; i += tickInterval) {
      const screenPos = i * viewport.zoom + (orientation === 'horizontal' ? viewport.panX : viewport.panY);
      const isMajorTick = i % labelInterval === 0;
      const tickHeight = isMajorTick ? majorTickHeight : minorTickHeight;

      ctx.beginPath();
      
      if (orientation === 'horizontal') {
        ctx.moveTo(screenPos, height);
        ctx.lineTo(screenPos, height - tickHeight);
        ctx.stroke();

        if (isMajorTick && i >= 0) {
          ctx.fillText(String(i), screenPos + 2, height - majorTickHeight - 2);
        }
      } else {
        ctx.moveTo(height, screenPos);
        ctx.lineTo(height - tickHeight, screenPos);
        ctx.stroke();

        if (isMajorTick && i >= 0) {
          ctx.save();
          ctx.translate(height - majorTickHeight - 12, screenPos - 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(i), 0, 0);
          ctx.restore();
        }
      }
    }

    // Draw mouse position indicator
    if (mousePosition) {
      ctx.strokeStyle = colors.indicator;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      if (orientation === 'horizontal') {
        ctx.moveTo(mousePosition.x, 0);
        ctx.lineTo(mousePosition.x, height);
      } else {
        ctx.moveTo(0, mousePosition.y);
        ctx.lineTo(height, mousePosition.y);
      }
      
      ctx.stroke();
    }
  }, [viewport, artboardBounds, orientation, height, mousePosition, colors]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        [orientation === 'horizontal' ? 'top' : 'left']: 0,
        [orientation === 'horizontal' ? 'left' : 'top']: orientation === 'horizontal' ? 0 : 0,
        pointerEvents: 'none',
        zIndex: 100,
        boxShadow: orientation === 'horizontal' 
          ? '0 1px 3px rgba(0,0,0,0.1)' 
          : '1px 0 3px rgba(0,0,0,0.1)'
      }}
    />
  );
}
