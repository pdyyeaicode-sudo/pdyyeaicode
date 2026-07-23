"use client";

import { useEffect } from "react";

import styles from "./DesignStudio.module.css";

import { AddElementPanel } from "../components/AddElementPanel";
import { EditorToolbar } from "../components/EditorToolbar";
import { LayerList } from "../components/LayerList";
import { PromptForm } from "../components/PromptForm";
import { SVGCanvas } from "../components/SVGCanvas";
import { useDesignStudio } from "../hooks/useDesignStudio";
import { DesignRequest } from "../types";

export default function DesignStudio(): JSX.Element {
  const studio = useDesignStudio();

  function handleSubmit(_: DesignRequest): void {
    void studio.generate();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        studio.undo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        studio.redo();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        studio.setActiveLayer(null);
        return;
      }

      if (event.key === "Delete" && studio.activeLayer) {
        event.preventDefault();
        studio.deleteLayer(studio.activeLayer);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [studio]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Dreamer</h1>
        <p>Generate layered SVG designs and edit them directly in the browser.</p>
      </header>

      <section className={styles.grid}>
        <div className={styles.leftColumn}>
          <div className={`${styles.card} ${styles.leftCard}`}>
            <PromptForm
              prompt={studio.prompt}
              brandKit={studio.brandKit}
              targetSize={studio.targetSize}
              isGenerating={studio.isGenerating}
              isUploading={studio.isUploading}
              onPromptChange={studio.setPrompt}
              onBrandKitChange={studio.setBrandKit}
              onTargetSizeChange={studio.setTargetSize}
              onSubmit={handleSubmit}
              onUploadImage={studio.uploadImage}
            />
          </div>
          <div className={`${styles.card} ${styles.leftCard}`}>
            <AddElementPanel
              onAddText={studio.addTextLayer}
              onAddShape={studio.addShapeLayer}
              onUploadImage={studio.addUploadedImageLayer}
            />
          </div>
        </div>

        <div className={styles.centerColumn}>
          <div className={styles.canvasShell} style={{ background: "#F0F0F0" }}>

            <SVGCanvas
              designOutput={studio.designOutput}
              activeLayer={studio.activeLayer}
              onLayerSelect={studio.setActiveLayer}
              onLayerTextUpdate={studio.updateLayerText}
              onLayerTransform={studio.translateLayer}
            />
          </div>
        </div>

        <div className={styles.rightColumn}>
          <div className={`${styles.card} ${styles.rightCard}`}>
            {studio.sceneGraph.emptyState ? (
              <div className={styles.exportSection} aria-live="polite">
                <p className={styles.error} style={{ marginTop: 0 }}>
                  No layers yet. Generate a design or add an element to start building the scene graph.
                </p>
              </div>
            ) : null}
            <div className={styles.exportSection}>
              <p style={{ marginTop: 0, marginBottom: "0.75rem" }}>
                {studio.sceneGraph.layerCount} layer{studio.sceneGraph.layerCount === 1 ? "" : "s"} in the scene graph.
              </p>
              <div className={styles.exportButtons}>
                <button type="button" className={styles.button} onClick={studio.undo} disabled={studio.historyIndex <= 0}>
                  Undo
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={studio.redo}
                  disabled={studio.historyIndex >= studio.historyLength - 1}
                >
                  Redo
                </button>
                <button type="button" className={styles.button} onClick={studio.exportSVG} disabled={!studio.designOutput}>
                  Export SVG
                </button>
                <button type="button" className={styles.button} onClick={studio.exportPNG} disabled={!studio.designOutput}>
                  Export PNG
                </button>
              </div>

              {studio.error ? (
                <p className={styles.error} role="alert">
                  {studio.error}
                </p>
              ) : null}
            </div>

            <LayerList
              layers={studio.sceneGraph.nodes}
              activeLayer={studio.activeLayer}
              designOutput={studio.designOutput}
              onSelect={studio.setActiveLayer}
              onToggleVisibility={studio.toggleLayerVisibility}
              onToggleLock={studio.toggleLayerLock}
              onOpacityChange={studio.setLayerOpacity}
              onDelete={studio.deleteLayer}
              onReorder={studio.reorderLayers}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  // If target is inside a shadow DOM, find the active element inside it
  let activeEl = document.activeElement;
  while (activeEl?.shadowRoot && activeEl.shadowRoot.activeElement) {
    activeEl = activeEl.shadowRoot.activeElement;
  }

  const element = target instanceof Element ? target : activeEl;
  if (!element) {
    return false;
  }
  
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") {
    return true;
  }
  
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  return element.closest("input, textarea, select, [contenteditable='true'], [role='textbox']") !== null;
}
