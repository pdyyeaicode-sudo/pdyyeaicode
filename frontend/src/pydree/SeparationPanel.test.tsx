import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DocumentLayer } from "../editor/types/documentModel";
import { SeparationPanel } from "./SeparationPanel";

const background: DocumentLayer = {
  id: "background",
  role: "background",
  name: "Background",
  editable: false,
  locked: true,
  visible: true,
  opacity: 100,
  kind: "image",
  href: "data:image/png;base64,background",
  x: 0,
  y: 0,
  width: 800,
  height: 600,
};

const extractedLayers: DocumentLayer[] = [
  background,
  {
    id: "shapes",
    role: "shapes",
    name: "Extracted objects",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "group",
    children: [
      {
        id: "subject",
        role: "shapes",
        name: "Subject",
        editable: true,
        locked: false,
        visible: true,
        opacity: 100,
        kind: "image",
        href: "data:image/png;base64,subject",
        x: 120,
        y: 80,
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: "body",
    role: "body",
    name: "Body",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "group",
    children: [],
  },
];

describe("SeparationPanel", () => {
  it("renders backend layers as a selected TreeList and separates the chosen child", () => {
    const onSelectLayer = vi.fn<(layerId: string) => void>();
    const onSeparateLayer = vi.fn<(layerId: string) => void>();
    const { getByLabelText, getByText, queryByText } = render(
      <SeparationPanel
        layers={extractedLayers}
        selection={{ layerIds: ["subject"], primaryLayerId: "subject" }}
        extractionMode="layered-extract"
        isUploading={false}
        onImport={vi.fn()}
        onSelectLayer={onSelectLayer}
        onSeparateLayer={onSeparateLayer}
      />,
    );

    expect(getByText("Backend layers ready")).toBeInTheDocument();
    expect(queryByText("Background")).not.toBeInTheDocument();
    expect(queryByText("Body")).not.toBeInTheDocument();

    const subjectRow = getByText("Subject").closest<HTMLElement>("[role='treeitem']");
    expect(subjectRow).not.toBeNull();
    expect(subjectRow).toHaveAttribute("aria-selected", "true");
    expect(within(subjectRow!).getByText("image")).toBeInTheDocument();

    fireEvent.click(getByText("Subject"));
    expect(onSelectLayer).toHaveBeenCalledWith("subject");

    fireEvent.click(getByLabelText("Separate Subject"));
    expect(onSeparateLayer).toHaveBeenCalledWith("subject");
  });
});
