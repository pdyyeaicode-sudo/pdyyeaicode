"use client";

import {
  SNAP_THRESHOLD_PX,
  collectReferenceLines,
  computeSnap,
  effectiveModelThreshold,
  type SnapGuide,
} from "../editor/snapping";
import type { BBox, LayerBox } from "../editor/selectionMath";

export interface AlignmentGuideElement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AlignmentGuidesProps {
  canvasWidth: number;
  canvasHeight: number;
  elements: AlignmentGuideElement[];
  isDragging: boolean;
  /**
   * Other layers' bounding boxes (Editor_Canvas/model space) whose edges and
   * centers become candidate snap references for the dragged layer (Req 2.1).
   * When provided, the component renders inter-layer + Artboard guides via the
   * pure snapping helper. When omitted, the legacy Artboard-edge/center guides
   * below are used so existing `SVGCanvas` usage keeps working unchanged.
   */
  otherElements?: AlignmentGuideElement[];
  /**
   * Editor_Canvas zoom, used to keep the 5px threshold a true *on-screen* 5px
   * by dividing the model threshold by zoom (Req 2.1, 2.4). Defaults to 1.
   */
  zoom?: number;
}

const GUIDE_TOLERANCE = SNAP_THRESHOLD_PX;

/** Map the panel's `{ left, top }` element shape to a model-space `BBox`. */
function toBBox(element: AlignmentGuideElement): BBox {
  return {
    x: element.left,
    y: element.top,
    width: element.width,
    height: element.height,
  };
}

/** Distinct color for Artboard guides vs. inter-layer guides. */
function guideColor(guide: SnapGuide): string {
  return guide.source === "artboard" ? "#2563eb" : "#ff6b00";
}

export function AlignmentGuides({
  canvasWidth,
  canvasHeight,
  elements,
  isDragging,
  otherElements,
  zoom = 1,
}: AlignmentGuidesProps): JSX.Element | null {
  if (!isDragging) {
    return null;
  }
  const activeElement = elements[0];
  if (!activeElement) {
    return null;
  }

  // Inter-layer mode (task 6.1): compute candidate references from every other
  // layer's edges/centers plus the Artboard edges/center, and render a guide
  // for each reference within a true on-screen 5px threshold (Req 2.1, 2.4,
  // 2.5). When no reference is within threshold the guide list is empty, so all
  // guides are hidden (Req 2.6); releasing the drag unmounts this component via
  // `isDragging`, hiding all guides (Req 2.3).
  if (otherElements) {
    const others: LayerBox[] = otherElements.map((element, index) => ({
      id: `other-${index}`,
      box: toBBox(element),
    }));
    const references = collectReferenceLines(others, {
      width: canvasWidth,
      height: canvasHeight,
    });
    const threshold = effectiveModelThreshold(GUIDE_TOLERANCE, zoom);
    const { guides } = computeSnap(toBBox(activeElement), references, threshold);

    if (guides.length === 0) {
      return null;
    }

    return (
      <div className="alignment-guides" aria-hidden="true">
        {guides.map((guide) => {
          const key = `${guide.axis}-${guide.source}-${guide.kind}-${guide.position}`;
          const color = guideColor(guide);
          return guide.axis === "x" ? (
            <div
              key={key}
              className="alignment-guide alignment-guide-vertical"
              data-source={guide.source}
              data-kind={guide.kind}
              style={{
                position: "absolute",
                left: `${guide.position}px`,
                top: "0",
                bottom: "0",
                borderLeft: `1px dashed ${color}`,
              }}
            />
          ) : (
            <div
              key={key}
              className="alignment-guide alignment-guide-horizontal"
              data-source={guide.source}
              data-kind={guide.kind}
              style={{
                position: "absolute",
                top: `${guide.position}px`,
                left: "0",
                right: "0",
                borderTop: `1px dashed ${color}`,
              }}
            />
          );
        })}
      </div>
    );
  }

  const elementCenterX = activeElement.left + (activeElement.width / 2);
  const elementCenterY = activeElement.top + (activeElement.height / 2);
  const showVerticalCenter = Math.abs(elementCenterX - (canvasWidth / 2)) <= GUIDE_TOLERANCE;
  const showHorizontalCenter = Math.abs(elementCenterY - (canvasHeight / 2)) <= GUIDE_TOLERANCE;
  const showLeftEdge = Math.abs(activeElement.left) <= GUIDE_TOLERANCE;
  const showTopEdge = Math.abs(activeElement.top) <= GUIDE_TOLERANCE;
  const showRightEdge = Math.abs((activeElement.left + activeElement.width) - canvasWidth) <= GUIDE_TOLERANCE;
  const showBottomEdge = Math.abs((activeElement.top + activeElement.height) - canvasHeight) <= GUIDE_TOLERANCE;

  return (
    <div className="alignment-guides" aria-hidden="true">
      {showVerticalCenter ? (
        <div
          className="alignment-guide alignment-guide-vertical-center"
          style={{ position: "absolute", left: `${canvasWidth / 2}px`, top: "0", bottom: "0", borderLeft: "1px dashed #ff6b00" }}
        />
      ) : null}
      {showHorizontalCenter ? (
        <div
          className="alignment-guide alignment-guide-horizontal-center"
          style={{ position: "absolute", top: `${canvasHeight / 2}px`, left: "0", right: "0", borderTop: "1px dashed #ff6b00" }}
        />
      ) : null}
      {showLeftEdge ? (
        <div className="alignment-guide alignment-guide-left-edge" style={{ position: "absolute", left: "0", top: "0", bottom: "0", borderLeft: "1px dashed #2563eb" }} />
      ) : null}
      {showRightEdge ? (
        <div className="alignment-guide alignment-guide-right-edge" style={{ position: "absolute", right: "0", top: "0", bottom: "0", borderRight: "1px dashed #2563eb" }} />
      ) : null}
      {showTopEdge ? (
        <div className="alignment-guide alignment-guide-top-edge" style={{ position: "absolute", top: "0", left: "0", right: "0", borderTop: "1px dashed #2563eb" }} />
      ) : null}
      {showBottomEdge ? (
        <div className="alignment-guide alignment-guide-bottom-edge" style={{ position: "absolute", bottom: "0", left: "0", right: "0", borderBottom: "1px dashed #2563eb" }} />
      ) : null}
    </div>
  );
}
