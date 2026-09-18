/**
 * Canonical_SVG parse / serialize (round-trip, never flatten).
 *
 * Pure functions that convert between the backend's Canonical_SVG markup
 * (`<g data-role>` groups defined in AGENTS.md) and the structured Artboard
 * Document_Model. The browser `DOMParser` / `XMLSerializer` are used (tests run
 * under jsdom), matching the approach already relied on in `useDesignStudio.ts`.
 *
 * Design contract (design.md → "SVG parse / serialize strategy"):
 *  - Validate the root is `<svg data-printrocket>`; throw `CanonicalSvgError` on
 *    parse failure or a non-canonical root so callers keep the current model.
 *  - Preserve root attributes and `<defs>` verbatim.
 *  - Preserve nested `<g>` groups as `GroupLayer.children` — never flatten.
 *  - Synthesize a unique `role-N` id when `data-layer-id` is absent (logged).
 *  - Snap every emitted editable coordinate to a 0.001px authoring grid, and
 *    apply the 0.5px print grid at export instead (Req 5.6). See `snap`.
 *  - Always emit text as `<text>`; never path-trace (Req 6.8).
 *  - Serialize non-editable layers (background/logo/print-marks) verbatim from
 *    their preserved raw fragment for byte-stable fidelity.
 *
 * One responsibility per file: this module only parses and serializes
 * Canonical_SVG. It performs no React/state work and has no hidden global state.
 */

import {
  LOCKED_ROLES,
  type Artboard,
  type DataRole,
  type DocumentLayer,
  type GroupLayer,
  type ImageLayer,
  type ShapeGeometry,
  type ShapeLayer,
  type TextLayer,
} from "./types/documentModel";
import {
  gradientIdForFill,
  gradientVector,
  parseGradientFill,
} from "./gradientFill";
import type { PrintMeta } from "../types";
import { buildParametricPath } from "./geometry/GeometryEngine";
import { multiply, parseSvgTransform, toSvgTransform } from "./renderer/matrix2d";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Typed error thrown when SVG cannot be parsed as Canonical_SVG. */
export class CanonicalSvgError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CanonicalSvgError";
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const ALL_ROLES: ReadonlySet<DataRole> = new Set<DataRole>([
  "background",
  "shapes",
  "image-slots",
  "body",
  "cta",
  "headline",
  "logo",
  "print-marks",
]);

const ROLE_DEFAULT_NAME: Readonly<Record<DataRole, string>> = {
  background: "Background",
  shapes: "Shapes",
  "image-slots": "Image Slots",
  body: "Body",
  cta: "CTA",
  headline: "Headline",
  logo: "Logo",
  "print-marks": "Print Marks",
};

const SHAPE_TAGS: ReadonlySet<string> = new Set([
  "rect",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
  "path",
]);

const DEFAULT_PRINT_META: PrintMeta = { bleed: 0, cmykSafe: false, trimMarks: false };

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse Canonical_SVG markup into an `Artboard`. Throws `CanonicalSvgError` when
 * the markup cannot be parsed or its root is not `<svg data-printrocket>`.
 */
export function parseCanonicalSvg(svg: string): Artboard {
  if (typeof svg !== "string" || svg.trim().length === 0) {
    throw new CanonicalSvgError("Cannot parse empty SVG markup.");
  }

  let root: SVGSVGElement;
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svg, "image/svg+xml");

    const parserError = parsed.getElementsByTagName("parsererror")[0];
    if (parserError || parsed.documentElement.nodeName === "parsererror") {
      throw new CanonicalSvgError(
        `SVG markup is not well-formed: ${parserError?.textContent?.trim() ?? "unknown parse error"}`,
      );
    }

    const documentElement = parsed.documentElement;
    if (documentElement.tagName.toLowerCase() !== "svg") {
      throw new CanonicalSvgError("Root element is not an <svg> element.");
    }
    root = documentElement as unknown as SVGSVGElement;
  } catch (parseError) {
    if (parseError instanceof CanonicalSvgError) {
      throw parseError;
    }
    throw new CanonicalSvgError("Failed to parse SVG markup.", { cause: parseError });
  }

  if (!root.hasAttribute("data-printrocket")) {
    throw new CanonicalSvgError('Root <svg> is missing the required data-printrocket attribute.');
  }

  const serializer = new XMLSerializer();

  // Root attributes are preserved verbatim except width/height (kept as numeric
  // Artboard fields) and namespace declarations (always re-emitted on serialize).
  const rootAttributes: Record<string, string> = {};
  for (const attributeName of root.getAttributeNames()) {
    if (attributeName === "width" || attributeName === "height") {
      continue;
    }
    if (attributeName === "xmlns" || attributeName.startsWith("xmlns:")) {
      continue;
    }
    if (!isSafeRootAttribute(attributeName)) {
      // An imported document is untrusted. Only the attribute VALUE was escaped
      // on serialize, never the name, so an `onload="…"` on the root survived the
      // round trip into `composedSVG` and into every export. Dropped and logged.
      logFallback(`dropped unsafe root attribute "${attributeName}" from the imported document`);
      continue;
    }
    rootAttributes[attributeName] = root.getAttribute(attributeName) ?? "";
  }

  const { width, height } = readArtboardDimensions(root);

  // Capture <defs> verbatim (preserves embedded font CSS / gradients).
  let defs = "";
  for (const child of Array.from(root.children)) {
    if (child.tagName.toLowerCase() === "defs") {
      defs = serializer.serializeToString(child);
      break;
    }
  }

  const layers: DocumentLayer[] = [];
  let groupIndex = 0;
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "defs") {
      continue;
    }
    if (tag !== "g") {
      // Backend Canonical_SVG only contains <defs> and <g data-role> groups at
      // the top level. Anything else is non-canonical; log and skip rather than
      // silently dropping (AGENTS.md: no silent fallbacks).
      logFallback(`Skipping non-canonical top-level <${tag}> element.`);
      continue;
    }
    layers.push(parseTopLevelGroup(child as SVGGElement, groupIndex, serializer));
    groupIndex += 1;
  }

  return {
    id: "artboard-1",
    width,
    height,
    printMeta: DEFAULT_PRINT_META,
    layers,
    defs,
    rootAttributes,
  };
}

function readArtboardDimensions(root: SVGSVGElement): { width: number; height: number } {
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return {
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
  };
}

