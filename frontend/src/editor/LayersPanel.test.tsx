import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";

import { LayersPanel } from "./LayersPanel";
import { getActiveArtboard } from "./commands";
import type {
  Command,
  CreativeDocument,
  DocumentLayer,
  SelectionSet,
} from "./types/documentModel";

/**
 * Behavior tests for the Layers_Panel (task 9.1, Req 3.1–3.8, 3.10, 3.11).
 *
 * The panel is a controlled view: it renders the active artboard's top-level
 * layers + the Selection_Set and turns every mutation into a Command passed to
 * `dispatchCommand`. Tests assert the correct Commands are produced (and, for
 * reorder, apply the produced Command to confirm its effect) and that invalid
 * edits are rejected with no Command.
 */

function makeLayers(): DocumentLayer[] {
  // Document order: index 0 = bottom z, last = top z.
  return [
    {
      id: "background",
      role: "background",
      name: "Background",
      editable: false,
      locked: true,
      visible: true,
      opacity: 100,
      kind: "rect",
      field: "bg",
      geometry: { type: "rect", x: 0, y: 0, width: 100, height: 80 },
      fill: "#ffffff",
    },
    {
      id: "rect-1",
      role: "shapes",
      name: "Rectangle",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "rect",
      field: "shape",
      geometry: { type: "rect", x: 10, y: 10, width: 40, height: 30 },
      fill: "#ff6b00",
    },
    {
      id: "headline-1",
      role: "headline",
      name: "Headline",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "text",
      elementId: "t1",
      field: "headline",
      content: "Hello",
      x: 10,
      y: 20,
      fontFamily: "General Sans",
      fontSize: 48,
      fontWeight: "bold",
      textAlign: "left",
      fill: "#000000",
    },
    {
      id: "logo",
      role: "logo",
      name: "Logo",
      editable: false,
      locked: true,
      visible: true,
      opacity: 100,
      kind: "image",
      href: "data:image/png;base64,AAAA",
      x: 70,
      y: 5,
      width: 20,
      height: 20,
    },
  ];
}

function makeDoc(layers: DocumentLayer[]): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Doc",
    activePageId: "page-1",
    activeArtboardId: "artboard-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-1",
            width: 100,
            height: 80,
            printMeta: { bleed: 0, cmykSafe: true, trimMarks: false },
            layers,
            defs: "",
            rootAttributes: { "data-printrocket": "true", "data-version": "1.0" },
          },
        ],
      },
    ],
  };
}

function makeGroupedLayers(): DocumentLayer[] {
  const [background, rectangle, headline, logo] = makeLayers();
  return [
    background,
    {
      id: "group-1",
      role: "shapes",
      name: "Hero Group",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "group",
      children: [rectangle, headline],
    },
    logo,
  ];
}

function setup(selectionIds: string[] = [], layers: DocumentLayer[] = makeLayers()) {
  const selection: SelectionSet = { layerIds: selectionIds };
  const onSelectLayer = vi.fn<(layerId: string) => void>();
  const dispatchCommand = vi.fn<(command: Command) => void>();
  const utils = render(
    <LayersPanel
      layers={layers}
      selection={selection}
      onSelectLayer={onSelectLayer}
      dispatchCommand={dispatchCommand}
    />,
  );
  return { layers, onSelectLayer, dispatchCommand, ...utils };
}

