// wasm_smoke_test.mjs — headless verification that the WASM engine renders.
//
// Loads the real compiled module in Node, uploads a scene through the binary
// wire format, renders, and reads pixels back. This proves the whole browser
// path end to end without needing a browser: bindings, scene decode, traversal,
// Skia rasterisation and pixel readback.
//
// It also builds the scene buffer with the same layout the TypeScript encoder
// uses, so a codec divergence between the two sides fails here.
//
// Usage (from the repo root, inside WSL):
//   node engine/tests/wasm_smoke_test.mjs
//   PYDEE_ENGINE_DIR=/path/to/artifacts node engine/tests/wasm_smoke_test.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = process.env.PYDEE_ENGINE_DIR ?? path.join(here, "..", "artifacts");
const modulePath = path.join(artifactDir, "pydee-engine.mjs");

let checks = 0;
let failures = 0;

function check(condition, description) {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${description}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${description}`);
  }
}

function checkNear(actual, expected, tolerance, description) {
  check(Math.abs(actual - expected) <= tolerance,
    `${description} (expected ~${expected}, got ${actual})`);
}

// --- binary scene encoder, matching engine/include/pydee/scene_codec.h -------

const SCENE_MAGIC = 0x53445950;
const SCENE_VERSION = 3;
const NO_PARENT = 0xffffffff;
const KIND_RECT = 0;
const KIND_ELLIPSE = 1;
const KIND_GROUP = 3;
const KIND_TEXT = 4;
const FLAG_ISOLATE = 1 << 0;
const FLAG_HAS_BOUNDS = 1 << 1;
const TEXT_STYLE_BOLD = 1 << 0;
const TEXT_STYLE_ITALIC = 1 << 1;

class SceneWriter {
  constructor() {
    this.bytes = [];
  }

  u8(value) {
    this.bytes.push(value & 0xff);
  }

  u16(value) {
    this.u8(value);
    this.u8(value >>> 8);
  }

  u32(value) {
    this.u8(value);
    this.u8(value >>> 8);
    this.u8(value >>> 16);
    this.u8(value >>> 24);
  }

  f64(value) {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setFloat64(0, value, true);
    for (let i = 0; i < 8; i += 1) {
      this.u8(buffer.getUint8(i));
    }
  }

  str(value) {
    for (const byte of new TextEncoder().encode(value)) {
      this.u8(byte);
    }
  }

  header(width, height, nodeCount) {
    this.u32(SCENE_MAGIC);
    this.u32(SCENE_VERSION);
    this.f64(width);
    this.f64(height);
    this.u32(nodeCount);
  }

  node(parent, kind, flags, opacity, matrix, bounds, id) {
    this.u32(parent);
    this.u8(kind);
    this.u8(0); // blend mode: normal
    this.u8(flags);
    this.u8(0); // reserved
    this.f64(opacity);
    for (const component of matrix) {
      this.f64(component);
    }
    if ((flags & FLAG_HAS_BOUNDS) !== 0) {
      for (const component of bounds) {
        this.f64(component);
      }
    }
    this.u16(id.length);
    this.str(id);
  }

  solidPaint(argb) {
    this.u8(1);
    this.u32(argb);
  }

  noStroke() {
    this.u8(0);
    this.u32(0);
    this.f64(0);
  }

  /** A `url(#id)` paint. The engine resolves it against the parsed defs. */
  referencePaint(id) {
    this.u8(4);
    this.u32(0);
    const encoded = new TextEncoder().encode(id);
    this.u16(encoded.length);
    for (const byte of encoded) {
      this.u8(byte);
    }
  }

  toUint8Array() {
    // Must be a typed array, not a string: embind UTF-8 encodes strings, which
    // would corrupt every byte >= 0x80.
    return new Uint8Array(this.bytes);
  }
}

const IDENTITY = [1, 0, 0, 1, 0, 0];
const RED = 0xffff0000;
const BLACK = 0xff000000;
const WHITE = 0xffffffff;

function rgbaAt(pixels, width, x, y) {
  const offset = (y * width + x) * 4;
  return {
    r: pixels[offset],
    g: pixels[offset + 1],
    b: pixels[offset + 2],
    a: pixels[offset + 3],
  };
}

async function main() {
  console.log("\n=== Pydee WASM engine smoke test ===\n");

  const wasmBinary = await readFile(path.join(artifactDir, "pydee-engine.wasm"));
  const { default: createPydeeEngine } = await import(pathToFileURL(modulePath).href);

  const engine = await createPydeeEngine({ wasmBinary });
  check(typeof engine.PydeeSurface === "function", "module exposes PydeeSurface");
  check(engine.sceneFormatVersion() === SCENE_VERSION,
    `engine scene format version is ${SCENE_VERSION}`);

  const size = 100;
  const surface = new engine.PydeeSurface(size, size);
  check(surface.isValid(), "surface allocated");
  check(surface.width() === size && surface.height() === size, "surface dimensions match");

  // --- a solid rect renders ------------------------------------------------
  const single = new SceneWriter();
  single.header(size, size, 1);
  single.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [20, 20, 60, 60], "r1");
  single.f64(20);
  single.f64(20);
  single.f64(60);
  single.f64(60);
  single.f64(0);
  single.solidPaint(RED);
  single.noStroke();

  const loadError = surface.loadScene(single.toUint8Array());
  check(loadError === "", `scene loaded without error (got "${loadError}")`);

  const drawn = surface.render(...IDENTITY, 1, WHITE, true);
  check(drawn === 1, "one node drawn");

  let pixels = surface.readPixels();
  check(pixels !== null && pixels.length === size * size * 4, "pixels read back");

  const inside = rgbaAt(pixels, size, 50, 50);
  check(inside.r === 255 && inside.g === 0 && inside.b === 0, "rect interior is red");
  const outside = rgbaAt(pixels, size, 5, 5);
  check(outside.r === 255 && outside.g === 255 && outside.b === 255, "background is white");

  // --- hit testing uses real geometry -------------------------------------
  check(surface.hitTest(50, 50) === "r1", "hit test finds the rect");
  check(surface.hitTest(5, 5) === "", "hit test misses empty space");

  // --- the hot path moves a node without re-uploading the scene -----------
  check(surface.setNodeTransform("r1", 1, 0, 0, 1, -20, -20), "setNodeTransform accepted");
  check(!surface.setNodeTransform("does-not-exist", 1, 0, 0, 1, 0, 0),
    "setNodeTransform reports an unknown id");

  surface.render(...IDENTITY, 1, WHITE, true);
  pixels = surface.readPixels();
  const moved = rgbaAt(pixels, size, 30, 30);
  check(moved.r === 255 && moved.g === 0, "node moved to the translated position");
  check(surface.hitTest(30, 30) === "r1", "hit test follows the new transform");

  // --- group isolation composites once ------------------------------------
  const group = new SceneWriter();
  group.header(size, size, 3);
  group.node(NO_PARENT, KIND_GROUP, FLAG_ISOLATE, 0.5, IDENTITY, null, "g");

  group.node(0, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [10, 40, 50, 20], "a");
  group.f64(10);
  group.f64(40);
  group.f64(50);
  group.f64(20);
  group.f64(0);
  group.solidPaint(BLACK);
  group.noStroke();

  group.node(0, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [40, 40, 50, 20], "b");
  group.f64(40);
  group.f64(40);
  group.f64(50);
  group.f64(20);
  group.f64(0);
  group.solidPaint(BLACK);
  group.noStroke();

  check(surface.loadScene(group.toUint8Array()) === "", "group scene loaded");
  surface.render(...IDENTITY, 1, WHITE, true);
  check(surface.lastLayersOpened() === 1, "one isolated layer opened");
  pixels = surface.readPixels();

  // Correct isolation gives ~128 across the whole group. Applying the group's
  // alpha per child would darken the overlap to ~64.
  checkNear(rgbaAt(pixels, size, 20, 50).r, 128, 2, "first rect at 50% group alpha");
  checkNear(rgbaAt(pixels, size, 80, 50).r, 128, 2, "second rect at 50% group alpha");
  checkNear(rgbaAt(pixels, size, 50, 50).r, 128, 2, "overlap composites once, not twice");

  // --- selection geometry comes from the engine, not from the DOM ----------
  //
  // The whole point of these bindings: the editor asks the renderer where an
  // object is instead of measuring it. A nested scaled group is the case a
  // "divide by zoom" conversion in TypeScript gets wrong, so it is the case
  // checked here.
  const geometry = new SceneWriter();
  geometry.header(size, size, 5);

  // 0: group with translate(100, 50) scale(2)
  geometry.node(NO_PARENT, KIND_GROUP, 0, 1, [2, 0, 0, 2, 100, 50], null, "g");

  // 1: rect inside it, itself translated by (10, 5) in the GROUP's units
  geometry.node(0, KIND_RECT, FLAG_HAS_BOUNDS, 1, [1, 0, 0, 1, 10, 5], [0, 0, 20, 10], "r");
  geometry.f64(0);
  geometry.f64(0);
  geometry.f64(20);
  geometry.f64(10);
  geometry.f64(0);
  geometry.solidPaint(RED);
  geometry.noStroke();

  // 2: a quarter-turn rotated rect at the root
  geometry.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, [0, 1, -1, 0, 0, 0], [0, 0, 20, 10],
    "rot");
  geometry.f64(0);
  geometry.f64(0);
  geometry.f64(20);
  geometry.f64(10);
  geometry.f64(0);
  geometry.solidPaint(RED);
  geometry.noStroke();

  // 3: no local bounds at all
  geometry.node(NO_PARENT, KIND_RECT, 0, 1, IDENTITY, null, "nobounds");
  geometry.f64(0);
  geometry.f64(0);
  geometry.f64(20);
  geometry.f64(10);
  geometry.f64(0);
  geometry.solidPaint(RED);
  geometry.noStroke();

  // 4: collapsed to a line by a zero x scale
  geometry.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, [0, 0, 0, 1, 0, 0], [0, 0, 20, 10],
    "collapsed");
  geometry.f64(0);
  geometry.f64(0);
  geometry.f64(20);
  geometry.f64(10);
  geometry.f64(0);
  geometry.solidPaint(RED);
  geometry.noStroke();

  check(surface.loadScene(geometry.toUint8Array()) === "", "geometry scene loaded");

  const world = surface.getWorldTransform("r");
  check(world !== null, "getWorldTransform returns a matrix for a nested node");
  if (world !== null) {
    checkNear(world.a, 2, 1e-12, "nested world scale x includes the group");
    checkNear(world.d, 2, 1e-12, "nested world scale y includes the group");
    // 10 * 2 + 100: the group's scale applies to the child's own translation too.
    checkNear(world.e, 120, 1e-12, "nested world translation is scaled by the ancestor");
    checkNear(world.f, 60, 1e-12, "nested world translation y is scaled by the ancestor");
  }
  check(surface.getWorldTransform("ghost") === null, "getWorldTransform reports an unknown id");

  const corners = surface.getWorldCorners("r");
  check(corners.ok === true, "getWorldCorners succeeds for a nested node");
  if (corners.ok === true) {
    checkNear(corners.corners[0].x, 120, 1e-12, "corner 0 x");
    checkNear(corners.corners[0].y, 60, 1e-12, "corner 0 y");
    checkNear(corners.corners[2].x, 160, 1e-12, "corner 2 x");
    checkNear(corners.corners[2].y, 80, 1e-12, "corner 2 y");
  }

  const obb = surface.getOrientedBounds("rot");
  check(obb.ok === true, "getOrientedBounds succeeds for a rotated node");
  if (obb.ok === true) {
    checkNear(obb.angle, 90, 1e-9, "the derived angle matches the rotation");
    check(obb.flipped === false, "a rotation is not reported as a flip");
    checkNear(obb.topRight.x, 0, 1e-9, "rotated top-right x");
    checkNear(obb.topRight.y, 20, 1e-9, "rotated top-right y");
    // Handles are interpolated from the corners, so they rotate for free.
    checkNear(obb.handles.n.x, 0, 1e-9, "north handle x follows the rotation");
    checkNear(obb.handles.n.y, 10, 1e-9, "north handle y follows the rotation");
    checkNear(obb.localBounds.width, 20, 1e-12, "local bounds are returned unchanged");
  }

  check(surface.getOrientedBounds("nobounds").reason === "bounds-unavailable",
    "a node with no bounds is reported, not guessed");
  check(surface.getOrientedBounds("collapsed").reason === "singular-transform",
    "a collapsed node is reported, not drawn");
  check(surface.getOrientedBounds("ghost").reason === "node-not-found",
    "an unknown id is reported");

  const multi = surface.getAxisAlignedBounds(["r", "rot", "ghost"]);
  check(multi.ok === true, "a multi-selection resolves to an axis-aligned rect");
  if (multi.ok === true) {
    checkNear(multi.rect.x, -10, 1e-9, "multi-selection min x spans both nodes");
    checkNear(multi.rect.y, 0, 1e-9, "multi-selection min y spans both nodes");
    checkNear(multi.rect.width, 170, 1e-9, "multi-selection width spans both nodes");
    checkNear(multi.rect.height, 80, 1e-9, "multi-selection height spans both nodes");
    check(multi.failed.length === 1 && multi.failed[0] === "ghost",
      "ids with no geometry are reported rather than dropped");
  }

  // World (-20, 30) is local (30, 20) through the 90 degree rotation, so the
  // south-east drag must resize along the object's own axes.
  const resized = surface.resizeLocalBounds("rot", "se", -20, 30, false, false);
  check(resized !== null, "resizeLocalBounds returns a rect");
  if (resized !== null) {
    checkNear(resized.x, 0, 1e-9, "resize keeps the anchored local x");
    checkNear(resized.y, 0, 1e-9, "resize keeps the anchored local y");
    checkNear(resized.width, 30, 1e-9, "resize width is measured in local space");
    checkNear(resized.height, 20, 1e-9, "resize height is measured in local space");
  }
  check(surface.resizeLocalBounds("rot", "north", 0, 0, false, false) === null,
    "an unknown handle name is rejected");
  check(surface.resizeLocalBounds("collapsed", "se", 0, 0, false, false) === null,
    "resizing a collapsed node is refused");

  // --- malformed input is rejected, not partially applied -----------------
  const badVersion = new SceneWriter();
  badVersion.u32(SCENE_MAGIC);
  badVersion.u32(999);
  badVersion.f64(size);
  badVersion.f64(size);
  badVersion.u32(0);
  const versionError = surface.loadScene(badVersion.toUint8Array());
  check(versionError !== "", `unsupported version rejected ("${versionError}")`);

  const truncated = new SceneWriter();
  truncated.header(size, size, 1);
  check(surface.loadScene(truncated.toUint8Array()) !== "", "truncated buffer rejected");

  // An ellipse to confirm a second geometry kind crosses the boundary.
  const ellipse = new SceneWriter();
  ellipse.header(size, size, 1);
  ellipse.node(NO_PARENT, KIND_ELLIPSE, FLAG_HAS_BOUNDS, 1, IDENTITY, [10, 25, 80, 50], "e1");
  ellipse.f64(50);
  ellipse.f64(50);
  ellipse.f64(40);
  ellipse.f64(25);
  ellipse.solidPaint(RED);
  ellipse.noStroke();
  check(surface.loadScene(ellipse.toUint8Array()) === "", "ellipse scene loaded");
  surface.render(...IDENTITY, 1, WHITE, true);
  pixels = surface.readPixels();
  check(rgbaAt(pixels, size, 50, 50).r === 255, "ellipse centre filled");
  check(rgbaAt(pixels, size, 2, 2).g === 255, "ellipse corner untouched");
  check(surface.hitTest(50, 50) === "e1", "ellipse hit test hits the centre");
  check(surface.hitTest(12, 27) === "", "ellipse hit test rejects a bounding-box corner");

  surface.delete();

  // --- text: fonts must be supplied explicitly ------------------------------
  const textSurface = new engine.PydeeSurface(size, size);

  const textScene = () => {
    const writer = new SceneWriter();
    writer.header(size, size, 1);
    writer.node(NO_PARENT, KIND_TEXT, FLAG_HAS_BOUNDS, 1, IDENTITY, [0, 20, 90, 45], "t1");
    writer.f64(5); // x
    writer.f64(60); // y (baseline)
    writer.f64(40); // font size
    writer.f64(0); // letter spacing
    writer.f64(0); // line height
    writer.u8(0); // style flags
    writer.u8(0); // align left
    writer.u16(8);
    writer.str("TestSans");
    writer.u32(4);
    writer.str("HHHH");
    writer.solidPaint(BLACK);
    return writer.toUint8Array();
  };

  check(textSurface.fontCount() === 0, "a new surface has no fonts registered");
  check(!textSurface.hasFont("TestSans"), "an unregistered family is reported missing");
  check(textSurface.measureText("TestSans", "Hi", 24, false, false, 0, 0) === null,
    "measuring without a font returns nothing rather than a guess");

  check(textSurface.loadScene(textScene()) === "", "text scene loaded");
  textSurface.render(...IDENTITY, 1, WHITE, true);
  check(textSurface.lastUnresolvedText() === 1,
    "text with no registered font is reported as unresolved");

  let textPixels = textSurface.readPixels();
  let anyDark = false;
  for (let offset = 0; offset < textPixels.length; offset += 4) {
    if (textPixels[offset] < 200) {
      anyDark = true;
      break;
    }
  }
  check(!anyDark, "nothing is painted with a substituted font");

  // Register a real font and draw again.
  const fontPath = path.join(
    process.env.SKIA_DIR ?? path.join(process.env.HOME ?? "", "dev/skia"),
    "resources/fonts/Roboto-Regular.ttf",
  );
  let fontBytes = null;
  try {
    fontBytes = await readFile(fontPath);
  } catch {
    console.warn(`  note  test font not found at ${fontPath}; skipping the rendered-text cases`);
  }

  if (fontBytes !== null) {
    check(textSurface.registerFont("TestSans", new Uint8Array(fontBytes)),
      "a real font binary is accepted");
    check(textSurface.hasFont("TestSans"), "the family is now registered");
    check(textSurface.fontCount() === 1, "one font family registered");
    check(!textSurface.registerFont("Junk", new Uint8Array([1, 2, 3, 4])),
      "junk font data is rejected");

    const metrics = textSurface.measureText("TestSans", "Hi", 24, false, false, 0, 0);
    check(metrics !== null, "shaped metrics are returned once a font exists");
    if (metrics !== null) {
      check(metrics.width > 0 && metrics.height > 0, "metrics have positive extents");
      check(metrics.firstLineAscent > 0, "metrics report a first-line ascent");
      check(metrics.lineCount === 1, "single-line content reports one line");

      const wider = textSurface.measureText("TestSans", "Hello world", 24, false, false, 0, 0);
      check(wider.width > metrics.width, "longer content measures wider");
      const bigger = textSurface.measureText("TestSans", "Hi", 48, false, false, 0, 0);
      check(bigger.width > metrics.width, "larger font size measures wider");
    }

    textSurface.loadScene(textScene());
    textSurface.render(...IDENTITY, 1, WHITE, true);
    check(textSurface.lastUnresolvedText() === 0, "text now resolves a font");

    textPixels = textSurface.readPixels();
    const darkestInRow = (row) => {
      let darkest = 255;
      for (let x = 0; x < size; x += 1) {
        darkest = Math.min(darkest, rgbaAt(textPixels, size, x, row).r);
      }
      return darkest;
    };
    // Glyphs sit above the baseline at y = 60.
    check(darkestInRow(45) < 128, "glyphs are painted above the baseline");
    check(darkestInRow(90) === 255, "nothing is painted well below the baseline");
    check(darkestInRow(2) === 255, "nothing is painted above the cap height");
  }

  textSurface.delete();

  // --- paint servers parsed in C++, resolved by reference -------------------
  const gradientSurface = new engine.PydeeSurface(size, size);
  if (!gradientSurface.isValid()) {
    check(false, "gradient surface allocated");
  } else {
    const defs =
      "<defs><linearGradient id='ramp' x1='0%' y1='0%' x2='100%' y2='0%'>" +
      "<stop offset='0' stop-color='#ff0000'/>" +
      "<stop offset='1' stop-color='rgb(0,0,255)'/></linearGradient>" +
      "<pattern id='unsupported'><rect width='2' height='2'/></pattern></defs>";

    check(gradientSurface.loadDefs(defs, size, size) === "", "defs markup parsed");
    check(gradientSurface.paintServerCount() === 1, "one gradient parsed from the defs");
    check(gradientSurface.unsupportedPaintServers() === 1,
      "the pattern is reported, not silently ignored");

    const gradientScene = () => {
      const writer = new SceneWriter();
      writer.header(size, size, 1);
      writer.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [0, 0, size, size], "g1");
      writer.f64(0);
      writer.f64(0);
      writer.f64(size);
      writer.f64(size);
      writer.f64(0);
      writer.referencePaint("ramp");
      writer.noStroke();
      return writer.toUint8Array();
    };

    check(gradientSurface.loadScene(gradientScene()) === "", "gradient scene loaded");
    check(gradientSurface.unresolvedPaintReferences() === 0,
      "the url(#ramp) reference resolved");
    gradientSurface.render(...IDENTITY, 1, WHITE, true);
    check(gradientSurface.lastUnresolvedPaints() === 0, "no paint was left unresolved");
    check(gradientSurface.lastApproximatedPaints() === 0, "no paint needed approximating");

    const gradientPixels = gradientSurface.readPixels();
    const left = rgbaAt(gradientPixels, size, 2, 50);
    const right = rgbaAt(gradientPixels, size, 97, 50);
    const middle = rgbaAt(gradientPixels, size, 50, 50);
    // Asserted as an ordering, so the check does not depend on which colour
    // space Skia interpolates in.
    check(left.r > 200 && left.b < 60, "the ramp starts at the first stop");
    check(right.b > 200 && right.r < 60, "the ramp ends at the last stop");
    check(middle.r > 40 && middle.r < 220, "the ramp blends in between");

    // An id with no defs entry must be counted, never guessed at.
    const missing = new SceneWriter();
    missing.header(size, size, 1);
    missing.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [0, 0, size, size], "g2");
    missing.f64(0);
    missing.f64(0);
    missing.f64(size);
    missing.f64(size);
    missing.f64(0);
    missing.referencePaint("does-not-exist");
    missing.noStroke();
    check(gradientSurface.loadScene(missing.toUint8Array()) === "",
      "a scene with an unresolvable paint still loads");
    check(gradientSurface.unresolvedPaintReferences() === 1,
      "the missing paint server is reported");
    gradientSurface.render(...IDENTITY, 1, WHITE, true);
    const blank = rgbaAt(gradientSurface.readPixels(), size, 50, 50);
    check(blank.r === 255 && blank.g === 255 && blank.b === 255,
      "nothing is painted for an unresolvable paint server");
  }

  gradientSurface.delete();

  // --- document-space drag resolves the ancestor transform chain ------------
  // A node inside a scaled, translated group. Dragging it by a document-space
  // offset must move it by exactly that offset on screen; applying the offset to
  // the local transform directly would move it by offset x groupScale.
  const dragSurface = new engine.PydeeSurface(size, size);
  if (!dragSurface.isValid()) {
    check(false, "drag surface allocated");
  } else {
    const GROUP_SCALE = 2;
    const dragScene = () => {
      const writer = new SceneWriter();
      writer.header(size, size, 2);
      // Group: scale(2) with no translation.
      writer.node(NO_PARENT, KIND_GROUP, 0, 1, [GROUP_SCALE, 0, 0, GROUP_SCALE, 0, 0], [], "grp");
      // Child rect at group-local (5,5) size 10x10 -> document (10,10) size 20x20.
      writer.node(0, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [5, 5, 10, 10], "kid");
      writer.f64(5);
      writer.f64(5);
      writer.f64(10);
      writer.f64(10);
      writer.f64(0);
      writer.solidPaint(RED);
      writer.noStroke();
      return writer.toUint8Array();
    };

    check(dragSurface.loadScene(dragScene()) === "", "nested drag scene loaded");
    check(dragSurface.nodeCount() === 2, "both nodes are indexed for dragging");

    dragSurface.render(...IDENTITY, 1, WHITE, true);
    let pixels = dragSurface.readPixels();
    check(rgbaAt(pixels, size, 15, 15).r > 200, "the child starts inside the scaled group");
    check(rgbaAt(pixels, size, 55, 15).r === 255, "and is not yet at the drag destination");

    // Drag 40 document px right. In the group's space that is 20 units.
    check(dragSurface.setNodeDocumentTranslation("kid", 40, 0),
      "the document-space translation is accepted");
    dragSurface.render(...IDENTITY, 1, WHITE, true);
    pixels = dragSurface.readPixels();
    check(rgbaAt(pixels, size, 55, 15).r > 200,
      "the child lands exactly 40 document px right, not 80");
    check(rgbaAt(pixels, size, 15, 15).r === 255, "and has left its starting position");

    // Frames are relative to the loaded transform, so they cannot accumulate.
    dragSurface.setNodeDocumentTranslation("kid", 40, 0);
    dragSurface.setNodeDocumentTranslation("kid", 40, 0);
    dragSurface.render(...IDENTITY, 1, WHITE, true);
    pixels = dragSurface.readPixels();
    check(rgbaAt(pixels, size, 55, 15).r > 200, "repeated frames do not accumulate");

    // Returning to zero restores the original position exactly.
    dragSurface.setNodeDocumentTranslation("kid", 0, 0);
    dragSurface.render(...IDENTITY, 1, WHITE, true);
    pixels = dragSurface.readPixels();
    check(rgbaAt(pixels, size, 15, 15).r > 200, "a zero offset restores the start position");

    check(dragSurface.setNodeDocumentTranslation("nope", 5, 5) === false,
      "an unknown layer id is rejected rather than ignored");
  }

  dragSurface.delete();

  // --- gesture lifecycle: begin / update / end / cancel ---------------------
  //
  // The engine owns the whole gesture, so a drag, a resize and a rotate are the
  // same three calls from JavaScript's point of view and none of them requires the
  // caller to do matrix algebra. The case checked is the one the browser fixture
  // could not distinguish: a node inside a scaled, translated group that carries its
  // own rotation about a pivot which is NOT its centre.
  const gestureSurface = new engine.PydeeSurface(size, size);
  if (!gestureSurface.isValid()) {
    check(false, "gesture surface allocated");
  } else {
    const COS25 = Math.cos((25 * Math.PI) / 180);
    const SIN25 = Math.sin((25 * Math.PI) / 180);

    const gestureScene = () => {
      const writer = new SceneWriter();
      writer.header(size, size, 2);
      // translate(10 10) scale(1.5)
      writer.node(NO_PARENT, KIND_GROUP, 0, 1, [1.5, 0, 0, 1.5, 10, 10], [], "grp");
      // rotate(25) about the LOCAL ORIGIN, while the box centre is (10, 5).
      writer.node(0, KIND_RECT, FLAG_HAS_BOUNDS, 1, [COS25, SIN25, -SIN25, COS25, 0, 0],
        [0, 0, 20, 10], "spun");
      writer.f64(0);
      writer.f64(0);
      writer.f64(20);
      writer.f64(10);
      writer.f64(0);
      writer.solidPaint(RED);
      writer.noStroke();
      return writer.toUint8Array();
    };

    check(gestureSurface.loadScene(gestureScene()) === "", "gesture scene loaded");
    check(gestureSurface.hasActiveGesture() === false, "a fresh surface has no gesture");

    // Nothing can be updated before a gesture begins: reported, not ignored.
    check(gestureSurface.updateTransformGesture(0, 0, false, false, 0).reason
      === "no-active-gesture", "updating with no gesture is reported");
    check(gestureSurface.cancelTransformGesture() === false,
      "cancelling with no gesture reports false");
    check(gestureSurface.beginTransformGesture("ghost", "move", "", 0, 0).reason
      === "node-not-found", "an unknown layer id cannot start a gesture");
    check(gestureSurface.beginTransformGesture("spun", "scale", "", 0, 0).reason
      === "unknown-gesture-kind", "an unknown gesture kind is rejected");
    check(gestureSurface.beginTransformGesture("spun", "resize", "north", 0, 0).reason
      === "unknown-resize-handle", "a resize needs a real handle name");

    // --- move: the object follows the pointer exactly ----------------------
    gestureSurface.render(...IDENTITY, 1, WHITE, true);
    let framePixels = gestureSurface.readPixels();
    const startedRed = rgbaAt(framePixels, size, 20, 23).r > 200;
    check(startedRed, "the rect starts under the probe point");

    const moveStart = gestureSurface.beginTransformGesture("spun", "move", "", 20, 23);
    check(moveStart.ok === true, "a move gesture begins");
    check(gestureSurface.hasActiveGesture() === true, "the gesture is held");
    const moveFrame = gestureSurface.updateTransformGesture(60, 23, false, false, 0);
    check(moveFrame.ok === true, "a move frame solves");
    if (moveFrame.ok === true) {
      checkNear(moveFrame.worldDelta.dx, 40, 1e-9, "the reported delta is the world delta");
      checkNear(moveFrame.worldDelta.dy, 0, 1e-9, "no vertical drift on a horizontal drag");
    }
    gestureSurface.render(...IDENTITY, 1, WHITE, true);
    framePixels = gestureSurface.readPixels();
    // 40 document px right, NOT 40 x the group's 1.5 scale.
    check(rgbaAt(framePixels, size, 60, 23).r > 200,
      "the move lands exactly 40 document px right through a scaled ancestor");
    check(rgbaAt(framePixels, size, 20, 23).r === 255, "and left its starting position");

    // Cancelling restores the snapshot rather than inverting the applied matrix.
    check(gestureSurface.cancelTransformGesture() === true, "the move is cancelled");
    check(gestureSurface.hasActiveGesture() === false, "and the gesture is released");
    gestureSurface.render(...IDENTITY, 1, WHITE, true);
    framePixels = gestureSurface.readPixels();
    check(rgbaAt(framePixels, size, 20, 23).r > 200, "cancel put the rect back exactly");

    // --- rotate: the object's own centre is a fixed point ------------------
    const before = gestureSurface.getOrientedBounds("spun");
    check(before.ok === true, "the pre-rotation box resolves");
    const centre = before.center;

    const rotateStart = gestureSurface.beginTransformGesture(
      "spun", "rotate", "", centre.x + 40, centre.y);
    check(rotateStart.ok === true, "a rotate gesture begins");
    if (rotateStart.ok === true) {
      checkNear(rotateStart.pivot.x, centre.x, 1e-9, "the pivot is the box's own centre");
      checkNear(rotateStart.pivot.y, centre.y, 1e-9, "the pivot y is the box's own centre");
    }
    // Straight down from the pivot is a quarter turn in SVG's y-down space.
    const rotateFrame = gestureSurface.updateTransformGesture(
      centre.x, centre.y + 40, false, false, 0);
    check(rotateFrame.ok === true, "a rotate frame solves");
    if (rotateFrame.ok === true) {
      checkNear(rotateFrame.angle, 90, 1e-9, "the reported angle is the dragged angle");
      check(rotateFrame.corners !== null, "the frame carries the new world corners");
      const spun = rotateFrame.corners;
      // The centre of the four returned corners must still be the pivot. This is
      // the assertion the old formulation failed: it appended rotate(d, pivot) to
      // the node's own transform with the pivot measured in the PARENT's space, and
      // the two agree only when the existing transform is a rotation about that
      // same point.
      checkNear((spun[0].x + spun[2].x) / 2, centre.x, 1e-9,
        "rotation keeps the object's centre in x");
      checkNear((spun[0].y + spun[2].y) / 2, centre.y, 1e-9,
        "rotation keeps the object's centre in y");
      // And it really turned: a quarter turn swaps the axis-aligned extents.
      const width = Math.max(...spun.map((p) => p.x)) - Math.min(...spun.map((p) => p.x));
      const height = Math.max(...spun.map((p) => p.y)) - Math.min(...spun.map((p) => p.y));
      const wasWidth = Math.max(...before.corners.map((p) => p.x))
        - Math.min(...before.corners.map((p) => p.x));
      const wasHeight = Math.max(...before.corners.map((p) => p.y))
        - Math.min(...before.corners.map((p) => p.y));
      checkNear(width, wasHeight, 1e-9, "a quarter turn swaps the bounding width");
      checkNear(height, wasWidth, 1e-9, "a quarter turn swaps the bounding height");
    }
    // Snapping is a step, decided by the caller.
    const snapped = gestureSurface.updateTransformGesture(
      centre.x + 40 * Math.cos(0.6), centre.y + 40 * Math.sin(0.6), false, false, 15);
    check(snapped.ok === true, "a snapped rotate frame solves");
    if (snapped.ok === true) {
      checkNear(snapped.angle, 30, 1e-9, "34.4 degrees snaps to the 15 degree step");
    }
    const ended = gestureSurface.endTransformGesture(centre.x, centre.y + 40, false, false, 0);
    check(ended.ok === true, "the rotate gesture ends with a final frame");
    check(gestureSurface.hasActiveGesture() === false, "and releases the snapshot");
    // The transform STAYS applied: the document commit re-uploads, and reverting
    // here would show one frame of the object back where it was.
    const after = gestureSurface.getOrientedBounds("spun");
    check(after.ok === true, "the post-rotation box resolves");
    if (after.ok === true) {
      checkNear(after.angle - before.angle, 90, 1e-9, "the applied rotation persisted");
    }

    // --- resize: the dragged handle reaches the pointer --------------------
    check(gestureSurface.loadScene(gestureScene()) === "", "gesture scene reloaded");
    const box = gestureSurface.getOrientedBounds("spun");
    const grab = box.handles.se;
    const anchorBefore = box.handles.nw;
    check(gestureSurface.beginTransformGesture("spun", "resize", "se", grab.x, grab.y).ok
      === true, "a resize gesture begins on the south-east handle");
    const resizeFrame = gestureSurface.updateTransformGesture(
      grab.x + 12, grab.y + 9, false, false, 0);
    check(resizeFrame.ok === true, "a resize frame solves");
    if (resizeFrame.ok === true && resizeFrame.corners !== null) {
      // The corners come back in draw order, so index 2 is the south-east one and
      // index 0 is the anchor.
      checkNear(resizeFrame.corners[2].x, grab.x + 12, 1e-9,
        "the dragged corner reaches the pointer in x");
      checkNear(resizeFrame.corners[2].y, grab.y + 9, 1e-9,
        "the dragged corner reaches the pointer in y");
      checkNear(resizeFrame.corners[0].x, anchorBefore.x, 1e-9, "the anchor is fixed in x");
      checkNear(resizeFrame.corners[0].y, anchorBefore.y, 1e-9, "the anchor is fixed in y");
      check(resizeFrame.localBounds.width > 20,
        "the reported local bounds grew, which is what the document commits");
    }

    // A scene upload invalidates the snapshot: it was measured against geometry
    // that no longer exists.
    check(gestureSurface.loadScene(gestureScene()) === "", "reloading during a gesture");
    check(gestureSurface.hasActiveGesture() === false, "a scene upload drops the gesture");

    // --- handle hit regions replace invisible DOM handle elements ----------
    const hitBox = gestureSurface.getOrientedBounds("spun");
    const probe = (point) => gestureSurface.hitTestSelectionHandle(
      "spun", point.x, point.y, 9, 26, 11, 20, 18);

    for (const name of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const hit = probe(hitBox.handles[name]);
      check(hit.ok === true && hit.region === "resize" && hit.handle === name,
        `the ${name} handle is hit where it is drawn`);
    }
    const control = probe(hitBox.handles.nw).rotationControl;
    check(control !== null, "the rotation control has a position");
    check(probe(control).region === "rotate", "the rotation control is hit");
    check(probe(hitBox.center).region === "body", "inside the object reports the body");
    check(probe({ x: 999, y: 999 }).region === "none", "far outside reports nothing");
    check(gestureSurface.hitTestSelectionHandle("ghost", 0, 0, 9, 26, 11, 20, 18).reason
      === "node-not-found", "hit testing an unknown layer is reported");
  }

  gestureSurface.delete();

  // --- damage tracking: repaint and read back only what changed --------------
  //
  // The measurement that forced this: rendering and reading back the whole surface each
  // cost 34-44ms per MEGAPIXEL in WebAssembly, so at the editor's default 1080x1080
  // document one drag frame cost ~92ms — under 12fps — to move one small object. Both are
  // proportional to AREA, so the fix is to make them proportional to the change.
  //
  // The property that makes a partial repaint safe is that everything outside the damaged
  // rectangle keeps what was already on the surface. That is what is checked here: a shape
  // is drawn, a SECOND shape elsewhere is drawn with a clipped render, and the first must
  // survive — a leaking clip would have its background clear wipe it.
  const damageSurface = new engine.PydeeSurface(size, size);
  if (!damageSurface.isValid()) {
    check(false, "damage surface allocated");
  } else {
    const twoRects = () => {
      const writer = new SceneWriter();
      writer.header(size, size, 2);
      writer.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [5, 5, 20, 20], "a");
      writer.f64(5);
      writer.f64(5);
      writer.f64(20);
      writer.f64(20);
      writer.f64(0);
      writer.solidPaint(RED);
      writer.noStroke();
      writer.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [60, 60, 20, 20], "b");
      writer.f64(60);
      writer.f64(60);
      writer.f64(20);
      writer.f64(20);
      writer.f64(0);
      writer.solidPaint(BLACK);
      writer.noStroke();
      return writer.toUint8Array();
    };

    check(damageSurface.loadScene(twoRects()) === "", "damage scene loaded");
    // A fresh upload invalidates every pixel: ids, geometry and paint may all differ, so
    // there is no basis for a partial repaint.
    check(!damageSurface.hasPartialDamage(), "a scene upload requires a full repaint");
    check(damageSurface.renderDamaged(...IDENTITY, 1, WHITE, true, 2).reason
      === "full-repaint-required", "a partial render is refused until a full one happens");

    damageSurface.render(...IDENTITY, 1, WHITE, true);
    check(!damageSurface.hasPartialDamage(), "a full render satisfies outstanding damage");
    check(damageSurface.renderDamaged(...IDENTITY, 1, WHITE, true, 2).reason === "no-damage",
      "nothing to repaint is reported as such, not as an empty frame");

    // Move rect "a" only. The engine unions its bounds BEFORE and AFTER, so the damage
    // covers where it was and where it went.
    check(damageSurface.setNodeTransform("a", 1, 0, 0, 1, 12, 0), "the node moved");
    check(damageSurface.hasPartialDamage(), "moving a node produced partial damage");

    const damaged = damageSurface.renderDamaged(...IDENTITY, 1, WHITE, true, 2);
    check(damaged.ok === true, "the damaged region rendered");
    if (damaged.ok === true) {
      // 5..25 before, 17..37 after, padded by 2 -> 3..39.
      checkNear(damaged.x, 3, 0.001, "damage covers where the shape WAS");
      checkNear(damaged.x + damaged.width, 39, 0.001, "and where it went");
      // The other rect is far outside, so it must have been culled rather than redrawn.
      check(damaged.nodesDrawn === 1,
        `only the moved node was redrawn (drew ${damaged.nodesDrawn})`);
      check(damaged.nodesCulled >= 1, "the untouched node was culled, not repainted");
      // And the region is a small fraction of the surface, which is the whole point.
      const fraction = (damaged.width * damaged.height) / (size * size);
      check(fraction < 0.2, `the repainted area is ${(fraction * 100).toFixed(1)}% of the surface`);
    }
    check(!damageSurface.hasPartialDamage(), "rendering the damage clears it");

    // The unchanged rect SURVIVED the clipped render's background clear.
    const afterPixels = damageSurface.readPixels();
    check(rgbaAt(afterPixels, size, 70, 70).r === 0
      && rgbaAt(afterPixels, size, 70, 70).a === 255,
      "the untouched shape is still on the surface after a clipped repaint");
    // The moved shape is at its new position and gone from the old one.
    check(rgbaAt(afterPixels, size, 30, 15).r > 200, "the moved shape is at its new position");
    check(rgbaAt(afterPixels, size, 8, 15).r === 255
      && rgbaAt(afterPixels, size, 8, 15).g === 255,
      "and the pixels it vacated were repainted to the background");

    // Region readback returns exactly the rectangle asked for, tightly packed.
    damageSurface.setNodeTransform("a", 1, 0, 0, 1, 24, 0);
    const region = damageSurface.renderDamaged(...IDENTITY, 1, WHITE, true, 2);
    check(region.ok === true, "a second damaged region rendered");
    if (region.ok === true) {
      const read = damageSurface.readPixelsRegion(region.x, region.y, region.width, region.height);
      check(read !== null, "the region read back");
      if (read !== null) {
        check(read.pixels.length === read.width * read.height * 4,
          `the buffer is exactly ${read.width}x${read.height} pixels`);
        check(read.width < size, "and it is smaller than the whole surface");
      }
    }
    // Entirely outside the surface is reported, never silently empty.
    check(damageSurface.readPixelsRegion(size + 10, size + 10, 4, 4) === null,
      "a region outside the surface is reported");

    // A node with no resolvable geometry cannot bound what changed, so the engine says so
    // rather than guessing a small rect.
    damageSurface.invalidateAll();
    check(!damageSurface.hasPartialDamage(), "invalidateAll forces a full repaint");
  }

  damageSurface.delete();

  // ------------------------------------------------------------------------- //
  // Shape creation: an ephemeral outline, built and measured by the engine
  // ------------------------------------------------------------------------- //
  {
    const shapeSurface = new engine.PydeeSurface(size, size);
    // One full-surface background rect, so a hit test has something to land on that
    // is not the preview.
    const blank = new SceneWriter();
    blank.header(size, size, 1);
    blank.node(NO_PARENT, KIND_RECT, FLAG_HAS_BOUNDS, 1, IDENTITY, [0, 0, size, size], "bg");
    blank.f64(0);
    blank.f64(0);
    blank.f64(size);
    blank.f64(size);
    blank.f64(0);
    blank.solidPaint(WHITE);
    blank.noStroke();
    const blankBytes = blank.toUint8Array();
    check(shapeSurface.loadScene(blankBytes) === "", "shape-create scene loaded");
    const nodesBefore = shapeSurface.sceneRootCount();
    // A fresh scene invalidates everything, so render once to clear that before any
    // claim about PARTIAL damage can mean anything.
    shapeSurface.render(...IDENTITY, 1, WHITE, true);

    // An unknown kind is refused rather than producing an empty outline.
    const badKind = shapeSurface.beginShapeCreate("no-such-shape", 10, 10, 0xff3b82f6, 0, 0);
    check(badKind.ok === false && badKind.reason === "unknown-shape-kind",
      "an unknown shape kind is refused");

    const started = shapeSurface.beginShapeCreate("triangle", 20, 20, 0xff3b82f6, 0, 0);
    check(started.ok === true, "a triangle creation gesture starts");
    check(shapeSurface.hasShapeCreateGesture(), "the gesture is reported as active");

    // A zero-extent drag is not a shape. The engine says so instead of inventing a
    // minimum size, and paints nothing.
    const degenerate = shapeSurface.updateShapeCreate(20, 20, false, false);
    check(degenerate.ok === false && degenerate.reason === "degenerate-bounds",
      "a zero-extent drag produces no outline");
    check(shapeSurface.sceneRootCount() === nodesBefore,
      "no ephemeral node exists while the drag is degenerate");

    // A real drag produces geometry that exactly fills the swept box.
    const narrow = shapeSurface.updateShapeCreate(60, 120, false, false);
    check(narrow.ok === true, "a real drag produces an outline");
    check(typeof narrow.d === "string" && narrow.d.startsWith("M"),
      "the outline is SVG path data");
    checkNear(narrow.bounds.x, 20, 0.02, "outline left edge");
    checkNear(narrow.bounds.y, 20, 0.02, "outline top edge");
    checkNear(narrow.bounds.width, 40, 0.02, "outline width follows the drag");
    checkNear(narrow.bounds.height, 100, 0.02, "outline height follows the drag");
    check(shapeSurface.sceneRootCount() === nodesBefore + 1,
      "the ephemeral preview node is in the scene");

    // Stretching horizontally makes the shape WIDER, which is the feedback a
    // creation preview exists to give. Not merely a moved shape of the same size.
    const wide = shapeSurface.updateShapeCreate(220, 120, false, false);
    check(wide.ok === true, "the outline updates on the next sample");
    checkNear(wide.bounds.width, 200, 0.02, "stretching horizontally widens the shape");
    checkNear(wide.bounds.height, 100, 0.02, "and leaves the height alone");
    check(wide.d !== narrow.d, "the path data itself changed, not just the box");
    check(shapeSurface.sceneRootCount() === nodesBefore + 1,
      "updating reuses the same ephemeral node rather than adding another");

    // The preview is not selectable: it is not an object yet. Probed at a point that
    // is inside BOTH the preview triangle and the background rect, so a miss cannot
    // be mistaken for the skip working. (80, 90) is inside the triangle whose apex is
    // (120, 20) and whose base runs from (20, 120) to (220, 120), and inside the
    // 100x100 background.
    check(shapeSurface.hitTest(80, 90) === "bg",
      "a press on the preview selects what is UNDERNEATH it, not the preview");

    // Per-frame updates damage a region rather than the whole surface, which is what
    // keeps this off the full-repaint path.
    check(shapeSurface.hasPartialDamage(),
      "a preview update produces partial damage, not a full invalidation");

    // Modifiers are geometry, so the engine applies them.
    const squared = shapeSurface.updateShapeCreate(220, 120, true, false);
    checkNear(squared.bounds.width, 200, 0.02, "aspect lock squares off the larger extent");
    checkNear(squared.bounds.height, 200, 0.02, "on both axes");

    const centred = shapeSurface.updateShapeCreate(60, 70, false, true);
    checkNear(centred.bounds.width, 80, 0.02, "from-centre doubles the horizontal extent");
    checkNear(centred.bounds.height, 100, 0.02, "and the vertical extent");
    checkNear(centred.bounds.x + centred.bounds.width / 2, 20, 0.02,
      "from-centre keeps the press point at the centre");

    // A backwards drag sweeps a real box rather than collapsing.
    const backwards = shapeSurface.updateShapeCreate(-30, -40, false, false);
    checkNear(backwards.bounds.x, -30, 0.02, "a backwards drag starts at the pointer");
    checkNear(backwards.bounds.width, 50, 0.02, "and has positive extent");

    // getShapePreview reports the same thing without advancing anything.
    const peek = shapeSurface.getShapePreview();
    check(peek.ok === true && peek.d === backwards.d,
      "getShapePreview returns the current outline unchanged");

    // Commit hands back the SAME string that was painted, and removes the node.
    const committed = shapeSurface.commitShapeCreate();
    check(committed.ok === true, "the gesture commits");
    check(committed.d === backwards.d,
      "the committed outline is byte-identical to the previewed one");
    check(committed.bounds.width === backwards.bounds.width
      && committed.bounds.height === backwards.bounds.height,
      "and so are its bounds");
    check(!shapeSurface.hasShapeCreateGesture(), "the gesture is over");
    check(shapeSurface.sceneRootCount() === nodesBefore,
      "the ephemeral node is gone after the commit");

    // Cancel: no outline, no node, and nothing to commit.
    check(shapeSurface.beginShapeCreate("star", 40, 40, 0xff3b82f6, 0, 0).ok === true,
      "a second gesture starts after a commit");
    check(shapeSurface.updateShapeCreate(140, 140, false, false).ok === true,
      "and produces an outline");
    check(shapeSurface.sceneRootCount() === nodesBefore + 1, "with its own ephemeral node");
    check(shapeSurface.cancelShapeCreate() === true, "cancel reports it had work to do");
    check(shapeSurface.sceneRootCount() === nodesBefore, "the node is removed on cancel");
    check(shapeSurface.getShapePreview().ok === false, "there is no preview after a cancel");
    check(shapeSurface.cancelShapeCreate() === false, "cancelling twice is a no-op");

    // Parameters take effect mid-gesture rather than at the next begin.
    shapeSurface.beginShapeCreate("star", 0, 0, 0xff3b82f6, 0, 0);
    const fivePoint = shapeSurface.updateShapeCreate(100, 100, false, false);
    check(shapeSurface.setShapeCreateParameters(8, 0.5, 0.2, 0.33, 0.5, 0.3) === true,
      "shape parameters are accepted mid-gesture");
    const eightPoint = shapeSurface.getShapePreview();
    check(eightPoint.ok === true && eightPoint.d !== fivePoint.d,
      "changing the point count rebuilds the outline immediately");
    // The box is unchanged: parameters change the silhouette, not the extent.
    checkNear(eightPoint.bounds.width, 100, 0.02, "a parameter change keeps the drag box");
    shapeSurface.cancelShapeCreate();

    // A scene reload destroys the ephemeral node, so it must also end the gesture.
    shapeSurface.beginShapeCreate("ellipse", 10, 10, 0xff3b82f6, 0, 0);
    shapeSurface.updateShapeCreate(90, 90, false, false);
    check(shapeSurface.loadScene(blankBytes) === "", "scene reloaded mid-gesture");
    check(!shapeSurface.hasShapeCreateGesture(),
      "loadScene ends the creation gesture it just destroyed");
    check(shapeSurface.sceneRootCount() === nodesBefore, "and leaves no orphan node");

    // buildShapePath is the same builder without a gesture, for a click-to-insert.
    const built = shapeSurface.buildShapePath("hexagon", 5, 6, 70, 40);
    check(built.ok === true, "buildShapePath produces an outline without a gesture");
    checkNear(built.bounds.x, 5, 0.02, "at the requested position");
    checkNear(built.bounds.width, 70, 0.02, "with the requested width");
    checkNear(built.bounds.height, 40, 0.02, "and height");
    check(shapeSurface.buildShapePath("nope", 0, 0, 10, 10).ok === false,
      "an unknown kind is refused there too");
    check(shapeSurface.buildShapePath("hexagon", 0, 0, 0, 10).ok === false,
      "and so is a degenerate box");

    // measurePathBounds: the reference the TypeScript measurement is held to.
    const measured = shapeSurface.measurePathBounds("M 0 0 C 0 100 100 100 100 0");
    check(measured.ok === true, "measurePathBounds measures a cubic");
    checkNear(measured.bounds.height, 75, 1e-3,
      "tightly, not as the control-point hull (which would say 100)");
    check(shapeSurface.measurePathBounds("").ok === false,
      "empty path data is reported as unmeasurable");

    shapeSurface.delete();
  }

  console.log(`\n${checks} checks, ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nsmoke test threw:", error);
  process.exit(1);
});