function parseTopLevelGroup(group: SVGGElement, index: number, serializer: XMLSerializer): DocumentLayer {
  const roleAttribute = group.getAttribute("data-role");
  const role = resolveRole(roleAttribute, index);

  let id = group.getAttribute("data-layer-id");
  if (!id) {
    id = `${role}-${index}`;
    logFallback(
      `Top-level <g data-role="${role}"> has no data-layer-id; synthesized id "${id}" from role and document position.`,
    );
  }

  const editable = group.getAttribute("data-editable") === "true";
  const pointerEvents = group.getAttribute("pointer-events");
  const locked = !editable || pointerEvents === "none" || LOCKED_ROLES.has(role);
  const visible = isVisible(group);
  const opacity = parseOpacityAttribute(group.getAttribute("opacity"));
  const name = group.getAttribute("data-name") ?? ROLE_DEFAULT_NAME[role];
  const filter = readFilterFromStyle(group.getAttribute("style"));
  const blendMode = readBlendModeFromStyle(group.getAttribute("style"));

  const base = {
    id,
    role,
    name,
    editable,
    locked,
    visible,
    opacity,
    ...(filter ? { filter } : {}),
    ...(blendMode ? { blendMode } : {}),
  } as const;
  const transform = group.getAttribute("transform");
  const topLevelBase = transform ? { ...base, transform } : base;

  // Non-editable layers (background, logo, print-marks, …) are preserved
  // verbatim for byte-stable fidelity and to honor the canonical schema exactly.
  if (!editable) {
    return {
      ...topLevelBase,
      kind: "group",
      children: [],
      raw: serializeSafeRaw(group, serializer),
    };
  }

  const elements = Array.from(group.children);

  // Single primitive child → a typed Shape/Text/Image layer.
  if (elements.length === 1 && elements[0].tagName.toLowerCase() !== "g") {
    // The collapse folds `<g transform=G><rect transform=E/></g>` into one
    // layer, so the layer's single `transform` slot has to carry BOTH. Passing
    // `topLevelBase` straight through kept only G and silently discarded E,
    // which moved the shape on the first save. SVG applies the outer group
    // first, so the effective matrix is G · E.
    const collapsedBase = composeCollapsedTransform(topLevelBase, elements[0].getAttribute("transform"));
    if (collapsedBase !== null) {
      const primitive = parsePrimitiveLayer(elements[0], collapsedBase, serializer);
      if (primitive) {
        return primitive;
      }
    }
    // else: a transform we cannot represent as a single matrix. Fall through to
    // the GroupLayer branch, which keeps both transform strings verbatim on
    // their own nodes rather than guessing at a composition.
  }

  // Empty group, multiple children, or nested groups → a GroupLayer whose
  // children preserve document order and nesting (never flattened, Req 10.9).
  const children = elements.map((element, childIndex) =>
    parseChildElement(element, role, editable, childIndex, serializer),
  );
  return { ...topLevelBase, kind: "group", children };
}

/**
 * Fold an outer group transform and an inner primitive transform into the single
 * `transform` slot a collapsed layer has. Returns `null` when either string
 * contains a function this codebase cannot resolve to a matrix, so the caller
 * can decline to collapse instead of persisting a partial composition.
 */
function composeCollapsedTransform<T extends object>(
  groupBase: T,
  primitiveTransform: string | null,
): T | null {
  if (primitiveTransform === null || primitiveTransform.trim() === "") {
    return groupBase;
  }

  const inner = parseSvgTransform(primitiveTransform);
  if (inner.unsupported.length > 0) {
    logFallback(
      `Not collapsing a single-child group: element transform uses ${inner.unsupported.join(", ")}.`,
    );
    return null;
  }

  const groupTransform = (groupBase as { readonly transform?: string }).transform;
  if (groupTransform === undefined || groupTransform.trim() === "") {
    return { ...groupBase, transform: toSvgTransform(inner.matrix) };
  }

  const outer = parseSvgTransform(groupTransform);
  if (outer.unsupported.length > 0) {
    logFallback(
      `Not collapsing a single-child group: group transform uses ${outer.unsupported.join(", ")}.`,
    );
    return null;
  }

  // SVG applies the outer group transform first, so world = G · E · point.
  return { ...groupBase, transform: toSvgTransform(multiply(outer.matrix, inner.matrix)) };
}

function parseChildElement(
  element: Element,
  parentRole: DataRole,
  parentEditable: boolean,
  index: number,
  serializer: XMLSerializer,
): DocumentLayer {
  const id =
    element.getAttribute("data-layer-id") ??
    element.getAttribute("data-element-id") ??
    `${parentRole}-child-${index}`;
  const visible = isVisible(element);
  const opacity = parseOpacityAttribute(element.getAttribute("opacity"));
  const locked = !parentEditable || element.getAttribute("pointer-events") === "none";
  const transform = element.getAttribute("transform");
  const filter = readFilterFromStyle(element.getAttribute("style"));
  const blendMode = readBlendModeFromStyle(element.getAttribute("style"));
  const base = {
    id,
    role: parentRole,
    name: element.getAttribute("data-name") ?? ROLE_DEFAULT_NAME[parentRole],
    editable: parentEditable,
    locked,
    visible,
    opacity,
    ...(transform ? { transform } : {}),
    ...(filter ? { filter } : {}),
    ...(blendMode ? { blendMode } : {}),
  } as const;

  if (element.tagName.toLowerCase() === "g") {
    const children = Array.from(element.children).map((child, childIndex) =>
      parseChildElement(child, parentRole, parentEditable, childIndex, serializer),
    );
    return { ...base, kind: "group", children };
  }


  const primitive = parsePrimitiveLayer(element, base, serializer);
  if (primitive) {
    return primitive;
  }

  // Unknown element kind → preserve verbatim so nothing is lost or flattened.
  logFallback(`Preserving unsupported <${element.tagName.toLowerCase()}> element verbatim.`);
  return { ...base, kind: "group", children: [], raw: serializeSafeRaw(element, serializer) };
}

function parsePrimitiveLayer(
  element: Element,
  base: Omit<ShapeLayer, "kind" | "field" | "geometry"> & { raw?: string },
  serializer: XMLSerializer,
): DocumentLayer | null {
  const tag = element.tagName.toLowerCase();

  if (tag === "text") {
    return parseTextLayer(element, base);
  }
  if (tag === "image") {
    return parseImageLayer(element, base);
  }
  if (SHAPE_TAGS.has(tag)) {
    return parseShapeLayer(element, base, serializer);
  }
  return null;
}

