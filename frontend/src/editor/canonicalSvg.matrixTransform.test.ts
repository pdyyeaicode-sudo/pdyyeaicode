import { describe, expect, it } from "vitest";

import { parseCanonicalSvg, serializeArtboard } from "./canonicalSvg";
import { parseSvgTransform, toSvgTransform } from "./renderer/matrix2d";

/**
 * Gesture commits write `matrix(a b c d e f)` — a single resolved matrix — rather
 * than appending `rotate(deg cx cy)` / `scale(...)` to whatever string was there
 * before. That decision lives in SelectionOverlay's commit path and in
 * `toSvgTransform`.
 *
 * The pre-existing canonicalSvg round-trip coverage only exercised `rotate(...)`
 * and `skewX(...)`, i.e. the forms the *backend* composer emits. This file covers
 * the form the *editor* now emits, because that is what has to survive
 * save -> load -> export once the engine renderer is the default. A matrix is the
 * riskiest form to round-trip: six components, negatives, sub-pixel decimals, and
 * a separator convention that differs between producers.
 *
 * Writing these tests found a real defect: a single-primitive role group is
 * collapsed into one typed layer, and the collapse kept only the *group's*
 * transform, silently discarding one on the primitive. See
 * `composeCollapsedTransform`.
 */

/** Rotation by 15deg about (160, 40), resolved to a matrix. */
const ROTATION_MATRIX =
  "matrix(0.9659258263 0.2588190451 -0.2588190451 0.9659258263 15.8038903466 -40.2483028242)";

/** A horizontal flip with a non-uniform scale and a sub-pixel translation. */
const FLIP_MATRIX = "matrix(-1.5 0 0 2.25 -0.0625 480)";

/** Comma-separated components, which is legal SVG and which some tools emit. */
const COMMA_MATRIX = "matrix(1,0,0,1,12.5,-8.25)";

/**
 * FLIP_MATRIX · COMMA_MATRIX. SVG applies the outer group transform first, so a
 * collapsed layer must carry the product, not either factor.
 *
 *   e = -1.5 * 12.5  +  0    * -8.25  +  -0.0625  = -18.8125
 *   f =  0   * 12.5  +  2.25 * -8.25  +  480      =  461.4375
 */
const COMPOSED_MATRIX = "matrix(-1.5 0 0 2.25 -18.8125 461.4375)";

