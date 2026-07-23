import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "./ColorPanel.module.css";
import type { UseCreativeStudioResult } from "../editor/useCreativeStudio";
import { Pipette, Sparkles, Layers, SlidersHorizontal, Sun, Contrast } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
import { setPropertyCommand } from "../editor/commands/setPropertyCommand";
import { getLayerFill } from "../editor/propertyEditing";
import { getActiveArtboard, findLayer } from "../editor/commands/helpers";
import {
  gradientFillToCss,
  parseGradientFill,
  serializeGradientFill,
} from "../editor/gradientFill";

// --- Math Utilities ---
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  let f = (n: number, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 255, 255];
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const v = Math.max(r, g, b), n = v - Math.min(r, g, b);
  const h = n === 0 ? 0 : n && v === r ? (g - b) / n : v === g ? 2 + (b - r) / n : 4 + (r - g) / n;
  return [60 * (h < 0 ? h + 6 : h), v === 0 ? 0 : n / v, v];
}
function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}
function isHexColor(value: string): boolean {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
function isColorPayload(value: string): boolean {
  return isHexColor(value) || parseGradientFill(value) !== null;
}

interface GradientStop {
  color: string;
  pos: number;
}

function buildGradientPayload(stops: readonly GradientStop[]): string {
  return serializeGradientFill(
    90,
    stops.map((stop) => ({ color: stop.color, offset: stop.pos })),
  );
}

// --- Circular Color Picker Component ---
interface CircularColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
}

