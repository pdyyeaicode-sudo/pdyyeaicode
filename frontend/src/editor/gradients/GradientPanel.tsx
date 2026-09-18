"use client";

/**
 * GradientPanel — authoring UI for gradient fills.
 *
 * This is the largest capability the renderers had that no user could reach: the
 * engine supports linear and radial gradients, both `gradientUnits`, all three
 * `spreadMethod`s, `gradientTransform` and a radial focal point, while the only
 * fill control in the editor was a hex field that rejected `url(#…)` outright.
 *
 * Design language is the panel's existing one — `panelSection` / `sectionTitle` /
 * `field` / `fieldLabel` / `fieldInput`, the `--bg-2` / `--line` / `--fg-0` /
 * `--fg-2` variables, 28px controls and 6px radii — so it reads as part of the
 * Properties panel rather than as a bolted-on dialog.
 *
 * Editing model: every change dispatches ONE command that updates both the
 * artboard `<defs>` and the layer's fill, so a gradient edit is a single undo
 * step and cannot leave a fill pointing at a definition that does not exist.
 *
 * Live edits are committed on the input's change/commit event rather than on
 * every keystroke of a text field, matching the rest of the panel.
 *
 * One responsibility per file: the gradient authoring panel.
 */

import { useMemo } from "react";

import styles from "../CreativeStudio.module.css";
import { clearGradientCommand, setGradientCommand } from "../commands/setGradientCommand";
import type { Command, DocumentLayer } from "../types/documentModel";
import {
  createGradient,
  gradientIdFromFill,
  gradientPreviewCss,
  MAX_GRADIENT_STOPS,
  normaliseStops,
  parseGradientFromDefs,
  type GradientDefinition,
  type GradientKind,
  type GradientSpread,
  type GradientStop,
  type GradientUnits,
} from "./gradientModel";

export interface GradientPanelProps {
  readonly layer: DocumentLayer;
  /** The active artboard's `<defs>`, which holds the paint servers. */
  readonly defs: string;
  readonly dispatchCommand: (command: Command) => void;
}

/** Solid colour restored when a gradient is removed. */
const FALLBACK_SOLID = "#ffffff";