const MATRIX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" data-printrocket="true" data-version="1.0">
<g data-role="shapes" data-editable="true" data-layer-id="shapes" transform="${FLIP_MATRIX}">
<rect data-field="shape" data-element-id="box-1" x="10" y="20" width="200" height="100" fill="#FF6B00" transform="${COMMA_MATRIX}"/>
</g>
<g data-role="headline" data-editable="true" data-layer-id="headline">
<g data-layer-id="headline-child-0">
<text data-field="headline" data-element-id="headline-1" x="160" y="40" fill="#000000" font-size="48" transform="${ROTATION_MATRIX}">Tilted</text>
</g>
</g>
</svg>`;

function shapeTransformOf(markup: string): string | undefined {
  return parseCanonicalSvg(markup).layers.find((layer) => layer.role === "shapes")?.transform;
}

describe("canonical SVG matrix transforms", () => {
  it("preserves a nested primitive's matrix verbatim through parse", () => {
    const artboard = parseCanonicalSvg(MATRIX_SVG);
    const headline = artboard.layers.find((layer) => layer.role === "headline");

    expect(headline?.kind).toBe("group");
    if (headline?.kind === "group") {
      const child = headline.children[0];
      expect(child?.kind).toBe("group");
      if (child?.kind === "group") {
        expect(child.children[0]?.transform).toBe(ROTATION_MATRIX);
      }
    }
  });

  it("folds a collapsed group's and primitive's matrices into their product", () => {
    // `<g transform=G><rect transform=E/></g>` collapses to one shape layer with
    // a single `transform` slot. Keeping only G moved the rect by G's translation
    // instead of G·E's on the very first save.
    const artboard = parseCanonicalSvg(MATRIX_SVG);
    const shapes = artboard.layers.find((layer) => layer.role === "shapes");

    expect(shapes?.kind).toBe("rect");
    expect(shapes?.transform).toBe(COMPOSED_MATRIX);
  });

  it("does not move the shape: the composed matrix maps the same point as G then E", () => {
    // Independent check of the composition, so a wrong multiplication order
    // cannot pass just because both sides use the same helper.
    const outer = parseSvgTransform(FLIP_MATRIX).matrix;
    const inner = parseSvgTransform(COMMA_MATRIX).matrix;
    const composed = parseSvgTransform(shapeTransformOf(MATRIX_SVG) ?? "").matrix;

    for (const [x, y] of [
      [0, 0],
      [10, 20],
      [210, 120],
      [-7.5, 3.25],
    ] as const) {
      // Apply inner first, then outer — the order a browser applies them.
      const ix = inner.a * x + inner.c * y + inner.e;
      const iy = inner.b * x + inner.d * y + inner.f;
      const expectedX = outer.a * ix + outer.c * iy + outer.e;
      const expectedY = outer.b * ix + outer.d * iy + outer.f;

      const actualX = composed.a * x + composed.c * y + composed.e;
      const actualY = composed.b * x + composed.d * y + composed.f;

      expect(actualX).toBeCloseTo(expectedX, 10);
      expect(actualY).toBeCloseTo(expectedY, 10);
    }
  });

  it("writes every matrix back out and stays byte-stable on re-serialize", () => {
    const first = serializeArtboard(parseCanonicalSvg(MATRIX_SVG));

    expect(first).toContain(`transform="${COMPOSED_MATRIX}"`);
    expect(first).toContain(`transform="${ROTATION_MATRIX}"`);

    const second = serializeArtboard(parseCanonicalSvg(first));
    expect(second).toBe(first);
  });

  it("does not duplicate a matrix onto both the wrapper group and the primitive", () => {
    // A collapsed layer is serialized as a wrapper <g> plus its primitive. If
    // both carried the transform the object would move twice as far as the
    // gesture asked for — the defect that made a rotated shape fly off in the
    // opposite direction during a follow-up drag.
    const serialized = serializeArtboard(parseCanonicalSvg(MATRIX_SVG));
    expect(countOccurrences(serialized, COMPOSED_MATRIX)).toBe(1);
    expect(countOccurrences(serialized, ROTATION_MATRIX)).toBe(1);
    // The factors must not survive alongside the product.
    expect(serialized).not.toContain(COMMA_MATRIX);
  });

  it("survives repeated save -> load cycles without numeric drift", () => {
    let markup = serializeArtboard(parseCanonicalSvg(MATRIX_SVG));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      markup = serializeArtboard(parseCanonicalSvg(markup));
    }
    expect(markup).toContain(`transform="${COMPOSED_MATRIX}"`);
    expect(markup).toContain(`transform="${ROTATION_MATRIX}"`);
  });

  it("normalises a primitive-only matrix onto the collapsed layer", () => {
    const svg = MATRIX_SVG.replace(` transform="${FLIP_MATRIX}"`, "");
    expect(shapeTransformOf(svg)).toBe("matrix(1 0 0 1 12.5 -8.25)");
  });

  it("leaves a group-only transform byte-identical", () => {
    // No primitive transform to fold, so the string must not be re-encoded —
    // that is what keeps the backend composer's `rotate(...)` output stable.
    const svg = MATRIX_SVG.replace(` transform="${COMMA_MATRIX}"`, "");
    expect(shapeTransformOf(svg)).toBe(FLIP_MATRIX);
  });

  it("declines to collapse rather than half-resolve an unsupported transform", () => {
    // `ref(svg, x, y)` is not resolvable to a matrix. Dropping it would move the
    // shape; composing around it would move it differently. Neither is allowed,
    // so the group stays a group and both strings survive on their own nodes.
    const svg = MATRIX_SVG.replace(COMMA_MATRIX, "ref(svg, 10, 20)");
    const shapes = parseCanonicalSvg(svg).layers.find((layer) => layer.role === "shapes");

    expect(shapes?.kind).toBe("group");
    expect(shapes?.transform).toBe(FLIP_MATRIX);
    if (shapes?.kind === "group") {
      expect(shapes.children[0]?.transform).toBe("ref(svg, 10, 20)");
    }

    const serialized = serializeArtboard(parseCanonicalSvg(svg));
    expect(serialized).toContain(`transform="${FLIP_MATRIX}"`);
    expect(serialized).toContain('transform="ref(svg, 10, 20)"');
  });

  it("reads back through the renderer's own matrix parser to the same numbers", () => {
    // Round-tripping the *string* is necessary but not sufficient: the engine
    // reads these attributes through `parseSvgTransform`, so assert that the
    // persisted string still decodes to the matrix that was committed.
    const decoded = parseSvgTransform(
      shapeTransformOf(serializeArtboard(parseCanonicalSvg(MATRIX_SVG))) ?? "",
    );

    expect(decoded.unsupported).toEqual([]);
    expect(decoded.matrix.a).toBe(-1.5);
    expect(decoded.matrix.b).toBe(0);
    expect(decoded.matrix.c).toBe(0);
    expect(decoded.matrix.d).toBe(2.25);
    expect(decoded.matrix.e).toBe(-18.8125);
    expect(decoded.matrix.f).toBe(461.4375);

    // Re-encoding is the identity, so a commit that follows a load starts from
    // exactly the persisted matrix.
    expect(toSvgTransform(decoded.matrix)).toBe(COMPOSED_MATRIX);
  });

  it("keeps a sub-pixel translation that a rounded serializer would erase", () => {
    // 0.0625px is the smallest step the sub-pixel fidelity suite exercises at 4x
    // zoom. If persistence rounded to whole pixels, a micro-nudge would be
    // silently discarded the moment the document was saved.
    const microMatrix = "matrix(1 0 0 1 0.0625 -0.0625)";
    const svg = MATRIX_SVG.replace(FLIP_MATRIX, microMatrix).replace(
      ` transform="${COMMA_MATRIX}"`,
      "",
    );
    const serialized = serializeArtboard(parseCanonicalSvg(svg));
    expect(serialized).toContain(`transform="${microMatrix}"`);

    const decoded = parseSvgTransform(shapeTransformOf(serialized) ?? "");
    expect(decoded.matrix.e).toBe(0.0625);
    expect(decoded.matrix.f).toBe(-0.0625);
  });
});

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}