describe("LayersPanel rendering and ordering (Req 3.1)", () => {
  it("lists one entry per top-level layer, top (last in document order) first", () => {
    const { getAllByRole, queryByText } = setup();
    const items = getAllByRole("treeitem");
    expect(items).toHaveLength(3);
    // Reverse of document order: logo (top) → headline → rectangle → background.
    expect(within(items[0]).getByText("Logo")).toBeInTheDocument();
    expect(within(items[1]).getByText("Headline")).toBeInTheDocument();
    expect(within(items[2]).getByText("Rectangle")).toBeInTheDocument();
    expect(queryByText("Background")).not.toBeInTheDocument();
  });

  it("renders group children as expanded nested tree items", () => {
    const { getAllByRole, getByText } = setup([], makeGroupedLayers());
    const items = getAllByRole("treeitem");

    expect(items).toHaveLength(4);
    expect(getByText("Hero Group").closest("[role='treeitem']")).toHaveAttribute("aria-expanded", "true");
    expect(getByText("Headline").closest("[role='treeitem']")).toHaveAttribute("aria-level", "2");
    expect(getByText("Rectangle").closest("[role='treeitem']")).toHaveAttribute("aria-level", "2");
  });

  it("hides empty canonical scaffold groups from older blank documents", () => {
    const background = makeLayers()[0];
    const placeholderRoles: DocumentLayer["role"][] = [
      "shapes",
      "image-slots",
      "body",
      "cta",
      "headline",
      "logo",
      "print-marks",
    ];
    const placeholders = placeholderRoles.map((role): DocumentLayer => ({
      id: role,
      role,
      name: role,
      editable: role !== "logo" && role !== "print-marks",
      locked: role === "logo" || role === "print-marks",
      visible: role !== "print-marks",
      opacity: 100,
      kind: "group",
      children: [],
      ...(role === "logo" || role === "print-marks"
        ? { raw: `<g data-role="${role}" data-layer-id="${role}"></g>` }
        : {}),
    }));

    const { queryAllByRole, queryByText } = setup([], [background, ...placeholders]);

    expect(queryAllByRole("treeitem")).toHaveLength(0);
    expect(queryByText("Background")).not.toBeInTheDocument();
    expect(queryByText("Print Marks")).not.toBeInTheDocument();
    expect(queryByText("Logo")).not.toBeInTheDocument();
    expect(queryByText("Headline")).not.toBeInTheDocument();
  });
});

describe("LayersPanel selection (Req 3.2, 3.6, 3.8)", () => {
  it("selects an editable, unlocked layer on click", () => {
    const { getByRole, onSelectLayer } = setup();
    fireEvent.click(getByRole("button", { name: "Rectangle" }));
    expect(onSelectLayer).toHaveBeenCalledWith("rect-1");
  });

  it("does not select a role-locked layer", () => {
    const { getByText, onSelectLayer } = setup();
    fireEvent.click(getByText("Logo"));
    expect(onSelectLayer).not.toHaveBeenCalled();
  });
});

describe("LayersPanel visibility and lock toggles (Req 3.5, 3.6, 3.8)", () => {
  it("dispatches a visibility command", () => {
    const { getByRole, dispatchCommand } = setup();
    fireEvent.click(getByRole("button", { name: "Hide Rectangle" }));
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0][0].type).toBe("set-property");
  });

  it("dispatches a lock command for an editable layer", () => {
    const { getByRole, dispatchCommand } = setup();
    fireEvent.click(getByRole("button", { name: "Lock Rectangle" }));
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand.mock.calls[0][0].type).toBe("set-property");
  });

  it("disables the lock toggle for a role-locked layer (Req 3.8)", () => {
    const { getByRole, dispatchCommand } = setup();
    // The logo starts locked, so its lock control reads "Unlock Logo".
    expect(getByRole("button", { name: "Unlock Logo" })).toBeDisabled();
    expect(getByRole("button", { name: "Delete Logo" })).toBeDisabled();
    expect(dispatchCommand).not.toHaveBeenCalled();
  });
});