function parseTextLayer(element: Element, base: BaseFields): TextLayer {
  const fontSize = readNumber(element, "font-size", 16);
  
  let content = "";
  const tspans = Array.from(element.querySelectorAll("tspan"));
  if (tspans.length > 0) {
    content = tspans.map(tspan => tspan.textContent ?? "").join("\n");
  } else if (element.innerHTML) {
    content = element.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  } else {
    content = element.textContent ?? "";
  }

  return {
    ...base,
    kind: "text",
    elementId: element.getAttribute("data-element-id") ?? "",
    field: element.getAttribute("data-field") ?? "",
    content,
    x: readNumber(element, "x", 0),
    y: readNumber(element, "y", 0),
    fontFamily: element.getAttribute("font-family") ?? "",
    fontSize,
    fontWeight: element.getAttribute("font-weight") === "bold" ? "bold" : "normal",
    fontStyle: element.getAttribute("font-style") === "italic" ? "italic" : "normal",
    textDecoration: parseTextDecoration(element.getAttribute("text-decoration")),
    textAlign: textAnchorToAlign(element.getAttribute("text-anchor")),
    lineHeight: readOptionalNumber(element, "data-line-height"),
    letterSpacing: readOptionalNumber(element, "letter-spacing"),
    wordSpacing: readOptionalNumber(element, "word-spacing"),
    baselineShift: readOptionalNumber(element, "baseline-shift"),
    textTransform: parseTextTransform(element.getAttribute("text-transform")),
    direction: parseTextDirection(element.getAttribute("direction")),
    writingMode: parseWritingMode(element.getAttribute("writing-mode")),
    fill: element.getAttribute("data-fill") ?? element.getAttribute("fill") ?? "#000000",
  };
}

function parseImageLayer(element: Element, base: BaseFields): ImageLayer {
  const href =
    element.getAttribute("href") ??
    element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
    element.getAttribute("xlink:href") ??
    "";
  const layer = {
    ...base,
    kind: "image" as const,
    href,
    field: element.getAttribute("data-field") ?? undefined,
    elementId: element.getAttribute("data-element-id") ?? undefined,
    x: readNumber(element, "x", 0),
    y: readNumber(element, "y", 0),
    width: readNumber(element, "width", 0),
    height: readNumber(element, "height", 0),
    ...(element.getAttribute("data-clip-path-id")
      ? { clipPathId: element.getAttribute("data-clip-path-id") ?? undefined }
      : {}),
  };

  const dataFill = element.getAttribute("data-fill");
  if (dataFill) {
    (layer as any).fill = dataFill;
  }

  return layer;
}

function parseShapeLayer(element: Element, base: BaseFields, _serializer: XMLSerializer): ShapeLayer {
  const tag = element.tagName.toLowerCase();
  const geometry = parseGeometry(element, tag);
  const kind = geometry.type === "parametric" ? "path" : geometry.type;

  const shape: ShapeLayer = {
    ...base,
    kind,
    field: element.getAttribute("data-field") ?? "",
    geometry,
  };

  const elementId = element.getAttribute("data-element-id");
  if (elementId) {
    shape.elementId = elementId;
  }
  const fill = element.getAttribute("data-fill") ?? element.getAttribute("fill");
  if (fill !== null) {
    shape.fill = fill;
  }
  const stroke = element.getAttribute("data-stroke") ?? element.getAttribute("stroke");
  if (stroke !== null) {
    shape.stroke = stroke;
  }
  const strokeWidth = element.getAttribute("stroke-width");
  if (strokeWidth !== null) {
    const parsed = Number.parseFloat(strokeWidth);
    if (Number.isFinite(parsed)) {
      shape.strokeWidth = parsed;
    }
  }
  return shape;
}

function parseGeometry(element: Element, tag: string): ShapeGeometry {
  switch (tag) {
    case "rect": {
      const rx = element.getAttribute("rx");
      const geometry: ShapeGeometry = {
        type: "rect",
        x: readNumber(element, "x", 0),
        y: readNumber(element, "y", 0),
        width: readNumber(element, "width", 0),
        height: readNumber(element, "height", 0),
      };
      if (rx !== null) {
        const parsedRx = Number.parseFloat(rx);
        if (Number.isFinite(parsedRx)) {
          geometry.rx = parsedRx;
        }
      }
      return geometry;
    }
    case "circle": {
      const r = readNumber(element, "r", 0);
      return { type: "ellipse", cx: readNumber(element, "cx", 0), cy: readNumber(element, "cy", 0), rx: r, ry: r };
    }
    case "ellipse":
      return {
        type: "ellipse",
        cx: readNumber(element, "cx", 0),
        cy: readNumber(element, "cy", 0),
        rx: readNumber(element, "rx", 0),
        ry: readNumber(element, "ry", 0),
      };
    case "line":
      return {
        type: "line",
        x1: readNumber(element, "x1", 0),
        y1: readNumber(element, "y1", 0),
        x2: readNumber(element, "x2", 0),
        y2: readNumber(element, "y2", 0),
      };
    case "polygon":
    case "polyline":
      return { type: "polygon", points: parsePoints(element.getAttribute("points")) };
    case "path":
    default: {
      const shapeType = element.getAttribute("data-shape-type");
      const shapeBounds = element.getAttribute("data-shape-bounds");
      const shapeGeometry = element.getAttribute("data-shape-geometry");
      
      if (shapeType && shapeBounds && shapeGeometry) {
        try {
          const bounds = JSON.parse(shapeBounds);
          const parameters = JSON.parse(shapeGeometry);
          return {
            type: "parametric",
            shapeType,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            parameters
          };
        } catch (e) {
          logFallback(`Failed to parse parametric geometry data for layer.`);
        }
      }
      return { type: "path", d: element.getAttribute("d") ?? "" };
    }
  }
}

type BaseFields = {
  id: string;
  role: DataRole;
  name: string;
  editable: boolean;
  locked: boolean;
  visible: boolean;
  opacity: number;
  transform?: string;
  raw?: string;
};

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize an `Artboard` back into Canonical_SVG markup. The output is
 * normalized through `DOMParser`/`XMLSerializer` so that
 * `parse → serialize → parse` is structurally (and byte-) stable.
 */
export function serializeArtboard(artboard: Artboard): string {
  try {
    const rootAttributeMarkup = buildRootAttributeMarkup(artboard);
    const layerMarkup = artboard.layers.map((layer) => serializeTopLevelLayer(layer)).join("\n");
    const serializedDefs = serializeDefsWithImageMasks(artboard);
    const defsMarkup = serializedDefs ? `${serializedDefs}\n` : "";
    const svgMarkup = `<svg ${rootAttributeMarkup}>\n${defsMarkup}${layerMarkup}\n</svg>`;

    // Normalize and validate the result so output is deterministic/idempotent.
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
    const parserError = parsed.getElementsByTagName("parsererror")[0];
    if (parserError || parsed.documentElement.nodeName === "parsererror") {
      throw new CanonicalSvgError(
        `Serialized SVG is not well-formed: ${parserError?.textContent?.trim() ?? "unknown error"}`,
      );
    }
    return new XMLSerializer().serializeToString(parsed.documentElement);
  } catch (serializeError) {
    if (serializeError instanceof CanonicalSvgError) {
      throw serializeError;
    }
    throw new CanonicalSvgError("Failed to serialize Artboard to Canonical_SVG.", { cause: serializeError });
  }
}

