/**
 * SmartGuides.tsx — SVG-based smart guide rendering for Task 6.1
 *
 * Renders alignment guides as SVG <line> elements that extend across the entire
 * artboard when dragging layers near reference points (edges, centers) of other
 * layers or the artboard itself.
 *
 * Technical Requirements (from design.md):
 * - Threshold: 5px (handled by snapping.ts)
 * - Priority: center > edges (handled by snapping.ts computeSnap)
 * - Compute on every drag move (caller responsibility)
 * - Use vector-effect="non-scaling-stroke" for consistent 1px width at all zooms
 *
 * Acceptance Criteria (Requirement 7):
 * - WHEN dragging near edge THEN guide appears
 * - WHEN dragging near center THEN center guide
 * - WHEN align to multiple THEN multiple guides
 * - WHEN drag ends THEN guides disappear
 * - WHEN guide shown THEN extends across artboard
 *
 * One responsibility per file: SVG line rendering for snap guides only.
 */

import type { SnapGuide } from "./snapping";

export interface SmartGuidesProps {
  /** Active guides to render (computed by snapping.ts) */
  guides: SnapGuide[];
  /** Viewport state for coordinate transformation */
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  /** Artboard dimensions (model space) to determine guide extent */
  artboardBounds: {
    width: number;
    height: number;
  };
}

/**
 * Determine guide color based on source and kind.
 * - Artboard references: blue (#2563eb)
 * - Layer center references: magenta (#ff00ff) - higher priority
 * - Layer edge references: orange (#ff6b00)
 */
function guideColor(guide: SnapGuide): string {
  if (guide.source === "artboard") {
    return "#2563eb";
  }
  if (guide.kind === "center") {
    return "#ff00ff"; // Magenta for center guides (higher visual priority)
  }
  return "#ff6b00"; // Orange for layer edge guides
}

/**
 * SmartGuides component renders SVG alignment guides.
 *
 * Renders guides as SVG <line> elements positioned in model space (same
 * coordinate system as layer bounding boxes). The parent SVG canvas applies
 * viewport transform (zoom/pan), so this component works in raw model coords.
 *
 * Key features:
 * - vector-effect="non-scaling-stroke" keeps stroke 1px at all zoom levels
 * - Guides extend across entire artboard (full width for vertical, full height for horizontal)
 * - Multiple simultaneous guides supported (Req 7.3)
 * - Empty guides array = no rendering (Req 7.5)
 */
export function SmartGuides({
  guides,
  viewport,
  artboardBounds,
}: SmartGuidesProps): JSX.Element | null {
  // When no guides, render nothing (drag ended or no references within threshold)
  if (guides.length === 0) {
    return null;
  }

  return (
    <g
      className="smart-guides"
      data-layer="smart-guides"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {guides.map((guide, index) => {
        // Generate unique key from guide properties
        const key = `${guide.axis}-${guide.source}-${guide.kind}-${guide.position}-${index}`;
        const color = guideColor(guide);

        // Vertical guide (x-axis): extends full artboard height
        if (guide.axis === "x") {
          return (
            <line
              key={key}
              x1={guide.position}
              y1={0}
              x2={guide.position}
              y2={artboardBounds.height}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              data-source={guide.source}
              data-kind={guide.kind}
              data-axis="x"
            />
          );
        }

        // Horizontal guide (y-axis): extends full artboard width
        return (
          <line
            key={key}
            x1={0}
            y1={guide.position}
            x2={artboardBounds.width}
            y2={guide.position}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            data-source={guide.source}
            data-kind={guide.kind}
            data-axis="y"
          />
        );
      })}
    </g>
  );
}
