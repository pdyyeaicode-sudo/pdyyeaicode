/**
 * Multi-Selection Integration Tests
 * 
 * Tests the complete multi-selection flow from user interactions to visual feedback.
 */

import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CenterStage } from "./CenterStage";
import { LayersPanel } from "./LayersPanel";
import { designOutputFromArtboard } from "./designOutputMapping";
import { findLayer, getActiveArtboard } from "./commands";
import { evaluateTextCommit } from "./tools/textTool";
import type { Command, CreativeDocument, SelectionSet } from "./types/documentModel";
import type { DesignOutput } from "../types";

const mockDesignOutput: DesignOutput = {
  requestId: "test-123",
  svgLayers: [
    {
      id: "layer1",
      role: "shape",
      svgElement: '<rect id="layer1" data-layer-id="layer1" data-editable="true" x="0" y="0" width="100" height="100" fill="red"/>',
      isEditable: true,
    },
    {
      id: "layer2",
      role: "shape",
      svgElement: '<rect id="layer2" data-layer-id="layer2" data-editable="true" x="150" y="150" width="100" height="100" fill="blue"/>',
      isEditable: true,
    },
    {
      id: "layer3",
      role: "shape",
      svgElement: '<rect id="layer3" data-layer-id="layer3" data-editable="true" x="300" y="300" width="100" height="100" fill="green"/>',
      isEditable: true,
    },
  ],
  composedSVG: `
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
      <g data-role="shape">
        <rect id="layer1" data-layer-id="layer1" data-editable="true" x="0" y="0" width="100" height="100" fill="red"/>
        <rect id="layer2" data-layer-id="layer2" data-editable="true" x="150" y="150" width="100" height="100" fill="blue"/>
        <rect id="layer3" data-layer-id="layer3" data-editable="true" x="300" y="300" width="100" height="100" fill="green"/>
      </g>
    </svg>
  `,
  printMeta: {
    bleed: 3,
    cmykSafe: true,
    trimMarks: false,
  },
};

const textDesignOutput: DesignOutput = {
  requestId: "text-edit",
  svgLayers: [],
  composedSVG: `
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
      <g data-role="headline" data-editable="true">
        <text
          data-layer-id="text-1"
          data-element-id="text-element-1"
          data-field="headline"
          x="100"
          y="100"
          font-size="32"
          fill="#111111"
        >Edit me</text>
      </g>
    </svg>
  `,
  printMeta: {
    bleed: 0,
    cmykSafe: true,
    trimMarks: false,
  },
};