function serializeDefsWithImageMasks(artboard: Artboard): string {
  const maskSources = collectReferencedMaskSources(artboard.layers);
  const gradientFills = collectGradientFills(artboard.layers);
  if (!artboard.defs && maskSources.length === 0 && gradientFills.length === 0) {
    return "";
  }

  const parser = new DOMParser();
  const wrapped = `<svg xmlns="${SVG_NS}">${artboard.defs || "<defs></defs>"}</svg>`;
  const parsed = parser.parseFromString(wrapped, "image/svg+xml");
  const parserError = parsed.getElementsByTagName("parsererror")[0];
  if (parserError || parsed.documentElement.nodeName === "parsererror") {
    throw new CanonicalSvgError(
      `Stored SVG definitions are not well-formed: ${parserError?.textContent?.trim() ?? "unknown error"}`,
    );
  }

  let defs = Array.from(parsed.documentElement.children).find(
    (child) => child.tagName.toLowerCase() === "defs",
  );
  if (!defs) {
    defs = parsed.createElementNS(SVG_NS, "defs");
    parsed.documentElement.insertBefore(defs, parsed.documentElement.firstChild);
  }

  Array.from(defs.querySelectorAll('[data-printrocket-generated="clip-path"]')).forEach((element) => {
    element.remove();
  });
  Array.from(defs.querySelectorAll('[data-printrocket-generated="gradient"]')).forEach((element) => {
    element.remove();
  });

  for (const mask of maskSources) {
    const clipPath = parsed.createElementNS(SVG_NS, "clipPath");
    clipPath.setAttribute("id", clipPathElementId(mask.id));
    clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
    clipPath.setAttribute("data-printrocket-generated", "clip-path");
    clipPath.setAttribute("data-source-layer-id", mask.id);
    clipPath.appendChild(createClipShapeElement(parsed, mask));
    defs.appendChild(clipPath);
  }

  for (const fill of gradientFills) {
    const gradient = parseGradientFill(fill);
    if (!gradient) {
      continue;
    }
    const vector = gradientVector(gradient.angle);
    const gradientElement = parsed.createElementNS(SVG_NS, "linearGradient");
    gradientElement.setAttribute("id", gradientIdForFill(fill));
    gradientElement.setAttribute("x1", vector.x1);
    gradientElement.setAttribute("y1", vector.y1);
    gradientElement.setAttribute("x2", vector.x2);
    gradientElement.setAttribute("y2", vector.y2);
    gradientElement.setAttribute("data-printrocket-generated", "gradient");
    gradientElement.setAttribute("data-fill", fill);
    for (const stop of gradient.stops) {
      const stopElement = parsed.createElementNS(SVG_NS, "stop");
      stopElement.setAttribute("offset", `${stop.offset}%`);
      stopElement.setAttribute("stop-color", stop.color);
      gradientElement.appendChild(stopElement);
    }
    defs.appendChild(gradientElement);
  }

  return new XMLSerializer().serializeToString(defs);
}

function collectGradientFills(layers: readonly DocumentLayer[]): string[] {
  const fills = new Set<string>();
  walkDocumentLayers(layers, (layer) => {
    if (layer.kind === "text") {
      if (parseGradientFill(layer.fill)) {
        fills.add(layer.fill);
      }
      return;
    }
    if (layer.kind === "group" || layer.kind === "image") {
      return;
    }
    if (layer.fill && parseGradientFill(layer.fill)) {
      fills.add(layer.fill);
    }
    if (layer.stroke && parseGradientFill(layer.stroke)) {
      fills.add(layer.stroke);
    }
  });
  return [...fills];
}

function collectReferencedMaskSources(layers: readonly DocumentLayer[]): ShapeLayer[] {
  const layersById = new Map<string, DocumentLayer>();
  const referencedIds: string[] = [];
  const seenReferences = new Set<string>();

  walkDocumentLayers(layers, (layer) => {
    layersById.set(layer.id, layer);
    if (layer.kind === "image" && layer.clipPathId && !seenReferences.has(layer.clipPathId)) {
      referencedIds.push(layer.clipPathId);
      seenReferences.add(layer.clipPathId);
    }
  });

  const sources: ShapeLayer[] = [];
  for (const id of referencedIds) {
    const source = layersById.get(id);
    if (source && source.kind !== "group" && source.kind !== "text" && source.kind !== "image" && source.kind !== "line") {
      sources.push(source);
    } else {
      logFallback(`Image mask source "${id}" is missing or is not a clip-compatible shape.`);
    }
  }
  return sources;
}

function walkDocumentLayers(
  layers: readonly DocumentLayer[],
  visit: (layer: DocumentLayer) => void,
): void {
  for (const layer of layers) {
    visit(layer);
    if (layer.kind === "group") {
      walkDocumentLayers(layer.children, visit);
    }
  }
}

function createClipShapeElement(documentNode: Document, layer: ShapeLayer): SVGElement {
  const geometry = layer.geometry;
  let element: SVGElement;

  switch (geometry.type) {
    case "rect": {
      element = documentNode.createElementNS(SVG_NS, "rect");
      element.setAttribute("x", formatNumber(snap(geometry.x)));
      element.setAttribute("y", formatNumber(snap(geometry.y)));
      element.setAttribute("width", formatNumber(snap(geometry.width)));
      element.setAttribute("height", formatNumber(snap(geometry.height)));
      if (geometry.rx !== undefined) {
        element.setAttribute("rx", formatNumber(snap(geometry.rx)));
      }
      break;
    }
    case "ellipse":
      element = documentNode.createElementNS(SVG_NS, "ellipse");
      element.setAttribute("cx", formatNumber(snap(geometry.cx)));
      element.setAttribute("cy", formatNumber(snap(geometry.cy)));
      element.setAttribute("rx", formatNumber(snap(geometry.rx)));
      element.setAttribute("ry", formatNumber(snap(geometry.ry)));
      break;
    case "polygon":
      element = documentNode.createElementNS(SVG_NS, "polygon");
      element.setAttribute(
        "points",
        geometry.points
          .map(([x, y]) => `${formatNumber(snap(x))},${formatNumber(snap(y))}`)
          .join(" "),
      );
      break;
    case "path":
      element = documentNode.createElementNS(SVG_NS, "path");
      element.setAttribute("d", geometry.d);
      break;
    case "line":
    default:
      throw new CanonicalSvgError(`Layer "${layer.id}" cannot be used as an image mask.`);
  }

  if (layer.transform) {
    element.setAttribute("transform", layer.transform);
  }
  return element;
}

