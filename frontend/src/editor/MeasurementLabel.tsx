export interface MeasurementLabelProps {
  text: string;
  position: { x: number; y: number };
  visible: boolean;
}

export function MeasurementLabel({ text, position, visible }: MeasurementLabelProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      left: position.x + 20,
      top: position.y - 40,
      background: 'var(--p-accent, #0d99ff)',
      color: '#ffffff',
      padding: '4px 10px',
      borderRadius: '50px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'var(--font-mono, monospace)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      pointerEvents: 'none',
      zIndex: 1000,
      whiteSpace: 'nowrap'
    }}>
      {text}
    </div>
  );
}
