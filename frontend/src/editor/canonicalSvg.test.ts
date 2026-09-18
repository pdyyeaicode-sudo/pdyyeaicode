import { describe, expect, it } from "vitest";

import {
  CanonicalSvgError,
  parseCanonicalSvg,
  serializeArtboard,
  snapToPrintGrid,
} from "./canonicalSvg";
import type { GroupLayer, ShapeLayer, TextLayer } from "./types/documentModel";

/**
 * Representative Canonical_SVG sample mirroring the backend composer output
 * (services/svg/composer.py): `<svg data-printrocket>` root, a `<defs>` block,
 * and the eight `<g data-role>` groups (background … print-marks) with
 * data-editable / data-field / data-element-id / data-layer-id attributes.
 */
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" data-printrocket="true" data-version="1.0">
<defs>
  <style><![CDATA[ .printrocket-text { font-family: 'PrintRocketEmbedded', sans-serif; } ]]></style>
</defs>
<g data-role="background" data-editable="false" data-layer-id="background">
<image href="https://cdn.example/bg.png" x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="shapes">
<rect data-field="shape" data-element-id="box-1" x="10.3" y="20.7" width="200" height="100" fill="#FF6B00"/>
</g>
<g data-role="image-slots" data-editable="true" data-layer-id="image-slots"></g>
<g data-role="body" data-editable="true" data-layer-id="body">
<text data-field="body" data-element-id="body-1" x="40" y="60" fill="#111111" font-size="24" data-line-height="30" letter-spacing="0.5" word-spacing="1.5" baseline-shift="2" text-transform="uppercase" direction="rtl" writing-mode="vertical-rl"><tspan x="40">Hello &amp; welcome</tspan><tspan x="40" dy="30">Second line</tspan></text>
</g>
<g data-role="cta" data-editable="true" data-layer-id="cta">
<rect data-field="cta-bg" data-element-id="cta-1" x="100" y="200" width="160" height="48" rx="8" fill="#FF6B00"/>
<text data-field="cta" data-element-id="cta-1" x="180" y="224" fill="#FFFFFF" font-size="18" text-anchor="middle">Buy now</text>
</g>
<g data-role="headline" data-editable="true" data-layer-id="headline" style="mix-blend-mode: multiply">
<text data-field="headline" data-element-id="headline-1" x="540" y="80" fill="#000000" font-size="64" font-style="italic" text-decoration="underline" text-anchor="middle">50% OFF</text>
</g>
<g data-role="logo" data-editable="false" data-layer-id="logo">
<image href="https://cdn.example/logo.png" x="900" y="20" width="120" height="120"/>
</g>
<g data-role="print-marks" data-editable="false" data-layer-id="print-marks" visibility="hidden">
<!-- bleed-box: 3mm; trim-marks: true -->
</g>
</svg>`;

const TRANSFORMED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" data-printrocket="true" data-version="1.0">
<g data-role="headline" data-editable="true" data-layer-id="headline" transform="rotate(15 160 40)">
<g data-layer-id="headline-child-0">
<text data-field="headline" data-element-id="headline-1" x="160" y="40" fill="#000000" font-size="48" text-anchor="middle" transform="skewX(8)">Tilted</text>
</g>
</g>
</svg>`;