function clipPathElementId(layerId: string): string {
  const encoded = Array.from(layerId)
    .map((character) => character.codePointAt(0)?.toString(16) ?? "0")
    .join("-");
  return `printrocket-clip-${encoded}`;
}

function buildRootAttributeMarkup(artboard: Artboard): string {
  const parts: string[] = [`xmlns="${SVG_NS}"`];
  parts.push(`width="${formatNumber(artboard.width)}"`);
  parts.push(`height="${formatNumber(artboard.height)}"`);
  for (const [key, value] of Object.entries(artboard.rootAttributes)) {
    if (key === "width" || key === "height" || key === "xmlns" || key.startsWith("xmlns:")) {
      continue;
    }
    parts.push(`${key}="${escapeAttribute(value)}"`);
  }
  return parts.join(" ");
}

function serializeTopLevelLayer(layer: DocumentLayer): string {
  if (layer.raw != null) {
    return layer.raw;
  }
  const attributes = topLevelGroupAttributes(layer);
  const inner = serializePayload(layer);
  return inner ? `<g ${attributes}>\n${inner}\n</g>` : `<g ${attributes}></g>`;
}

function serializePayload(layer: DocumentLayer): string {
  switch (layer.kind) {
    case "group":
      return layer.children.map((child) => serializeChildLayer(child)).join("\n");
    case "text":
      return serializeTextElement(layer, true);
    case "image":
      return serializeImageElement(layer, true);
    default:
      return serializeShapeElement(layer as any, true);
  }
}

function serializeChildLayer(layer: DocumentLayer): string {
  if (layer.raw != null) {
    return layer.raw;
  }
  if (layer.kind === "group") {
    const attributes = childGroupAttributes(layer);
    const inner = layer.children.map((child) => serializeChildLayer(child)).join("\n");
    const attributeMarkup = attributes ? ` ${attributes}` : "";
    return inner ? `<g${attributeMarkup}>\n${inner}\n</g>` : `<g${attributeMarkup}></g>`;
  }
  if (layer.kind === "text") {
    return serializeTextElement(layer, false);
  }
  if (layer.kind === "image") {
    return serializeImageElement(layer, false);
  }
  return serializeShapeElement(layer as any, false);
}

function buildEffectStackFilterString(stack: import("./types/documentModel").EffectNode[]): string {
  const activeEffects = stack.filter(e => e.enabled);
  if (activeEffects.length === 0) return "";
  
  const filterParts = activeEffects.map(effect => {
    switch (effect.type) {
      case "blur":
        return `blur(${effect.params.radius ?? 5}px)`;
      case "drop-shadow":
        return `drop-shadow(${effect.params.dx ?? 2}px ${effect.params.dy ?? 2}px ${effect.params.stdDeviation ?? 3}px ${effect.params.color ?? '#000000'})`;
      case "brightness":
        return `brightness(${effect.params.amount ?? 1.2})`;
      case "contrast":
        return `contrast(${effect.params.amount ?? 1.2})`;
      case "saturate":
        return `saturate(${effect.params.amount ?? 1.5})`;
      case "grayscale":
        return `grayscale(${effect.params.amount ?? 1})`;
      case "sepia":
        return `sepia(${effect.params.amount ?? 1})`;
      case "hue-rotate":
        return `hue-rotate(${effect.params.angle ?? 90}deg)`;
      case "invert":
        return `invert(${effect.params.amount ?? 1})`;
      default:
        return "";
    }
  }).filter(bool => bool);
  
  return filterParts.join(" ");
}

function topLevelGroupAttributes(layer: DocumentLayer): string {
  const parts: string[] = [
    `data-role="${escapeAttribute(layer.role)}"`,
    `data-editable="${layer.editable ? "true" : "false"}"`,
    `data-layer-id="${escapeAttribute(layer.id)}"`,
  ];
  if (layer.name !== ROLE_DEFAULT_NAME[layer.role]) {
    parts.push(`data-name="${escapeAttribute(layer.name)}"`);
  }
  if (!layer.visible) {
    parts.push(`display="none"`);
  }
  if (layer.opacity !== 100) {
    parts.push(`opacity="${formatOpacity(layer.opacity)}"`);
  }
  if (layer.editable && layer.locked) {
    parts.push(`pointer-events="none"`);
  }
  const styles: string[] = [];
  
  let combinedFilter = layer.filter || "";
  if (layer.effectStack && layer.effectStack.length > 0) {
    const generatedFilter = buildEffectStackFilterString(layer.effectStack);
    if (generatedFilter) {
      combinedFilter = combinedFilter ? `${combinedFilter} ${generatedFilter}` : generatedFilter;
    }
  }
  
  if (combinedFilter) styles.push(`filter: ${escapeAttribute(combinedFilter.trim())}`);
  if (layer.blendMode) styles.push(`mix-blend-mode: ${escapeAttribute(layer.blendMode)}`);
  
  if (styles.length > 0) {
    parts.push(`style="${styles.join("; ")}"`);
  }
  if (hasTransform(layer)) {
    parts.push(`transform="${escapeAttribute((layer as any).transform)}"`);
  }
  return parts.join(" ");
}

function childGroupAttributes(layer: import("./types/documentModel").GroupLayer): string {
  const parts: string[] = [`data-layer-id="${escapeAttribute(layer.id)}"`];
  if (layer.name !== ROLE_DEFAULT_NAME[layer.role]) {
    parts.push(`data-name="${escapeAttribute(layer.name)}"`);
  }
  if (!layer.visible) {
    parts.push(`display="none"`);
  }
  if (layer.opacity !== 100) {
    parts.push(`opacity="${formatOpacity(layer.opacity)}"`);
  }
  const styles: string[] = [];
  
  let combinedFilter = layer.filter || "";
  if (layer.effectStack && layer.effectStack.length > 0) {
    const generatedFilter = buildEffectStackFilterString(layer.effectStack);
    if (generatedFilter) {
      combinedFilter = combinedFilter ? `${combinedFilter} ${generatedFilter}` : generatedFilter;
    }
  }
  
  if (combinedFilter) styles.push(`filter: ${escapeAttribute(combinedFilter.trim())}`);
  if (layer.blendMode) styles.push(`mix-blend-mode: ${escapeAttribute(layer.blendMode)}`);
  
  if (styles.length > 0) {
    parts.push(`style="${styles.join("; ")}"`);
  }
  if (hasTransform(layer)) {
    parts.push(`transform="${escapeAttribute((layer as any).transform)}"`);
  }
  return parts.join(" ");
}

