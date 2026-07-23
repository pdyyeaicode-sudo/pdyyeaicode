import { useMemo } from 'react';

interface GridOverlayProps {
  viewport: { zoom: number; panX: number; panY: number };
  artboardBounds: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  baseGridSize?: number;  // Default 10px
  theme?: 'light' | 'dark';
}

export function GridOverlay({ 
  viewport, 
  artboardBounds, 
  enabled, 
  baseGridSize = 10,
  theme = 'light'
}: GridOverlayProps) {
  // Adaptive grid sizing based on zoom level
  const adaptiveGridSize = useMemo(() => {
    const { zoom } = viewport;
    if (zoom < 0.25) return baseGridSize * 4;      // 40px at very zoomed out
    if (zoom < 0.5) return baseGridSize * 2;       // 20px at zoomed out
    if (zoom > 2) return baseGridSize / 2;         // 5px at zoomed in
    return baseGridSize;                           // 10px default
  }, [viewport.zoom, baseGridSize]);

  // Grid color based on theme
  const gridColor = useMemo(() => {
    return theme === 'dark' 
      ? 'rgba(255, 255, 255, 0.1)' 
      : 'rgba(0, 0, 0, 0.1)';
  }, [theme]);

  if (!enabled) return null;

  // Calculate artboard position in screen space
  const artboardX = artboardBounds.x * viewport.zoom + viewport.panX;
  const artboardY = artboardBounds.y * viewport.zoom + viewport.panY;
  const artboardWidth = artboardBounds.width * viewport.zoom;
  const artboardHeight = artboardBounds.height * viewport.zoom;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="grid-pattern"
          width={adaptiveGridSize}
          height={adaptiveGridSize}
          patternUnits="userSpaceOnUse"
          patternTransform={`scale(${viewport.zoom})`}
        >
          <rect 
            width={adaptiveGridSize} 
            height={adaptiveGridSize} 
            fill="none" 
          />
          <path
            d={`M ${adaptiveGridSize} 0 L 0 0 0 ${adaptiveGridSize}`}
            fill="none"
            stroke={gridColor}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
      </defs>
      
      {/* Apply grid only to artboard area */}
      <rect
        x={artboardX}
        y={artboardY}
        width={artboardWidth}
        height={artboardHeight}
        fill="url(#grid-pattern)"
      />
    </svg>
  );
}
