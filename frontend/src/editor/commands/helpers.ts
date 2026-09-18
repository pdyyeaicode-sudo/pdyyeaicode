/**
 * Shared pure helpers for the Command set (Command / History System).
 *
 * Every Command in `frontend/src/editor/commands/` operates on the *active
 * artboard's* layer tree within a `CreativeDocument` and treats the document
 * immutably (returns new objects, never mutates the input). These helpers walk
 * `pages -> artboards -> layers` (including nested `GroupLayer.children`) and
 * rebuild the structure with the minimal set of new references.
 *
 * Design contract (design.md -> "Command / History System"):
 *  - Commands capture the values needed to invert themselves at construction;
 *    `apply`/`undo` only apply captured values and stay pure.
 *  - Validation/clamping is performed by callers BEFORE a Command is built.
 *
 * One responsibility per file: this module only provides immutable tree
 * utilities and layer geometry math. It holds no global mutable state beyond a
 * monotonic id counter used to mint unique identifiers on request.
 */

import type {
  Artboard,
  CreativeDocument,
  DocumentLayer,
  ShapeGeometry,
} from "../types/documentModel";
import { worldDeltaInSpaceOf } from "../geometry/transformDelta";
import { parseSvgTransform } from "../renderer/matrix2d";

// ---------------------------------------------------------------------------
// Active-artboard access (immutable)
// ---------------------------------------------------------------------------

/** Return the active `Artboard`, or `null` when it cannot be resolved. */
export function getActiveArtboard(doc: CreativeDocument): Artboard | null {
  for (const page of doc.pages) {
    for (const artboard of page.artboards) {
      if (artboard.id === doc.activeArtboardId) {
        return artboard;
      }
    }
  }
  return null;
}

/**
 * Return a new `CreativeDocument` whose active artboard's `layers` array has
 * been transformed by `transform`. When the active artboard cannot be resolved
 * or the transform returns the same reference, the original document is
 * returned unchanged.
 */
export function mapActiveArtboardLayers(
  doc: CreativeDocument,
  transform: (layers: DocumentLayer[]) => DocumentLayer[],
): CreativeDocument {
  let changed = false;
  const pages = doc.pages.map((page) => {
    const artboards = page.artboards.map((artboard) => {
      if (artboard.id !== doc.activeArtboardId) {
        return artboard;
      }
      const nextLayers = transform(artboard.layers);
      if (nextLayers === artboard.layers) {
        return artboard;
      }
      changed = true;
      return { ...artboard, layers: nextLayers };
    });
    const pageChanged = artboards.some(
      (artboard, index) => artboard !== page.artboards[index],
    );
    return pageChanged ? { ...page, artboards } : page;
  });

  return changed ? { ...doc, pages } : doc;
}

// ---------------------------------------------------------------------------
// Layer-tree traversal (immutable)
// ---------------------------------------------------------------------------

/**
 * Find a layer anywhere in the tree (top level or nested inside any
 * `GroupLayer.children`) by its `id`. Returns `null` when absent.
 */
