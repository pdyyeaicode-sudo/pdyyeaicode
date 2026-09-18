/**
 * sceneRenderer — the single traversal that turns a `RenderScene` into
 * `Renderer2D` calls (spec §64, §65).
 *
 * Every backend shares this walk, so paint order, transform composition, group
 * isolation, clipping and culling behave identically on the SVG renderer, the
 * Skia renderer, thumbnails and export targets. A backend only implements the
 * drawing primitives; it never re-derives scene semantics.
 *
 * The walk is intentionally allocation-light: it recurses over the existing
 * node tree and emits `save`/`concatTransform`/`restore` rather than building
 * per-frame intermediate objects.
 *
 * One responsibility per file: scene traversal and command emission.
 */

import type { ClipSpec, Renderer2D } from "./Renderer2D";
import { rectIntersects, type Matrix2D, type RectF } from "./matrix2d";
import {
  findSceneNode,
  isGroupNode,
  type RenderGroupNode,
  type RenderLeafNode,
  type RenderNode,
  type RenderScene,
} from "./renderScene";

export interface RenderSceneOptions {
  /** Document space → surface space. */
  readonly viewTransform: Matrix2D;
  /** Backing-store scale for high-DPI output (spec §91). Defaults to 1. */
  readonly pixelRatio?: number;
  /** Region that must be repainted, in document space (spec §30). */
  readonly dirtyRect?: RectF;
  /**
   * Visible region in document space. Nodes whose world bounds fall entirely
   * outside are skipped (spec §65 "Culling"). Nodes with unknown bounds are
   * never culled, so unmeasured text is still drawn.
   */
  readonly cullRect?: RectF;
  /** When set, the surface is cleared to this colour before drawing. */
  readonly backgroundColor?: string;
}

/** Instrumentation for the profiling requirement in spec §49. */
export interface RenderStats {
  nodesVisited: number;
  nodesDrawn: number;
  nodesCulled: number;
  layersOpened: number;
  clipsApplied: number;
  /** Clip references that could not be resolved to a usable shape. */
  unresolvedClips: string[];
}

/** Draw `scene` into `renderer`. Returns instrumentation for profiling. */
export function renderScene(
  scene: RenderScene,
  renderer: Renderer2D,
  options: RenderSceneOptions,
): RenderStats {
  const stats: RenderStats = {
    nodesVisited: 0,
    nodesDrawn: 0,
    nodesCulled: 0,
    layersOpened: 0,
    clipsApplied: 0,
    unresolvedClips: [],
  };

  renderer.beginFrame({
    width: scene.width,
    height: scene.height,
    viewTransform: options.viewTransform,
    pixelRatio: options.pixelRatio ?? 1,
    dirtyRect: options.dirtyRect,
  });

  if (options.backgroundColor !== undefined) {
    renderer.clear(options.backgroundColor);
  }

  renderer.setTransform(options.viewTransform);
  drawNodes(scene, scene.roots, renderer, options, stats);
  renderer.endFrame();

  return stats;
}

function drawNodes(
  scene: RenderScene,
  nodes: readonly RenderNode[],
  renderer: Renderer2D,
  options: RenderSceneOptions,
  stats: RenderStats,
): void {
  for (const node of nodes) {
    drawNode(scene, node, renderer, options, stats);
  }
}

function drawNode(
  scene: RenderScene,
  node: RenderNode,
  renderer: Renderer2D,
  options: RenderSceneOptions,
  stats: RenderStats,
): void {
  stats.nodesVisited += 1;

  // Fully-opaque culling decision: only skip when we KNOW the bounds and know
  // they are outside the visible region.
  if (
    options.cullRect !== undefined
    && node.worldBounds !== null
    && !rectIntersects(node.worldBounds, options.cullRect)
  ) {
    stats.nodesCulled += 1;
    return;
  }

  renderer.save();
  renderer.concatTransform(node.localTransform);

  const clip = resolveClip(scene, node.clipPathId);
  if (node.clipPathId !== undefined) {
    if (clip === null) {
      stats.unresolvedClips.push(node.clipPathId);
    } else {
      renderer.setClip(clip);
      stats.clipsApplied += 1;
    }
  }

  if (isGroupNode(node)) {
    drawGroup(scene, node, renderer, options, stats);
  } else {
    drawLeaf(node, renderer);
    stats.nodesDrawn += 1;
  }

  renderer.restore();
}

function drawGroup(
  scene: RenderScene,
  node: RenderGroupNode,
  renderer: Renderer2D,
  options: RenderSceneOptions,
  stats: RenderStats,
): void {
  if (!node.isolate) {
    drawNodes(scene, node.children, renderer, options, stats);
    return;
  }
  // Composite the group's children into their own layer so alpha, blend mode
  // and effects apply to the composed result (spec §12, §25).
  renderer.beginLayer(node, node.opacity, node.blendMode);
  stats.layersOpened += 1;
  drawNodes(scene, node.children, renderer, options, stats);
  renderer.endLayer();
}

function drawLeaf(node: RenderLeafNode, renderer: Renderer2D): void {
  switch (node.kind) {
    case "rect":
      renderer.drawRect(node);
      return;
    case "ellipse":
      renderer.drawEllipse(node);
      return;
    case "line":
      renderer.drawLine(node);
      return;
    case "polygon":
      renderer.drawPolygon(node);
      return;
    case "path":
      renderer.drawPath(node);
      return;
    case "text":
      renderer.drawText(node);
      return;
    case "image":
      renderer.drawImage(node);
      return;
    default: {
      // Exhaustiveness guard: a new leaf kind must be handled explicitly.
      const unhandled: never = node;
      throw new Error(`Unhandled render node: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Resolve a `clipPathId` to a concrete clip shape by looking up the referenced
 * layer in the same scene. Returns null when the reference is missing or points
 * at a layer whose geometry cannot act as a clip, so the caller can report it.
 *
 * Coordinate-space caveat: the returned geometry is the clip source's own local
 * geometry, which is applied in the clipped node's current space. That matches
 * SVG `clipPathUnits="userSpaceOnUse"` when the clip source and the clipped
 * node share an ancestor transform — the case the editor creates today.
 * Independently transformed clip sources need the clip path mapped through the
 * source's world transform, which belongs with real mask support (spec §13).
 */
export function resolveClip(scene: RenderScene, clipPathId: string | undefined): ClipSpec | null {
  if (clipPathId === undefined) {
    return null;
  }
  const target = findSceneNode(scene, clipPathId);
  if (target === null) {
    return null;
  }
  switch (target.kind) {
    case "rect":
      return {
        kind: "rect",
        rect: { x: target.x, y: target.y, width: target.width, height: target.height },
        cornerRadius: target.cornerRadius,
      };
    case "path":
      return target.d === "" ? null : { kind: "path", d: target.d };
    default:
      return target.localBounds === null
        ? null
        : { kind: "rect", rect: target.localBounds };
  }
}
