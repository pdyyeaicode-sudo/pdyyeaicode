/**
 * groupCommand — nest two or more selected top-level layers into a new
 * container `GroupLayer`, preserving each member's `data-role` and their
 * relative z-order (Req 3.9). `apply` produces the grouped layer list; `undo`
 * ungroups by restoring the exact prior list (design.md "Command / History
 * System").
 *
 * Inverse data (the prior top-level layer list) and the grouped result are both
 * computed at construction from the current layers, so the command is pure and
 * exactly invertible regardless of whether the selection was contiguous.
 *
 * The caller enforces the "at least two layers" rule (Req 3.12) before building
 * the command.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer, GroupLayer } from "../types/documentModel";
import { mapActiveArtboardLayers, mintId } from "./helpers";

export interface GroupCommandOptions {
  /** Explicit id for the new container group (defaults to a minted unique id). */
  groupId?: string;
  /** Display name for the new container group (defaults to "Group"). */
  name?: string;
}

/**
 * Build a command that groups the layers in `layerIds` (matched among the
 * `currentLayers` top-level list) into a single container group. `currentLayers`
 * is the active artboard's top-level layer list at the time of construction.
 */
export function groupCommand(
  layerIds: readonly string[],
  currentLayers: readonly DocumentLayer[],
  options?: GroupCommandOptions,
): Command {
  const idSet = new Set(layerIds);
  const members: DocumentLayer[] = [];
  let firstMemberIndex = -1;

  currentLayers.forEach((layer, index) => {
    if (idSet.has(layer.id)) {
      if (firstMemberIndex === -1) {
        firstMemberIndex = index;
      }
      members.push(layer);
    }
  });

  const prevLayers: DocumentLayer[] = [...currentLayers];

  // Fewer than two members is an invalid grouping (Req 3.12); the resulting
  // command is inert so the dispatcher records nothing meaningful.
  if (members.length < 2) {
    return {
      type: "group",
      label: "Group layers",
      apply: (doc: CreativeDocument): CreativeDocument => doc,
      undo: (doc: CreativeDocument): CreativeDocument => doc,
    };
  }

  const group: GroupLayer = {
    id: options?.groupId ?? mintId("group"),
    role: members[0].role,
    name: options?.name ?? "Group",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "group",
    children: members,
  };

  // Place the container where the lowest-index member was; the number of kept
  // (non-member) layers preceding that index equals firstMemberIndex because no
  // earlier layer is a member.
  const kept = prevLayers.filter((layer) => !idSet.has(layer.id));
  const groupedLayers: DocumentLayer[] = [
    ...kept.slice(0, firstMemberIndex),
    group,
    ...kept.slice(firstMemberIndex),
  ];

  return {
    type: "group",
    label: "Group layers",
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, () => groupedLayers),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, () => prevLayers),
  };
}
