/**
 * textEditCommand — change the text content of a text layer. The previous and
 * next strings are captured at construction so `undo` restores the exact prior
 * content (Req 6.3; design.md "Concrete command examples").
 *
 * The caller validates the committed text (1..500 non-whitespace characters)
 * before building the command; empty/whitespace commits record no command
 * (Req 6.4). Editable text always remains a `<text>` node and is never
 * path-traced (Req 6.8) — this command only swaps the string content.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { mapLayerInDoc } from "./helpers";

/**
 * Build a command that sets the content of the text layer `layerId` to
 * `nextText`, restoring `prevText` on undo.
 */
export function textEditCommand(layerId: string, prevText: string, nextText: string): Command {
  return {
    type: "text-edit",
    label: "Edit text",
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => withContent(layer, nextText)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => withContent(layer, prevText)),
  };
}

function withContent(layer: DocumentLayer, content: string): DocumentLayer {
  return layer.kind === "text" ? { ...layer, content } : layer;
}
