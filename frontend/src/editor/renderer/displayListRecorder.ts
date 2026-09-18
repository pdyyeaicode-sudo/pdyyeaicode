/**
 * displayListRecorder — a `Renderer2D` that records commands instead of
 * painting them.
 *
 * This is the deterministic reference target required by spec §42 (always keep
 * a non-GPU path) and §52 (rendering/regression tests). It gives us three
 * things before any Skia code exists:
 *
 *  1. Unit-testable proof that scene traversal emits the right commands in the
 *     right order, with the right transforms.
 *  2. A parity harness: the same scene recorded once per backend, then compared
 *     command-by-command, so a Skia regression is caught as a diff rather than
 *     a visual "looks wrong".
 *  3. A stable golden format for review, since every command serializes to a
 *     short deterministic string.
 *
 * It holds no graphics resources, so it is safe to run in jsdom and in CI.
 *
 * One responsibility per file: recording renderer commands.
 */

import type { ClipSpec, FrameInfo, Renderer2D } from "./Renderer2D";
import { toSvgTransform, type Matrix2D } from "./matrix2d";
import type {
  RenderBlendMode,
  RenderEllipseNode,
  RenderGroupNode,
  RenderImageNode,
  RenderLeafNode,
  RenderLineNode,
  RenderPathNode,
  RenderPolygonNode,
  RenderRectNode,
  RenderTextNode,
} from "./renderScene";

export type RecordedCommand =
  | { readonly op: "beginFrame"; readonly frame: FrameInfo }
  | { readonly op: "endFrame" }
  | { readonly op: "save" }
  | { readonly op: "restore" }
  | { readonly op: "setTransform"; readonly matrix: Matrix2D }
  | { readonly op: "concatTransform"; readonly matrix: Matrix2D }
  | { readonly op: "setClip"; readonly clip: ClipSpec }
  | { readonly op: "clear"; readonly color: string }
  | { readonly op: "draw"; readonly node: RenderLeafNode }
  | {
      readonly op: "beginLayer";
      readonly node: RenderGroupNode;
      readonly alpha: number;
      readonly blendMode: RenderBlendMode;
    }
  | { readonly op: "endLayer" };

export class DisplayListRecorder implements Renderer2D {
  private readonly commands: RecordedCommand[] = [];
  private depth = 0;
  private maxDepth = 0;

  beginFrame(frame: FrameInfo): void {
    this.commands.push({ op: "beginFrame", frame });
  }

  endFrame(): void {
    this.commands.push({ op: "endFrame" });
  }

  save(): void {
    this.depth += 1;
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    this.commands.push({ op: "save" });
  }

  restore(): void {
    this.depth -= 1;
    this.commands.push({ op: "restore" });
  }

  setTransform(matrix: Matrix2D): void {
    this.commands.push({ op: "setTransform", matrix });
  }

  concatTransform(matrix: Matrix2D): void {
    this.commands.push({ op: "concatTransform", matrix });
  }

  setClip(clip: ClipSpec): void {
    this.commands.push({ op: "setClip", clip });
  }

  clear(color: string): void {
    this.commands.push({ op: "clear", color });
  }

  drawRect(node: RenderRectNode): void {
    this.commands.push({ op: "draw", node });
  }

  drawEllipse(node: RenderEllipseNode): void {
    this.commands.push({ op: "draw", node });
  }

  drawLine(node: RenderLineNode): void {
    this.commands.push({ op: "draw", node });
  }

  drawPolygon(node: RenderPolygonNode): void {
    this.commands.push({ op: "draw", node });
  }

  drawPath(node: RenderPathNode): void {
    this.commands.push({ op: "draw", node });
  }

  drawText(node: RenderTextNode): void {
    this.commands.push({ op: "draw", node });
  }

  drawImage(node: RenderImageNode): void {
    this.commands.push({ op: "draw", node });
  }

  beginLayer(node: RenderGroupNode, alpha: number, blendMode: RenderBlendMode): void {
    this.commands.push({ op: "beginLayer", node, alpha, blendMode });
  }

  endLayer(): void {
    this.commands.push({ op: "endLayer" });
  }

  /** Recorded commands in emission order. */
  getCommands(): readonly RecordedCommand[] {
    return this.commands;
  }

  /** True when every `save` was matched by a `restore`. */
  isBalanced(): boolean {
    return this.depth === 0;
  }

  /** Deepest nesting reached — useful for spotting runaway group nesting. */
  getMaxDepth(): number {
    return this.maxDepth;
  }

  /** Ids of drawn leaves in paint order. The primary parity assertion. */
  getDrawnNodeIds(): string[] {
    return this.commands
      .filter((command): command is Extract<RecordedCommand, { op: "draw" }> => command.op === "draw")
      .map((command) => command.node.id);
  }

  /**
   * Stable one-line-per-command trace for golden comparisons. Deliberately
   * compact: it captures ordering, identity and geometry-affecting values
   * without embedding the whole node.
   */
  toTrace(): string[] {
    return this.commands.map((command) => {
      switch (command.op) {
        case "beginFrame":
          return `beginFrame ${command.frame.width}x${command.frame.height} @${command.frame.pixelRatio} view=${toSvgTransform(command.frame.viewTransform)}`;
        case "setTransform":
          return `setTransform ${toSvgTransform(command.matrix)}`;
        case "concatTransform":
          return `concatTransform ${toSvgTransform(command.matrix)}`;
        case "setClip":
          return command.clip.kind === "rect"
            ? `setClip rect ${formatRect(command.clip.rect)} r=${command.clip.cornerRadius ?? 0}`
            : `setClip path ${command.clip.d}`;
        case "clear":
          return `clear ${command.color}`;
        case "draw":
          return `draw ${command.node.kind} #${command.node.id} opacity=${command.node.opacity} blend=${command.node.blendMode}`;
        case "beginLayer":
          return `beginLayer #${command.node.id} alpha=${command.alpha} blend=${command.blendMode}`;
        default:
          return command.op;
      }
    });
  }
}

function formatRect(rect: { x: number; y: number; width: number; height: number }): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}
