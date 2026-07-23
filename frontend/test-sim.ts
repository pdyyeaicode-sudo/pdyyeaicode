import { JSDOM } from 'jsdom';
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.window = dom.window as any;
global.document = dom.window.document as any;

// Use relative imports avoiding hooks if possible
import { parseCanonicalSvg, serializeArtboard } from './src/editor/canonicalSvg';
import { createShapeCommand } from './src/editor/tools/shapeTool';

const blankSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" data-printrocket="true" data-version="1.0"><g data-role="background" data-editable="false" data-layer-id="background"><rect x="0" y="0" width="1080" height="1080" fill="#FFFFFF"/></g><g data-role="shapes" data-editable="true" data-layer-id="shapes"></g><g data-role="image-slots" data-editable="true" data-layer-id="image-slots"></g><g data-role="body" data-editable="true" data-layer-id="body"></g><g data-role="cta" data-editable="true" data-layer-id="cta"></g><g data-role="headline" data-editable="true" data-layer-id="headline"></g><g data-role="logo" data-editable="false" data-layer-id="logo"></g><g data-role="print-marks" data-editable="false" visibility="hidden" data-layer-id="print-marks"></g></svg>`;

const ab = parseCanonicalSvg(blankSvg);
console.log('Parsed layers length:', ab.layers.length);
const ctx = { existingIds: [], accentColor: '#FF6B00' };
const cmd = createShapeCommand({ kind: 'rect', x: 100, y: 100, width: 200, height: 100 }, ctx);
const nextAb = cmd.apply({ 
  schemaVersion: 1, 
  name: 'test', 
  activePageId: 'p', 
  activeArtboardId: ab.id, 
  pages: [{ id: 'p', name: '', artboards: [ab] }] 
}).pages[0].artboards[0];
console.log('Next layers length:', nextAb.layers.length);
console.log('Serialized:', serializeArtboard(nextAb));
