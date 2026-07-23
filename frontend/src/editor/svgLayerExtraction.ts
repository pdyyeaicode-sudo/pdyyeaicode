/**
 * Shared derivation of the backend `SVGLayer[]` contract from a live SVG root.
 *
 * This is the single source of truth for turning the top-level `<g data-role>`
 * groups of a Canonical_SVG into the `DesignOutput.svgLayers[]` interchange
 * shape. It was factored out of `useDesignStudio.ts` (without changing its
 * behavior) so both the hook's in-place SVG mutation path and the
 * Document_Model mapping in `designOutputMapping.ts` reuse the exact same
 * logic rather than duplicating it (AGENTS.md: extend, never rewrite; one
 * responsibility per file).
 *
 * Pure functions only — no React/state work and no hidden global state.
 */

import type { SVGLayer } from "../types";

/**
 * Derive the ordered `SVGLayer[]` from an `<svg>` root, preserving any role
 * carried by a matching previous layer (matched by `data-layer-id` or name).
 */
export function extractLayers(svgRoot: SVGSVGElement, previousLayers: SVGLayer[]): SVGLayer[] {
  const serializer = new XMLSerializer();
  const previousLayerById = new Map<string, SVGLayer>();
  previousLayers.forEach((layer) => {
    previousLayerById.set(layer.id, layer);
    const layerName = readLayerName(layer.svgElement);
    if (layerName) {
      previousLayerById.set(layerName, layer);
    }
  });

  const topLevelGroups = Array.from(svgRoot.children).filter(
    (node): node is SVGGElement => node.tagName.toLowerCase() === "g" && node.hasAttribute("data-role"),
  );

  return topLevelGroups.map((group, index) => {
    const layerId = group.getAttribute("data-layer-id") ?? `layer-${index}`;
    const previousLayer = previousLayerById.get(layerId);
    return {
      id: layerId,
      role: previousLayer?.role ?? toLayerRole(group.getAttribute("data-role") ?? "shapes"),
      svgElement: serializer.serializeToString(group),
      isEditable: group.getAttribute("data-editable") === "true",
    };
  });
}

export function readLayerName(svgElement: string): string | null {
  const idMatch = svgElement.match(/data-layer-id="([^"]+)"/);
  if (idMatch?.[1]) {
    return idMatch[1];
  }
  const roleMatch = svgElement.match(/data-role="([^"]+)"/);
  return roleMatch?.[1] ?? null;
}

export function toLayerRole(layerName: string): SVGLayer["role"] {
  switch (layerName) {
    case "background":
      return "background";
    case "image-slots":
      return "image";
    case "logo":
      return "logo";
    case "headline":
      return "headline";
    case "cta":
      return "cta";
    case "body":
      return "body";
    default:
      return "shape";
  }
}
