import type { SVGLayer } from "../types";

export interface SceneGraphNode {
  id: string;
  role: SVGLayer["role"];
  name: string;
  editable: boolean;
  visible: boolean;
  locked: boolean;
  opacity: number;          // 0–100 integer, derived from the SVG opacity attribute
  color: string | null;     // hex from data-color, or null when absent
  childCount: number;
}

export interface SceneGraphStore {
  orderedIds: string[];
  nodesById: Record<string, SceneGraphNode>;
}

export interface SceneGraphProjection {
  nodes: SceneGraphNode[];
  selectedNodeId: string | null;
  emptyState: boolean;
  layerCount: number;
}

export function createSceneGraphStore(layers: readonly SVGLayer[]): SceneGraphStore {
  const orderedIds: string[] = [];
  const nodesById: Record<string, SceneGraphNode> = {};

  for (const layer of layers) {
    const node = toSceneGraphNode(layer);
    orderedIds.push(node.id);
    nodesById[node.id] = node;
  }

  return { orderedIds, nodesById };
}

export function projectSceneGraph(store: SceneGraphStore, activeLayer: string | null): SceneGraphProjection {
  const nodes = store.orderedIds.flatMap((layerId) => {
    const node = store.nodesById[layerId];
    return node ? [node] : [];
  });

  return {
    nodes,
    selectedNodeId: activeLayer,
    emptyState: nodes.length === 0,
    layerCount: nodes.length,
  };
}

export function updateSceneGraphFromLayers(
  currentStore: SceneGraphStore,
  layers: readonly SVGLayer[],
): SceneGraphStore {
  const nextStore = createSceneGraphStore(layers);
  if (nextStore.orderedIds.length === currentStore.orderedIds.length) {
    const sameOrder = nextStore.orderedIds.every((layerId, index) => layerId === currentStore.orderedIds[index]);
    if (sameOrder) {
      return nextStore;
    }
  }
  return nextStore;
}

function toSceneGraphNode(layer: SVGLayer): SceneGraphNode {
  return {
    id: layer.id,
    role: layer.role,
    name: layer.role,
    editable: layer.isEditable,
    visible: readVisibleFromSvg(layer.svgElement),
    locked: !layer.isEditable || readLockedFromSvg(layer.svgElement),
    opacity: readOpacityFromSvg(layer.svgElement),
    color: readColorFromSvg(layer.svgElement),
    childCount: 0,
  };
}

function readVisibleFromSvg(svg: string): boolean {
  return !svg.includes('display="none"') && !svg.includes('visibility="hidden"');
}

function readLockedFromSvg(svg: string): boolean {
  return svg.includes('pointer-events="none"');
}

function readOpacityFromSvg(svg: string): number {
  const match = svg.match(/opacity="([0-9.]+)"/);
  if (!match) {
    return 100;
  }
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.round(value * 100);
}

function readColorFromSvg(svg: string): string | null {
  const match = svg.match(/data-color="(#[0-9a-fA-F]{6})"/);
  return match?.[1] ?? null;
}