export function findLayer(layers: readonly DocumentLayer[], layerId: string): DocumentLayer | null {
  for (const layer of layers) {
    if (layer.id === layerId) {
      return layer;
    }
    if (layer.kind === "group") {
      const nested = findLayer(layer.children, layerId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

/**
 * Returns the chain of parent layers (from top level down) that lead to `targetId`.
 * Returns an empty array if the layer is at the root or not found.
 */
export function findParentChain(layers: readonly DocumentLayer[], targetId: string): DocumentLayer[] {
  const chain: DocumentLayer[] = [];
  
  function walk(currentLayers: readonly DocumentLayer[], target: string): boolean {
    for (const layer of currentLayers) {
      if (layer.id === target) {
        return true;
      }
      if (layer.kind === "group" && layer.children) {
        if (walk(layer.children, target)) {
          chain.unshift(layer);
          return true;
        }
      }
    }
    return false;
  }
  
  walk(layers, targetId);
  return chain;
}

/**
 * Return a new layer array in which the layer matching `layerId` (searched
 * recursively through nested groups) is replaced by `transform(layer)`. Layers
 * that are not on the matched path keep their original reference. When no layer
 * matches, the original array reference is returned unchanged.
 */
export function mapLayerTree(
  layers: DocumentLayer[],
  layerId: string,
  transform: (layer: DocumentLayer) => DocumentLayer,
): DocumentLayer[] {
  let changed = false;
  const next = layers.map((layer) => {
    if (layer.id === layerId) {
      const transformed = transform(layer);
      if (transformed !== layer) {
        changed = true;
      }
      return transformed;
    }
    if (layer.kind === "group") {
      const children = mapLayerTree(layer.children, layerId, transform);
      if (children !== layer.children) {
        changed = true;
        return { ...layer, children };
      }
    }
    return layer;
  });
  return changed ? next : layers;
}

/**
 * Convenience wrapper: map a single layer (by id) inside the active artboard's
 * layer tree of a document, returning a new immutable document.
 */
export function mapLayerInDoc(
  doc: CreativeDocument,
  layerId: string,
  transform: (layer: DocumentLayer) => DocumentLayer,
): CreativeDocument {
  return mapActiveArtboardLayers(doc, (layers) => mapLayerTree(layers, layerId, transform));
}

// ---------------------------------------------------------------------------
// Top-level array mutations (immutable)
// ---------------------------------------------------------------------------

/** Insert `layer` at `index` (clamped to the array bounds), returning a new array. */
export function insertLayerAt(layers: DocumentLayer[], layer: DocumentLayer, index: number): DocumentLayer[] {
  const clamped = clampIndex(index, layers.length);
  const next = [...layers];
  next.splice(clamped, 0, layer);
  return next;
}

/** Remove the top-level layer with `layerId`, returning a new array (or the same when absent). */
export function removeLayerById(layers: DocumentLayer[], layerId: string): DocumentLayer[] {
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index === -1) {
    return layers;
  }
  const next = [...layers];
  next.splice(index, 1);
  return next;
}

/** Remove the layer with `layerId` recursively from anywhere in the tree, returning a new tree. */
export function removeLayerFromTree(layers: readonly DocumentLayer[], layerId: string): DocumentLayer[] {
  let changed = false;
  const next = layers.filter((layer) => {
    if (layer.id === layerId) {
      changed = true;
      return false;
    }
    return true;
  }).map((layer) => {
    if (layer.kind === "group") {
      const nextChildren = removeLayerFromTree(layer.children, layerId);
      if (nextChildren !== layer.children) {
        changed = true;
        return { ...layer, children: nextChildren };
      }
    }
    return layer;
  });
  return changed ? next : (layers as DocumentLayer[]);
}

export interface LayerPosition {
  parentId: string | null;
  index: number;
}

/** Recursively scan the tree to find the parent group ID and child index of a layer. */
export function findLayerPosition(layers: readonly DocumentLayer[], layerId: string, parentId: string | null = null): LayerPosition | null {
  const idx = layers.findIndex(l => l.id === layerId);
  if (idx !== -1) {
    return { parentId, index: idx };
  }
  for (const layer of layers) {
    if (layer.kind === "group") {
      const pos = findLayerPosition(layer.children, layerId, layer.id);
      if (pos) return pos;
    }
  }
  return null;
}

/** Recursively insert a layer back at a specific parent group ID and child index position. */
export function insertLayerAtPosition(
  layers: readonly DocumentLayer[],
  layer: DocumentLayer,
  position: LayerPosition
): DocumentLayer[] {
  if (position.parentId === null) {
    return insertLayerAt(layers as DocumentLayer[], layer, position.index);
  }
  
  return layers.map((l) => {
    if (l.id === position.parentId && l.kind === "group") {
      return {
        ...l,
        children: insertLayerAt(l.children as DocumentLayer[], layer, position.index),
      };
    }
    if (l.kind === "group") {
      return {
        ...l,
        children: insertLayerAtPosition(l.children, layer, position),
      };
    }
    return l;
  }) as DocumentLayer[];
}

/**
 * Move the top-level layer at `fromIndex` to `toIndex`, preserving the relative
 * order of all other layers. Returns a new array. `moveLayer(moveLayer(xs, a,
 * b), b, a)` restores the original ordering for valid in-range indices.
 */
export function moveLayer(layers: DocumentLayer[], fromIndex: number, toIndex: number): DocumentLayer[] {
  if (fromIndex < 0 || fromIndex >= layers.length) {
    return layers;
  }
  const next = [...layers];
  const [moved] = next.splice(fromIndex, 1);
  const dest = clampIndex(toIndex, next.length);
  next.splice(dest, 0, moved);
  return next;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }
  if (index > length) {
    return length;
  }
  return Math.floor(index);
}

// ---------------------------------------------------------------------------
// Geometry translation (pure, exactly invertible)
// ---------------------------------------------------------------------------

/**
 * Return a copy of `layer` translated by `(dx, dy)`, expressed in the layer's OWN
 * space.
 *
 * "Its own space" matters for groups. A group's children each carry their own
 * transform, and a child's geometry coordinates live INSIDE that transform, so
 * offsetting every descendant's geometry by the same numbers moves a rotated or
 * scaled child in the wrong direction and by the wrong amount. Previously that is
 * exactly what happened: dragging a group whose children were individually rotated
 * pulled them apart.
 *
 * The delta is therefore mapped into each child's space on the way down:
 *
 * ```
 * want:  T_child * g' = T_child * g + delta        (move by delta in the group's space)
 * so:    g' = g + linear(T_child)^-1 * delta
 * ```
 *
 * which is the same `M^-1 * t` conversion the drag path uses, applied recursively.
 *
 * When a descendant's transform cannot be inverted — singular, or a transform list
 * this codebase cannot parse — the layer is returned UNCHANGED and the reason is
 * logged. A group that moved some of its children and not others would be worse
 * than one that did not move, and the dispatcher drops a no-op command.
 *
 * Offsetting by `(dx, dy)` then `(-dx, -dy)` reproduces the original layer exactly
 * for coordinates that are integer multiples of 0.5 (the Canonical_SVG grid), which
 * keeps translate commands exactly invertible.
 */
export function offsetLayer(layer: DocumentLayer, dx: number, dy: number): DocumentLayer {
  switch (layer.kind) {
    case "text":
      return { ...layer, x: layer.x + dx, y: layer.y + dy };
    case "image":
      return { ...layer, x: layer.x + dx, y: layer.y + dy };
    case "group": {
      const children: DocumentLayer[] = [];
      for (const child of layer.children) {
        const childDelta = deltaInLayerSpace(child, dx, dy);
        if (childDelta === null) {
          console.warn(
            `[commands] layer "${child.id}" has a transform that cannot be inverted, so the `
              + `translation of group "${layer.id}" was not applied to any child.`,
          );
          return layer;
        }
        children.push(offsetLayer(child, childDelta.dx, childDelta.dy));
      }
      return { ...layer, children };
    }
    default:
      return { ...layer, geometry: offsetGeometry(layer.geometry, dx, dy) };
  }
}

/**
 * A delta from a parent's space into `layer`'s own space.
 *
 * Only the LINEAR part of the transform applies: a displacement has no position, so
 * adding the transform's translation would move the layer by its own offset as well.
 * Returns null when the transform is unusable, so the caller can refuse rather than
 * apply an unconverted delta.
 */
function deltaInLayerSpace(
  layer: DocumentLayer,
  dx: number,
  dy: number,
): { dx: number; dy: number } | null {
  const transform = (layer as { transform?: string }).transform;
  if (transform === undefined || transform.trim() === "") {
    return { dx, dy };
  }
  const parsed = parseSvgTransform(transform);
  if (parsed.unsupported.length > 0) {
    // An unparsed component would silently drop out of the conversion, so the
    // resulting delta would be wrong in a way nothing downstream could detect.
    return null;
  }
  return worldDeltaInSpaceOf(parsed.matrix, { dx, dy });
}

function offsetGeometry(geometry: ShapeGeometry, dx: number, dy: number): ShapeGeometry {
  switch (geometry.type) {
    case "rect":
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
    case "ellipse":
      return { ...geometry, cx: geometry.cx + dx, cy: geometry.cy + dy };
    case "line":
      return {
        ...geometry,
        x1: geometry.x1 + dx,
        y1: geometry.y1 + dy,
        x2: geometry.x2 + dx,
        y2: geometry.y2 + dy,
      };
    case "polygon":
      return { ...geometry, points: geometry.points.map(([px, py]) => [px + dx, py + dy] as [number, number]) };
    case "parametric":
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
    case "path":
    default:
      return { ...geometry, d: translatePathData(geometry.d, dx, dy) };
  }
}

/**
 * Translate the absolute coordinates of an SVG path `d` string by `(dx, dy)`.
 * Relative segments keep their deltas (already translation-invariant); only the
 * coordinate operands of absolute commands are offset, with arc flags/radii
 * left untouched. Applying `+ (dx, dy)` then `- (dx, dy)` restores the exact
 * input for grid-aligned coordinates, preserving command invertibility.
 */
export function translatePathData(d: string, dx: number, dy: number): string {
  if (!d || (dx === 0 && dy === 0)) {
    return d;
  }

  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) {
    return d;
  }

  const out: string[] = [];
  let command = "";
  let operandIndex = 0;

  for (const token of tokens) {
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      operandIndex = 0;
      out.push(token);
      continue;
    }

    const value = Number.parseFloat(token);
    const axis = absoluteAxisFor(command, operandIndex);
    if (axis === "x") {
      out.push(formatCoordinate(value + dx));
    } else if (axis === "y") {
      out.push(formatCoordinate(value + dy));
    } else {
      out.push(token);
    }
    operandIndex += 1;
  }

  return out.join(" ");
}