/**
 * Whether a layer has a transform worth writing.
 *
 * This was `'transform' in layer`, which is true for `{ transform: undefined }` —
 * and `escapeAttribute(undefined)` throws, which made `serializeArtboard` throw,
 * which unmounted the whole editor. Undoing the rotation of a previously
 * untransformed shape produced exactly that object: `rotateLayerCommand` restores
 * its `prev` snapshot by spreading `transform: snap.transform`, and for a shape that
 * had no transform to begin with `snap.transform` is `undefined`. The editor went
 * blank on Ctrl+Z after a rotate.
 *
 * An absent transform and an `undefined` transform are the same fact, and both
 * serialize to no attribute, so there was never a distinction to preserve. An empty
 * string is excluded too: `transform=""` is meaningless and is not byte-stable.
 */
function hasTransform(layer: unknown): boolean {
  if (typeof layer !== "object" || layer === null) {
    return false;
  }
  const transform = (layer as { transform?: unknown }).transform;
  return typeof transform === "string" && transform.trim() !== "";
}

function serializeTextElement(layer: TextLayer, wrapped: boolean): string {
  const parts: string[] = [];
  if (!wrapped) {
    parts.push(`data-layer-id="${escapeAttribute(layer.id)}"`);
  }
  if (layer.field) {
    parts.push(`data-field="${escapeAttribute(layer.field)}"`);
  }
  if (layer.elementId) {
    parts.push(`data-element-id="${escapeAttribute(layer.elementId)}"`);
  }
  parts.push(`x="${formatNumber(snap(layer.x))}"`);
  parts.push(`y="${formatNumber(snap(layer.y))}"`);
  if (layer.fontFamily) {
    parts.push(`font-family="${escapeAttribute(layer.fontFamily)}"`);
  }
  parts.push(`font-size="${formatNumber(layer.fontSize)}"`);
  if (layer.fontWeight === "bold") {
    parts.push(`font-weight="bold"`);
  }
  if (layer.fontStyle === "italic") {
    parts.push(`font-style="italic"`);
  }
  if (layer.textDecoration && layer.textDecoration !== "none") {
    parts.push(`text-decoration="${escapeAttribute(layer.textDecoration)}"`);
  }
  const anchor = alignToTextAnchor(layer.textAlign);
  if (anchor) {
    parts.push(`text-anchor="${anchor}"`);
  }
  parts.push(...serializePaintAttribute("fill", layer.fill));
  if (!wrapped && (layer as any).transform) {
    parts.push(`transform="${escapeAttribute((layer as any).transform)}"`);
  }

  const styles: string[] = [];
  if (layer.filter) styles.push(`filter: ${escapeAttribute(layer.filter)}`);
  if (layer.blendMode) styles.push(`mix-blend-mode: ${escapeAttribute(layer.blendMode)}`);
  if (styles.length > 0) {
    parts.push(`style="${styles.join("; ")}"`);
  }

  if (layer.lineHeight !== undefined) {
    parts.push(`data-line-height="${formatNumber(layer.lineHeight)}"`);
  }
  if (layer.letterSpacing !== undefined) {
    parts.push(`letter-spacing="${formatNumber(layer.letterSpacing)}"`);
  }
  if (layer.wordSpacing !== undefined) {
    parts.push(`word-spacing="${formatNumber(layer.wordSpacing)}"`);
  }
  if (layer.baselineShift !== undefined) {
    parts.push(`baseline-shift="${formatNumber(layer.baselineShift)}"`);
  }
  if (layer.textTransform) {
    parts.push(`text-transform="${escapeAttribute(layer.textTransform)}"`);
  }
  if (layer.direction) {
    parts.push(`direction="${escapeAttribute(layer.direction)}"`);
  }
  if (layer.writingMode) {
    parts.push(`writing-mode="${escapeAttribute(layer.writingMode)}"`);
  }

  // Always emit as <text> — never path-traced (Req 6.8).
  let textContent = "";
  if (layer.content.includes("\n")) {
    const lines = layer.content.split("\n");
    textContent = lines.map((line, index) => {
      const escaped = escapeText(line);
      if (index === 0) return `<tspan x="${formatNumber(snap(layer.x))}">${escaped}</tspan>`;
      const dy = layer.lineHeight !== undefined ? formatNumber(layer.lineHeight) : "1.2em";
      return `<tspan x="${formatNumber(snap(layer.x))}" dy="${dy}">${escaped}</tspan>`;
    }).join("");
  } else {
    textContent = escapeText(layer.content);
  }
  return `<text ${parts.join(" ")}>${textContent}</text>`;
}

function serializeImageElement(layer: ImageLayer, wrapped: boolean): string {
  const parts: string[] = [
    `data-layer-id="${escapeAttribute(layer.id)}"`
  ];
  if (layer.field) {
    parts.push(`data-field="${escapeAttribute(layer.field)}"`);
  }
  if ((layer as any).fill) {
    parts.push(`data-fill="${escapeAttribute((layer as any).fill)}"`);
  }
  if (layer.elementId) {
    parts.push(`data-element-id="${escapeAttribute(layer.elementId)}"`);
  }
  parts.push(`href="${escapeAttribute(layer.href)}"`);
  parts.push(`x="${formatNumber(snap(layer.x))}"`);
  parts.push(`y="${formatNumber(snap(layer.y))}"`);
  parts.push(`width="${formatNumber(snap(layer.width))}"`);
  parts.push(`height="${formatNumber(snap(layer.height))}"`);
  if (layer.clipPathId) {
    parts.push(`data-clip-path-id="${escapeAttribute(layer.clipPathId)}"`);
    parts.push(`clip-path="url(#${clipPathElementId(layer.clipPathId)})"`);
  }
  if (!wrapped && (layer as any).transform) {
    parts.push(`transform="${escapeAttribute((layer as any).transform)}"`);
  }

  const styles: string[] = [];
  if (layer.filter) styles.push(`filter: ${escapeAttribute(layer.filter)}`);
  if (layer.blendMode) styles.push(`mix-blend-mode: ${escapeAttribute(layer.blendMode)}`);
  if (styles.length > 0) {
    parts.push(`style="${styles.join("; ")}"`);
  }

  return `<image ${parts.join(" ")}/>`;
}

