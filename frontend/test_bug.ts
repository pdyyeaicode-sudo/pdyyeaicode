import { JSDOM } from "jsdom";
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;

import { parseCanonicalSvg, serializeArtboard } from "./src/editor/canonicalSvg";
import { insertLayerAt } from "./src/editor/commands/helpers";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" data-printrocket="true">
  <g data-role="shapes" data-editable="true" data-layer-id="shapes-0">
    <rect x="100" y="100" width="100" height="100" data-element-id="child-1" />
  </g>
</svg>`;

try {
  console.log("Parsing SVG...");
  const artboard = parseCanonicalSvg(svg);
  console.log("Parsed Artboard layers:", JSON.stringify(artboard.layers, null, 2));

  // Simulating createLayerCommand
  const newShape = {
    id: "shape-rect-2",
    role: "shapes",
    name: "Rectangle",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape-rect",
    geometry: { type: "rect", x: 200, y: 200, width: 50, height: 50 }
  };

  const layers = artboard.layers;
  const groupIndex = layers.findIndex(l => l.kind === "group" && l.role === newShape.role);
  let nextLayers;
  if (groupIndex === -1) {
    console.log("Group not found! Inserting at top level.");
    nextLayers = insertLayerAt(layers, newShape as any, layers.length);
  } else {
    console.log("Group found! Inserting as child.");
    const group = layers[groupIndex];
    const nextGroup = {
      ...group,
      children: insertLayerAt((group as any).children, newShape as any, (group as any).children.length)
    };
    nextLayers = [...layers];
    nextLayers[groupIndex] = nextGroup as any;
  }

  const nextArtboard = { ...artboard, layers: nextLayers };
  
  console.log("Serializing new artboard...");
  const newSvg = serializeArtboard(nextArtboard);
  console.log("New SVG:\n" + newSvg);

} catch (err) {
  console.error("Error!", err);
}
