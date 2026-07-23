export interface AngleIndicatorProps {
  angle: number;  // Degrees 0-360
  position: { x: number; y: number };
  visible: boolean;
}

export function AngleIndicator({ angle, position, visible }: AngleIndicatorProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      left: position.x + 20,
      top: position.y - 30,
      background: 'var(--bg-secondary)',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 'bold',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      pointerEvents: 'none',
      zIndex: 1000
    }}>
      {Math.round(angle)}°
    </div>
  );
}