const MASKED_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" data-printrocket="true" data-version="1.0">
<g data-role="shapes" data-editable="true" data-layer-id="frame-1" data-name="Photo Frame">
<rect data-field="frame" x="50" y="40" width="200" height="150" rx="12" fill="none"/>
</g>
<g data-role="image-slots" data-editable="true" data-layer-id="photo-1">
<image href="data:image/png;base64,source" x="25" y="40" width="250" height="150" data-clip-path-id="frame-1"/>
</g>
</svg>`;

describe("parseCanonicalSvg", () => {
  it("captures root attributes, dimensions, and defs verbatim", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);

    expect(artboard.width).toBe(1080);
    expect(artboard.height).toBe(1080);
    expect(artboard.rootAttributes["data-printrocket"]).toBe("true");
    expect(artboard.rootAttributes["data-version"]).toBe("1.0");
    expect(artboard.rootAttributes).not.toHaveProperty("width");
    expect(artboard.defs).toContain("CDATA");
    expect(artboard.defs).toContain("PrintRocketEmbedded");
  });

  it("produces one layer per top-level group, in document order", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    expect(artboard.layers.map((layer) => layer.role)).toEqual([
      "background",
      "shapes",
      "image-slots",
      "body",
      "cta",
      "headline",
      "logo",
      "print-marks",
    ]);
  });

  it("marks non-editable and locked-role layers as locked", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const byRole = Object.fromEntries(artboard.layers.map((layer) => [layer.role, layer]));

    expect(byRole.background.locked).toBe(true); // data-editable="false"
    expect(byRole.logo.locked).toBe(true); // LOCKED_ROLES + non-editable
    expect(byRole["print-marks"].locked).toBe(true);
    expect(byRole.shapes.locked).toBe(false);
    expect(byRole.headline.editable).toBe(true);
  });

  it("classifies a single-primitive group as a typed layer", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const shapesLayer = artboard.layers.find((layer) => layer.role === "shapes") as ShapeLayer;
    expect(shapesLayer.kind).toBe("rect");
    expect(shapesLayer.field).toBe("shape");
    expect(shapesLayer.elementId).toBe("box-1");

    const headline = artboard.layers.find((layer) => layer.role === "headline") as TextLayer;
    expect(headline.kind).toBe("text");
    expect(headline.content).toBe("50% OFF");
    expect(headline.textAlign).toBe("center");
    expect(headline.fontStyle).toBe("italic");
    expect(headline.textDecoration).toBe("underline");
    expect(headline.blendMode).toBe("multiply");

    const body = artboard.layers.find((layer) => layer.role === "body") as TextLayer;
    expect(body.content).toBe("Hello & welcome\nSecond line");
    expect(body.lineHeight).toBe(30);
    expect(body.letterSpacing).toBe(0.5);
    expect(body.wordSpacing).toBe(1.5);
    expect(body.baselineShift).toBe(2);
    expect(body.textTransform).toBe("uppercase");
    expect(body.direction).toBe("rtl");
    expect(body.writingMode).toBe("vertical-rl");
  });

  it("parses nondestructive image mask references", () => {
    const artboard = parseCanonicalSvg(MASKED_IMAGE_SVG);
    const image = artboard.layers.find((layer) => layer.id === "photo-1");
    expect(image?.kind).toBe("image");
    if (image?.kind === "image") {
      expect(image.clipPathId).toBe("frame-1");
      expect(image.href).toBe("data:image/png;base64,source");
    }
  });

  it("never flattens a multi-element group (cta becomes a GroupLayer)", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const cta = artboard.layers.find((layer) => layer.role === "cta") as GroupLayer;
    expect(cta.kind).toBe("group");
    expect(cta.children).toHaveLength(2);
    expect(cta.children[0].kind).toBe("rect");
    expect(cta.children[1].kind).toBe("text");
  });

  it("throws CanonicalSvgError when the root lacks data-printrocket", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>`;
    expect(() => parseCanonicalSvg(svg)).toThrow(CanonicalSvgError);
  });

  it("throws CanonicalSvgError on malformed markup", () => {
    expect(() => parseCanonicalSvg("<svg><g></svg")).toThrow(CanonicalSvgError);
  });

  it("throws CanonicalSvgError on empty input", () => {
    expect(() => parseCanonicalSvg("   ")).toThrow(CanonicalSvgError);
  });
});