export function GradientPanel({
  layer,
  defs,
  dispatchCommand,
}: GradientPanelProps): JSX.Element | null {
  const fill = "fill" in layer ? (layer.fill as string | undefined) : undefined;
  const activeId = gradientIdFromFill(fill);

  // Parsing the defs string is the only expensive step, so it is keyed on the
  // markup rather than redone on every render.
  const gradient = useMemo<GradientDefinition | null>(() => {
    if (activeId === null) {
      return null;
    }
    return parseGradientFromDefs(defs, activeId);
  }, [activeId, defs]);

  if (!("fill" in layer)) {
    return null;
  }

  const snapshot = { defs, paint: fill };

  const commit = (next: GradientDefinition): void => {
    dispatchCommand(setGradientCommand(layer.id, next, snapshot));
  };

  const enable = (kind: GradientKind): void => {
    // The id is derived from the layer so a layer owns exactly one gradient and
    // re-applying replaces it rather than accumulating dead defs entries.
    commit(createGradient(`grad-${layer.id}`, kind));
  };

  if (activeId === null || gradient === null) {
    return (
      <div className={styles.panelSection}>
        <h3 className={styles.sectionTitle}>Gradient</h3>
        <div className={styles.fieldGroup}>
          <p className={styles.fieldNote}>
            {activeId === null
              ? "This layer has a solid fill."
              : `The fill references "${activeId}", which is not a gradient this panel wrote.`}
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className={styles.fieldInput} onClick={() => enable("linear")}>
              Linear
            </button>
            <button type="button" className={styles.fieldInput} onClick={() => enable("radial")}>
              Radial
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stops = normaliseStops(gradient.stops);

  const updateStop = (index: number, patch: Partial<GradientStop>): void => {
    commit({
      ...gradient,
      stops: stops.map((stop, at) => (at === index ? { ...stop, ...patch } : stop)),
    });
  };

  const addStop = (): void => {
    if (stops.length >= MAX_GRADIENT_STOPS) {
      return;
    }
    // Insert midway between the last two stops, which is what a user expects
    // when they add a stop without saying where.
    const last = stops[stops.length - 1];
    const previous = stops[stops.length - 2] ?? stops[0];
    commit({
      ...gradient,
      stops: [
        ...stops,
        {
          offset: (previous.offset + last.offset) / 2,
          color: last.color,
          opacity: last.opacity,
        },
      ],
    });
  };

  const removeStop = (index: number): void => {
    // Two stops is the minimum that still describes a ramp; below that the
    // engine paints a flat colour, which is a different intent.
    if (stops.length <= 2) {
      return;
    }
    commit({ ...gradient, stops: stops.filter((_, at) => at !== index) });
  };

  return (
    <div className={styles.panelSection}>
      <h3 className={styles.sectionTitle}>Gradient</h3>

      <div
        aria-label="Gradient preview"
        data-role="gradient-preview"
        style={{
          height: 44,
          borderRadius: 6,
          border: "1px solid var(--line)",
          marginBottom: "0.5rem",
          // The swatch is CSS; the canvas itself is painted by the real
          // renderers, so this is a hint, never the source of truth.
          background: gradientPreviewCss(gradient),
        }}
      />

      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select
            className={styles.fieldInput}
            value={gradient.kind}
            onChange={(event) =>
              commit({ ...gradient, kind: event.target.value as GradientKind })
            }
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
        </label>

        {gradient.kind === "linear" ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Angle</span>
            <input
              className={styles.fieldInput}
              type="range"
              min={0}
              max={360}
              step={1}
              value={gradient.angle}
              onChange={(event) =>
                commit({ ...gradient, angle: Number(event.target.value) })
              }
            />
            <span className={styles.fieldNote}>{Math.round(gradient.angle)}°</span>
          </label>
        ) : (
          <>
            <FractionField
              label="Centre X"
              value={gradient.cx}
              onCommit={(value) => commit({ ...gradient, cx: value, fx: value })}
            />
            <FractionField
              label="Centre Y"
              value={gradient.cy}
              onCommit={(value) => commit({ ...gradient, cy: value, fy: value })}
            />
            <FractionField
              label="Radius"
              value={gradient.r}
              onCommit={(value) => commit({ ...gradient, r: value })}
            />
            <FractionField
              label="Focal X"
              value={gradient.fx}
              onCommit={(value) => commit({ ...gradient, fx: value })}
            />
            <FractionField
              label="Focal Y"
              value={gradient.fy}
              onCommit={(value) => commit({ ...gradient, fy: value })}
            />
          </>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Spread</span>
          <select
            className={styles.fieldInput}
            value={gradient.spread}
            onChange={(event) =>
              commit({ ...gradient, spread: event.target.value as GradientSpread })
            }
          >
            <option value="pad">Pad</option>
            <option value="reflect">Reflect</option>
            <option value="repeat">Repeat</option>
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Units</span>
          <select
            className={styles.fieldInput}
            value={gradient.units}
            onChange={(event) =>
              commit({ ...gradient, units: event.target.value as GradientUnits })
            }
          >
            <option value="objectBoundingBox">Relative to shape</option>
            <option value="userSpaceOnUse">Absolute canvas units</option>
          </select>
        </label>
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Stops</span>
        {stops.map((stop, index) => (
          <div
            key={`${index}-${stop.offset}`}
            data-role="gradient-stop"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <input
              aria-label={`Stop ${index + 1} colour`}
              type="color"
              value={normaliseHex(stop.color)}
              onChange={(event) => updateStop(index, { color: event.target.value })}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                border: "1px solid var(--line)",
                borderRadius: 6,
                background: "var(--bg-2)",
              }}
            />
            <input
              aria-label={`Stop ${index + 1} position`}
              className={styles.fieldInput}
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(stop.offset * 100)}
              onChange={(event) => updateStop(index, { offset: Number(event.target.value) / 100 })}
              style={{ flex: 1 }}
            />
            <input
              aria-label={`Stop ${index + 1} opacity`}
              className={styles.fieldInput}
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={stop.opacity}
              onChange={(event) => updateStop(index, { opacity: Number(event.target.value) })}
              style={{ width: 62 }}
            />
            <button
              type="button"
              aria-label={`Remove stop ${index + 1}`}
              className={styles.fieldInput}
              disabled={stops.length <= 2}
              onClick={() => removeStop(index)}
              style={{ width: 28, padding: 0 }}
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={styles.fieldInput}
            onClick={addStop}
            disabled={stops.length >= MAX_GRADIENT_STOPS}
          >
            Add stop
          </button>
          <button
            type="button"
            className={styles.fieldInput}
            onClick={() =>
              dispatchCommand(
                clearGradientCommand(layer.id, gradient.id, snapshot, FALLBACK_SOLID),
              )
            }
          >
            Remove gradient
          </button>
        </div>
      </div>
    </div>
  );
}

interface FractionFieldProps {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (value: number) => void;
}

/** A 0..1 fraction, presented as a percentage because that is how SVG reads. */
function FractionField({ label, value, onCommit }: FractionFieldProps): JSX.Element {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={styles.fieldInput}
        type="number"
        min={0}
        max={200}
        step={1}
        value={Math.round(value * 100)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onCommit(next / 100);
          }
        }}
      />
    </label>
  );
}

/**
 * `<input type="color">` accepts only `#rrggbb`, so a short or malformed stored
 * colour is normalised rather than silently resetting the swatch to black.
 */
function normaliseHex(color: string): string {
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short !== null) {
    return `#${short[1].split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  return "#000000";
}
