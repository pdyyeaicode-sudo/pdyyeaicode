import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import {
  Box,
  Image as ImageIcon,
  Layers3,
  Scissors,
  Shapes,
  Type,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import type { DocumentLayer, SelectionSet } from "../editor/types/documentModel";
import styles from "./PydreeStudio.module.css";

export interface SeparationPanelProps {
  layers: readonly DocumentLayer[];
  selection: SelectionSet;
  extractionMode?: string;
  isUploading: boolean;
  onImport: () => void;
  onSelectLayer: (layerId: string) => void;
  onSeparateLayer: (layerId: string) => void;
}

function displayName(layer: DocumentLayer): string {
  const name = layer.name.trim();
  return name.length > 0 ? name : "Untitled layer";
}

function iconForLayer(layer: DocumentLayer): LucideIcon {
  switch (layer.kind) {
    case "text":
      return Type;
    case "image":
      return ImageIcon;
    case "group":
      return Layers3;
    case "rect":
    case "ellipse":
    case "line":
    case "polygon":
    case "path":
      return Shapes;
    default:
      return Box;
  }
}

function containsSelectedLayer(layer: DocumentLayer, selectedIds: ReadonlySet<string>): boolean {
  return selectedIds.has(layer.id)
    || (layer.kind === "group"
      && layer.children.some((child) => containsSelectedLayer(child, selectedIds)));
}

function hasVisibleContent(layer: DocumentLayer): boolean {
  return layer.kind !== "group" || layer.children.some(hasVisibleContent);
}

function countLayers(layers: readonly DocumentLayer[]): number {
  return layers.reduce(
    (count, layer) => count + 1 + (layer.kind === "group" ? countLayers(layer.children) : 0),
    0,
  );
}

export function SeparationPanel({
  layers,
  selection,
  extractionMode,
  isUploading,
  onImport,
  onSelectLayer,
  onSeparateLayer,
}: SeparationPanelProps): JSX.Element {
  const selectedIds = new Set(selection.layerIds);
  const extractedLayers = layers.filter(
    (layer) => layer.role !== "background" && hasVisibleContent(layer),
  );

  const buildTreeItems = (
    siblings: readonly DocumentLayer[],
    parentId: string | null = null,
  ): TreeListItemData[] =>
    [...siblings].reverse().map((layer) => {
      const LayerIcon = iconForLayer(layer);
      const locked = !layer.editable || layer.locked;
      const children = layer.kind === "group"
        ? buildTreeItems(layer.children, layer.id)
        : undefined;

      return {
        id: layer.id,
        label: <span className={styles.separationLayerName}>{displayName(layer)}</span>,
        description: layer.kind === "group"
          ? `${countLayers(layer.children)} layers`
          : layer.kind,
        startContent: <LayerIcon size={15} aria-hidden="true" />,
        endContent: parentId && !locked ? (
          <IconButton
            label={`Separate ${displayName(layer)}`}
            tooltip="Move to top level"
            icon={<Scissors size={14} />}
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSeparateLayer(layer.id);
            }}
          />
        ) : undefined,
        isDisabled: locked,
        isSelected: selectedIds.has(layer.id),
        isExpanded: layer.kind === "group"
          && (parentId === null || containsSelectedLayer(layer, selectedIds)),
        onClick: locked ? undefined : () => onSelectLayer(layer.id),
        children,
      };
    });

  const treeItems = buildTreeItems(extractedLayers);
  const status = extractionMode === "layered-extract"
    ? "Backend layers ready"
    : extractionMode === "overlay-edit"
      ? "Overlay fallback"
      : "No extraction loaded";

  return (
    <section className={styles.separationPanel} aria-label="Layer separation">
      <div className={styles.separationHeader}>
        <div>
          <h2 className={styles.separationTitle}>Separate</h2>
          <span className={styles.separationStatus}>{status}</span>
        </div>
        <Button
          label={isUploading ? "Separating" : "Import"}
          icon={<UploadCloud size={14} />}
          variant="secondary"
          size="sm"
          isLoading={isUploading}
          isDisabled={isUploading}
          onClick={onImport}
        />
      </div>

      {treeItems.length > 0 ? (
        <TreeList
          className={styles.separationTree}
          density="compact"
          data-testid="separation-tree"
          header={(
            <div className={styles.separationTreeHeader}>
              <span>Extracted layers</span>
              <span>{countLayers(extractedLayers)}</span>
            </div>
          )}
          items={treeItems}
        />
      ) : (
        <div className={styles.separationEmpty}>
          <Layers3 size={22} aria-hidden="true" />
          <span>No separated layers</span>
        </div>
      )}
    </section>
  );
}