describe("serializeArtboard", () => {
  it("preserves authoring precision instead of quantising to the 0.5px grid", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const svg = serializeArtboard(artboard);
    // The 0.5px grid was moved to the print export path, where its stated reason
    // — print sharpness — actually applies. Quantising here made fine dragging
    // impossible: at zoom 8 one screen pixel is 0.125 document px, entirely
    // below the old grid.
    expect(svg).toContain('x="10.3"');
    expect(svg).toContain('y="20.7"');
  });

  it("still offers the 0.5px print grid for the export path", () => {
    expect(snapToPrintGrid(10.3)).toBe(10.5);
    expect(snapToPrintGrid(20.7)).toBe(20.5);
    expect(snapToPrintGrid(Number.NaN)).toBe(0);
  });

  it("keeps sub-pixel movement, down to a thousandth of a pixel", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const shapes = artboard.layers.find((layer) => layer.role === "shapes");
    expect(shapes).toBeDefined();

    // A drag of 0.05px must survive the round trip. Previously it quantised to
    // zero and the canvas showed no change at all.
    const nudged = serializeArtboard({
      ...artboard,
      layers: artboard.layers.map((layer) =>
        layer.role === "shapes" && layer.kind === "rect"
          ? { ...layer, geometry: { ...layer.geometry, x: 10.35, y: 20.749 } }
          : layer,
      ),
    });
    expect(nudged).toContain('x="10.35"');
    expect(nudged).toContain('y="20.749"');
  });

  it("always emits editable text as <text> and never path-traces it", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const svg = serializeArtboard(artboard);
    expect(svg).toContain("50% OFF");
    expect(svg).toContain("<text");
    // The headline text must not have been converted into a path outline.
    expect(svg).not.toContain("<path");
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('text-decoration="underline"');
    expect(svg).toContain('data-line-height="30"');
    expect(svg).toContain('letter-spacing="0.5"');
    expect(svg).toContain('word-spacing="1.5"');
    expect(svg).toContain('baseline-shift="2"');
    expect(svg).toContain('text-transform="uppercase"');
    expect(svg).toContain('direction="rtl"');
    expect(svg).toContain('writing-mode="vertical-rl"');
    expect(svg).toContain('<tspan x="40">Hello &amp; welcome</tspan>');
    expect(svg).toContain('<tspan x="40" dy="30">Second line</tspan>');
    expect(svg).toContain("mix-blend-mode: multiply");
  });

  it("preserves non-editable layers verbatim (background width=100%, hidden print-marks)", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const svg = serializeArtboard(artboard);
    expect(svg).toContain('width="100%"');
    expect(svg).toContain('visibility="hidden"');
    expect(svg).toContain("bleed-box: 3mm");
  });

  it("preserves transform attributes on groups and elements across a round-trip", () => {
    const artboard = parseCanonicalSvg(TRANSFORMED_SVG);
    const headline = artboard.layers.find((layer) => layer.role === "headline");

    expect(headline?.transform).toBe('rotate(15 160 40)');
    expect(headline?.kind).toBe("group");
    if (headline?.kind === "group") {
      expect(headline.children[0]?.kind).toBe("group");
      if (headline.children[0]?.kind === "group") {
        expect(headline.children[0].children[0]?.transform).toBe('skewX(8)');
      }
    }

    const svg = serializeArtboard(artboard);
    expect(svg).toContain('transform="rotate(15 160 40)"');
    expect(svg).toContain('transform="skewX(8)"');

    const roundTripped = serializeArtboard(parseCanonicalSvg(svg));
    expect(roundTripped).toContain('transform="rotate(15 160 40)"');
    expect(roundTripped).toContain('transform="skewX(8)"');
  });

  it("generates one stable clipPath definition for a referenced frame", () => {
    const first = serializeArtboard(parseCanonicalSvg(MASKED_IMAGE_SVG));
    expect(first).toContain('data-printrocket-generated="clip-path"');
    expect(first).toContain('data-source-layer-id="frame-1"');
    expect(first).toContain('data-clip-path-id="frame-1"');
    expect(first).toContain('clip-path="url(#printrocket-clip-');
    expect(first).toContain('<rect x="50" y="40" width="200" height="150" rx="12"');

    const second = serializeArtboard(parseCanonicalSvg(first));
    expect(second).toBe(first);
    expect(second.match(/data-printrocket-generated="clip-path"/g)).toHaveLength(1);
  });

  it("escapes text content safely", () => {
    const artboard = parseCanonicalSvg(SAMPLE_SVG);
    const svg = serializeArtboard(artboard);
    expect(svg).toContain("Hello &amp; welcome");
  });
});

describe("round-trip (parse → serialize → parse) structural stability", () => {
  it("is byte-stable after the first serialize", () => {
    const artboard1 = parseCanonicalSvg(SAMPLE_SVG);
    const svg1 = serializeArtboard(artboard1);
    const artboard2 = parseCanonicalSvg(svg1);
    const svg2 = serializeArtboard(artboard2);

    // serialize is idempotent on already-serialized canonical markup.
    expect(svg2).toBe(svg1);
  });

  it("preserves roles, ids, document order, and nesting across the round-trip", () => {
    const artboard1 = parseCanonicalSvg(SAMPLE_SVG);
    const artboard2 = parseCanonicalSvg(serializeArtboard(artboard1));
    const artboard3 = parseCanonicalSvg(serializeArtboard(artboard2));

    const fingerprint = (layers: typeof artboard1.layers): unknown =>
      layers.map((layer) => ({
        role: layer.role,
        id: layer.id,
        kind: layer.kind,
        children: layer.kind === "group" ? fingerprint(layer.children) : undefined,
      }));

    expect(fingerprint(artboard2.layers)).toEqual(fingerprint(artboard3.layers));
    // The stable model is deep-equal across successive round-trips.
    expect(artboard3).toEqual(artboard2);
  });
});
