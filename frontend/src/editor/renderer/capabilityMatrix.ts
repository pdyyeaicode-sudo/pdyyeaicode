/**
 * capabilityMatrix — the declared support status of every renderable feature.
 *
 * The purpose is to make "supported" a claim that can be falsified. A feature is
 * not supported because a toolbar button exists for it; it is supported when the
 * engine renders it and a test proves it. The companion test drives the encoder
 * for each entry and fails if reality disagrees with this table, in either
 * direction:
 *
 *   declared supported but the encoder reports it unsupported  -> fail
 *   declared unsupported but the encoder emits it silently     -> fail
 *
 * That second direction matters as much as the first: it catches a feature that
 * started working without the matrix being updated, which is how a matrix
 * quietly becomes fiction.
 *
 * The SVG column is the reference renderer and remains the export/print path.
 *
 * One responsibility per file: declaring renderer capability status.
 */

/** How completely a backend handles a feature. */
export type SupportLevel =
  /** Rendered correctly, with a test that proves it. */
  | "full"
  /** Rendered, but with a documented limitation. */
  | "partial"
  /** Not rendered. Must produce a diagnostic, never silent degradation. */
  | "none";

export interface CapabilityEntry {
  readonly feature: string;
  readonly svg: SupportLevel;
  readonly skia: SupportLevel;
  /** True when cross-language parity is asserted for this feature. */
  readonly parityTested: boolean;
  /** Why it is not yet complete, or how it is verified. */
  readonly note: string;
}

/**
 * Declared capability status.
 *
 * Keep this ordered by implementation priority so the next milestone is obvious
 * from reading the table.
 */
export const CAPABILITY_MATRIX: readonly CapabilityEntry[] = [
  {
    feature: "rect",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Includes corner radius, fill and stroke.",
  },
  {
    feature: "ellipse",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Parity asserts a bounding-box corner is not a hit.",
  },
  {
    feature: "path",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Parsed by SkParsePath; malformed data is counted, not ignored.",
  },
  {
    feature: "polygon",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Encoded as a path; no separate engine node kind.",
  },
  {
    feature: "line",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Encoded as a path with no fill, matching SVG semantics.",
  },
  {
    feature: "group",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Preserved as a tree so nesting is never flattened.",
  },
  {
    feature: "group-isolation",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Alpha and blend apply to the composed group, not per child.",
  },
  {
    feature: "blend-mode",
    svg: "full",
    skia: "full",
    parityTested: false,
    note: "All 17 CSS modes map onto SkBlendMode; unknown values are reported.",
  },
  {
    feature: "opacity",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Leaf alpha and isolated group alpha are distinct paths.",
  },
  {
    feature: "transform",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Full SVG transform list; parity asserts matrix component order.",
  },
  {
    feature: "text",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Shaped via skparagraph with HarfBuzz and ICU.",
  },
  {
    feature: "text-transform",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Applied at encode time; the document keeps the original string.",
  },
  {
    feature: "text-metrics",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Engine metrics give exact bounds; without a font, bounds stay unknown.",
  },
  {
    feature: "font-registration",
    svg: "full",
    skia: "partial",
    parityTested: true,
    note: "One published font registers. Per-family weight/style resolution pending; unresolved families are named in the overlay.",
  },
  {
    feature: "text-decoration",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Underline and line-through via TextStyle::setDecoration; the decoration colour is set explicitly because skparagraph defaults it to white.",
  },
  {
    feature: "gradient",
    svg: "full",
    skia: "full",
    parityTested: true,
    note: "Linear and radial, both gradientUnits, all three spreadMethods, gradientTransform and href inheritance. The engine parses <defs> itself; TypeScript forwards only the id.",
  },
  {
    feature: "image",
    svg: "full",
    skia: "none",
    parityTested: false,
    note: "Needs the asset manager; codecs are already linked into the wasm build.",
  },
  {
    feature: "clip-path",
    svg: "full",
    skia: "partial",
    parityTested: false,
    note: "Traversal resolves and applies clips; independently transformed clip sources need mask support.",
  },
  {
    feature: "vertical-writing",
    svg: "full",
    skia: "none",
    parityTested: false,
    note: "Largest remaining item; skparagraph has no direct vertical layout.",
  },
  {
    feature: "print-pdf-export",
    svg: "full",
    skia: "none",
    parityTested: false,
    note: "Intentional: export stays on the canonical SVG path. Skia's PDF backend drops or rasterizes some effects.",
  },
];

/** Features the engine claims to render, for assertions and reporting. */
export function supportedBySkia(): readonly string[] {
  return CAPABILITY_MATRIX.filter((entry) => entry.skia === "full").map((entry) => entry.feature);
}

/** Features that must still produce a diagnostic rather than degrade silently. */
export function unsupportedBySkia(): readonly string[] {
  return CAPABILITY_MATRIX.filter((entry) => entry.skia === "none").map((entry) => entry.feature);
}

/** Render the matrix as a fixed-width table for docs and console output. */
export function formatCapabilityMatrix(): string {
  const symbol = (level: SupportLevel): string =>
    level === "full" ? "yes" : level === "partial" ? "partial" : "no";

  const header = `${"feature".padEnd(22)}${"svg".padEnd(9)}${"skia".padEnd(9)}parity`;
  const rows = CAPABILITY_MATRIX.map(
    (entry) =>
      `${entry.feature.padEnd(22)}${symbol(entry.svg).padEnd(9)}${symbol(entry.skia).padEnd(9)}${
        entry.parityTested ? "yes" : "-"
      }`,
  );
  return [header, "-".repeat(header.length), ...rows].join("\n");
}
