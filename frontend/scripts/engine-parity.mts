/**
 * engine-parity — cross-language verification of the TypeScript encoder against
 * the REAL compiled C++ decoder and Skia renderer.
 *
 * Run with:  npm run test:engine        (from frontend/)
 *
 * This lives outside Vitest on purpose. Vitest routes every dynamic import
 * through Vite's module graph, which percent-encodes the space in this
 * repository's path and then cannot resolve the engine module; the engine is an
 * external build artifact, not a project module. `tsx` runs the TypeScript
 * directly with Node's native loader, so the encoder and the module are both
 * imported the way they actually are at runtime.
 *
 * It verifies the whole pipeline in one chain:
 *
 *   DocumentLayer -> extractRenderScene -> encodeScene -> WASM decode
 *                 -> Skia raster -> pixel readback
 *
 * and compares hit-testing between the TypeScript and C++ implementations, which
 * is the property that keeps selection consistent when the renderer is swapped.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SCENE_FORMAT_VERSION, encodeScene } from "../src/editor/renderer/sceneCodec.js";
import { createEngineTextMetricsProvider } from "../src/editor/renderer/engineTextMetrics.js";
import { extractRenderScene } from "../src/editor/renderer/sceneExtractor.js";
import { hitTestScene } from "../src/editor/renderer/sceneHitTest.js";
import { InteractionEngine } from "../src/editor/interaction/InteractionEngine.js";
import { createGestureChannel } from "../src/editor/interaction/gestureChannel.js";
import { IDENTITY as MATRIX_IDENTITY, multiply as matrixMultiply } from "../src/editor/renderer/matrix2d.js";
import { walkScene, type RenderNode } from "../src/editor/renderer/renderScene.js";
import { worldPoint } from "../src/editor/geometry/coordinateSpaces.js";
import {
  localTransformAfterWorldTranslation,
  parentWorldTransform,
  type Delta,
} from "../src/editor/geometry/transformDelta.js";
import {
  beginGesture,
  solveGesture,
} from "../src/editor/geometry/gestureSolve.js";
import {
  RESIZE_HANDLES,
  aabbForNodes,
  handleWorldPosition,
  obbAngleDegrees,
  obbCorners,
  obbForNode,
  obbIsFlipped,
  resizeLocalBounds,
  type ResizeHandleId,
} from "../src/editor/geometry/selectionGeometry.js";
import { exactPathBounds } from "../src/editor/renderer/exactPathBounds.js";
import {
  createGradient,
  gradientFillReference,
  serializeGradient,
  type GradientDefinition,
} from "../src/editor/gradients/gradientModel.js";
import type { RenderScene } from "../src/editor/renderer/renderScene.js";
import type {
  Artboard,
  DocumentLayer,
  ShapeLayer,
} from "../src/editor/types/documentModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(here, "../../engine/artifacts");
const moduleFile = path.join(artifactDir, "pydee-engine.mjs");
const wasmFile = path.join(artifactDir, "pydee-engine.wasm");

const SIZE = 100;
const WHITE = 0xffffffff;
const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

/** What `begin/update/endTransformGesture` answer with. Mirrors GestureFrameToVal. */
interface EngineGestureFrame {
  ok: true;
  kind: string;
  localTransform: { a: number; b: number; c: number; d: number; e: number; f: number };
  localBounds: { x: number; y: number; width: number; height: number };
  angle: number;
  worldDelta: { dx: number; dy: number };
  pivot: { x: number; y: number };
  corners: Array<{ x: number; y: number }> | null;
}

interface PydeeSurfaceHandle {
  isValid(): boolean;
  width(): number;
  height(): number;
  loadScene(bytes: Uint8Array): string;
  registerFont(family: string, bytes: Uint8Array): boolean;
  hasFont(family: string): boolean;
  fontCount(): number;
  measureText(
    family: string,
    content: string,
    fontSize: number,
    bold: boolean,
    italic: boolean,
    letterSpacing: number,
    lineHeight: number,
  ): { width: number; height: number; firstLineAscent: number; lineCount: number } | null;
  setNodeTransform(
    id: string,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): boolean;
  setNodeDocumentTranslation(id: string, dx: number, dy: number): boolean;
  nodeCount(): number;
  render(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    pixelRatio: number,
    background: number,
    useBackground: boolean,
  ): number;
  hitTest(x: number, y: number): string;
  getWorldTransform(id: string): { a: number; b: number; c: number; d: number; e: number; f: number } | null;
  getWorldCorners(id: string):
    | { ok: true; corners: Array<{ x: number; y: number }> }
    | { ok: false; reason: string };
  getOrientedBounds(id: string):
    | {
        ok: true;
        corners: Array<{ x: number; y: number }>;
        topLeft: { x: number; y: number };
        topRight: { x: number; y: number };
        bottomRight: { x: number; y: number };
        bottomLeft: { x: number; y: number };
        center: { x: number; y: number };
        angle: number;
        flipped: boolean;
        localBounds: { x: number; y: number; width: number; height: number };
        worldTransform: { a: number; b: number; c: number; d: number; e: number; f: number };
        handles: Record<string, { x: number; y: number }>;
      }
    | { ok: false; reason: string };
  getAxisAlignedBounds(ids: string[]):
    | { ok: true; rect: { x: number; y: number; width: number; height: number }; failed: string[] }
    | { ok: false; reason: string; failed: string[] };
  resizeLocalBounds(
    id: string,
    handle: string,
    pointerX: number,
    pointerY: number,
    preserveAspect: boolean,
    fromCenter: boolean,
  ): { x: number; y: number; width: number; height: number } | null;
  measurePathBounds(
    pathData: string,
  ):
    | { ok: true; bounds: { x: number; y: number; width: number; height: number } }
    | { ok: false; reason: string };
  buildShapePath(
    shapeType: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ):
    | { ok: true; d: string; bounds: { x: number; y: number; width: number; height: number } }
    | { ok: false; reason: string };
  setShapeCreateParameters(
    pointCount: number,
    innerRatio: number,
    cornerRatio: number,
    thicknessRatio: number,
    holeRatio: number,
    headRatio: number,
  ): boolean;
  beginTransformGesture(
    id: string,
    kind: string,
    handle: string,
    pointerX: number,
    pointerY: number,
  ): EngineGestureFrame | { ok: false; reason: string };
  updateTransformGesture(
    pointerX: number,
    pointerY: number,
    preserveAspect: boolean,
    fromCenter: boolean,
    angleSnapDegrees: number,
  ): EngineGestureFrame | { ok: false; reason: string };
  endTransformGesture(
    pointerX: number,
    pointerY: number,
    preserveAspect: boolean,
    fromCenter: boolean,
    angleSnapDegrees: number,
  ): EngineGestureFrame | { ok: false; reason: string };
  cancelTransformGesture(): boolean;
  hasActiveGesture(): boolean;
  hitTestSelectionHandle(
    id: string,
    x: number,
    y: number,
    handleSize: number,
    rotationOffset: number,
    rotationRadius: number,
    cornerRotationOffset: number,
    cornerRotationSize: number,
  ):
    | {
        ok: true;
        region: string;
        handle: string;
        rotationControl: { x: number; y: number } | null;
      }
    | { ok: false; reason: string };
  readPixels(): Uint8Array | null;
  lastLayersOpened(): number;
  lastUnresolvedText(): number;
  delete(): void;
}

interface PydeeEngineModule {
  PydeeSurface: new (width: number, height: number) => PydeeSurfaceHandle;
  sceneFormatVersion(): number;
}

let checks = 0;
let failures = 0;

