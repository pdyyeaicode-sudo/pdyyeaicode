"use client";

/**
 * LayersPanel — the Layers_Panel body, extending the existing `LayerList`
 * patterns to operate over the structured Document_Model instead of the legacy
 * `SVGLayer[]` (design.md → "Layers_Panel (extends LayerList)", Req 3.1–3.8,
 * 3.10, 3.11).
 *
 * It is a controlled view: it renders the active artboard's top-level layers
 * and the current Selection_Set, and every mutation is expressed as a Command
 * passed to `dispatchCommand`. The panel performs validation (name length,
 * opacity range) BEFORE building a Command so rejected edits never reach the
 * History_Stack; on rejection it shows a field-level error and retains the
 * previous value (Req 3.10, 3.11).
 *
 * Behavior summary:
 *  - Lists one entry per top-level layer, top (last in document order, highest
 *    z) to bottom — the document array reversed (Req 3.1).
 *  - Click selects exactly that layer via `onSelectLayer` (Req 3.2).
 *  - Drag-reorder maps panel order to document z-order, preserving the relative
 *    order of other layers, via `reorderLayerCommand` (Req 3.3).
 *  - Double-click a name to rename (1..100 chars) → `setPropertyCommand("name")`
 *    (Req 3.4, 3.10).
 *  - Visibility toggle → `setPropertyCommand("visible")` (Req 3.5).
 *  - Lock toggle (editable layers) → `setPropertyCommand("locked")` (Req 3.6).
 *  - Opacity 0..100 → `setPropertyCommand("opacity")` (Req 3.7, 3.11).
 *  - Role-locked layers (logo, print-marks, data-editable=false) present as
 *    locked and disable rename/delete/lock/reorder (Req 3.8).
 *
 * Chrome icons are rendered exclusively through <Icon> (Req 13.5/13.6).
 *
 * One responsibility per file: this module renders + wires the Layers_Panel.
 */

import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import { Icon, type IconName } from "./Icon";
import styles from "./CreativeStudio.module.css";
import {
  LAYER_NAME_MAX_LENGTH,
  validateLayerName,
  validateOpacityInput,
} from "./layersPanelValidation";
import {
  deleteLayerCommand,
  findLayer,
  findLayerPosition,
  reorderLayerCommand,
  setPropertyCommand,
} from "./commands";
import { LOCKED_ROLES, type Command, type DocumentLayer, type SelectionSet } from "./types/documentModel";

export interface LayersPanelProps {
  /** Active artboard layers in document order (index 0 = bottom z, last = top). */
  layers: DocumentLayer[];
  /** Current Selection_Set (drives the active-row indicator). */
  selection: SelectionSet;
  /** Select exactly one layer (Req 3.2); the parent owns the Selection_Set. */
  onSelectLayer: (layerId: string) => void;
  /** Apply a Command to the Document_Model (all mutations flow through here). */
  dispatchCommand: (command: Command) => void;
}

const MAX_VISIBLE_TREE_LEVELS = 5;

/** Whether a layer's role/editable flags make it fully locked (Req 3.8). */
function isRoleLocked(layer: DocumentLayer): boolean {
  return !layer.editable || LOCKED_ROLES.has(layer.role);
}

/** Pick the line icon that represents a layer's kind. */
function iconForLayer(layer: DocumentLayer): IconName {
  switch (layer.kind) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "group":
      return "layers";
    case "ellipse":
      return "circle";
    case "line":
      return "line";
    case "polygon":
      return "polygon";
    case "path":
      return "pen";
    case "rect":
    default:
      return "square";
  }
}

function labelForLayerKind(layer: DocumentLayer): string {
  switch (layer.kind) {
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "group":
      return "Group";
    case "ellipse":
      return "Ellipse";
    case "line":
      return "Line";
    case "polygon":
      return "Polygon";
    case "path":
      return "Path";
    case "rect":
    default:
      return "Rectangle";
  }
}

function displayNameForLayer(layer: DocumentLayer): string {
  const name = layer.name.trim();
  return name.length > 0 ? name : `${labelForLayerKind(layer)} layer`;
}

function isEmptyCanonicalPlaceholder(layer: DocumentLayer): boolean {
  if (
    layer.role === "background"
    || layer.id !== layer.role
    || layer.kind !== "group"
    || layer.children.length > 0
  ) {
    return false;
  }
  if (!layer.raw) {
    return true;
  }

  const parsed = new DOMParser().parseFromString(layer.raw, "image/svg+xml");
  const root = parsed.documentElement;
  const hasParseError = root.nodeName === "parsererror"
    || parsed.getElementsByTagName("parsererror").length > 0;
  return !hasParseError && root.tagName.toLowerCase() === "g" && root.children.length === 0;
}

