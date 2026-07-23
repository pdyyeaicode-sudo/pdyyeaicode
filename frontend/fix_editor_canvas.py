with open('src/editor/EditorCanvas.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Let's find everything from 'return (' to the end of the file.
start_idx = code.find('return (\n    <div className={styles.canvasHost} ref={hostRef}>')
end_idx = code.find('}\n\n/**\n * Wrap the top-level')

if start_idx != -1 and end_idx != -1:
    replacement = '''return (
    <div className={styles.canvasHost} ref={hostRef}>
      {!renderOutput ? (
        <div className={styles.emptyState}>
          <p>No design has been generated yet.</p>
        </div>
      ) : (
        <SVGCanvas
          designOutput={renderOutput}
          activeLayer={activeLayer}
          onLayerSelect={onLayerSelect}
          onLayerTextUpdate={onLayerTextUpdate}
          onLayerTransform={onLayerTransform}
          viewport={viewport}
          snappingEnabled={snappingEnabled}
        />
      )}
      {/*
        Selection overlay: handles + marquee + hit-testing (task 5.5). Listens
        on the host in the capture phase so it coexists with SVGCanvas's own
        click/double-click/drag handlers without intercepting them.
      */}
      <SelectionOverlay
        hostRef={hostRef}
        designOutput={renderOutput}
        viewport={viewport}
        selection={selection}
        onSelectOnly={onSelectOnly}
        onToggle={onToggleSelection}
        onClear={onClearSelection ?? (() => undefined)}
        onSetSelection={onSetSelection ?? (() => undefined)}
        onDoubleClick={onDoubleClick}
        onPrimaryChange={(layerId) => {
          if (layerId !== null) {
            onLayerSelect(layerId);
          }
        }}
        onResize={onResize}
        onRotate={onRotate}
      />
    </div>
  );'''
    code = code[:start_idx] + replacement + '\n' + code[end_idx:]

with open('src/editor/EditorCanvas.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