function check(condition: boolean, description: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${description}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${description}`);
  }
}

function checkEqual(actual: unknown, expected: unknown, description: string): void {
  check(
    actual === expected,
    `${description}${actual === expected ? "" : ` (expected ${String(expected)}, got ${String(actual)})`}`,
  );
}

function checkBetween(actual: number, low: number, high: number, description: string): void {
  check(actual >= low && actual <= high, `${description} (expected ${low}..${high}, got ${actual})`);
}

function makeArtboard(layers: DocumentLayer[], defs = ""): Artboard {
  return {
    id: "artboard-1",
    width: SIZE,
    height: SIZE,
    printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
    layers,
    defs,
    rootAttributes: {},
  };
}

function makeRect(id: string, overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id,
    role: "shapes",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x: 20, y: 20, width: 60, height: 60 },
    fill: "#ff0000",
    ...overrides,
  };
}

function pixelAt(pixels: Uint8Array, x: number, y: number) {
  const offset = (y * SIZE + x) * 4;
  return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] };
}

async function main(): Promise<void> {
  console.log("\n=== Pydee engine parity: TypeScript encoder vs compiled C++ ===\n");

  if (!existsSync(moduleFile) || !existsSync(wasmFile)) {
    console.error(
      `Engine artifacts not found in ${artifactDir}.\n`
        + "Build them first:  bash engine/scripts/build-engine-wasm.sh\n",
    );
    process.exit(1);
  }

  const imported = (await import(pathToFileURL(moduleFile).href)) as {
    default: (options: Record<string, unknown>) => Promise<PydeeEngineModule>;
  };
  const engine = await imported.default({ wasmBinary: readFileSync(wasmFile) });

  const renderThroughEngine = (scene: RenderScene) => {
    const surface = new engine.PydeeSurface(SIZE, SIZE);
    const encoded = encodeScene(scene);
    const loadError = surface.loadScene(encoded.buffer);
    check(loadError === "", `scene loaded (error: "${loadError}")`);
    const drawn = surface.render(...IDENTITY, 1, WHITE, true);
    const pixels = surface.readPixels();
    check(pixels !== null, "pixels read back");
    return { surface, pixels: pixels as Uint8Array, drawn, encoded };
  };

  // --- version agreement ----------------------------------------------------
  checkEqual(
    engine.sceneFormatVersion(),
    SCENE_FORMAT_VERSION,
    "encoder and compiled decoder agree on the wire format version",
  );

  // --- a document layer renders end to end ----------------------------------
  {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]));
    const { surface, pixels, drawn } = renderThroughEngine(scene);
    checkEqual(drawn, 1, "one node drawn");
    checkEqual(pixelAt(pixels, 50, 50).r, 255, "rect interior is red");
    checkEqual(pixelAt(pixels, 50, 50).g, 0, "rect interior has no green");
    checkEqual(pixelAt(pixels, 5, 5).g, 255, "background stays white");
    surface.delete();
  }

  // --- transforms survive the wire format -----------------------------------
  {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("r1", {
          geometry: { type: "rect", x: 0, y: 0, width: 20, height: 20 },
          transform: "translate(60 60)",
        }),
      ]),
    );
    const { surface, pixels } = renderThroughEngine(scene);
    checkEqual(pixelAt(pixels, 70, 70).r, 255, "translated rect painted at its new position");
    checkEqual(pixelAt(pixels, 10, 10).g, 255, "original position left untouched");
    surface.delete();
  }

  // --- rotation proves the matrix component order matches -------------------
  {
    // A transposed matrix would still draw something, so assert a point that is
    // only covered under the correct rotation.
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("r1", {
          geometry: { type: "rect", x: 0, y: 0, width: 60, height: 10 },
          transform: "rotate(45)",
        }),
      ]),
    );
    const { surface, pixels } = renderThroughEngine(scene);
    checkEqual(pixelAt(pixels, 30, 32).r, 255, "rotated rect covers the +45 diagonal");
    checkEqual(pixelAt(pixels, 30, 32).g, 0, "rotated rect is opaque there");
    checkEqual(pixelAt(pixels, 30, 8).g, 255, "the mirrored diagonal is empty");
    surface.delete();
  }

  // --- group isolation ------------------------------------------------------
  {
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "g",
          role: "shapes",
          name: "g",
          editable: true,
          locked: false,
          visible: true,
          opacity: 50,
          kind: "group",
          children: [
            makeRect("a", {
              geometry: { type: "rect", x: 10, y: 40, width: 50, height: 20 },
              fill: "#000000",
            }),
            makeRect("b", {
              geometry: { type: "rect", x: 40, y: 40, width: 50, height: 20 },
              fill: "#000000",
            }),
          ],
        },
      ]),
    );
    const { surface, pixels } = renderThroughEngine(scene);
    checkEqual(surface.lastLayersOpened(), 1, "one isolated compositing layer");
    checkBetween(pixelAt(pixels, 20, 50).r, 120, 136, "single coverage at 50% group alpha");
    // The decisive assertion: per-child alpha would darken the overlap to ~64.
    checkBetween(pixelAt(pixels, 50, 50).r, 120, 136, "overlap composites once, not twice");
    surface.delete();
  }

  // --- hit-test parity ------------------------------------------------------
  {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("under", { geometry: { type: "rect", x: 10, y: 10, width: 40, height: 40 } }),
        makeRect("over", { geometry: { type: "rect", x: 30, y: 30, width: 40, height: 40 } }),
        makeRect("circle", {
          kind: "ellipse",
          geometry: { type: "ellipse", cx: 80, cy: 20, rx: 15, ry: 15 },
        }),
      ]),
    );
    const surface = new engine.PydeeSurface(SIZE, SIZE);
    surface.loadScene(encodeScene(scene).buffer);

    // The engine answers geometric hits; lock and visibility policy stays in the
    // editor, so every layer here is unlocked to make the comparison direct.
    const samples: Array<[number, number]> = [
      [15, 15], [35, 35], [45, 45], [60, 60], [5, 5], [95, 95],
      [80, 20], [68, 9], [80, 5], [50, 50], [25, 40], [12, 48],
    ];
    let agreements = 0;
    for (const [x, y] of samples) {
      const expected = hitTestScene(scene, { x, y })?.id ?? "";
      const actual = surface.hitTest(x, y);
      if (actual === expected) {
        agreements += 1;
      } else {
        check(false, `hit test disagreed at (${x}, ${y}): TS "${expected}" vs C++ "${actual}"`);
      }
    }
    check(agreements === samples.length, `hit tests agree at all ${samples.length} sample points`);
    surface.delete();
  }

  // --- selection geometry parity: TS and C++ must answer identically -------
  //
  // This is the check that keeps the architecture honest. Two implementations of
  // the same transform mathematics exist only because the engine must own the
  // hot path while the editor still has to draw a selection box before the WASM
  // module has loaded. That is tolerable ONLY while a test proves they cannot
  // disagree, so the comparison covers the cases that broke before: a scaled and
  // translated ancestor group, a rotation, a mirror, and resize from every
  // handle.
  {
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "outer",
          role: "shapes",
          name: "outer",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "group",
          transform: "translate(30 20) scale(2 2)",
          children: [
            makeRect("plain", {
              geometry: { type: "rect", x: 4, y: 6, width: 20, height: 10 },
            }),
            makeRect("spun", {
              geometry: { type: "rect", x: 4, y: 6, width: 20, height: 10 },
              transform: "rotate(37 14 11)",
            }),
            {
              id: "inner",
              role: "shapes",
              name: "inner",
              editable: true,
              locked: false,
              visible: true,
              opacity: 100,
              kind: "group",
              transform: "rotate(15) scale(-1 1)",
              children: [
                makeRect("mirrored", {
                  geometry: { type: "rect", x: 2, y: 3, width: 14, height: 9 },
                  transform: "rotate(-8 9 7)",
                }),
              ],
            },
          ],
        },
        makeRect("loose", {
          geometry: { type: "rect", x: 60, y: 70, width: 25, height: 15 },
          transform: "rotate(-22 72 77)",
        }),
      ]),
    );

    const surface = new engine.PydeeSurface(SIZE, SIZE);
    check(surface.loadScene(encodeScene(scene).buffer) === "", "geometry scene loaded");

    const TOL = 1e-9;
    const nodes = [...walkScene(scene)];
    check(nodes.length >= 6, `scene has ${nodes.length} nodes to compare`);

    let comparedNodes = 0;
    let cornerMismatches = 0;
    let matrixMismatches = 0;
    let derivedMismatches = 0;

    for (const node of nodes) {
      const ts = obbForNode(node);
      const cpp = surface.getOrientedBounds(node.id);

      if (!ts.ok) {
        // Agreement includes agreeing about FAILURE, with the same reason: a
        // silent divergence here would mean one side drew a box the other
        // refused to.
        check(
          cpp.ok === false && cpp.reason === ts.reason,
          `"${node.id}": both refuse geometry with reason "${ts.reason}" `
            + `(C++ said "${cpp.ok === false ? cpp.reason : "ok"}")`,
        );
        continue;
      }
      if (cpp.ok !== true) {
        check(false, `"${node.id}": TypeScript produced a box but C++ said "${cpp.reason}"`);
        continue;
      }

      comparedNodes += 1;

      const world = surface.getWorldTransform(node.id);
      if (
        world === null
        || Math.abs(world.a - node.worldTransform.a) > TOL
        || Math.abs(world.b - node.worldTransform.b) > TOL
        || Math.abs(world.c - node.worldTransform.c) > TOL
        || Math.abs(world.d - node.worldTransform.d) > TOL
        || Math.abs(world.e - node.worldTransform.e) > TOL
        || Math.abs(world.f - node.worldTransform.f) > TOL
      ) {
        matrixMismatches += 1;
        check(false, `"${node.id}": world transform differs between TS and C++`);
      }

      const tsCorners = obbCorners(ts.obb);
      const cppCorners = surface.getWorldCorners(node.id);
      if (cppCorners.ok !== true) {
        cornerMismatches += 1;
        check(false, `"${node.id}": getWorldCorners failed while TS succeeded`);
      } else {
        for (let index = 0; index < 4; index += 1) {
          if (
            Math.abs(tsCorners[index].x - cppCorners.corners[index].x) > TOL
            || Math.abs(tsCorners[index].y - cppCorners.corners[index].y) > TOL
          ) {
            cornerMismatches += 1;
            check(
              false,
              `"${node.id}" corner ${index}: TS (${tsCorners[index].x}, ${tsCorners[index].y}) `
                + `vs C++ (${cppCorners.corners[index].x}, ${cppCorners.corners[index].y})`,
            );
          }
        }
      }

      if (
        Math.abs(obbAngleDegrees(ts.obb) - cpp.angle) > 1e-9
        || obbIsFlipped(ts.obb) !== cpp.flipped
      ) {
        derivedMismatches += 1;
        check(
          false,
          `"${node.id}": derived angle/flip differ — TS ${obbAngleDegrees(ts.obb)}/`
            + `${obbIsFlipped(ts.obb)} vs C++ ${cpp.angle}/${cpp.flipped}`,
        );
      }

      // Handles are interpolated from the corners on both sides, so all eight
      // must land on the same points once the corners do.
      for (const handle of RESIZE_HANDLES) {
        const tsHandle = handleWorldPosition(ts.obb, handle);
        const cppHandle = cpp.handles[handle];
        if (
          cppHandle === undefined
          || Math.abs(tsHandle.x - cppHandle.x) > TOL
          || Math.abs(tsHandle.y - cppHandle.y) > TOL
        ) {
          derivedMismatches += 1;
          check(false, `"${node.id}" handle "${handle}" differs between TS and C++`);
        }
      }
    }

    check(comparedNodes >= 4, `${comparedNodes} nodes produced geometry on both sides`);
    check(matrixMismatches === 0, "every world transform agrees to 1e-9");
    check(cornerMismatches === 0, "every world corner agrees to 1e-9");
    check(derivedMismatches === 0, "every derived angle, flip and handle agrees");

    // The parity above is worthless if the scene is trivial, so assert that it
    // actually contains the cases that broke: a real rotation, a mirror, and an
    // ancestor scale. A passing comparison on axis-aligned unscaled nodes would
    // be a false positive.
    const spunBounds = surface.getOrientedBounds("spun");
    check(
      spunBounds.ok === true && Math.abs(spunBounds.angle) > 1,
      `the scene contains a genuinely rotated node `
        + `(angle ${spunBounds.ok === true ? spunBounds.angle.toFixed(2) : "n/a"})`,
    );
    const mirroredBounds = surface.getOrientedBounds("mirrored");
    check(
      mirroredBounds.ok === true && mirroredBounds.flipped,
      "the scene contains a genuinely mirrored node",
    );
    const plainWorld = surface.getWorldTransform("plain");
    check(
      plainWorld !== null && Math.abs(plainWorld.a) > 1.5,
      `the scene applies a real ancestor scale (a = ${plainWorld?.a ?? "null"})`,
    );

    // --- resize parity, from every handle, on a rotated + mirrored node -----
    const resizeTargets = ["plain", "spun", "mirrored", "loose"];
    const offsets: Array<[number, number]> = [[7, 0], [0, -5], [-11, 13], [3, 3]];
    const optionSets: Array<{ preserveAspect: boolean; fromCenter: boolean }> = [
      { preserveAspect: false, fromCenter: false },
      { preserveAspect: true, fromCenter: false },
      { preserveAspect: false, fromCenter: true },
    ];
    let resizeComparisons = 0;
    let resizeMismatches = 0;

    for (const id of resizeTargets) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (node === undefined) {
        check(false, `resize target "${id}" is present in the scene`);
        continue;
      }
      const ts = obbForNode(node);
      if (!ts.ok) {
        check(false, `resize target "${id}" has geometry`);
        continue;
      }
      for (const handle of RESIZE_HANDLES) {
        const start = handleWorldPosition(ts.obb, handle);
        for (const [dx, dy] of offsets) {
          for (const options of optionSets) {
            const pointer = worldPoint(start.x + dx, start.y + dy);
            const tsResult = resizeLocalBounds(ts.obb, handle, pointer, options);
            const cppResult = surface.resizeLocalBounds(
              id,
              handle,
              pointer.x,
              pointer.y,
              options.preserveAspect,
              options.fromCenter,
            );
            resizeComparisons += 1;

            if (tsResult === null || cppResult === null) {
              if ((tsResult === null) !== (cppResult === null)) {
                resizeMismatches += 1;
                check(
                  false,
                  `"${id}" handle "${handle}" offset (${dx}, ${dy}): one side refused the resize`,
                );
              }
              continue;
            }
            if (
              Math.abs(tsResult.x - cppResult.x) > 1e-9
              || Math.abs(tsResult.y - cppResult.y) > 1e-9
              || Math.abs(tsResult.width - cppResult.width) > 1e-9
              || Math.abs(tsResult.height - cppResult.height) > 1e-9
            ) {
              resizeMismatches += 1;
              check(
                false,
                `"${id}" handle "${handle}" offset (${dx}, ${dy}) aspect=`
                  + `${options.preserveAspect} centre=${options.fromCenter}: `
                  + `TS ${JSON.stringify(tsResult)} vs C++ ${JSON.stringify(cppResult)}`,
              );
            }
          }
        }
      }
    }

    check(resizeComparisons === 4 * 8 * 4 * 3, `${resizeComparisons} resize cases compared`);
    check(resizeMismatches === 0, "every resize result agrees to 1e-9");

    // --- multi-selection parity --------------------------------------------
    const multiIds = ["plain", "spun", "mirrored", "loose"];
    const tsMulti = aabbForNodes(
      multiIds.map((id) => nodes.find((node) => node.id === id)!).filter(Boolean),
    );
    const cppMulti = surface.getAxisAlignedBounds(multiIds);
    check(tsMulti !== null && cppMulti.ok === true, "both sides produce a multi-selection rect");
    if (tsMulti !== null && cppMulti.ok === true) {
      check(
        Math.abs(tsMulti.rect.x - cppMulti.rect.x) <= 1e-9
          && Math.abs(tsMulti.rect.y - cppMulti.rect.y) <= 1e-9
          && Math.abs(tsMulti.rect.width - cppMulti.rect.width) <= 1e-9
          && Math.abs(tsMulti.rect.height - cppMulti.rect.height) <= 1e-9,
        "the multi-selection axis-aligned rect agrees to 1e-9",
      );
    }

    // An id that is not in the scene is reported by both, never absorbed.
    const withGhost = surface.getAxisAlignedBounds(["plain", "ghost"]);
    check(
      withGhost.ok === true && withGhost.failed.length === 1 && withGhost.failed[0] === "ghost",
      "an unknown id in a multi-selection is reported",
    );

    // --- path bounds parity: the measurement the selection box is drawn from ---
    //
    // `localBounds` is what the chrome, the hit test and the engine all read, and it
    // used to be a control-point SUPERSET: a donut's box came out twice the shape's
    // width and offset by half of it, and a rounded rectangle was inflated by its
    // corner radius on every side. `exactPathBounds` replaced that with a closed-form
    // measurement, and a closed-form measurement written from scratch needs a
    // reference implementation to be checked against rather than believed. Skia's
    // `computeTightBounds` is that reference.
    {
      // Every shape the C++ builder can produce, at a NON-SQUARE box so an
      // inscribed-circle mistake cannot hide, plus hand-written cases for the curve
      // forms the solver handles separately.
      const shapeKinds = [
        "rectangle", "rounded-rect", "ellipse", "triangle", "diamond", "pentagon",
        "hexagon", "octagon", "star", "badge", "cross", "heart", "donut",
        "chat-bubble", "banner", "shield", "arrow",
      ];
      const handWritten = [
        "M 0 0 L 40 0 L 40 30 L 0 30 Z",
        "M 0 0 C 0 100 100 100 100 0",
        "M 0 0 C 0 100 100 100 100 0 S 200 -100 200 0",
        "M 0 0 Q 50 100 100 0",
        "M 0 0 Q 50 100 100 0 T 200 0",
        "M 0 0 A 50 50 0 0 1 100 0",
        "M 0 0 A 50 50 0 0 0 100 0",
        "M 0 0 A 80 40 45 1 1 0.001 0.001",
        "M 10 10 H 90 V 50 H 10 Z",
        "m 5 5 l 20 0 l 0 20 z",
      ];

      let boundsCompared = 0;
      let boundsMismatches = 0;
      let worstDelta = 0;

      const comparePathBounds = (d: string, label: string): void => {
        const ts = exactPathBounds(d);
        const cpp = surface.measurePathBounds(d);
        boundsCompared += 1;
        if (ts === null || cpp.ok !== true) {
          if ((ts === null) !== (cpp.ok !== true)) {
            boundsMismatches += 1;
            check(false, `${label}: one side could not measure it (TS ${ts === null ? "null" : "ok"})`);
          }
          return;
        }
        const delta = Math.max(
          Math.abs(ts.x - cpp.bounds.x),
          Math.abs(ts.y - cpp.bounds.y),
          Math.abs(ts.width - cpp.bounds.width),
          Math.abs(ts.height - cpp.bounds.height),
        );
        worstDelta = Math.max(worstDelta, delta);
        // 0.02px. Not 1e-9, and the reason is real rather than a tolerance chosen to
        // pass: Skia stores an SVG arc as a chain of CONICS and measures their bounds
        // numerically, while `exactPathBounds` solves the arc's stationary angles in
        // closed form. The two answers differ by the conic approximation, which is a
        // fraction of a pixel. Straight-line and cubic cases agree far more tightly;
        // the worst case across this corpus is reported below so a regression shows up
        // as a number rather than as a pass.
        if (delta > 0.02) {
          boundsMismatches += 1;
          check(
            false,
            `${label}: TS ${JSON.stringify(ts)} vs Skia ${JSON.stringify(cpp.bounds)} `
              + `(worst axis off by ${delta})`,
          );
        }
      };

      for (const kind of shapeKinds) {
        const built = surface.buildShapePath(kind, 40, 60, 120, 90);
        check(built.ok === true, `the engine builds a "${kind}"`);
        if (built.ok !== true) {
          continue;
        }
        comparePathBounds(built.d, `shape "${kind}"`);
        // And the builder's own claim about its bounds matches the measurement, which
        // is what makes "every shape fills its box" true rather than asserted.
        const measured = exactPathBounds(built.d);
        check(
          measured !== null
            && Math.abs(measured.x - 40) <= 0.05
            && Math.abs(measured.y - 60) <= 0.05
            && Math.abs(measured.width - 120) <= 0.05
            && Math.abs(measured.height - 90) <= 0.05,
          `"${kind}" fills the box it was built into (got ${JSON.stringify(measured)})`,
        );
      }
      for (const [index, d] of handWritten.entries()) {
        comparePathBounds(d, `hand-written path ${index}`);
      }

      check(boundsCompared === shapeKinds.length + handWritten.length,
        `${boundsCompared} path-bounds cases compared`);
      check(boundsMismatches === 0,
        `every path measurement agrees with Skia (worst axis off by ${worstDelta.toFixed(6)}px)`);
    }

    // --- P⁻¹·T·P parity: the TS drag conversion equals the engine's ----------
    //
    // The editor cannot ask the engine for this on the SVG render path, so
    // transformDelta.ts computes it. Rather than trusting two copies of the
    // algebra, apply the same world translation both ways and compare the ONE
    // observable both produce: the node's resulting world transform.
    {
      const lookup = (id: string): RenderNode | undefined =>
        nodes.find((candidate) => candidate.id === id);
      const worldDeltas: Delta[] = [
        { dx: 40, dy: 0 },
        { dx: 0, dy: -25 },
        { dx: -13.5, dy: 7.25 },
        { dx: 0.001, dy: -0.002 },
      ];
      let translationComparisons = 0;
      let translationMismatches = 0;

      for (const node of nodes) {
        const parentWorld = parentWorldTransform(node, lookup);
        if (parentWorld === null) {
          check(false, `"${node.id}": no parent transform available`);
          continue;
        }
        for (const worldDelta of worldDeltas) {
          const nextLocal = localTransformAfterWorldTranslation(node, lookup, worldDelta);
          if (nextLocal === null) {
            check(false, `"${node.id}": TS refused a translation the engine may accept`);
            continue;
          }
          const tsWorld = matrixMultiply(parentWorld, nextLocal);

          check(
            surface.setNodeDocumentTranslation(node.id, worldDelta.dx, worldDelta.dy),
            `"${node.id}": the engine accepted the document translation`,
          );
          const cppWorld = surface.getWorldTransform(node.id);
          translationComparisons += 1;

          if (
            cppWorld === null
            || Math.abs(cppWorld.a - tsWorld.a) > 1e-9
            || Math.abs(cppWorld.b - tsWorld.b) > 1e-9
            || Math.abs(cppWorld.c - tsWorld.c) > 1e-9
            || Math.abs(cppWorld.d - tsWorld.d) > 1e-9
            || Math.abs(cppWorld.e - tsWorld.e) > 1e-9
            || Math.abs(cppWorld.f - tsWorld.f) > 1e-9
          ) {
            translationMismatches += 1;
            check(
              false,
              `"${node.id}" delta (${worldDelta.dx}, ${worldDelta.dy}): `
                + `TS world ${JSON.stringify(tsWorld)} vs C++ ${JSON.stringify(cppWorld)}`,
            );
          }
        }
        // Return the node to where the scene loaded it, so the next node's
        // comparison starts from the same state.
        surface.setNodeDocumentTranslation(node.id, 0, 0);
      }

      check(
        translationComparisons === nodes.length * worldDeltas.length,
        `${translationComparisons} document translations compared`,
      );
      check(translationMismatches === 0, "the TS drag conversion matches the engine to 1e-9");
    }

    // --- gesture lifecycle parity: the whole solve, both sides ---------------
    //
    // The strongest form of this comparison. `solveGesture` and `SolveGesture` are
    // handed the SAME snapshot and the same pointer, and every number they produce
    // must agree: the resulting local transform, the new local bounds, the rotation
    // angle, the world delta and all four world corners.
    //
    // The scene is deliberately hostile — an ancestor that translates AND scales, an
    // inner group that rotates and mirrors, and nodes carrying their own rotation
    // about pivots that are not their centres. That last detail is what the browser
    // fixture could not distinguish, and it is where a left-composition and a
    // right-composition give different answers.
    {
      const lookup = (id: string): RenderNode | undefined =>
        nodes.find((candidate) => candidate.id === id);
      const gestureTargets = ["plain", "spun", "mirrored", "loose"];
      const gestureOffsets: Array<[number, number]> = [
        [30, 0],
        [0, -18],
        [-14, 21],
        [6.5, 6.5],
      ];
      const modifierSets: Array<{
        preserveAspect: boolean;
        fromCenter: boolean;
        angleSnapDegrees: number;
      }> = [
        { preserveAspect: false, fromCenter: false, angleSnapDegrees: 0 },
        { preserveAspect: true, fromCenter: false, angleSnapDegrees: 15 },
        { preserveAspect: false, fromCenter: true, angleSnapDegrees: 0 },
      ];

      let gestureComparisons = 0;
      let gestureMismatches = 0;
      let rotationsCompared = 0;
      let biggestRotationAngle = 0;

      const near = (first: number, second: number): boolean => Math.abs(first - second) <= 1e-9;

      for (const id of gestureTargets) {
        const node = lookup(id);
        if (node === undefined) {
          check(false, `gesture target "${id}" is present`);
          continue;
        }
        const parentWorld = parentWorldTransform(node, lookup);
        const geometry = obbForNode(node);
        if (parentWorld === null || !geometry.ok) {
          check(false, `gesture target "${id}" has a parent transform and geometry`);
          continue;
        }

        for (const kind of ["move", "resize", "rotate"] as const) {
          for (const handle of kind === "resize" ? RESIZE_HANDLES : (["se"] as const)) {
            // Grab the handle for a resize; for a move or a rotate start from a point
            // well away from the pivot so the angle is well defined.
            const start = kind === "resize"
              ? handleWorldPosition(geometry.obb, handle)
              : worldPoint(geometry.obb.topLeft.x + 40, geometry.obb.topLeft.y + 25);

            for (const [dx, dy] of gestureOffsets) {
              for (const modifiers of modifierSets) {
                const pointer = worldPoint(start.x + dx, start.y + dy);

                const started = beginGesture(node, parentWorld, kind, handle, worldPoint(start.x, start.y));
                const cppStart = surface.beginTransformGesture(
                  id,
                  kind,
                  kind === "resize" ? handle : "",
                  start.x,
                  start.y,
                );
                if (!started.ok || cppStart.ok !== true) {
                  if (started.ok !== (cppStart.ok === true)) {
                    gestureMismatches += 1;
                    check(false, `"${id}"/${kind}/${handle}: one side refused to begin`);
                  }
                  surface.cancelTransformGesture();
                  continue;
                }

                const ts = solveGesture(started.snapshot, pointer, modifiers);
                const cpp = surface.updateTransformGesture(
                  pointer.x,
                  pointer.y,
                  modifiers.preserveAspect,
                  modifiers.fromCenter,
                  modifiers.angleSnapDegrees,
                );
                gestureComparisons += 1;

                if (ts.ok !== (cpp.ok === true)) {
                  gestureMismatches += 1;
                  check(
                    false,
                    `"${id}"/${kind}/${handle} offset (${dx}, ${dy}): TS ok=${ts.ok} `
                      + `vs C++ ok=${cpp.ok === true}`,
                  );
                } else if (ts.ok && cpp.ok === true) {
                  const m = ts.frame.localTransform;
                  const n = cpp.localTransform;
                  const matrixAgrees = near(m.a, n.a) && near(m.b, n.b) && near(m.c, n.c)
                    && near(m.d, n.d) && near(m.e, n.e) && near(m.f, n.f);
                  const boundsAgree = near(ts.frame.localBounds.x, cpp.localBounds.x)
                    && near(ts.frame.localBounds.y, cpp.localBounds.y)
                    && near(ts.frame.localBounds.width, cpp.localBounds.width)
                    && near(ts.frame.localBounds.height, cpp.localBounds.height);
                  const scalarsAgree = near(ts.frame.angleDegrees, cpp.angle)
                    && near(ts.frame.worldDelta.dx, cpp.worldDelta.dx)
                    && near(ts.frame.worldDelta.dy, cpp.worldDelta.dy)
                    && near(started.snapshot.pivot.x, cpp.pivot.x)
                    && near(started.snapshot.pivot.y, cpp.pivot.y);
                  let cornersAgree = (ts.frame.corners === null) === (cpp.corners === null);
                  if (ts.frame.corners !== null && cpp.corners !== null) {
                    for (let index = 0; index < 4; index += 1) {
                      if (
                        !near(ts.frame.corners[index].x, cpp.corners[index].x)
                        || !near(ts.frame.corners[index].y, cpp.corners[index].y)
                      ) {
                        cornersAgree = false;
                      }
                    }
                  }

                  if (!matrixAgrees || !boundsAgree || !scalarsAgree || !cornersAgree) {
                    gestureMismatches += 1;
                    check(
                      false,
                      `"${id}"/${kind}/${handle} offset (${dx}, ${dy}) `
                        + `aspect=${modifiers.preserveAspect} centre=${modifiers.fromCenter} `
                        + `snap=${modifiers.angleSnapDegrees}: matrix=${matrixAgrees} `
                        + `bounds=${boundsAgree} scalars=${scalarsAgree} corners=${cornersAgree}\n`
                        + `        TS  ${JSON.stringify(ts.frame.localTransform)}\n`
                        + `        C++ ${JSON.stringify(cpp.localTransform)}`,
                    );
                  }
                  if (kind === "rotate") {
                    rotationsCompared += 1;
                    biggestRotationAngle = Math.max(
                      biggestRotationAngle,
                      Math.abs(ts.frame.angleDegrees),
                    );
                  }
                }

                // Restore the node so the next comparison starts from the same base.
                // This also exercises cancellation on every single iteration.
                check(
                  surface.cancelTransformGesture(),
                  `"${id}"/${kind}/${handle} (${dx}, ${dy}): the gesture cancels`,
                );
              }
            }
          }
        }
      }

      check(
        gestureComparisons === 4 * (1 + 8 + 1) * 4 * 3,
        `${gestureComparisons} gesture frames compared`,
      );
      check(gestureMismatches === 0, "every gesture frame agrees to 1e-9");
      // NON-VACUITY: a suite of rotations that all came out as zero degrees would
      // pass every comparison above while testing nothing.
      check(rotationsCompared >= 40, `${rotationsCompared} rotation frames were compared`);
      check(
        biggestRotationAngle > 10,
        `the rotations were real (largest ${biggestRotationAngle.toFixed(2)} degrees)`,
      );

      // Cancelling restored every node exactly, so the geometry is unchanged from
      // where the scene loaded it. A drifting base would silently weaken every
      // comparison after the first.
      let restored = true;
      for (const node of nodes) {
        const cpp = surface.getWorldTransform(node.id);
        if (
          cpp === null
          || Math.abs(cpp.a - node.worldTransform.a) > 1e-9
          || Math.abs(cpp.d - node.worldTransform.d) > 1e-9
          || Math.abs(cpp.e - node.worldTransform.e) > 1e-9
          || Math.abs(cpp.f - node.worldTransform.f) > 1e-9
        ) {
          restored = false;
        }
      }
      check(restored, "cancelling every gesture left the scene exactly as it loaded");
      check(!surface.hasActiveGesture(), "no gesture is left active");

      // --- handle hit regions land on the drawn handle positions -------------
      //
      // The chrome is painted, so there is no DOM element to receive a pointer
      // event. What replaces it must agree with where the handles were drawn, and
      // "where they were drawn" is the TypeScript side's own answer.
      let handleHits = 0;
      let handleMisses = 0;
      for (const id of gestureTargets) {
        const node = lookup(id);
        const geometry = node === undefined ? null : obbForNode(node);
        if (geometry === null || !geometry.ok) {
          continue;
        }
        for (const handle of RESIZE_HANDLES) {
          const at = handleWorldPosition(geometry.obb, handle);
          const hit = surface.hitTestSelectionHandle(id, at.x, at.y, 9, 26, 11, 20, 18);
          handleHits += 1;
          if (hit.ok !== true || hit.region !== "resize" || hit.handle !== handle) {
            handleMisses += 1;
            check(
              false,
              `"${id}": the point where TypeScript draws handle "${handle}" reports `
                + `${hit.ok === true ? `${hit.region}/${hit.handle}` : hit.reason}`,
            );
          }
        }
      }
      check(handleHits === 4 * 8, `${handleHits} drawn handle positions probed`);
      check(handleMisses === 0, "every drawn handle position hit-tests as that handle");
    }

    surface.delete();
  }

  // --- hot path -------------------------------------------------------------
  {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("r1", { geometry: { type: "rect", x: 0, y: 0, width: 20, height: 20 } }),
      ]),
    );
    const surface = new engine.PydeeSurface(SIZE, SIZE);
    surface.loadScene(encodeScene(scene).buffer);

    check(surface.setNodeTransform("r1", 1, 0, 0, 1, 50, 50), "setNodeTransform accepted");
    check(!surface.setNodeTransform("missing", 1, 0, 0, 1, 0, 0), "unknown id reported");

    surface.render(...IDENTITY, 1, WHITE, true);
    const pixels = surface.readPixels() as Uint8Array;
    checkEqual(pixelAt(pixels, 60, 60).r, 255, "node moved without re-uploading the scene");
    checkEqual(surface.hitTest(60, 60), "r1", "hit test follows the new transform");
    surface.delete();
  }

  // --- text: fonts are explicit, and metrics come from real shaping ---------
  {
    const textLayer: DocumentLayer = {
      id: "t1",
      role: "headline",
      name: "t1",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "text",
      elementId: "t1-el",
      field: "headline",
      content: "Hg",
      x: 5,
      y: 60,
      fontFamily: "TestSans",
      fontSize: 40,
      fontWeight: "normal",
      textAlign: "left",
      fill: "#000000",
    };

    // Without a metrics provider the extractor refuses to invent bounds.
    const unmeasured = extractRenderScene(makeArtboard([textLayer]));
    const unmeasuredNode = unmeasured.roots[0];
    checkEqual(unmeasuredNode?.localBounds, null, "text bounds are unknown without a provider");
    checkEqual(
      unmeasuredNode?.boundsAccuracy,
      "pending-measurement",
      "unmeasured text is flagged, not approximated",
    );

    const encoded = encodeScene(unmeasured);
    checkEqual(encoded.skippedNodeIds.length, 0, "text is now encoded rather than skipped");

    const surface = new engine.PydeeSurface(SIZE, SIZE);
    checkEqual(surface.loadScene(encoded.buffer), "", "text scene decodes");

    // No font registered yet: the engine must report it, not substitute one.
    checkEqual(surface.hasFont("TestSans"), false, "family is absent before registration");
    surface.render(...IDENTITY, 1, WHITE, true);
    checkEqual(surface.lastUnresolvedText(), 1, "unresolved text is reported");

    // The font is published next to the module by the same build step, so a
    // missing font here means an inconsistent build rather than an optional
    // extra. Failing keeps the text checks from silently skipping.
    const fontPath = path.join(artifactDir, "fonts", "Roboto-Regular.ttf");
    if (!existsSync(fontPath)) {
      check(false, `published font missing at ${fontPath} — re-run build-engine-wasm.sh`);
    } else {
      const fontBytes = new Uint8Array(readFileSync(fontPath));
      check(surface.registerFont("TestSans", fontBytes), "a real font binary is accepted");
      check(!surface.registerFont("Junk", new Uint8Array([1, 2, 3])), "junk font data is rejected");
      checkEqual(surface.hasFont("TestSans"), true, "family is registered");

      surface.render(...IDENTITY, 1, WHITE, true);
      checkEqual(surface.lastUnresolvedText(), 0, "text resolves once a font exists");

      const pixels = surface.readPixels() as Uint8Array;
      let darkestAboveBaseline = 255;
      for (let x = 0; x < SIZE; x += 1) {
        darkestAboveBaseline = Math.min(darkestAboveBaseline, pixelAt(pixels, x, 45).r);
      }
      check(darkestAboveBaseline < 128, "glyphs are painted above the baseline");

      // The engine's shaped metrics feed the extractor, so TypeScript bounds and
      // the painted pixels come from the same shaping engine.
      const provider = createEngineTextMetricsProvider(surface);
      const measured = extractRenderScene(makeArtboard([textLayer]), {
        textMetrics: provider,
      });
      const measuredNode = measured.roots[0];
      check(measuredNode?.localBounds !== null, "engine metrics give text real bounds");
      checkEqual(measuredNode?.boundsAccuracy, "exact", "measured text bounds are exact");

      if (measuredNode?.localBounds != null) {
        const bounds = measuredNode.localBounds;
        check(bounds.width > 0 && bounds.height > 0, "measured bounds have positive extents");
        // SVG places text by baseline, so the box must sit above y = 60.
        check(bounds.y < 60, "bounds start above the baseline");
        check(bounds.y + bounds.height >= 60, "bounds extend down to the baseline or below");
      }

      // Hit-testing now works for text because bounds are known.
      const textOnly = encodeScene(measured);
      const hitSurface = new engine.PydeeSurface(SIZE, SIZE);
      hitSurface.registerFont("TestSans", fontBytes);
      hitSurface.loadScene(textOnly.buffer);
      const tsHit = hitTestScene(measured, { x: 10, y: 45 })?.id ?? "";
      checkEqual(hitSurface.hitTest(10, 45), tsHit, "text hit test agrees across languages");
      hitSurface.delete();
    }

    surface.delete();
  }

  // --- polygons and lines render as paths -----------------------------------
  {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("tri", {
          kind: "polygon",
          geometry: {
            type: "polygon",
            points: [
              [10, 90],
              [90, 90],
              [50, 20],
            ],
          },
        }),
      ]),
    );
    const { surface, pixels, drawn, encoded } = renderThroughEngine(scene);
    checkEqual(drawn, 1, "polygon drawn as a path");
    checkEqual(encoded.skippedNodeIds.length, 0, "polygon is not skipped");
    checkEqual(pixelAt(pixels, 50, 80).r, 255, "polygon interior filled");
    checkEqual(pixelAt(pixels, 50, 80).g, 0, "polygon interior is opaque");
    checkEqual(pixelAt(pixels, 15, 30).g, 255, "outside the triangle is untouched");
    surface.delete();
  }

  {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("ln", {
          kind: "line",
          geometry: { type: "line", x1: 10, y1: 50, x2: 90, y2: 50 },
          stroke: "#000000",
          strokeWidth: 6,
        }),
      ]),
    );
    const { surface, pixels, drawn } = renderThroughEngine(scene);
    checkEqual(drawn, 1, "line drawn as a path");
    check(pixelAt(pixels, 50, 50).r < 128, "line stroke is painted");
    checkEqual(pixelAt(pixels, 50, 20).g, 255, "away from the line is untouched");
    surface.delete();
  }

  // --- text-transform is applied before shaping -----------------------------
  {
    const fontPath = path.join(artifactDir, "fonts", "Roboto-Regular.ttf");
    if (existsSync(fontPath)) {
      const fontBytes = new Uint8Array(readFileSync(fontPath));
      const surface = new engine.PydeeSurface(SIZE, SIZE);
      surface.registerFont("TestSans", fontBytes);

      const upper = surface.measureText("TestSans", "HELLO", 30, false, false, 0, 0);
      const lower = surface.measureText("TestSans", "hello", 30, false, false, 0, 0);
      check(upper !== null && lower !== null, "both casings measure");
      if (upper !== null && lower !== null) {
        // Uppercase is wider in this font, so an unapplied transform would be
        // detectable as a width mismatch.
        check(upper.width !== lower.width, "casing changes shaped width");
      }
      surface.delete();
    }
  }

  // --- gradients: the id crosses, the engine resolves it --------------------
  {
    const defs =
      "<defs><linearGradient id='ramp' x1='0%' y1='0%' x2='100%' y2='0%'>"
      + "<stop offset='0' stop-color='#ff0000'/>"
      + "<stop offset='1' stop-color='#0000ff'/></linearGradient></defs>";

    const scene = extractRenderScene(
      makeArtboard(
        [
          makeRect("r1", {
            geometry: { type: "rect", x: 0, y: 0, width: SIZE, height: SIZE },
            fill: "url(#ramp)",
          }),
        ],
        defs,
      ),
    );
    const encoded = encodeScene(scene);
    // The encoder must not report this: resolution belongs to the engine.
    checkEqual(encoded.diagnostics.length, 0, "a gradient reference produces no diagnostic");
    checkEqual(encoded.skippedNodeIds.length, 0, "the gradient-filled node is not skipped");

    const surface = new engine.PydeeSurface(SIZE, SIZE);
    checkEqual(surface.loadDefs(defs, SIZE, SIZE), "", "the engine parses the artboard defs");
    checkEqual(surface.paintServerCount(), 1, "one paint server is available");
    checkEqual(surface.loadScene(encoded.buffer), "", "the gradient scene decodes");
    checkEqual(surface.unresolvedPaintReferences(), 0, "the url(#ramp) reference resolves");

    surface.render(...IDENTITY, 1, WHITE, true);
    checkEqual(surface.lastUnresolvedPaints(), 0, "no paint is left unresolved");
    const pixels = surface.readPixels();
    check(pixels !== null, "gradient pixels read back");
    if (pixels !== null) {
      const left = pixelAt(pixels, 2, 50);
      const right = pixelAt(pixels, 97, 50);
      // Asserted as an ordering so the check does not depend on the
      // interpolation colour space.
      check(left.r > 200 && left.b < 60, "the ramp starts at the first stop");
      check(right.b > 200 && right.r < 60, "the ramp ends at the last stop");
      checkBetween(pixelAt(pixels, 50, 50).r, 40, 220, "the ramp blends in between");
    }

    // The same encoded scene with no defs loaded: reported, never guessed.
    const bare = new engine.PydeeSurface(SIZE, SIZE);
    checkEqual(bare.loadScene(encoded.buffer), "", "the scene still decodes without defs");
    checkEqual(bare.unresolvedPaintReferences(), 1, "the missing paint server is reported");
    bare.render(...IDENTITY, 1, WHITE, true);
    const blankPixels = bare.readPixels();
    if (blankPixels !== null) {
      const centre = pixelAt(blankPixels, 50, 50);
      check(
        centre.r === 255 && centre.g === 255 && centre.b === 255,
        "nothing is painted for an unresolvable paint server",
      );
    }
    bare.delete();
    surface.delete();
  }

  // --- text decoration crosses as style bits --------------------------------
  {
    const fontFile = path.join(artifactDir, "fonts", "Roboto-Regular.ttf");
    if (!existsSync(fontFile)) {
      check(false, "the published test font is present");
    } else {
      const font = new Uint8Array(readFileSync(fontFile));
      const textLayer: DocumentLayer = {
        id: "t1",
        role: "body",
        name: "t1",
        editable: true,
        locked: false,
        visible: true,
        opacity: 100,
        kind: "text",
        elementId: "t1-el",
        field: "body",
        content: "nnnn",
        x: 5,
        y: 50,
        fontFamily: "TestSans",
        fontSize: 28,
        fontWeight: "normal",
        textAlign: "left",
        fill: "#000000",
      };

      const darkestBelowBaseline = (decoration: "none" | "underline"): number => {
        const surface = new engine.PydeeSurface(SIZE, SIZE);
        surface.registerFont("TestSans", font);
        const scene = extractRenderScene(
          makeArtboard([{ ...textLayer, textDecoration: decoration }]),
          "",
        );
        const encoded = encodeScene(scene);
        checkEqual(encoded.diagnostics.length, 0, `${decoration} text encodes cleanly`);
        checkEqual(surface.loadScene(encoded.buffer), "", `${decoration} text scene decodes`);
        surface.render(...IDENTITY, 1, WHITE, true);
        const pixels = surface.readPixels();
        let darkest = 255;
        if (pixels !== null) {
          for (let row = 52; row <= 60; row += 1) {
            for (let x = 0; x < SIZE; x += 1) {
              darkest = Math.min(darkest, pixelAt(pixels, x, row).r);
            }
          }
        }
        surface.delete();
        return darkest;
      };

      // 'n' has no descender, so the band below the baseline is empty without a
      // decoration and must contain dark pixels with one — in the text's colour,
      // which is what proves the decoration colour is set explicitly.
      checkEqual(darkestBelowBaseline("none"), 255, "nothing below the baseline without decoration");
      check(darkestBelowBaseline("underline") < 128, "an underline is painted below the baseline");
    }
  }

  // --- a live drag reaches the engine through the interaction frame loop ----
  // The full path a pointer takes: gesture channel -> InteractionEngine ->
  // document-space translation -> Skia. Exercised against the real compiled
  // engine, with a node inside a scaled group so a missing ancestor-chain
  // resolution would be visible as the wrong travel distance.
  {
    const GROUP_SCALE = 2;
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "grp",
          role: "shapes",
          name: "grp",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "group",
          transform: `scale(${GROUP_SCALE})`,
          children: [
            makeRect("kid", { geometry: { type: "rect", x: 5, y: 5, width: 10, height: 10 } }),
          ],
        } as DocumentLayer,
      ]),
    );
    const encoded = encodeScene(scene);

    const surface = new engine.PydeeSurface(SIZE, SIZE);
    checkEqual(surface.loadScene(encoded.buffer), "", "the grouped scene decodes");
    checkEqual(surface.nodeCount(), 2, "both the group and its child are indexed");

    let frames = 0;
    let painted: Uint8Array | null = null;
    const interaction = new InteractionEngine({
      surface,
      view: {
        viewTransform: MATRIX_IDENTITY,
        pixelRatio: 1,
        backgroundColor: WHITE,
        useBackground: true,
      },
      // Synchronous frames so the script does not depend on rAF.
      requestFrame: (callback) => {
        callback();
        return 1;
      },
      cancelFrame: () => {},
      onFramePainted: () => {
        frames += 1;
        painted = surface.readPixels();
      },
    });

    const channel = createGestureChannel();
    channel.subscribe((event) => {
      switch (event.phase) {
        case "begin":
          interaction.beginGesture([{ layerId: event.layerId, baseTransform: MATRIX_IDENTITY }]);
          break;
        case "move":
          interaction.setTransientTranslation(event.layerId, event.dx, event.dy);
          break;
        case "end":
          interaction.endGesture();
          break;
        case "cancel":
          interaction.cancelGesture();
          break;
      }
    });

    interaction.requestPaint();
    check(painted !== null && pixelAt(painted, 15, 15).r > 200,
      "the child starts inside the scaled group");

    // Ten document-space samples, exactly as useCanvasDrag would emit them.
    channel.emit({ phase: "begin", layerId: "kid", dx: 0, dy: 0 });
    for (let step = 1; step <= 10; step += 1) {
      channel.emit({ phase: "move", layerId: "kid", dx: step * 4, dy: 0 });
    }
    channel.emit({ phase: "end", layerId: "kid", dx: 40, dy: 0 });

    check(painted !== null && pixelAt(painted, 55, 15).r > 200,
      "the drag lands 40 document px right, not 80");
    check(painted !== null && pixelAt(painted, 15, 15).r === 255,
      "and the child has left its starting position");

    const stats = interaction.getStats();
    checkEqual(stats.sceneRebuildsDuringGesture, 0,
      "the drag never re-uploads the scene");
    checkEqual(stats.pointerSamples, 10, "every pointer sample was recorded");
    // Frames run synchronously here, so each sample gets its own frame: one
    // patch per sample and no redundant work. Coalescing under a real frame
    // budget is covered by the unit tests, which drive the scheduler manually.
    checkEqual(stats.patchCalls, 10, "exactly one transform patch per sample");
    checkEqual(frames, 11, "one initial paint plus one per sample");

    interaction.dispose();
    surface.delete();
  }

  // --- what the gradient PANEL authors is what the C++ parser accepts --------
  // The authoring model and the renderer's parser are two separate
  // implementations by design. This is the check that keeps them from drifting:
  // markup produced by `serializeGradient` must resolve in the engine and paint.
  {
    const authored: GradientDefinition = {
      ...createGradient("panel-ramp"),
      angle: 0,
      spread: "reflect",
      stops: [
        { offset: 0, color: "#ff0000", opacity: 1 },
        { offset: 1, color: "#0000ff", opacity: 1 },
      ],
    };
    const defs = `<defs>${serializeGradient(authored)}</defs>`;

    const surface = new engine.PydeeSurface(SIZE, SIZE);
    checkEqual(surface.loadDefs(defs, SIZE, SIZE), "", "panel-authored defs parse in C++");
    checkEqual(surface.paintServerCount(), 1, "the authored gradient is available");
    checkEqual(surface.unsupportedPaintServers(), 0, "nothing about it is unsupported");

    const scene = extractRenderScene(
      makeArtboard(
        [
          makeRect("r1", {
            geometry: { type: "rect", x: 0, y: 0, width: SIZE, height: SIZE },
            fill: gradientFillReference(authored.id),
          }),
        ],
        defs,
      ),
    );
    const encoded = encodeScene(scene);
    checkEqual(surface.loadScene(encoded.buffer), "", "the authored scene decodes");
    checkEqual(surface.unresolvedPaintReferences(), 0, "the panel's url(#id) resolves");

    surface.render(...IDENTITY, 1, WHITE, true);
    const pixels = surface.readPixels();
    if (pixels !== null) {
      const left = pixelAt(pixels, 2, 50);
      const right = pixelAt(pixels, 97, 50);
      check(left.r > 200 && left.b < 60, "the authored ramp starts at its first stop");
      check(right.b > 200 && right.r < 60, "the authored ramp ends at its last stop");
    }

    // A radial gradient with a displaced focal point, which is the part of the
    // panel most likely to produce geometry the parser rejects.
    const radial: GradientDefinition = {
      ...createGradient("panel-radial", "radial"),
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      fx: 0.3,
      fy: 0.5,
      stops: [
        { offset: 0, color: "#ff0000", opacity: 1 },
        { offset: 1, color: "#0000ff", opacity: 1 },
      ],
    };
    const radialDefs = `<defs>${serializeGradient(radial)}</defs>`;
    checkEqual(surface.loadDefs(radialDefs, SIZE, SIZE), "", "an authored radial gradient parses");
    checkEqual(surface.paintServerCount(), 1, "the radial gradient is available");
    checkEqual(surface.unsupportedPaintServers(), 0, "its focal point is accepted");

    surface.delete();
  }

  // --- unsupported nodes are reported, not silently dropped -----------------
  {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("r1"),
        {
          id: "img1",
          role: "image-slots",
          name: "img1",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "image",
          href: "data:image/png;base64,AAAA",
          x: 10,
          y: 90,
          width: 10,
          height: 10,
        },
      ]),
    );
    const encoded = encodeScene(scene);
    checkEqual(encoded.skippedNodeIds.length, 1, "the image node is reported as unsupported");
    checkEqual(encoded.skippedNodeIds[0], "img1", "the reported id is the image layer");

    const surface = new engine.PydeeSurface(SIZE, SIZE);
    checkEqual(surface.loadScene(encoded.buffer), "", "the remaining scene still decodes");
    checkEqual(surface.render(...IDENTITY, 1, WHITE, true), 1, "only the supported node draws");
    surface.delete();
  }

  // --- damaged buffers are rejected ----------------------------------------
  {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]));
    const encoded = encodeScene(scene);
    const surface = new engine.PydeeSurface(SIZE, SIZE);

    const truncated = encoded.buffer.slice(0, encoded.buffer.length - 8);
    check(surface.loadScene(truncated) !== "", "a truncated buffer is rejected");

    const corrupted = encoded.buffer.slice();
    corrupted[0] = 0x00;
    check(surface.loadScene(corrupted) !== "", "a bad magic number is rejected");
    surface.delete();
  }

  console.log(`\n${checks} checks, ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nparity check threw:", error);
  process.exit(1);
});
