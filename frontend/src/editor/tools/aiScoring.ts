import type { CreativeDocument, DocumentLayer } from "../types/documentModel";
import { getLayerBox } from "../propertyEditing";

export interface DesignScore {
  overall: number; // 0-100
  contrastScore: number;
  alignmentScore: number;
  hierarchyScore: number;
  suggestions: string[];
}

/**
 * Calculates a local aesthetic design score based on WCAG contrast, grid alignment,
 * and visual hierarchy. Simulates "AI Aesthetic Scoring" completely client-side.
 */
export function calculateAestheticScore(doc: CreativeDocument): DesignScore {
  const page = doc.pages.find(p => p.id === doc.activePageId);
  const ab = page?.artboards.find(a => a.id === doc.activeArtboardId);
  if (!ab || ab.layers.length === 0) {
    return { overall: 100, contrastScore: 100, alignmentScore: 100, hierarchyScore: 100, suggestions: [] };
  }

  const layers = ab.layers;
  const suggestions: string[] = [];
  
  // 1. Contrast Heuristic (Basic text contrast simulation)
  let contrastFailures = 0;
  let hasText = false;
  for (const l of layers) {
    if (l.kind === "text") {
      hasText = true;
      // In a real WASM module, this would compute foreground vs background color contrast mathematically.
      // Here we simulate it by checking if font color matches the artboard default white background.
      if (l.fill === "#FFFFFF" || l.fill === "#FFF" || l.fill === "white") {
         contrastFailures++;
      }
    }
  }
  const contrastScore = hasText ? Math.max(0, 100 - (contrastFailures * 20)) : 100;
  if (contrastFailures > 0) suggestions.push("Improve text contrast against the background.");

  // 2. Alignment Heuristic (Snapping to edges/centers)
  let misaligned = 0;
  for (const l of layers) {
    if (l.kind === "group") continue;
    const box = getLayerBox(l);
    if (!box) continue;
    // If x/y coordinates aren't snapped to reasonable grid or edges (modulo 10 or exact center)
    if (Math.abs(box.x % 10) > 2 && Math.abs(box.y % 10) > 2) {
       misaligned++;
    }
  }
  const alignmentScore = Math.max(0, 100 - (misaligned * 5));
  if (misaligned > 2) suggestions.push("Snap elements to the 10px grid or use alignment tools for cleaner layout.");

  // 3. Hierarchy Heuristic (Are there overlapping elements making it messy?)
  const hierarchyScore = layers.length > 15 ? 70 : 100; // Too many layers = cluttered
  if (layers.length > 15) suggestions.push("Design might be too cluttered. Consider reducing the number of elements.");

  const overall = Math.round((contrastScore + alignmentScore + hierarchyScore) / 3);

  return {
    overall,
    contrastScore,
    alignmentScore,
    hierarchyScore,
    suggestions
  };
}