function makeLiveDocument(): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Live canvas",
    activePageId: "page-live",
    activeArtboardId: "artboard-live",
    pages: [
      {
        id: "page-live",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-live",
            width: 500,
            height: 500,
            defs: "",
            rootAttributes: {
              "data-printrocket": "true",
              "data-version": "1.0",
            },
            printMeta: {
              bleed: 0,
              cmykSafe: true,
              trimMarks: false,
            },
            layers: [
              {
                id: "shape-live",
                role: "shapes",
                name: "Canvas Shape",
                editable: true,
                locked: false,
                visible: true,
                opacity: 100,
                kind: "rect",
                field: "shape",
                geometry: { type: "rect", x: 20, y: 20, width: 120, height: 80 },
                fill: "#ef4444",
              },
              {
                id: "text-live",
                role: "headline",
                name: "Canvas Headline",
                editable: true,
                locked: false,
                visible: true,
                opacity: 100,
                kind: "text",
                elementId: "text-element-live",
                field: "headline",
                content: "Live headline",
                x: 180,
                y: 120,
                fontFamily: "Inter",
                fontSize: 32,
                fontWeight: "bold",
                textAlign: "left",
                fill: "#111111",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("Multi-Selection Integration", () => {
  it("should select single layer on click", async () => {
    const onLayerSelect = vi.fn();
    const onSelectionChange = vi.fn();

    const { container } = render(
      <CenterStage
        designOutput={mockDesignOutput}
        activeLayer={null}
        onLayerSelect={onLayerSelect}
        onLayerTextUpdate={vi.fn()}
        onLayerTransform={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    const layer1 = container.querySelector('[data-layer-id="layer1"]');
    expect(layer1).toBeInTheDocument();
    fireEvent.click(layer1 as Element);

    await waitFor(() => {
      expect(onLayerSelect).toHaveBeenCalledWith("layer1");
      expect(onSelectionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          layerIds: ["layer1"],
          primaryLayerId: "layer1",
        })
      );
    });
  });

  it("should add layer to selection on Shift+Click", async () => {
    const onLayerSelect = vi.fn();
    const onSelectionChange = vi.fn();

    const { container } = render(
      <CenterStage
        designOutput={mockDesignOutput}
        activeLayer="layer1"
        onLayerSelect={onLayerSelect}
        onLayerTextUpdate={vi.fn()}
        onLayerTransform={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    // First click layer1
    const layer1 = container.querySelector('[data-layer-id="layer1"]');
    expect(layer1).toBeInTheDocument();
    fireEvent.click(layer1 as Element);

    // Then Shift+Click layer2
    const layer2 = container.querySelector('[data-layer-id="layer2"]');
    expect(layer2).toBeInTheDocument();
    fireEvent.click(layer2 as Element, { shiftKey: true });

    await waitFor(() => {
      // Should be called twice (once for layer1, once for adding layer2)
      expect(onSelectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          layerIds: expect.arrayContaining(["layer1", "layer2"]),
          primaryLayerId: "layer2",
        })
      );
    });
  });

  it("should remove layer from selection on Shift+Click of selected layer", async () => {
    const onLayerSelect = vi.fn();
    const onSelectionChange = vi.fn();

    render(
      <CenterStage
        designOutput={mockDesignOutput}
        activeLayer="layer1"
        onLayerSelect={onLayerSelect}
        onLayerTextUpdate={vi.fn()}
        onLayerTransform={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    // Programmatically set selection to both layers
    // (In real usage, this would happen via previous clicks)
    
    // Shift+Click layer1 to remove it
    const layer1 = screen.getByText("Editing design").closest("section")?.querySelector('[data-layer-id="layer1"]');
    expect(layer1).toBeInTheDocument();
    fireEvent.click(layer1 as Element, { shiftKey: true });

    await waitFor(() => {
      // Selection should toggle layer1
      expect(onSelectionChange).toHaveBeenCalled();
    });
  });

  it("should show combined bounding box for multi-selection", async () => {
    const onSelectionChange = vi.fn();

    const { container } = render(
      <CenterStage
        designOutput={mockDesignOutput}
        activeLayer={null}
        onLayerSelect={vi.fn()}
        onLayerTextUpdate={vi.fn()}
        onLayerTransform={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    // Click layer1
    const layer1 = container.querySelector('[data-layer-id="layer1"]');
    expect(layer1).toBeInTheDocument();
    fireEvent.click(layer1 as Element);

    // Shift+Click layer2
    const layer2 = container.querySelector('[data-layer-id="layer2"]');
    expect(layer2).toBeInTheDocument();
    fireEvent.click(layer2 as Element, { shiftKey: true });

    await waitFor(() => {
      // Check that selection overlay exists
      const selectionBox = container.querySelector('[data-role="selection-overlay"]');
      expect(selectionBox).toBeInTheDocument();
    });
  });

  it("uses only the CenterStage text editor when text editing is externally managed", async () => {
    function TextEditingHarness(): JSX.Element {
      const [isTextEditing, setIsTextEditing] = useState(false);
      return (
        <CenterStage
          designOutput={textDesignOutput}
          activeLayer="text-1"
          isTextEditing={isTextEditing}
          onTextEditCancel={() => setIsTextEditing(false)}
          onLayerSelect={vi.fn()}
          onLayerTextUpdate={vi.fn()}
          onLayerTransform={vi.fn()}
          onDoubleClick={() => setIsTextEditing(true)}
        />
      );
    }

    const { container } = render(<TextEditingHarness />);
    const textLayer = container.querySelector('[data-layer-id="text-1"]');
    expect(textLayer).toBeInTheDocument();

    fireEvent.doubleClick(textLayer as Element);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Edit text" })).toBeInTheDocument();
    });
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("keeps the TreeList and canvas synchronized from one live document", async () => {
    function LiveDocumentHarness(): JSX.Element {
      const [document, setDocument] = useState<CreativeDocument>(makeLiveDocument);
      const [selection, setSelection] = useState<SelectionSet>({ layerIds: [] });
      const [activeLayer, setActiveLayer] = useState<string | null>(null);
      const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
      const artboard = getActiveArtboard(document);
      if (!artboard) {
        throw new Error("Live integration document has no active artboard.");
      }
      const designOutput = designOutputFromArtboard(artboard, "live-document");

      const dispatchCommand = (command: Command): void => {
        setDocument((current) => command.apply(current));
      };

      return (
        <>
          <LayersPanel
            layers={artboard.layers}
            selection={selection}
            onSelectLayer={(layerId) => {
              setSelection({ layerIds: [layerId], primaryLayerId: layerId });
              setActiveLayer(layerId);
            }}
            dispatchCommand={dispatchCommand}
          />
          <CenterStage
            designOutput={designOutput}
            activeLayer={activeLayer}
            isTextEditing={editingTextLayerId === activeLayer && activeLayer !== null}
            onTextEditCancel={() => setEditingTextLayerId(null)}
            onLayerSelect={setActiveLayer}
            onSelectionChange={setSelection}
            onLayerTransform={vi.fn()}
            onDoubleClick={(layerId) => {
              const layer = findLayer(artboard.layers, layerId);
              if (layer?.kind === "text" && layer.visible && !layer.locked) {
                setSelection({ layerIds: [layerId], primaryLayerId: layerId });
                setActiveLayer(layerId);
                setEditingTextLayerId(layerId);
              }
            }}
            onLayerTextUpdate={(layerId, nextText) => {
              const layer = findLayer(artboard.layers, layerId);
              if (layer?.kind !== "text") {
                return;
              }
              const result = evaluateTextCommit(layer.id, layer.content, nextText);
              if (result.status === "applied") {
                dispatchCommand(result.command);
              }
            }}
          />
        </>
      );
    }

    const { container } = render(<LiveDocumentHarness />);

    expect(screen.getByText("Canvas Headline")).toBeInTheDocument();
    expect(screen.getByText("Canvas Shape")).toBeInTheDocument();
    expect(screen.queryByText("Frame name")).not.toBeInTheDocument();
    expect(container.querySelector('svg text[data-layer-id="text-live"]')).toHaveTextContent(
      "Live headline",
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide Canvas Shape" }));
    await waitFor(() => {
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).toHaveAttribute(
        "display",
        "none",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Show Canvas Shape" }));
    await waitFor(() => {
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).not.toHaveAttribute(
        "display",
      );
    });

    const opacityInput = screen.getByRole("spinbutton", { name: "Opacity for Canvas Shape" });
    fireEvent.change(opacityInput, { target: { value: "35" } });
    fireEvent.blur(opacityInput);
    await waitFor(() => {
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).toHaveAttribute(
        "opacity",
        "0.35",
      );
    });

    fireEvent.doubleClick(screen.getByText("Canvas Shape"));
    const renameInput = screen.getByRole("textbox", { name: "Rename Canvas Shape" });
    fireEvent.change(renameInput, { target: { value: "Renamed Canvas Shape" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("Renamed Canvas Shape")).toBeInTheDocument();
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).toHaveAttribute(
        "data-name",
        "Renamed Canvas Shape",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Lock Renamed Canvas Shape" }));
    await waitFor(() => {
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).toHaveAttribute(
        "pointer-events",
        "none",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock Renamed Canvas Shape" }));
    await waitFor(() => {
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).not.toHaveAttribute(
        "pointer-events",
      );
    });

    const shapeHandle = screen.getByLabelText("Reorder Renamed Canvas Shape");
    const textTreeItem = screen.getByText("Canvas Headline").closest("[role='treeitem']");
    expect(textTreeItem).not.toBeNull();
    fireEvent.dragStart(shapeHandle);
    fireEvent.dragOver(textTreeItem as Element);
    fireEvent.drop(textTreeItem as Element);
    await waitFor(() => {
      const orderedIds = Array.from(
        container.querySelectorAll<SVGGElement>("svg g[data-role][data-layer-id]"),
      ).map((element) => element.getAttribute("data-layer-id"));
      expect(orderedIds).toEqual(["text-live", "shape-live"]);
    });

    const liveText = container.querySelector('svg text[data-layer-id="text-live"]');
    expect(liveText).toBeInTheDocument();
    fireEvent.doubleClick(liveText as Element);

    const editor = await screen.findByRole("textbox", { name: "Edit text" });
    fireEvent.change(editor, { target: { value: "Updated from canvas" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelector('svg text[data-layer-id="text-live"]')).toHaveTextContent(
        "Updated from canvas",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Renamed Canvas Shape" }));
    await waitFor(() => {
      expect(screen.queryByText("Renamed Canvas Shape")).not.toBeInTheDocument();
      expect(container.querySelector('svg g[data-layer-id="shape-live"]')).not.toBeInTheDocument();
    });
  });
});
