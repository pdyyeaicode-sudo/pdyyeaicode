"use client";

import { DragEvent, useEffect, useState } from "react";

import type { SceneGraphNode } from "../hooks/sceneGraphStore";
import type { DesignOutput } from "../types";
import styles from "../pages/DesignStudio.module.css";

export interface LayerListProps {
  layers: SceneGraphNode[];
  activeLayer: string | null;
  designOutput?: DesignOutput | null;
  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onOpacityChange: (layerId: string, opacityPercent: number) => void;
  onDelete: (layerId: string) => void;
  onReorder: (draggedLayerId: string, targetLayerId: string) => void;
}

export function LayerList({
  layers,
  activeLayer,
  designOutput,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onOpacityChange,
  onDelete,
  onReorder,
}: LayerListProps): JSX.Element {
  const [openColorPickerRole, setOpenColorPickerRole] = useState<string | null>(null);
  const [layerColors, setLayerColors] = useState<Record<string, string>>({});
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<string | null>(null);

  useEffect(() => {
    const nextLayerColors: Record<string, string> = {};
    layers.forEach((node) => {
      const color = node.color ?? readFallbackColor(node.id, designOutput);
      if (color) {
        nextLayerColors[node.id] = color;
      }
    });
    setLayerColors(nextLayerColors);
  }, [layers, designOutput]);

  useEffect(() => {
    const handleLayerColorUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ role: string; color: string }>;
      const layerId = customEvent.detail?.role;
      const color = customEvent.detail?.color;
      if (!layerId || !color) {
        return;
      }
      setLayerColors((currentColors) => ({
        ...currentColors,
        [layerId]: color,
      }));
    };

    window.addEventListener("printrocket:layer-color-updated", handleLayerColorUpdated as EventListener);
    return () => {
      window.removeEventListener("printrocket:layer-color-updated", handleLayerColorUpdated as EventListener);
    };
  }, []);

  function handleDrop(targetLayerId: string): void {
    if (!draggedLayerId || draggedLayerId === targetLayerId) {
      setDraggedLayerId(null);
      setDropTargetLayerId(null);
      return;
    }
    onReorder(draggedLayerId, targetLayerId);
    setDraggedLayerId(null);
    setDropTargetLayerId(null);
  }

  return (
    <aside className={styles.layers} aria-label="Design layers">
      <h2>Layers</h2>
      {layers.length === 0 ? (
        <p>No layers available.</p>
      ) : (
        <ol className={styles.layerList}>
          {layers.map((node) => {
            const roleName = readNodeDisplayName(node);
            const color = layerColors[node.id] ?? node.color;
            const isColorPickerOpen = openColorPickerRole === node.id;

            return (
              <li
                key={node.id}
                className={styles.layerItem}
                draggable="true"
                data-drop-target={dropTargetLayerId === node.id ? "true" : "false"}
                onDragStart={() => {
                  setDraggedLayerId(node.id);
                }}
                onDragOver={(event: DragEvent<HTMLLIElement>) => {
                  event.preventDefault();
                  setDropTargetLayerId(node.id);
                }}
                onDrop={() => {
                  handleDrop(node.id);
                }}
                onDragEnd={() => {
                  setDraggedLayerId(null);
                  setDropTargetLayerId(null);
                }}
              >
                <div className={`${styles.layerRow} ${activeLayer === node.id ? styles.layerRowActive : ""}`}>
                  <button
                    type="button"
                    className={styles.visibilityButton}
                    aria-pressed={node.visible}
                    onClick={() => onToggleVisibility(node.id)}
                  >
                    {node.visible ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="layer-drag-handle"
                    aria-label={`Drag handle for ${roleName}`}
                    onClick={() => onSelect(node.id)}
                  >
                    ::
                  </button>
                  <button
                    type="button"
                    className="layer-row-name"
                    aria-pressed={activeLayer === node.id}
                    onClick={() => onSelect(node.id)}
                  >
                    {roleName}
                  </button>
                  {color ? (
                    <>
                      <button
                        type="button"
                        className="layer-color-swatch"
                        aria-label={`Choose color for ${roleName}`}
                        onClick={() => {
                          setOpenColorPickerRole((currentRole) => (currentRole === node.id ? null : node.id));
                          onSelect(node.id);
                        }}
                        style={{ background: color, width: "16px", height: "16px", border: "1px solid #d0d0d0" }}
                      />
                      {isColorPickerOpen ? (
                        <input
                          className="layer-color-picker"
                          type="color"
                          value={color}
                          aria-label={`Color picker for ${roleName}`}
                          onChange={(event) => {
                            const nextColor = event.target.value;
                            setLayerColors((currentColors) => ({
                              ...currentColors,
                              [node.id]: nextColor,
                            }));
                            window.dispatchEvent(
                              new CustomEvent("printrocket:set-layer-color", {
                                detail: {
                                  role: node.id,
                                  color: nextColor,
                                },
                              }),
                            );
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="layer-lock-toggle"
                    aria-pressed={node.locked}
                    disabled={!node.editable}
                    onClick={() => onToggleLock(node.id)}
                  >
                    {!node.editable ? "Lock" : node.locked ? "Unlock" : "Lock"}
                  </button>
                  <input
                    className="layer-opacity-slider"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={node.opacity}
                    onChange={(event) => onOpacityChange(node.id, Number.parseInt(event.target.value, 10))}
                  />
                  {node.editable ? (
                    <button
                      type="button"
                      className="layer-delete-button"
                      onClick={() => onDelete(node.id)}
                    >
                      Del
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

/** Map a SceneGraphNode to a human-readable display name for the Layers panel. */
function readNodeDisplayName(node: SceneGraphNode): string {
  const nodeId = node.id;
  if (nodeId === "background") {
    return "Background";
  }
  if (nodeId === "subject") {
    return "Subject / Person";
  }
  if (nodeId === "text-0") {
    return "Headline Text";
  }
  if (nodeId === "text-1") {
    return "Body Text";
  }
  if (nodeId === "text-2") {
    return "Sub Text";
  }
  if (nodeId.startsWith("vector-region-")) {
    return `Color Region ${readTrailingNumber(nodeId)}`;
  }
  if (nodeId.startsWith("photo-region-")) {
    return `Image Region ${readTrailingNumber(nodeId)}`;
  }
  if (nodeId.startsWith("user-text")) {
    return "Text Layer";
  }
  if (nodeId.startsWith("shape")) {
    return "Shape";
  }
  if (nodeId.startsWith("uploaded")) {
    return "Uploaded Image";
  }
  // Fall back to the node's name (which is the role by default) or id.
  return node.name || node.id;
}

/**
 * Read a color from the raw DesignOutput SVG layers as a fallback when the
 * store node doesn't carry one (e.g. the store was built before the color
 * enrichment was added).
 */
function readFallbackColor(nodeId: string, designOutput: DesignOutput | null | undefined): string | null {
  if (!designOutput) {
    return null;
  }
  const svgLayer = designOutput.svgLayers.find((layer) => layer.id === nodeId);
  if (!svgLayer) {
    return null;
  }
  const match = svgLayer.svgElement.match(/data-color="(#[0-9a-fA-F]{6})"/);
  return match?.[1] ?? null;
}

function readTrailingNumber(layerId: string): number {
  const match = layerId.match(/(\d+)$/);
  if (!match) {
    return 1;
  }
  return Number.parseInt(match[1], 10) + 1;
}