describe("LayersPanel rename (Req 3.4, 3.10)", () => {
  it("commits a valid rename as a name command", () => {
    const { getByRole, getByText, dispatchCommand, layers } = setup();
    fireEvent.doubleClick(getByText("Rectangle"));
    const input = getByRole("textbox", { name: "Rename Rectangle" });
    fireEvent.change(input, { target: { value: "Hero Box" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0][0];
    expect(command.type).toBe("set-property");
    // Apply the command to confirm it sets data-name to the new value.
    const next = command.apply(makeDoc(layers));
    const renamed = getActiveArtboard(next)?.layers.find((l) => l.id === "rect-1");
    expect(renamed?.name).toBe("Hero Box");
  });

  it("rejects an empty rename, shows an error, and records no command (Req 3.10)", () => {
    const { getByRole, getByText, dispatchCommand } = setup();
    fireEvent.doubleClick(getByText("Rectangle"));
    const input = getByRole("textbox", { name: "Rename Rectangle" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(dispatchCommand).not.toHaveBeenCalled();
    expect(getByText(/name cannot be empty/i)).toBeInTheDocument();
  });

  it("rejects an over-100-character rename and records no command (Req 3.10)", () => {
    const { getByRole, getByText, dispatchCommand } = setup();
    fireEvent.doubleClick(getByText("Rectangle"));
    const input = getByRole("textbox", { name: "Rename Rectangle" });
    fireEvent.change(input, { target: { value: "a".repeat(101) } });
    fireEvent.blur(input);
    expect(dispatchCommand).not.toHaveBeenCalled();
  });
});

describe("LayersPanel opacity (Req 3.7, 3.11)", () => {
  it("commits a valid opacity as an opacity command", () => {
    const { getByRole, dispatchCommand, layers } = setup();
    const field = getByRole("spinbutton", { name: "Opacity for Rectangle" });
    fireEvent.change(field, { target: { value: "40" } });
    fireEvent.blur(field);

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0][0];
    const next = command.apply(makeDoc(layers));
    const updated = getActiveArtboard(next)?.layers.find((l) => l.id === "rect-1");
    expect(updated?.opacity).toBe(40);
  });

  it("rejects out-of-range opacity, shows an error, and records no command (Req 3.11)", () => {
    const { getByRole, getByText, dispatchCommand } = setup();
    const field = getByRole("spinbutton", { name: "Opacity for Rectangle" });
    fireEvent.change(field, { target: { value: "150" } });
    fireEvent.blur(field);

    expect(dispatchCommand).not.toHaveBeenCalled();
    expect(getByText(/opacity must be between 0 and 100/i)).toBeInTheDocument();
  });
});

describe("LayersPanel drag-reorder (Req 3.3)", () => {
  it("dispatches a reorder that moves the dragged layer while preserving others", () => {
    const { getByLabelText, getByText, dispatchCommand, layers } = setup();
    const rectangleHandle = getByLabelText("Reorder Rectangle");
    const headlineItem = getByText("Headline").closest("[role='treeitem']");
    expect(headlineItem).not.toBeNull();

    fireEvent.dragStart(rectangleHandle);
    fireEvent.dragOver(headlineItem as Element);
    fireEvent.drop(headlineItem as Element);

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0][0];
    expect(command.type).toBe("reorder");

    // rect-1 (doc index 1) moves to headline-1's slot (doc index 2); the other
    // layers keep their relative order.
    const next = command.apply(makeDoc(layers));
    const order = getActiveArtboard(next)?.layers.map((l) => l.id);
    expect(order).toEqual(["background", "headline-1", "rect-1", "logo"]);
  });

  it("does not start a drag from a role-locked layer (Req 3.8)", () => {
    const { getByLabelText } = setup();
    expect(getByLabelText("Reorder Logo")).toHaveAttribute("draggable", "false");
  });

  it("reorders siblings inside a group without changing their parent", () => {
    const layers = makeGroupedLayers();
    const { getByLabelText, getByText, dispatchCommand } = setup([], layers);
    const rectangleHandle = getByLabelText("Reorder Rectangle");
    const headlineItem = getByText("Headline").closest("[role='treeitem']");
    expect(headlineItem).not.toBeNull();

    fireEvent.dragStart(rectangleHandle);
    fireEvent.dragOver(headlineItem as Element);
    fireEvent.drop(headlineItem as Element);

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const next = dispatchCommand.mock.calls[0][0].apply(makeDoc(layers));
    const group = getActiveArtboard(next)?.layers.find((layer) => layer.id === "group-1");
    expect(group?.kind).toBe("group");
    expect(group?.kind === "group" ? group.children.map((layer) => layer.id) : []).toEqual([
      "headline-1",
      "rect-1",
    ]);
  });
});

describe("LayersPanel nested actions", () => {
  it("deletes a nested child and preserves undo position metadata", () => {
    const layers = makeGroupedLayers();
    const { getByRole, dispatchCommand } = setup([], layers);

    fireEvent.click(getByRole("button", { name: "Delete Rectangle" }));

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0][0];
    const next = command.apply(makeDoc(layers));
    const group = getActiveArtboard(next)?.layers.find((layer) => layer.id === "group-1");
    expect(group?.kind === "group" ? group.children.map((layer) => layer.id) : []).toEqual([
      "headline-1",
    ]);
    expect(command.undo(next)).toEqual(makeDoc(layers));
  });
});
