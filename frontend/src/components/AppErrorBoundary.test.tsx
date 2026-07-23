import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenView(): JSX.Element {
  throw new Error("render failed");
}

describe("AppErrorBoundary", () => {
  it("shows a recoverable application shell when a child render fails", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The editor needs to recover" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry editor" })).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it("remounts children when retry is selected", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldFail = true;

    function RecoverableView(): JSX.Element {
      if (shouldFail) {
        throw new Error("temporary render failure");
      }
      return <p>Editor restored</p>;
    }

    render(
      <AppErrorBoundary>
        <RecoverableView />
      </AppErrorBoundary>,
    );

    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry editor" }));

    expect(screen.getByText("Editor restored")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
