import { useState, type CSSProperties } from "react";
import type { Command, DocumentLayer, EffectNode, EffectType } from "../../types/documentModel";
import { setPropertyCommand } from "../../commands/setPropertyCommand";

type EffectParamValue = number | string | boolean;
type EffectParams = Record<string, EffectParamValue>;

interface EffectOption {
  type: EffectType;
  label: string;
  params: EffectParams;
}

const EFFECT_OPTIONS: readonly EffectOption[] = [
  { type: "blur", label: "Blur", params: { radius: 5 } },
  { type: "drop-shadow", label: "Shadow", params: { dx: 2, dy: 2, stdDeviation: 3, color: "#000000" } },
  { type: "brightness", label: "Brightness", params: { amount: 1.2 } },
  { type: "contrast", label: "Contrast", params: { amount: 1.2 } },
  { type: "saturate", label: "Saturation", params: { amount: 1.5 } },
  { type: "grayscale", label: "Grayscale", params: { amount: 1 } },
  { type: "sepia", label: "Sepia", params: { amount: 1 } },
  { type: "hue-rotate", label: "Hue rotate", params: { angle: 90 } },
  { type: "invert", label: "Invert", params: { amount: 1 } },
];

const stackHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const controlStyle: CSSProperties = {
  boxSizing: "border-box",
  minWidth: 0,
  height: 28,
  border: "1px solid var(--p-line, #444)",
  borderRadius: 4,
  background: "var(--p-bg-2, #2a2a2a)",
  color: "var(--p-fg-0, #ffffff)",
  font: "inherit",
  fontSize: 12,
};

interface EffectStackPanelProps {
  layer: DocumentLayer;
  dispatchCommand: (command: Command) => void;
}

