"use client";

/**
 * ColorPicker — a self-contained HSV color picker for the Pydree inspector.
 *
 * Saturation/Value spectrum square + hue strip + HEX / RGB inputs + eyedropper
 * + preset swatches. Pure React + pointer events, no dependency. Emits a 6-digit
 * uppercase hex on every change. The gradients here are functional picker
 * surfaces (the requested "color wheel"), not decorative chrome.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import styles from "./PydreeStudio.module.css";

interface Rgb { r: number; g: number; b: number; }
interface Hsv { h: number; s: number; v: number; }

const SWATCHES = ["#7C5CFF", "#4C8DFF", "#46C08A", "#E0B341", "#FF7A59", "#E0685F", "#ECECF2", "#6F7482", "#121317"];

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 124, g: 92, b: 255 };
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}
function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export interface ColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
}

export function ColorPicker({ color, onChange }: ColorPickerProps): JSX.Element {
  const rgb = hexToRgb(color);
  const hsv = rgbToHsv(rgb);
  const [hue, setHue] = useState(hsv.h);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"sv" | "hue" | null>(null);

  // Keep hue in sync when an external color (with chroma) is applied.
  useEffect(() => {
    if (hsv.s > 0.01 && hsv.v > 0.01) setHue(hsv.h);
  }, [hsv.h, hsv.s, hsv.v]);

  const applySv = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = clamp((clientX - r.left) / r.width, 0, 1);
    const v = clamp(1 - (clientY - r.top) / r.height, 0, 1);
    onChange(rgbToHex(hsvToRgb({ h: hue, s, v })));
  }, [hue, onChange]);

  const applyHue = useCallback((clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = clamp((clientX - r.left) / r.width, 0, 1) * 360;
    setHue(h);
    onChange(rgbToHex(hsvToRgb({ h, s: hsv.s || 1, v: hsv.v || 1 })));
  }, [hsv.s, hsv.v, onChange]);

  useEffect(() => {
    function move(e: PointerEvent): void {
      if (dragging.current === "sv") applySv(e.clientX, e.clientY);
      else if (dragging.current === "hue") applyHue(e.clientX);
    }
    function up(): void { dragging.current = null; }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [applySv, applyHue]);

  function onHex(e: ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value;
    if (/^#?[0-9a-f]{6}$/i.test(val)) onChange(rgbToHex(hexToRgb(val)));
  }
  function onChannel(ch: keyof Rgb, e: ChangeEvent<HTMLInputElement>): void {
    const n = clamp(Number(e.target.value), 0, 255);
    if (!Number.isNaN(n)) onChange(rgbToHex({ ...rgb, [ch]: n }));
  }
  async function eyedrop(): Promise<void> {
    const Ctor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!Ctor) return;
    try {
      const res = await new Ctor().open();
      onChange(rgbToHex(hexToRgb(res.sRGBHex)));
    } catch {
      /* user cancelled */
    }
  }

  const hueColor = rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 }));

  return (
    <div className={styles.colorPanel}>
      <div
        ref={svRef}
        className={styles.svArea}
        style={{
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${hueColor}`,
        }}
        onPointerDown={(e) => { dragging.current = "sv"; applySv(e.clientX, e.clientY); }}
      >
        <span className={styles.svHandle} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }} />
      </div>

      <div className={styles.pickerControls}>
        <button type="button" className={styles.eyedrop} onClick={() => void eyedrop()} title="Pick color from screen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="lucide" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
          </svg>
        </button>
        <div
          ref={hueRef}
          className={styles.hueSlider}
          onPointerDown={(e) => { dragging.current = "hue"; applyHue(e.clientX); }}
        >
          <span className={styles.hueHandle} style={{ left: `${(hue / 360) * 100}%` }} />
        </div>
      </div>

      <div className={styles.colorFields}>
        <label className={styles.colorFieldHex}>
          <span className={styles.colorSwatch} style={{ background: color }} />
          <input value={color} onChange={onHex} spellCheck={false} aria-label="Hex color" />
        </label>
        <input className={styles.numBox} type="number" value={Math.round(rgb.r)} onChange={(e) => onChannel("r", e)} aria-label="Red" />
        <input className={styles.numBox} type="number" value={Math.round(rgb.g)} onChange={(e) => onChannel("g", e)} aria-label="Green" />
        <input className={styles.numBox} type="number" value={Math.round(rgb.b)} onChange={(e) => onChannel("b", e)} aria-label="Blue" />
      </div>

      <div className={styles.swatchRow}>
        {SWATCHES.map((s) => (
          <button key={s} type="button" className={styles.swatchDot} style={{ background: s }} title={s} onClick={() => onChange(s)} />
        ))}
      </div>
    </div>
  );
}

export default ColorPicker;
