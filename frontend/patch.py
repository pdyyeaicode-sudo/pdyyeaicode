import re

with open('src/pydree/PydreeStudio.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start point
start_marker = '                return null;\n              })()}\n\n'
end_marker = '      </div>\n\n      {cropTarget && ('

start_idx = content.find(start_marker)
if start_idx == -1:
    print('Start marker not found')
    exit(1)
start_idx += len(start_marker)

end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print('End marker not found')
    exit(1)

new_block = """            </div>
          )}

          {/* Empty state overlay — shown when no design is loaded */}
          {!designOutput && (
            <div className={styles.canvasEmpty} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <div className={styles.emptyIcon}><Frame size={34} className="lucide" /></div>
              <div className={styles.emptyTitle}>Start a new design</div>
              <div className={styles.emptyText}>Create a blank frame, import an image, or generate one with AI.</div>
              <div className={styles.emptyBtns} style={{ pointerEvents: "all" }}>
                <button type="button" className={styles.share} onClick={() => { studio.newDocument?.(1080, 1080); }}>Create frame</button>
                <button type="button" className={styles.zoom} onClick={() => separateInputRef.current?.click()} disabled={studio.isUploading}>{studio.isUploading ? "Separating…" : "Import & Separate"}</button>
                <button type="button" className={styles.zoom} onClick={() => setRail("ai")}>Generate with AI</button>
              </div>
            </div>
          )}

          {/* floating canvas toolbar */}
          <div className={styles.canvasTools}>
            <button type="button" className={`${styles.zoomBtn} ${showRulers ? styles.toolActive : ""}`} title="Rulers" onClick={() => setShowRulers((v) => !v)}><Ruler size={16} className="lucide" /></button>
            <button type="button" className={`${styles.zoomBtn} ${showGrid ? styles.toolActive : ""}`} title="Grid" onClick={() => setShowGrid((v) => !v)}><Grid3x3 size={16} className="lucide" /></button>
            <button type="button" className={`${styles.zoomBtn} ${snap ? styles.toolActive : ""}`} title="Snap" onClick={() => setSnap((v) => !v)}><Magnet size={16} className="lucide" /></button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImageFile} />
          <input ref={separateInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleSeparateFile} />
        </main>

        {/* ===== Inspector ===== */}
        <aside className={styles.inspector}>
          <div className={styles.insTabs}>
            <button type="button" className={`${styles.insTab} ${insTab === "Design" ? styles.insTabActive : ""}`} onClick={() => setInsTab("Design")}>Design</button>
            <button type="button" className={`${styles.insTab} ${insTab === "Layers" ? styles.insTabActive : ""}`} onClick={() => setInsTab("Layers")}>Layers</button>
          </div>
          <div className={styles.insBody} style={{ padding: 0, overflow: "auto" }}>
            {insTab === "Layers" ? (
              <div className={styles.lpBody} style={{ flex: 1 }}>
                <Group title="Layers" defaultOpen={true}>
                  <TreeRows 
                    nodes={(() => {
                      const doc = studio.document;
                      if (!doc) return [];
                      const page = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
                      const artboard = page?.artboards.find((a) => a.id === doc.activeArtboardId) ?? page?.artboards[0];
                      return mapLayersToTreeNodes(artboard?.layers ?? []);
                    })()} 
                    depth={0} 
                    selected={studio.activeLayer || ""} 
                    onSelect={(id) => studio.setActiveLayer?.(id)} 
                  />
                </Group>
              </div>
            ) : (
              <>
                {/* Alignment toolbar — always shown when a layer is selected */}
                {studio.selectedLayer ? (
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--p-border)" }}>
                    <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                      <button type="button" className={styles.iconMini} onClick={() => studio.alignLayer(studio.selectedLayer!.id, "left")} title="Align Left"><AlignLeft size={14} /></button>
                      <button type="button" className={styles.iconMini} onClick={() => studio.alignLayer(studio.selectedLayer!.id, "center")} title="Align Horizontal Center"><AlignCenter size={14} /></button>
                      <button type="button" className={styles.iconMini} onClick={() => studio.alignLayer(studio.selectedLayer!.id, "right")} title="Align Right"><AlignRight size={14} /></button>
                      <div style={{ width: 1, background: "var(--p-line)", margin: "0 3px" }} />
                      <button type="button" className={styles.iconMini} onClick={() => studio.alignLayer(studio.selectedLayer!.id, "top")} title="Align Top"><ArrowUpToLine size={14} /></button>
                      <button type="button" className={styles.iconMini} onClick={() => studio.alignLayer(studio.selectedLayer!.id, "middle")} title="Align Vertical Center"><FlipVertical size={14} /></button>
                      <button type="button" className={styles.iconMini} onClick={() => studio.alignLayer(studio.selectedLayer!.id, "bottom")} title="Align Bottom"><ArrowDownToLine size={14} /></button>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className={styles.btnGhost} style={{ flex: 1, fontSize: 11 }} onClick={() => studio.bringForward(studio.selectedLayer!.id)} title="Bring Forward ( ] )">Forward</button>
                      <button type="button" className={styles.btnGhost} style={{ flex: 1, fontSize: 11 }} onClick={() => studio.sendBackward(studio.selectedLayer!.id)} title="Send Backward ( [ )">Backward</button>
                    </div>
                  </div>
                ) : null}

                {/* PropertiesPanel — full command-driven property editing */}
                <PropertiesPanel
                  selectedLayer={studio.selectedLayer}
                  selectionCount={selectionCount}
                  documentLayer={documentLayer}
                  dispatchCommand={studio.dispatchCommand}
                  activeLayers={activeArtboard?.layers ?? null}
                  onUpdate={(changes) => { if (studio.activeLayer) studio.applyLayerUpdate?.(studio.activeLayer, changes); }}
                  onDelete={() => { if (studio.activeLayer) studio.deleteLayer?.(studio.activeLayer); }}
                  onDuplicate={() => { if (studio.activeLayer) studio.duplicateLayer?.(studio.activeLayer); }}
                  onMoveUp={() => { if (studio.activeLayer) studio.bringForward?.(studio.activeLayer); }}
                  onMoveDown={() => { if (studio.activeLayer) studio.sendBackward?.(studio.activeLayer); }}
                />

                {/* Export shortcut */}
                <div className={styles.collapsedGroup} onClick={() => studio.exportSVG?.()}>
                  <span className={styles.groupTitle}>Export SVG</span>
                  <button type="button" className={styles.iconMini}><Plus size={14} className="lucide" /></button>
                </div>
                <div className={styles.collapsedGroup} onClick={() => studio.exportPNG?.()}>
                  <span className={styles.groupTitle}>Export PNG</span>
                  <button type="button" className={styles.iconMini}><Plus size={14} className="lucide" /></button>
                </div>

                {studio.error ? <div style={{ margin: 14, color: "var(--p-bad)", fontSize: 12.5 }}>{studio.error}</div> : null}
              </>
            )}
          </div>
        </aside>
"""

new_content = content[:start_idx] + new_block + content[end_idx:]

with open('src/pydree/PydreeStudio.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('File patched successfully.')
