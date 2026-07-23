import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertiesPanel } from "./PropertiesPanel";
import type { ImageLayer, ShapeLayer } from "./types/documentModel";

const FRAME: ShapeLayer = {
  id: "frame-1",
  role: "shapes",
  name: "Portrait Frame",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  kind: "ellipse",
  field: "frame",
  geometry: { type: "ellipse", cx: 200, cy: 180, rx: 100, ry: 80 },
  fill: "none",
  stroke: "#000000",
  strokeWidth: 1,
};

const IMAGE: ImageLayer = {
  id: "image-1",
  role: "image-slots",
  name: "Portrait",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  kind: "image",
  href: "data:image/png;base64,source",
  x: 0,
  y: 0,
  width: 400,
  height: 200,
};

describe("PropertiesPanel image masks", () => {
  it("dispatches one undoable command when a frame is selected", () => {
    const dispatchCommand = vi.fn();

    render(
      <PropertiesPanel
        selectedLayer={null}
        selectionCount={1}
        documentLayer={IMAGE}
        activeLayers={[FRAME, IMAGE]}
        dispatchCommand={dispatchCommand}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Frame & Mask" }));
    fireEvent.change(screen.getByLabelText("Shape mask"), {
      target: { value: FRAME.id },
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0][0]).toMatchObject({
      type: "set-image-mask",
      label: "Apply image mask",
    });
  });
});