function containsSelectedLayer(layer: DocumentLayer, selectedIds: ReadonlySet<string>): boolean {
  if (selectedIds.has(layer.id)) {
    return true;
  }
  return layer.kind === "group"
    ? layer.children.some((child) => containsSelectedLayer(child, selectedIds))
    : false;
}

interface FlattenedLayerEntry {
  layer: DocumentLayer;
  ancestorNames: string[];
}

function flattenLayersForPanel(
  layers: readonly DocumentLayer[],
  ancestorNames: readonly string[] = [],
): FlattenedLayerEntry[] {
  const entries: FlattenedLayerEntry[] = [];
  for (const layer of [...layers].reverse()) {
    if (layer.role === "background") continue;
    entries.push({ layer, ancestorNames: [...ancestorNames] });
    if (layer.kind === "group") {
      entries.push(...flattenLayersForPanel(
        layer.children,
        [...ancestorNames, displayNameForLayer(layer)],
      ));
    }
  }
  return entries;
}

function countLayers(layers: readonly DocumentLayer[]): number {
  return layers.reduce(
    (count, layer) => count + 1 + (layer.kind === "group" ? countLayers(layer.children) : 0),
    0,
  );
}

export function LayersPanel({
  layers,
  selection,
  onSelectLayer,
  dispatchCommand,
}: LayersPanelProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [opacityDrafts, setOpacityDrafts] = useState<Record<string, string>>({});
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const committedRenameIdRef = useRef<string | null>(null);

  const selectedIds = new Set(selection.layerIds);

  const setError = useCallback((layerId: string, message: string | null): void => {
    setErrors((current) => {
      if (message === null) {
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      }
      return { ...current, [layerId]: message };
    });
  }, []);

  // --- Selection (Req 3.2) ---
  const handleSelect = useCallback(
    (layer: DocumentLayer): void => {
      // Locked layers (role-locked or user-locked) cannot be selected (Req 3.6, 3.8).
      if (isRoleLocked(layer) || layer.locked) {
        return;
      }
      onSelectLayer(layer.id);
    },
    [onSelectLayer],
  );

  // --- Rename (Req 3.4, 3.10) ---
  const beginRename = useCallback((layer: DocumentLayer): void => {
    if (isRoleLocked(layer) || layer.locked) {
      return;
    }
    committedRenameIdRef.current = null;
    setEditingId(layer.id);
    setDraftName(layer.name);
    setError(layer.id, null);
  }, [setError]);

  const commitRename = useCallback(
    (layer: DocumentLayer): void => {
      if (committedRenameIdRef.current === layer.id) {
        return;
      }
      const result = validateLayerName(draftName);
      if (!result.ok) {
        // Reject: retain previous name, show error, keep the editor open (Req 3.10).
        setError(layer.id, result.error);
        return;
      }
      committedRenameIdRef.current = layer.id;
      setError(layer.id, null);
      setEditingId(null);
      if (result.value !== layer.name) {
        dispatchCommand(setPropertyCommand(layer.id, "name", layer.name, result.value));
      }
    },
    [draftName, dispatchCommand, setError],
  );

  const cancelRename = useCallback((layerId: string): void => {
    committedRenameIdRef.current = null;
    setEditingId(null);
    setError(layerId, null);
  }, [setError]);

  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, layer: DocumentLayer): void => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitRename(layer);
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelRename(layer.id);
      }
    },
    [commitRename, cancelRename],
  );

  // --- Visibility (Req 3.5) ---
  const handleToggleVisibility = useCallback(
    (layer: DocumentLayer): void => {
      dispatchCommand(setPropertyCommand(layer.id, "visible", layer.visible, !layer.visible));
    },
    [dispatchCommand],
  );

  // --- Lock (Req 3.6) — editable layers only; role-locked layers are inert. ---
  const handleToggleLock = useCallback(
    (layer: DocumentLayer): void => {
      if (isRoleLocked(layer)) {
        return;
      }
      dispatchCommand(setPropertyCommand(layer.id, "locked", layer.locked, !layer.locked));
    },
    [dispatchCommand],
  );

  // --- Opacity (Req 3.7, 3.11) ---
  const commitOpacity = useCallback(
    (layer: DocumentLayer, raw: string): void => {
      const result = validateOpacityInput(raw);
      if (!result.ok) {
        setError(layer.id, result.error);
        return;
      }
      setError(layer.id, null);
      setOpacityDrafts((current) => {
        const next = { ...current };
        delete next[layer.id];
        return next;
      });
      if (result.value !== layer.opacity) {
        dispatchCommand(setPropertyCommand(layer.id, "opacity", layer.opacity, result.value));
      }
    },
    [dispatchCommand, setError],
  );

  // --- Delete (Req 3.8 disables for role-locked) ---
  const handleDelete = useCallback(
    (layer: DocumentLayer): void => {
      if (isRoleLocked(layer) || layer.locked) {
        return;
      }
      const position = findLayerPosition(layers, layer.id);
      if (!position) {
        return;
      }
      dispatchCommand(deleteLayerCommand(layer, position));
    },
    [layers, dispatchCommand],
  );

  // --- Drag reorder (Req 3.3) ---
  const handleDrop = useCallback(
    (targetId: string): void => {
      const draggedLayerId = draggedId;
      setDraggedId(null);
      setDropTargetId(null);
      if (!draggedLayerId || draggedLayerId === targetId) {
        return;
      }
      const target = findLayer(layers, targetId);
      if (!target || isRoleLocked(target)) {
        return; // cannot reorder into a locked slot
      }
      const fromPosition = findLayerPosition(layers, draggedLayerId);
      const toPosition = findLayerPosition(layers, targetId);
      if (!fromPosition || !toPosition || fromPosition.parentId !== toPosition.parentId) {
        return;
      }
      dispatchCommand(
        reorderLayerCommand(
          draggedLayerId,
          fromPosition.index,
          toPosition.index,
          fromPosition.parentId,
        ),
      );
    },
    [draggedId, layers, dispatchCommand],
  );

  const handleTreeDragOver = useCallback((event: DragEvent<HTMLElement>): void => {
    if (!draggedId || !(event.target instanceof Element)) {
      return;
    }
    const targetId = event.target.closest<HTMLElement>("[data-tree-id]")?.dataset.treeId;
    if (!targetId || targetId === draggedId) {
      return;
    }
    const target = findLayer(layers, targetId);
    const sourcePosition = findLayerPosition(layers, draggedId);
    const targetPosition = findLayerPosition(layers, targetId);
    if (
      !target
      || isRoleLocked(target)
      || !sourcePosition
      || !targetPosition
      || sourcePosition.parentId !== targetPosition.parentId
    ) {
      return;
    }
    event.preventDefault();
    setDropTargetId(targetId);
  }, [draggedId, layers]);

  const handleTreeDrop = useCallback((event: DragEvent<HTMLElement>): void => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const targetId = event.target.closest<HTMLElement>("[data-tree-id]")?.dataset.treeId;
    if (targetId) {
      event.preventDefault();
      handleDrop(targetId);
    }
  }, [handleDrop]);

  const buildTreeItems = useCallback((
    siblings: readonly DocumentLayer[],
    nestedLevel = 0,
  ): TreeListItemData[] => {
    const flattenAtDepthLimit = nestedLevel >= MAX_VISIBLE_TREE_LEVELS - 1;
    const entries: FlattenedLayerEntry[] = flattenAtDepthLimit
      ? flattenLayersForPanel(siblings)
      : [...siblings].reverse()
          .filter(layer => layer.role !== "background")
          .map((layer) => ({ layer, ancestorNames: [] }));

    return entries.map(({ layer, ancestorNames }) => {
      const layerName = displayNameForLayer(layer);
      const displayName = ancestorNames.length > 0
        ? `${ancestorNames.join(" / ")} / ${layerName}`
        : layerName;
      const kindLabel = labelForLayerKind(layer);
      const roleLocked = isRoleLocked(layer);
      const locked = roleLocked || layer.locked;
      const isSelected = selectedIds.has(layer.id);
      const isEditing = editingId === layer.id;
      const error = errors[layer.id];
      const opacityValue = opacityDrafts[layer.id] ?? String(layer.opacity);
      const draggable = !locked;

      const label = (
        <span
          className={[
            styles.layerTreeLabel,
            locked ? styles.layerTreeLabelLocked : "",
            dropTargetId === layer.id ? styles.layerTreeLabelDrop : "",
          ].filter(Boolean).join(" ")}
          onDoubleClick={() => beginRename(layer)}
          title={locked ? `${displayName} (locked)` : displayName}
        >
          {isEditing ? (
            <input
              className={styles.layerNameInput}
              type="text"
              autoFocus
              maxLength={LAYER_NAME_MAX_LENGTH + 1}
              aria-label={`Rename ${displayName}`}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => handleRenameKeyDown(event, layer)}
              onBlur={() => commitRename(layer)}
            />
          ) : (
            <span className={styles.layerTreeName}>{displayName}</span>
          )}
          {error ? (
            <span className={styles.fieldError} role="alert">
              {error}
            </span>
          ) : null}
        </span>
      );

      const startContent = (
        <span className={styles.layerTreeStart}>
          <span
            className={styles.layerDragHandle}
            draggable={draggable}
            data-layer-drag-id={layer.id}
            aria-label={`Reorder ${displayName}`}
            title={draggable ? `Reorder ${displayName}` : `${displayName} cannot be reordered`}
            onDragStart={() => {
              if (draggable) {
                setDraggedId(layer.id);
              }
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTargetId(null);
            }}
          >
            <Icon name="drag" size={13} />
          </span>
          <span className={styles.layerKindIcon} title={`${kindLabel} layer`} aria-hidden="true">
            <Icon name={iconForLayer(layer)} size={15} />
          </span>
        </span>
      );

      const endContent = (
        <span className={styles.layerTreeActions}>
          <button
            type="button"
            className={styles.iconToggle}
            aria-label={layer.visible ? `Hide ${displayName}` : `Show ${displayName}`}
            aria-pressed={!layer.visible}
            onClick={() => handleToggleVisibility(layer)}
          >
            <Icon name={layer.visible ? "eye" : "eye-off"} size={15} active={!layer.visible} />
          </button>
          <button
            type="button"
            className={styles.iconToggle}
            aria-label={layer.locked ? `Unlock ${displayName}` : `Lock ${displayName}`}
            aria-pressed={layer.locked}
            disabled={roleLocked}
            onClick={() => handleToggleLock(layer)}
          >
            <Icon name={layer.locked ? "lock" : "unlock"} size={15} active={layer.locked} />
          </button>
          <label className={styles.layerOpacityControl}>
            <input
              className={styles.opacityField}
              type="number"
              min={0}
              max={100}
              step={1}
              aria-label={`Opacity for ${displayName}`}
              value={opacityValue}
              onChange={(event) =>
                setOpacityDrafts((current) => ({ ...current, [layer.id]: event.target.value }))
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitOpacity(layer, (event.target as HTMLInputElement).value);
                }
              }}
              onBlur={(event) => commitOpacity(layer, event.target.value)}
            />
            <span aria-hidden>%</span>
          </label>
          <button
            type="button"
            className={styles.iconToggle}
            aria-label={`Delete ${displayName}`}
            disabled={locked}
            onClick={() => handleDelete(layer)}
          >
            <Icon name="delete" size={15} />
          </button>
        </span>
      );

      return {
        id: layer.id,
        label,
        startContent,
        endContent,
        isSelected,
        isExpanded: !flattenAtDepthLimit
          && layer.kind === "group"
          && (nestedLevel === 0 || containsSelectedLayer(layer, selectedIds)),
        onClick: locked || isEditing ? undefined : () => handleSelect(layer),
        children: !flattenAtDepthLimit && layer.kind === "group"
          ? buildTreeItems(layer.children, nestedLevel + 1)
          : undefined,
      };
    });
  }, [
    beginRename,
    commitOpacity,
    commitRename,
    draftName,
    dropTargetId,
    editingId,
    errors,
    handleDelete,
    handleRenameKeyDown,
    handleSelect,
    handleToggleLock,
    handleToggleVisibility,
    opacityDrafts,
    selectedIds,
  ]);

  const panelLayers = layers.filter((layer) => !isEmptyCanonicalPlaceholder(layer));
  const treeItems = buildTreeItems(panelLayers);
  const layerCount = countLayers(panelLayers);

  return (
    <section
      className={styles.layersPanel}
      aria-label="Layers"
      onDragOver={handleTreeDragOver}
      onDrop={handleTreeDrop}
    >
      {treeItems.length === 0 ? (
        <>
          <div className={styles.layersPanelHeader}>
            <h2 className={styles.sectionTitle}>Layers</h2>
            <span className={styles.layersCount}>0</span>
          </div>
        <p className={styles.placeholder}>No layers yet.</p>
        </>
      ) : (
        <TreeList
          className={styles.layerTree}
          density="compact"
          data-testid="layers-tree"
          header={(
            <div className={styles.layersPanelHeader}>
              <h2 className={styles.sectionTitle}>Layers</h2>
              <span className={styles.layersCount}>{layerCount}</span>
            </div>
          )}
          items={treeItems}
        />
      )}
    </section>
  );
}
