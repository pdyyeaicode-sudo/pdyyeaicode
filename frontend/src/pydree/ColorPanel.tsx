import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import styles from "./ColorPanel.module.css";
import type { UseCreativeStudioResult } from "../editor/useCreativeStudio";
import type { DocumentLayer } from "../editor/types/documentModel";
import { Pipette } from "lucide-react";
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

type HarmonyMode = "Complementary" | "Analogous" | "Monochrome" | "Triadic";

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>;
}

type EyeDropperConstructor = new () => EyeDropperInstance;

function getEyeDropperConstructor(): EyeDropperConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & typeof globalThis & { EyeDropper?: EyeDropperConstructor }).EyeDropper ?? null;
}

function collectLayerColors(layers: readonly DocumentLayer[]): string[] {
  const colors: string[] = [];
  for (const layer of layers) {
    const fill = getLayerFill(layer);
    if (fill !== null && isHexColor(fill)) {
      colors.push(fill);
    }
    if (layer.kind !== "text" && layer.kind !== "image" && layer.kind !== "group" && isHexColor(layer.stroke ?? "")) {
      colors.push(layer.stroke as string);
    }
    if (layer.kind === "group") {
      colors.push(...collectLayerColors(layer.children));
    }
  }
  return colors;
}

function uniqueColors(colors: readonly string[]): string[] {
  const seen = new Set<string>();
  return colors.filter((color) => {
    const normalized = color.toLowerCase();
    if (!isHexColor(color) || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function getHarmonyColors(color: string, mode: HarmonyMode): string[] {
  const [hue, saturation, value] = rgbToHsv(...hexToRgb(color));
  const offsets: Record<HarmonyMode, readonly number[]> = {
    Complementary: [0, 180],
    Analogous: [-30, 0, 30],
    Monochrome: [0, 0, 0],
    Triadic: [0, 120, 240],
  };
  if (mode === "Monochrome") {
    return [0.55, 0.75, 1].map((brightness) => hsvToHex(hue, saturation, brightness));
  }
  return offsets[mode].map((offset) => hsvToHex((hue + offset + 360) % 360, saturation, value));
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
  const activeArtboard = studio.document ? getActiveArtboard(studio.document) : null;
  let selectedLayer: DocumentLayer | null = null;
  if (activeArtboard) {
    if (studio.activeLayer) {
      selectedLayer = findLayer(activeArtboard.layers, studio.activeLayer);
    }
  }
  const selectedLayerCanFill = selectedLayer !== null && getLayerFill(selectedLayer) !== null;
  const targetLayer = selectedLayerCanFill
    ? selectedLayer
    : activeArtboard?.layers.find((layer) => layer.role === "background") ?? null;

  const activeLayerId = targetLayer?.id;
  const eyeDropperConstructor = getEyeDropperConstructor();

  const [currentColor, setCurrentColor] = useState<string>("#ffffff");
  const [fillType, setFillType] = useState<"Solid" | "Gradient">("Solid");
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([
    {color: "#ff0080", pos: 0},
    {color: "#7928ca", pos: 100}
  ]);
  const [activeStopIdx, setActiveStopIdx] = useState(0);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [harmonyMode, setHarmonyMode] = useState<HarmonyMode>("Complementary");

  useEffect(() => {
    if (targetLayer) {
      const currentFill = getLayerFill(targetLayer);
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
    if (isHexColor(payload)) {
      setRecentColors((current) => [payload, ...current.filter((color) => color.toLowerCase() !== payload.toLowerCase())].slice(0, 6));
    }
    if (targetLayer?.role === "background" || (!studio.activeLayer && studio.document)) {
      studio.updateBackground(payload);
      return;
    }
    if (activeLayerId && targetLayer) {
      const prevFill = getLayerFill(targetLayer) || "#000000";
      if (prevFill !== 'mixed' && prevFill !== payload) {
        studio.dispatchCommand(setPropertyCommand(activeLayerId, "fill", prevFill, payload));
      }
    }
  }, [activeLayerId, targetLayer, studio]);

  const applyEditableColor = useCallback((color: string): void => {
    if (!isHexColor(color)) {
      return;
    }
    if (fillType !== "Gradient") {
      applyColor(color);
      return;
    }
    if (!gradientStops[activeStopIdx]) {
      return;
    }
    const nextStops = gradientStops.map((stop, index) => index === activeStopIdx ? { ...stop, color } : stop);
    setGradientStops(nextStops);
    applyColor(buildGradientPayload(nextStops));
  }, [activeStopIdx, applyColor, fillType, gradientStops]);

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

  const editableColor = fillType === "Gradient"
    ? gradientStops[activeStopIdx]?.color ?? "#ffffff"
    : currentColor;

  const documentSwatches = useMemo(() => uniqueColors([
    ...(activeArtboard ? collectLayerColors(activeArtboard.layers) : []),
    studio.brandKit.primaryColor,
    studio.brandKit.secondaryColor,
  ]).slice(0, 12), [activeArtboard, studio.brandKit.primaryColor, studio.brandKit.secondaryColor]);

  const harmonyColors = useMemo(
    () => getHarmonyColors(isHexColor(editableColor) ? editableColor : "#ffffff", harmonyMode),
    [editableColor, harmonyMode],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    if (fillType === "Gradient") {
      if (!gradientStops[activeStopIdx]) {
        return;
      }
      const nextStops = gradientStops.map((stop, index) => index === activeStopIdx ? { ...stop, color: value } : stop);
      setGradientStops(nextStops);
      if (isHexColor(value)) {
        applyColor(buildGradientPayload(nextStops));
      }
      return;
    }
    setCurrentColor(value);
    if (isHexColor(value)) {
      applyColor(value);
    }
  };

  const handleEyeDropper = useCallback(async (): Promise<void> => {
    if (!eyeDropperConstructor) {
      studio.showToast("Your browser does not support the eyedropper.", "info");
      return;
    }
    try {
      const result = await new eyeDropperConstructor().open();
      applyEditableColor(result.sRGBHex);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      studio.showToast("Could not read a color from the screen.", "error");
    }
  }, [applyEditableColor, eyeDropperConstructor, studio]);

  return (
    <div className={styles.panel}>
      <div className={styles.secHead}>
        <span className={styles.secTitle}>{selectedLayerCanFill ? "Layer Color" : "Canvas Background"}</span>
        <IconButton
          label="Eyedropper"
          icon={<Pipette size={14} />}
          variant="ghost"
          size="sm"
          isDisabled={eyeDropperConstructor === null}
          tooltip={eyeDropperConstructor ? "Pick a color from the screen" : "Eyedropper is not supported by this browser"}
          onClick={() => void handleEyeDropper()}
        />
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
        <CircularColorPicker color={editableColor} onChange={applyEditableColor} />
      ) : (
        <div className={styles.gradientBuilder}>
          <div 
            className={styles.gradientPreview} 
            style={{ background: `linear-gradient(to right, ${gradientStops.map(s => `${s.color} ${s.pos}%`).join(', ')})` }}
          />
          <div className={styles.gradientStops}>
            {gradientStops.map((s, i) => (
              <button
                type="button"
                key={i}
                className={`${styles.stopItem} ${activeStopIdx === i ? styles.active : ""}`}
                style={{ background: s.color }}
                onClick={() => setActiveStopIdx(i)}
                aria-label={`Select gradient stop ${i + 1}`}
              />
            ))}
            <IconButton label="Add Stop" icon={<Pipette size={12}/>} variant="ghost" size="sm" onClick={() => {
              const newStops = [...gradientStops, {color: "#ffffff", pos: 50}].sort((a,b) => a.pos - b.pos);
              setGradientStops(newStops);
              applyColor(buildGradientPayload(newStops));
            }} />
          </div>
          <CircularColorPicker 
            color={gradientStops[activeStopIdx]?.color || "#ffffff"} 
            onChange={applyEditableColor}
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
          value={editableColor}
          onChange={handleInputChange} 
          placeholder="#HEX"
          aria-label="Color value"
        />
      </div>

      {documentSwatches.length > 0 ? (
        <div className={styles.swatchesSec}>
          <div className={styles.subTitle}>Document & Brand Colors</div>
          <div className={styles.swatchGrid}>
            {documentSwatches.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                style={{ background: color }}
                onClick={() => applyEditableColor(color)}
                aria-label={`Apply ${color}`}
                title={color}
              />
            ))}
          </div>
        </div>
      ) : null}

      {recentColors.length > 0 ? (
        <div className={styles.swatchesSec} style={{ paddingTop: 0 }}>
          <div className={styles.subTitle}>Recent Colors</div>
          <div className={styles.swatchGrid}>
            {recentColors.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                style={{ background: color }}
                onClick={() => applyEditableColor(color)}
                aria-label={`Apply recent ${color}`}
                title={color}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.secHead} style={{ marginTop: 8 }}>
        <span className={styles.secTitle}>Color Harmony</span>
      </div>
      <div className={styles.harmonyRow}>
        {(["Complementary", "Analogous", "Monochrome", "Triadic"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`${styles.harmonyBtn} ${harmonyMode === mode ? styles.harmonyBtnActive : ""}`}
            aria-pressed={harmonyMode === mode}
            onClick={() => setHarmonyMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className={styles.harmonySwatches}>
        {harmonyColors.map((color) => (
          <button
            key={color}
            type="button"
            className={styles.swatch}
            style={{ background: color }}
            onClick={() => applyEditableColor(color)}
            aria-label={`Apply harmony ${color}`}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}

export default ColorPanel;