function serializeShapeElement(layer: ShapeLayer, wrapped: boolean): string {
  // `wrapped` means an enclosing <g> already carries this layer's identity and
  // transform. Repeating them here applied the transform TWICE — a rotated layer's
  // rotation doubled on every save, so one commit sent the shape off at 2x the
  // angle — and made data-layer-id ambiguous in the DOM, which broke every lookup
  // that walks up from a click target.
  const attributes: string[] = [];
  if (!wrapped) {
    attributes.push(`data-layer-id="${escapeAttribute(layer.id)}"`);
  }
  if (layer.field) {
    attributes.push(`data-field="${escapeAttribute(layer.field)}"`);
  }
  if (layer.elementId) {
    attributes.push(`data-element-id="${escapeAttribute(layer.elementId)}"`);
  }

  const geometry = layer.geometry;
  let tag: string;
  switch (geometry.type) {
    case "rect":
      tag = "rect";
      attributes.push(`x="${formatNumber(snap(geometry.x))}"`);
      attributes.push(`y="${formatNumber(snap(geometry.y))}"`);
      attributes.push(`width="${formatNumber(snap(geometry.width))}"`);
      attributes.push(`height="${formatNumber(snap(geometry.height))}"`);
      if (geometry.rx !== undefined) {
        attributes.push(`rx="${formatNumber(snap(geometry.rx))}"`);
      }
      break;
    case "ellipse":
      tag = "ellipse";
      attributes.push(`cx="${formatNumber(snap(geometry.cx))}"`);
      attributes.push(`cy="${formatNumber(snap(geometry.cy))}"`);
      attributes.push(`rx="${formatNumber(snap(geometry.rx))}"`);
      attributes.push(`ry="${formatNumber(snap(geometry.ry))}"`);
      break;
    case "line":
      tag = "line";
      attributes.push(`x1="${formatNumber(snap(geometry.x1))}"`);
      attributes.push(`y1="${formatNumber(snap(geometry.y1))}"`);
      attributes.push(`x2="${formatNumber(snap(geometry.x2))}"`);
      attributes.push(`y2="${formatNumber(snap(geometry.y2))}"`);
      break;
    case "polygon":
      tag = "polygon";
      attributes.push(
        `points="${geometry.points
          .map(([x, y]) => `${formatNumber(snap(x))},${formatNumber(snap(y))}`)
          .join(" ")}"`,
      );
      break;
    case "parametric":
      tag = "path";
      attributes.push(`data-shape-type="${escapeAttribute(geometry.shapeType)}"`);
      attributes.push(`data-shape-bounds="${escapeAttribute(JSON.stringify({ x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }))}"`);
      attributes.push(`data-shape-geometry="${escapeAttribute(JSON.stringify(geometry.parameters))}"`);
      attributes.push(`d="${escapeAttribute(buildParametricPath(geometry.shapeType, geometry, geometry.parameters))}"`);
      break;
    case "path":
    default:
      tag = "path";
      attributes.push(`d="${escapeAttribute(geometry.d)}"`);
      break;
  }

  if (layer.fill !== undefined) {
    attributes.push(...serializePaintAttribute("fill", layer.fill));
  }
  if (!wrapped && (layer as any).transform) {
    attributes.push(`transform="${escapeAttribute((layer as any).transform)}"`);
  }
  if (layer.stroke !== undefined) {
    attributes.push(...serializePaintAttribute("stroke", layer.stroke));
  }
  if (layer.strokeWidth !== undefined) {
    attributes.push(`stroke-width="${formatNumber(layer.strokeWidth)}"`);
  }

  const styles: string[] = [];
  if (layer.filter) styles.push(`filter: ${escapeAttribute(layer.filter)}`);
  if (layer.blendMode) styles.push(`mix-blend-mode: ${escapeAttribute(layer.blendMode)}`);
  if (styles.length > 0) {
    attributes.push(`style="${styles.join("; ")}"`);
  }

  return `<${tag} ${attributes.join(" ")}/>`;
}