export function EffectStackPanel({ layer, dispatchCommand }: EffectStackPanelProps): JSX.Element {
  const effects = layer.effectStack ?? [];
  const [effectToAdd, setEffectToAdd] = useState<EffectType>(EFFECT_OPTIONS[0].type);

  function replaceEffects(nextEffects: EffectNode[]): void {
    dispatchCommand(setPropertyCommand(layer.id, "effectStack", effects, nextEffects));
  }

  function addEffect(type: EffectType): void {
    const option = EFFECT_OPTIONS.find((candidate) => candidate.type === type);
    if (!option) {
      return;
    }
    const newEffect: EffectNode = {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      params: { ...option.params },
    };
    replaceEffects([...effects, newEffect]);
  }

  function removeEffect(id: string): void {
    replaceEffects(effects.filter((effect) => effect.id !== id));
  }

  function updateEffect(id: string, update: Partial<EffectNode>): void {
    const current = effects.find((effect) => effect.id === id);
    if (!current) {
      return;
    }
    replaceEffects(effects.map((effect) => effect.id === id ? { ...effect, ...update } : effect));
  }

  function updateEffectParam(id: string, key: string, value: EffectParamValue): void {
    const current = effects.find((effect) => effect.id === id);
    if (!current) {
      return;
    }
    updateEffect(id, { params: { ...current.params, [key]: value } });
  }

  function renderEffectControls(effect: EffectNode): JSX.Element {
    return (
      <div
        key={effect.id}
        style={{ display: "flex", flexDirection: "column", padding: 8, background: "var(--p-bg-2, #2a2a2a)", border: "1px solid var(--p-line, #444)", borderRadius: 5, gap: 8 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <label style={stackHeaderStyle}>
            <input
              type="checkbox"
              aria-label={`Enable ${formatEffectLabel(effect.type)} effect`}
              checked={effect.enabled}
              onChange={() => updateEffect(effect.id, { enabled: !effect.enabled })}
            />
            <span style={{ fontSize: 12, color: "var(--p-fg-0, #eee)", fontWeight: 600 }}>{formatEffectLabel(effect.type)}</span>
          </label>
          <button
            type="button"
            onClick={() => removeEffect(effect.id)}
            style={{ background: "transparent", border: 0, color: "var(--p-bad, #ff4d4f)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}
            aria-label={`Remove ${formatEffectLabel(effect.type)} effect`}
          >
            Remove
          </button>
        </div>
        {renderEffectParameters(effect, (key, value) => updateEffectParam(effect.id, key, value))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          aria-label="Effect to add"
          value={effectToAdd}
          onChange={(event) => setEffectToAdd(event.target.value as EffectType)}
          style={{ ...controlStyle, flex: 1, padding: "0 6px" }}
        >
          {EFFECT_OPTIONS.map((option) => (
            <option key={option.type} value={option.type}>{option.label}</option>
          ))}
        </select>
        <button type="button" onClick={() => addEffect(effectToAdd)} style={quickBtnStyle}>
          Add
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {effects.map(renderEffectControls)}
        {effects.length === 0 ? <span style={{ color: "var(--p-fg-2, #888)", fontSize: 12, textAlign: "center", margin: "4px 0" }}>No effects applied</span> : null}
      </div>
    </div>
  );
}

function renderEffectParameters(
  effect: EffectNode,
  onChange: (key: string, value: EffectParamValue) => void,
): JSX.Element | null {
  switch (effect.type) {
    case "blur":
      return <NumberField label="Radius" value={numberParam(effect, "radius", 5)} min={0} max={100} step={0.5} onChange={(value) => onChange("radius", value)} />;
    case "drop-shadow":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
          <NumberField label="X" value={numberParam(effect, "dx", 2)} min={-100} max={100} step={0.5} onChange={(value) => onChange("dx", value)} />
          <NumberField label="Y" value={numberParam(effect, "dy", 2)} min={-100} max={100} step={0.5} onChange={(value) => onChange("dy", value)} />
          <NumberField label="Blur" value={numberParam(effect, "stdDeviation", 3)} min={0} max={100} step={0.5} onChange={(value) => onChange("stdDeviation", value)} />
          <ColorField label="Color" value={colorParam(effect, "color", "#000000")} onChange={(value) => onChange("color", value)} />
        </div>
      );
    case "hue-rotate":
      return <NumberField label="Angle" value={numberParam(effect, "angle", 90)} min={0} max={360} step={1} onChange={(value) => onChange("angle", value)} />;
    case "brightness":
    case "contrast":
    case "saturate":
      return <NumberField label="Amount" value={numberParam(effect, "amount", 1)} min={0} max={3} step={0.05} onChange={(value) => onChange("amount", value)} />;
    case "grayscale":
    case "sepia":
    case "invert":
      return <NumberField label="Amount" value={numberParam(effect, "amount", 1)} min={0} max={1} step={0.05} onChange={(value) => onChange("amount", value)} />;
    default:
      return <span style={{ color: "var(--p-fg-2, #888)", fontSize: 11 }}>This imported effect is preserved but has no editable parameters in the canvas preview.</span>;
  }
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, color: "var(--p-fg-2, #aaa)", fontSize: 11 }}>
      {label}
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        style={{ ...controlStyle, width: "100%", padding: "0 6px" }}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (Number.isFinite(next)) {
            onChange(Math.min(max, Math.max(min, next)));
          }
        }}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, color: "var(--p-fg-2, #aaa)", fontSize: 11 }}>
      {label}
      <input
        type="color"
        aria-label={label}
        value={value}
        style={{ ...controlStyle, width: "100%", padding: 2, cursor: "pointer" }}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function numberParam(effect: EffectNode, key: string, fallback: number): number {
  const value = effect.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function colorParam(effect: EffectNode, key: string, fallback: string): string {
  const value = effect.params[key];
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function formatEffectLabel(type: EffectType): string {
  return EFFECT_OPTIONS.find((option) => option.type === type)?.label ?? type.replace(/-/g, " ");
}

const quickBtnStyle: CSSProperties = {
  height: 28,
  background: "var(--p-bg-3, #333)",
  color: "var(--p-fg-0, #ddd)",
  border: "1px solid var(--p-line, #444)",
  padding: "0 9px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};