function CircularColorPicker({ color, onChange }: CircularColorPickerProps) {
  const outerRef = useRef<HTMLDivElement>(null);

  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const [r, g, b] = hexToRgb(color || "#ffffff");
    return rgbToHsv(r, g, b);
  });

  useEffect(() => {
    if (!color) return;
    const [r, g, b] = hexToRgb(color);
    const [h, s, v] = rgbToHsv(r, g, b);
    const hexLocal = hsvToHex(hsv[0], hsv[1], hsv[2]);
    if (color.toLowerCase() !== hexLocal.toLowerCase()) {
      setHsv([h, s, v]);
    }
  }, [color]);

  const updateColor = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    onChange(hsvToHex(h, s, v));
  };

  const handlePointer = (e: React.PointerEvent | PointerEvent) => {
    if (!outerRef.current) return;
    const rect = outerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rMax = rect.width / 2;
    
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    
    let dist = Math.sqrt(dx * dx + dy * dy);
    let s = Math.min(1, dist / rMax);
    
    updateColor(angle, s, hsv[2]);
  };

  useEffect(() => {
    const onPointerUp = () => {
      document.body.removeAttribute('data-dragging-color');
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (document.body.getAttribute('data-dragging-color') === 'true') {
        handlePointer(e);
      }
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [hsv]);

  const hueAngle = hsv[0] - 90;
  const radiusPercent = hsv[1] * 50; // max 50% from center
  const handleX = 50 + radiusPercent * Math.cos(hueAngle * Math.PI / 180);
  const handleY = 50 + radiusPercent * Math.sin(hueAngle * Math.PI / 180);

  return (
    <div className={styles.pickerContainer}>
      <div 
        className={styles.wheelWrapper} 
        ref={outerRef}
        onPointerDown={(e) => {
          document.body.setAttribute('data-dragging-color', 'true');
          handlePointer(e);
        }}
      >
        {/* Center Point */}
        <div className={styles.centerPoint} />
        
        {/* Line to Handle */}
        <div 
          className={styles.handleLine} 
          style={{
            width: `${radiusPercent}%`,
            transform: `translateY(-50%) rotate(${hueAngle}deg)`
          }}
        />
        
        {/* Handle */}
        <div 
          className={styles.handle} 
          style={{ left: `${handleX}%`, top: `${handleY}%`, background: hsvToHex(hsv[0], hsv[1], 1) }} 
        />
      </div>

      <div className={styles.sliderWrapper}>
        <div className={styles.sliderRow}>
          <div className={styles.sliderLabel}>Luminance</div>
          <div 
            className={styles.sliderTrack} 
            style={{ background: `linear-gradient(to right, #000, ${hsvToHex(hsv[0], hsv[1], 1)})` }}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const updateV = (clientX: number) => {
                const newV = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                updateColor(hsv[0], hsv[1], newV);
              };
              updateV(e.clientX);
              const onMove = (ev: PointerEvent) => updateV(ev.clientX);
              const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
              };
              document.addEventListener('pointermove', onMove);
              document.addEventListener('pointerup', onUp);
            }}
          >
            <div className={styles.sliderThumb} style={{ left: `${hsv[2] * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Panel Component ---
export function ColorPanel({ studio }: { studio: UseCreativeStudioResult }) {
  
  let targetLayer = null;
  if (studio.document) {
    const ab = getActiveArtboard(studio.document);
    if (ab) {
      if (studio.activeLayer) {
        targetLayer = findLayer(ab.layers, studio.activeLayer);
      }
      if (!targetLayer) {
        targetLayer = ab.layers.find(l => l.role === "background");
      }
    }
  }

  const activeLayerId = targetLayer?.id;
  
  // Internal state to keep the input responsive
  const [currentColor, setCurrentColor] = useState<string>("#ffffff");
  const [inputMode, setInputMode] = useState<"HEX" | "RGB" | "HSL">("HEX");
  const [fillType, setFillType] = useState<"Solid" | "Gradient">("Solid");
  
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([
    {color: "#ff0080", pos: 0},
    {color: "#7928ca", pos: 100}
  ]);
  const [activeStopIdx, setActiveStopIdx] = useState(0);

  useEffect(() => {
    if (targetLayer) {
      const currentFill = getLayerFill(targetLayer as any);
      if (currentFill && currentFill !== 'mixed') {
        setCurrentColor(currentFill);
        // If it's a solid hex, reset fillType to Solid
        if (currentFill.startsWith('#')) {
          setFillType("Solid");
        } else {
          const gradient = parseGradientFill(currentFill);
          if (!gradient) {
            return;
          }
          setFillType("Gradient");
          setGradientStops(
            gradient.stops.map((stop) => ({ color: stop.color, pos: stop.offset })),
          );
          setActiveStopIdx(0);
        }
      }
    }
  }, [targetLayer]);

  const applyColor = useCallback((payload: string): void => {
    if (!isColorPayload(payload)) return;
    setCurrentColor(payload);
    if (targetLayer?.role === "background" || (!studio.activeLayer && studio.document)) {
      studio.updateBackground(payload);
      return;
    }
    if (activeLayerId && targetLayer) {
      const prevFill = getLayerFill(targetLayer as any) || "#000000";
      if (prevFill !== 'mixed' && prevFill !== payload) {
        studio.dispatchCommand(setPropertyCommand(activeLayerId, "fill", prevFill, payload));
      }
    }
  }, [activeLayerId, targetLayer, studio]);

  const handleColorChange = useCallback((payload: string): void => {
    applyColor(payload);
  }, [applyColor]);

  const handleFillTypeChange = useCallback((value: string | null): void => {
    if (value !== "Solid" && value !== "Gradient") {
      return;
    }
    setFillType(value);
    if (value === "Gradient") {
      applyColor(buildGradientPayload(gradientStops));
      return;
    }
    applyColor(gradientStops[activeStopIdx]?.color ?? gradientStops[0]?.color ?? "#ffffff");
  }, [activeStopIdx, applyColor, gradientStops]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCurrentColor(val);
    if (isHexColor(val)) {
      applyColor(val);
    }
  };

  // Dummy swatches based on spec
  const documentSwatches = ["#FF5733", "#33FF57", "#3357FF", "#F2F2F2", "#111111", "#FFF48B"];
  const recentColors = ["#171717", "#2A2A2A", "#A6A6A6", "#E03C3C", "#4A90E2"];

  return (
    <div className={styles.panel}>
      <div className={styles.secHead}>
        <span className={styles.secTitle}>{studio.activeLayer ? "Layer Color" : "Canvas Background"}</span>
        <IconButton label="Eyedropper" icon={<Pipette size={14} />} variant="ghost" size="sm" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <ToggleButtonGroup 
          label="Fill type"
          type="single" 
          value={fillType} 
          onChange={handleFillTypeChange}
        >
          <ToggleButton value="Solid" label="Solid" style={{ flex: 1, justifyContent: "center" }} />
          <ToggleButton value="Gradient" label="Gradient" style={{ flex: 1, justifyContent: "center" }} />
        </ToggleButtonGroup>
      </div>

      {fillType === "Solid" ? (
        <CircularColorPicker color={currentColor} onChange={handleColorChange} />
      ) : (
        <div className={styles.gradientBuilder}>
          <div 
            className={styles.gradientPreview} 
            style={{ background: `linear-gradient(to right, ${gradientStops.map(s => `${s.color} ${s.pos}%`).join(', ')})` }}
          />
          <div className={styles.gradientStops}>
            {gradientStops.map((s, i) => (
              <div 
                key={i}
                className={`${styles.stopItem} ${activeStopIdx === i ? styles.active : ""}`}
                style={{ background: s.color }}
                onClick={() => {
                  setActiveStopIdx(i);
                }}
              />
            ))}
            <IconButton label="Add Stop" icon={<Pipette size={12}/>} variant="ghost" size="sm" onClick={() => {
              const newStops = [...gradientStops, {color: "#ffffff", pos: 50}].sort((a,b) => a.pos - b.pos);
              setGradientStops(newStops);
              handleColorChange(buildGradientPayload(newStops));
            }} />
          </div>
          <CircularColorPicker 
            color={gradientStops[activeStopIdx]?.color || "#ffffff"} 
            onChange={(hex) => {
              const newStops = [...gradientStops];
              if (!newStops[activeStopIdx]) {
                return;
              }
              newStops[activeStopIdx].color = hex;
              setGradientStops(newStops);
              handleColorChange(buildGradientPayload(newStops));
            }} 
          />
        </div>
      )}

      <div className={styles.inputRow}>
        <div 
          className={styles.previewBox} 
          style={{ background: gradientFillToCss(currentColor) ?? currentColor }}
          title="Current color"
        />
        <input 
          type="text" 
          className={styles.colorInput} 
          value={currentColor} 
          onChange={handleInputChange} 
          placeholder="#HEX"
        />
        <button 
          className={styles.modeSwitcher}
          onClick={() => setInputMode(m => m === "HEX" ? "RGB" : m === "RGB" ? "HSL" : "HEX")}
        >
          {inputMode}
        </button>
      </div>

      <div className={styles.swatchesSec}>
        <div className={styles.subTitle}>Document Swatches</div>
        <div className={styles.swatchGrid}>
          {documentSwatches.map(c => (
            <div 
              key={c} 
              className={styles.swatch} 
              style={{ background: c }} 
              onClick={() => handleColorChange(c)} 
              title={c}
            />
          ))}
        </div>
      </div>

      <div className={styles.swatchesSec} style={{ paddingTop: 0 }}>
        <div className={styles.subTitle}>Recent Colors</div>
        <div className={styles.swatchGrid}>
          {recentColors.map(c => (
            <div 
              key={c} 
              className={styles.swatch} 
              style={{ background: c }} 
              onClick={() => handleColorChange(c)} 
              title={c}
            />
          ))}
        </div>
      </div>

      <div className={styles.secHead} style={{ marginTop: 8 }}>
        <span className={styles.secTitle}>Palettes</span>
        <IconButton label="AI Assist" icon={<Sparkles size={14} />} variant="ghost" size="sm" />
      </div>
      <div className={styles.harmonyRow}>
        <button className={styles.harmonyBtn}>Complementary</button>
        <button className={styles.harmonyBtn}>Analogous</button>
        <button className={styles.harmonyBtn}>Monochrome</button>
        <button className={styles.harmonyBtn}>Triadic</button>
      </div>

      <div className={styles.featureList}>
        <div className={styles.featureItem}>
          <Layers size={14} /> Extract from Image
        </div>
        <div className={styles.featureItem}>
          <SlidersHorizontal size={14} /> Match Color
        </div>
        <div className={styles.featureItem}>
          <Sun size={14} /> Gradient & Blend
        </div>
        <div className={styles.featureItem}>
          <Contrast size={14} /> Accessibility (WCAG 4.5:1)
        </div>
      </div>
    </div>
  );
}

export default ColorPanel;
