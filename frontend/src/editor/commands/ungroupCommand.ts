/**
 * Replace one top-level group with its children while preserving their order.
 * The exact previous layer list is captured so undo restores all group metadata.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { mapActiveArtboardLayers } from "./helpers";

export function ungroupCommand(
  groupId: string,
  currentLayers: readonly DocumentLayer[],
): Command {
  const groupIndex = currentLayers.findIndex((layer) => layer.id === groupId);
  const group = groupIndex >= 0 ? currentLayers[groupIndex] : null;
  const previousLayers = [...currentLayers];

  if (!group || group.kind !== "group") {
    return {
      type: "ungroup",
      label: "Ungroup layers",
      apply: (document: CreativeDocument): CreativeDocument => document,
      undo: (document: CreativeDocument): CreativeDocument => document,
    };
  }

  const ungroupedLayers = [
    ...previousLayers.slice(0, groupIndex),
    ...group.children,
    ...previousLayers.slice(groupIndex + 1),
  ];

  return {
    type: "ungroup",
    label: `Ungroup ${group.name || "Group"}`,
    apply: (document: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(document, () => ungroupedLayers),
    undo: (document: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(document, () => previousLayers),
  };
}
