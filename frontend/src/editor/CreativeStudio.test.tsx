import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CreativeStudio } from "./CreativeStudio";

/**
 * Shell render smoke tests (task 4.5).
 *
 * Verifies the Creative Studio shell mounts and lays out every required region
 * (Req 13.7/13.8): Top_Bar with its controls, the Tool_Rail, the left sidebar
 * with its six sections, the center stage, the Properties_Panel, and the
 * Bottom_Panel. These are structural assertions only — interactivity is covered
 * by later tasks.
 */
describe("CreativeStudio shell", () => {
  it("renders the top bar and all shell regions", () => {
    render(<CreativeStudio />);

    // Top_Bar region (banner) and its required controls (Req 13.7).
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByLabelText("Undo")).toBeInTheDocument();
    expect(screen.getByLabelText("Redo")).toBeInTheDocument();
    expect(screen.getByLabelText("AI assistant")).toBeInTheDocument();
    expect(screen.getByLabelText("Export options")).toBeInTheDocument();
    expect(screen.getByLabelText("Profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByLabelText("Collaborators")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Save status" })).toBeInTheDocument();

    // Layout regions (Req 13.8).
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Left sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: "Timeline" })).toBeInTheDocument();
  });

  it("disables undo and redo when no command history exists", () => {
    render(<CreativeStudio />);

    expect(screen.getByLabelText("Undo")).toBeDisabled();
    expect(screen.getByLabelText("Redo")).toBeDisabled();
  });

  it("exposes the current left-sidebar sections", () => {
    render(<CreativeStudio />);

    for (const label of ["Generate", "Templates", "Text", "Photos", "Elements", "Uploads", "Background", "Layers", "Resize"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the theme toggle in the top bar", () => {
    render(<CreativeStudio />);

    expect(screen.getByLabelText(/theme/i)).toBeInTheDocument();
  });
});