function serializePaintAttribute(name: "fill" | "stroke", value: string): string[] {
  if (!parseGradientFill(value)) {
    return [`${name}="${escapeAttribute(value)}"`];
  }
  return [
    `data-${name}="${escapeAttribute(value)}"`,
    `${name}="url(#${gradientIdForFill(value)})"`,
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRole(roleAttribute: string | null, index: number): DataRole {
  if (roleAttribute && ALL_ROLES.has(roleAttribute as DataRole)) {
    return roleAttribute as DataRole;
  }
  logFallback(
    `Top-level group at position ${index} has unknown data-role "${roleAttribute ?? ""}"; defaulting to "shapes".`,
  );
  return "shapes";
}

function isVisible(element: Element): boolean {
  return element.getAttribute("display") !== "none" && element.getAttribute("visibility") !== "hidden";
}

/** Extract the CSS `filter` value from an element's `style` attribute (Req 9.6). */
function readFilterFromStyle(style: string | null): string | null {
  if (!style) {
    return null;
  }
  const match = style.match(/filter:\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

/** Extract the CSS `mix-blend-mode` value from an element's `style` attribute. */
function readBlendModeFromStyle(style: string | null): string | null {
  if (!style) {
    return null;
  }
  const match = style.match(/mix-blend-mode:\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

function parseTextDecoration(value: string | null): TextLayer["textDecoration"] {
  if (value === "underline" || value === "line-through") {
    return value;
  }
  return "none";
}

function parseOpacityAttribute(value: string | null): number {
  if (value === null) {
    return 100;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  // SVG opacity is a 0..1 fraction; the model stores an integer 0..100 percent.
  const percent = Math.round(parsed * 100);
  return Math.max(0, Math.min(100, percent));
}

function readNumber(element: Element, attribute: string, fallback: number): number {
  const value = element.getAttribute(attribute);
  if (value === null) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalNumber(element: Element, attribute: string): number | undefined {
  const value = element.getAttribute(attribute);
  if (value === null) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTextTransform(value: string | null): "none" | "capitalize" | "uppercase" | "lowercase" | undefined {
  if (value === "none" || value === "capitalize" || value === "uppercase" || value === "lowercase") {
    return value;
  }
  return undefined;
}

function parseTextDirection(value: string | null): "ltr" | "rtl" | undefined {
  if (value === "ltr" || value === "rtl") {
    return value;
  }
  return undefined;
}

function parseWritingMode(value: string | null): "horizontal-tb" | "vertical-rl" | "vertical-lr" | undefined {
  if (value === "horizontal-tb" || value === "vertical-rl" || value === "vertical-lr") {
    return value;
  }
  return undefined;
}

function parsePoints(value: string | null): Array<[number, number]> {
  if (!value) {
    return [];
  }
  const numbers = (value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number).filter(Number.isFinite);
  const points: Array<[number, number]> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push([numbers[i], numbers[i + 1]]);
  }
  return points;
}

function textAnchorToAlign(anchor: string | null): "left" | "center" | "right" {
  if (anchor === "middle") {
    return "center";
  }
  if (anchor === "end") {
    return "right";
  }
  return "left";
}

function alignToTextAnchor(align: "left" | "center" | "right"): string | null {
  if (align === "center") {
    return "middle";
  }
  if (align === "right") {
    return "end";
  }
  return null;
}

/**
 * Quantise an authoring coordinate.
 *
 * This used to snap to the 0.5px grid on every serialize, citing AGENTS.md's
 * print-sharpness rule. That rule is real, but the grid was being applied in the
 * wrong place: `serializeArtboard` runs on every document round trip, so a 0.2px
 * drag quantised to zero and the canvas could not respond to fine movement at
 * all. At zoom 8 a single screen pixel is 0.125 document px — entirely below the
 * old grid — so precision work was impossible by construction.
 *
 * The grid's stated purpose is print sharpness, which only matters at export, so
 * it moved there: `snapToPrintGrid` is what the print path uses. Authoring keeps
 * `AUTHORING_PRECISION`, fine enough to resolve one screen pixel at the maximum
 * zoom of 64x (1/64 = 0.0156) with room to spare, and coarse enough that
 * floating-point noise never reaches the markup.
 */
const AUTHORING_PRECISION = 1000; // three decimal places

function snap(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * AUTHORING_PRECISION) / AUTHORING_PRECISION;
}

/**
 * Snap to the nearest 0.5px increment for print output (Req 5.6, AGENTS.md
 * print-sharpness). Applied by the export path, not by authoring.
 */
export function snapToPrintGrid(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 2) / 2;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  // Three decimals, matching AUTHORING_PRECISION. One decimal quantised a 0.05px
  // move to nothing, so fine dragging produced no visible change no matter how
  // precise the input device was. Trailing zeros are trimmed so the markup does
  // not grow for whole or half values.
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatOpacity(opacityPercent: number): string {
  const fraction = Math.max(0, Math.min(100, opacityPercent)) / 100;
  return String(fraction);
}

/**
 * Serialize an element that will be carried through the document verbatim, with
 * active content stripped.
 *
 * `raw` layers exist so nothing in an imported document is lost — background
 * art, logos, print marks, elements we do not model. But `raw` is re-emitted
 * unchanged by the serializer, so anything left in it lands in `composedSVG` and
 * in every export. The in-editor preview is sanitized by DOMPurify; the exported
 * artifact is not, so the strip has to happen here, at the point of capture.
 *
 * The element is cloned first: reading the document must not mutate it.
 */
function serializeSafeRaw(element: Element, serializer: XMLSerializer): string {
  const clone = element.cloneNode(true) as Element;
  const removed: string[] = [];

  const scrub = (node: Element): void => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase();
      if (ACTIVE_CONTENT_TAGS.has(tag)) {
        removed.push(`<${tag}>`);
        child.remove();
        continue;
      }
      scrub(child);
    }
    for (const name of [...node.getAttributeNames()]) {
      const lower = name.toLowerCase();
      const isEventHandler = lower.startsWith("on");
      const isUnsafeUrl =
        (lower === "href" || lower === "xlink:href" || lower === "src")
        && isUnsafeUrlValue(node.getAttribute(name) ?? "");
      if (isEventHandler || isUnsafeUrl) {
        removed.push(name);
        node.removeAttribute(name);
      }
    }
  };

  const rootTag = clone.tagName.toLowerCase();
  if (ACTIVE_CONTENT_TAGS.has(rootTag)) {
    logFallback(`Refused to preserve an active <${rootTag}> element from the document.`);
    return "";
  }
  scrub(clone);
  if (removed.length > 0) {
    logFallback(
      `Stripped active content from preserved markup before storing it: ${removed.join(", ")}.`,
    );
  }
  return serializer.serializeToString(clone);
}

/** Elements that can execute code or embed an arbitrary document. */
const ACTIVE_CONTENT_TAGS: ReadonlySet<string> = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "handler",
  "set",
  "animate",
  "animatetransform",
  "animatemotion",
]);

/** True for URL values that can execute, or that we refuse to carry. */
function isUnsafeUrlValue(value: string): boolean {
  // Whitespace and control characters are stripped first: `java\nscript:` is a
  // classic bypass that browsers tolerate.
  const normalized = value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
  return (
    normalized.startsWith("javascript:")
    || normalized.startsWith("vbscript:")
    || normalized.startsWith("data:text/html")
    || normalized.startsWith("data:image/svg+xml")
  );
}

/**
 * Whether a root `<svg>` attribute may be carried through a document round trip.
 *
 * Allow-list, not deny-list. The serializer escapes attribute *values* but emits
 * the *name* verbatim, so any name that can execute script or fetch a remote
 * resource has to be rejected at import rather than filtered on the way out.
 * `data-*` covers everything the Canonical_SVG actually uses
 * (`data-printrocket`, `data-version`, `data-mode`), and `viewBox` plus the
 * presentation attributes below are the only non-`data-` names we emit.
 */
const SAFE_ROOT_ATTRIBUTES: ReadonlySet<string> = new Set([
  "viewbox",
  "preserveaspectratio",
  "version",
  "baseprofile",
  "role",
  "aria-label",
  "fill",
  "stroke",
  "color",
  "overflow",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
  "color-interpolation-filters",
]);

export function isSafeRootAttribute(attributeName: string): boolean {
  const name = attributeName.toLowerCase();
  // `on*` is the obvious script vector; `xlink:*`, `href` and `style` on the root
  // are rejected because none of them are ours and all three can reach out.
  if (name.startsWith("on")) {
    return false;
  }
  if (name.startsWith("data-")) {
    // A `data-` name cannot be an event handler or a URL reference, but it must
    // still be a legal attribute name or serialization produces broken markup.
    return /^data-[a-z0-9-]+$/.test(name);
  }
  return SAFE_ROOT_ATTRIBUTES.has(name);
}

function escapeAttribute(value: string): string {  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function logFallback(reason: string): void {
  // AGENTS.md: no silent fallbacks — every fallback is logged with its reason.
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[canonicalSvg] ${reason}`);
  }
}
