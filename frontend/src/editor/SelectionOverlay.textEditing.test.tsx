import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SelectionOverlay } from "./SelectionOverlay";

describe("SelectionOverlay text editing hit testing", () => {
  it("passes the selectable layer and imported text element IDs on double click", () => {
    const hostRef = createRef<HTMLDivElement>();
    const onDoubleClick = vi.fn<(layerId: string, textElementId?: string) => void>();

    const { getByText } = render(
      <div ref={hostRef}>
        <svg>
          <g data-role="headline" data-editable="true" data-layer-id="imported-group">
            <text data-element-id="imported-text">Imported headline</text>
          </g>
        </svg>
        <SelectionOverlay
          hostRef={hostRef}
          designOutput={null}
          viewport={{ zoom: 1, panX: 0, panY: 0 }}
          selection={{ layerIds: [] }}
          onSelectOnly={vi.fn()}
          onToggle={vi.fn()}
          onClear={vi.fn()}
          onSetSelection={vi.fn()}
          onDoubleClick={onDoubleClick}
        />
      </div>,
    );

    const text = getByText("Imported headline");
    fireEvent.click(text);
    fireEvent.click(text);

    expect(onDoubleClick).toHaveBeenCalledWith("imported-group", "imported-text");
  });
});