/**
 * For an absolute path command and the zero-based operand position within that
 * command, return whether the operand is an `x`/`y` coordinate or neither
 * (radii, rotation, flags, or any relative-command operand).
 */
function absoluteAxisFor(command: string, operandIndex: number): "x" | "y" | null {
  switch (command) {
    case "M":
    case "L":
    case "T":
      return operandIndex % 2 === 0 ? "x" : "y";
    case "H":
      return "x";
    case "V":
      return "y";
    case "C": {
      const slot = operandIndex % 6;
      return slot % 2 === 0 ? "x" : "y";
    }
    case "S":
    case "Q": {
      const slot = operandIndex % 4;
      return slot % 2 === 0 ? "x" : "y";
    }
    case "A": {
      const slot = operandIndex % 7;
      if (slot === 5) {
        return "x";
      }
      if (slot === 6) {
        return "y";
      }
      return null;
    }
    default:
      // Relative commands (lowercase) and 'Z'/'z' are translation-invariant.
      return null;
  }
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  // Keep enough precision that grid-aligned values stay exact across inversion.
  return String(Number(value.toFixed(4)));
}

// ---------------------------------------------------------------------------
// Identifier minting
// ---------------------------------------------------------------------------

let idCounter = 0;

/**
 * Mint a process-unique identifier with the given prefix (e.g. `group`,
 * `shape`). Callers that need determinism may supply their own id instead.
 */
export function mintId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}
