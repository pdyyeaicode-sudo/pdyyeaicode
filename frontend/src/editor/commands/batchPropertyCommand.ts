import type { Command, DocumentLayer } from "../types/documentModel";

export function batchPropertyCommand(
  layerIds: string[],
  property: keyof DocumentLayer,
  oldValues: any[],
  newValue: any
): Command {
  return {
    type: "batch-property",
    label: `Change ${property} on ${layerIds.length} layers`,
    apply(doc) {
      const activePage = doc.pages.find(p => p.id === doc.activePageId);
      if (!activePage) return doc;
      
      const activeArtboard = activePage.artboards.find((a: any) => a.id === doc.activeArtboardId);
      if (!activeArtboard) return doc;
      
      const newLayers = activeArtboard.layers.map(layer => {
        if (layerIds.includes(layer.id) && !layer.locked) {
          return { ...layer, [property]: newValue };
        }
        return layer;
      });
      
      return {
        ...doc,
        pages: doc.pages.map(page =>
          page.id === doc.activePageId
            ? {
                ...page,
                artboards: page.artboards.map((a: any) =>
                  a.id === activeArtboard.id ? { ...a, layers: newLayers } : a
                ),
              }
            : page
        ),
      };
    },
    undo(doc) {
      const activePage = doc.pages.find(p => p.id === doc.activePageId);
      if (!activePage) return doc;
      
      const activeArtboard = activePage.artboards.find((a: any) => a.id === doc.activeArtboardId);
      if (!activeArtboard) return doc;
      
      const newLayers = activeArtboard.layers.map(layer => {
        const idx = layerIds.indexOf(layer.id);
        if (idx !== -1 && !layer.locked) {
          return { ...layer, [property]: oldValues[idx] };
        }
        return layer;
      });
      
      return {
        ...doc,
        pages: doc.pages.map(page =>
          page.id === doc.activePageId
            ? {
                ...page,
                artboards: page.artboards.map((a: any) =>
                  a.id === activeArtboard.id ? { ...a, layers: newLayers } : a
                ),
              }
            : page
        ),
      };
    }
  };
}
