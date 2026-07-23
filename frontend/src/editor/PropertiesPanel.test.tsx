import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PropertiesPanel } from "./PropertiesPanel";
import type { ShapeLayer, TextLayer } from "./types/documentModel";

/**
 * Render + interaction tests for the Properties_Panel single-selection editor
 * (task 10.1, Req 9.1–9.6).
 *
 * Verifies the displayed fields, that valid commits dispatch exactly one
 * Command, and that invalid commits are rejected with a field-level error,
 * retain the previous value, and record no Command (Req 9.3, 9.5).
 */

function rectLayer(): ShapeLayer {
  return {
    id: "rect-1",
    role: "shapes",
    name: "Rect",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x: 10, y: 20, width: 200, height: 100 },
    fill: "#ff6b00",
    stroke: "#000000",
    strokeWidth: 2,
  };
}

function textLayer(): TextLayer {
  return {
    id: "text-1",
    role: "headline",
    name: "Headline",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: "headline-1",
    field: "headline",
    content: "50% OFF",
    x: 40,
    y: 80,
    fontFamily: "General Sans",
    fontSize: 64,
    fontWeight: "bold",
    textAlign: "center",
    fill: "#000000",
  };
}

const noop = (): void => undefined;

function renderPanel(layer: ShapeLayer | TextLayer, dispatchCommand: () => void) {
  return render(
    <PropertiesPanel
      selectedLayer={null}
      selectionCount={1}
      documentLayer={layer}
      dispatchCommand={dispatchCommand}
      onUpdate={noop}
      onDelete={noop}
      onDuplicate={noop}
      onMoveUp={noop}
      onMoveDown={noop}
    />,
  );

}

describe("PropertiesPanel single-selection editor", () => {
  it("displays position, size, fill, stroke, stroke width, and opacity for a shape (Req 9.1)", () => {
    renderPanel(rectLayer(), vi.fn());

    fireEvent.click(screen.getByRole("button", { name: "Fill & Stroke" }));
    fireEvent.click(screen.getByRole("button", { name: "Blend & Opacity" }));

    expect(screen.getByLabelText("X")).toHaveValue("10");
    expect(screen.getByLabelText("Y")).toHaveValue("20");
    expect(screen.getByLabelText("W")).toHaveValue("200");
    expect(screen.getByLabelText("H")).toHaveValue("100");
    expect(screen.getByLabelText("Fill")).toHaveValue("#ff6b00");
    expect(screen.getByLabelText("Stroke")).toHaveValue("#000000");
    expect(screen.getByLabelText("Stroke width")).toHaveValue("2");
    expect(screen.getByLabelText("Opacity")).toHaveValue("100");
  });

  it("shows typography controls for text layers (Req 9.1)", () => {
    renderPanel(textLayer(), vi.fn());


    expect(screen.getByLabelText("Font family")).toHaveValue("General Sans");
    expect(screen.getByLabelText("Font size")).toHaveValue("64");
    expect(screen.getByLabelText("Font weight")).toHaveValue("bold");
    expect(screen.getByLabelText("Text align")).toHaveValue("center");
  });

  it("dispatches exactly one Command on a valid position commit (Req 9.2)", () => {
    const dispatch = vi.fn();
    renderPanel(rectLayer(), dispatch);


    const input = screen.getByLabelText("X");
    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.blur(input);

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("dispatches one Command on a valid fill commit (Req 9.4)", () => {
    const dispatch = vi.fn();
    renderPanel(rectLayer(), dispatch);

    fireEvent.click(screen.getByRole("button", { name: "Fill & Stroke" }));

    const input = screen.getByLabelText("Fill");
    fireEvent.change(input, { target: { value: "#123abc" } });
    fireEvent.blur(input);

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects an out-of-range position, retains the previous value, and records no Command (Req 9.3)", () => {
    const dispatch = vi.fn();
    renderPanel(rectLayer(), dispatch);


    const input = screen.getByLabelText("X");
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(input).toHaveValue("10"); // previous value retained
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects an invalid color with no Command (Req 9.3)", () => {
    const dispatch = vi.fn();
    renderPanel(rectLayer(), dispatch);
    fireEvent.click(screen.getByRole("button", { name: "Fill & Stroke" }));

    const input = screen.getByLabelText("Fill");
    fireEvent.change(input, { target: { value: "not-a-color" } });
    fireEvent.blur(input);

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(input).toHaveValue("#ff6b00");
  });

  it("rejects an out-of-range opacity with no Command (Req 9.5)", () => {
    const dispatch = vi.fn();
    renderPanel(rectLayer(), dispatch);
    fireEvent.click(screen.getByRole("button", { name: "Blend & Opacity" }));

    const input = screen.getByLabelText("Opacity");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.blur(input);

    expect(dispatch).not.toHaveBeenCalled();
    expect(input).toHaveValue("100");
  });

  it("keeps the Effects (shadow/blur) controls in a section collapsed by default (Req 13.11)", () => {
    renderPanel(rectLayer(), vi.fn());


    // Collapsed: the shadow toggle is not rendered until the section is opened.
    expect(screen.queryByLabelText("Drop shadow")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Effects" }));

    expect(screen.getByLabelText("Drop shadow")).toBeInTheDocument();
    expect(screen.getByLabelText("Blur")).toBeInTheDocument();
  });

  it("applies a shadow effect as one filter Command when toggled (Req 9.6)", () => {
    const dispatch = vi.fn();
    renderPanel(rectLayer(), dispatch);


    fireEvent.click(screen.getByRole("button", { name: "Effects" }));
    fireEvent.click(screen.getByLabelText("Drop shadow"));

    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
