import React, { useState } from 'react';
import { Command, DocumentLayer, EffectNode, EffectType } from '../../types/documentModel';
import { setPropertyCommand } from '../../commands/setPropertyCommand';

interface EffectStackPanelProps {
  layer: DocumentLayer;
  dispatchCommand: (command: Command) => void;
}

export function EffectStackPanel({ layer, dispatchCommand }: EffectStackPanelProps): JSX.Element {
  const effects: EffectNode[] = layer.effectStack || [];

  function addEffect(type: EffectType, defaultParams: Record<string, any> = {}) {
    const newEffect: EffectNode = {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      params: defaultParams,
    };
    
    dispatchCommand(setPropertyCommand(
      layer.id,
      "effectStack",
      effects,
      [...effects, newEffect]
    ));
  }

  function removeEffect(id: string) {
    dispatchCommand(setPropertyCommand(
      layer.id,
      "effectStack",
      effects,
      effects.filter(e => e.id !== id)
    ));
  }

  function toggleEffect(id: string) {
    const node = effects.find(e => e.id === id);
    if (!node) return;
    
    dispatchCommand(setPropertyCommand(
      layer.id,
      "effectStack",
      effects,
      effects.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e)
    ));
  }

  function renderEffectControls(effect: EffectNode) {
    return (
      <div key={effect.id} style={{ display: 'flex', flexDirection: 'column', padding: '8px', background: 'var(--p-bg-2, #2a2a2a)', borderRadius: '4px', marginBottom: '4px', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              checked={effect.enabled} 
              onChange={() => toggleEffect(effect.id)}
            />
            <span style={{ fontSize: '13px', color: '#eee', textTransform: 'capitalize' }}>{effect.type.replace('-', ' ')}</span>
          </div>
          <button
            onClick={() => removeEffect(effect.id)}
            style={{ background: 'transparent', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: '16px' }}
            title="Remove Effect"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => addEffect('blur', { radius: 5 })} style={quickBtnStyle}>+ Blur</button>
        <button onClick={() => addEffect('drop-shadow', { dx: 2, dy: 2, stdDeviation: 3, color: '#000000' })} style={quickBtnStyle}>+ Shadow</button>
        <button onClick={() => addEffect('noise', { intensity: 0.5 })} style={quickBtnStyle}>+ Noise</button>
        <button onClick={() => addEffect('brightness', { amount: 1.2 })} style={quickBtnStyle}>+ Brightness</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {effects.map(renderEffectControls)}
        {effects.length === 0 && <span style={{ color: '#888', fontSize: '12px', textAlign: 'center', margin: '8px 0' }}>No effects applied</span>}
      </div>
    </div>
  );
}

const quickBtnStyle: React.CSSProperties = {
  background: 'var(--p-bg-3, #333)',
  color: '#ddd',
  border: '1px solid var(--p-border, #444)',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  cursor: 'pointer',
};
