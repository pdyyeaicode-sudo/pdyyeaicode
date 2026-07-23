"use client";

/**
 * LeftSidebar — the content panel for the active sidebar section.
 * Re-architected for Polotno-style UI. The vertical tabs are in SidebarNav.
 */

import { LayerList } from "../components/LayerList";
import { PromptForm } from "../components/PromptForm";
import { TextPanel } from "../components/TextPanel";
import { IconsPanel } from "../components/IconsPanel";
import { UploadPanel } from "../components/UploadPanel";
import { BackgroundPanel } from "../components/BackgroundPanel";
import { PhotosPanel } from "../components/PhotosPanel";
import styles from "./CreativeStudio.module.css";
import type { SceneGraphNode } from "../hooks/sceneGraphStore";
import type { BrandKit, DesignOutput, DesignRequest, TargetSize } from "../types";
import type { SidebarSection } from "./SidebarNav";

export interface LeftSidebarProps {
  activeSection: SidebarSection;

  // Layers section (LayerList).
  layers: SceneGraphNode[];
  activeLayer: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onOpacityChange: (layerId: string, opacityPercent: number) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayers: (draggedLayerId: string, targetLayerId: string) => void;

  // Assets section (AddElementPanel).
  onAddText: () => void;
  onAddShape: (shapeType: "rectangle" | "circle" | "triangle" | "line") => void;
  onUploadAsset: (file: File) => Promise<void>;

  // Generate section (PromptForm — the AI entry).
  prompt: string;
  brandKit: BrandKit;
  targetSize: TargetSize;
  isGenerating: boolean;
  isUploading: boolean;
  onPromptChange: (text: string) => void;
  onBrandKitChange: (kit: Partial<BrandKit>) => void;
  onTargetSizeChange: (size: TargetSize) => void;
  onSubmitPrompt: (request: DesignRequest) => void | Promise<void>;
  onUploadImage: (file: File) => void | Promise<void>;
  
  onUpdateBackground?: (color: string) => void;

  /** The active design output (used to gate empty-state messaging). */
  designOutput: DesignOutput | null;
}

export function LeftSidebar(props: LeftSidebarProps): JSX.Element {
  return (
    <aside className={styles.leftSidebar} aria-label="Left sidebar">
      <div className={styles.sectionBody} role="tabpanel">
        {renderSection(props)}
      </div>
    </aside>
  );
}

function renderSection(props: LeftSidebarProps): JSX.Element {
  switch (props.activeSection) {
    case "layers":
      return (
        <LayerList
          layers={props.layers}
          activeLayer={props.activeLayer}
          designOutput={props.designOutput}
          onSelect={props.onSelectLayer}
          onToggleVisibility={props.onToggleVisibility}
          onToggleLock={props.onToggleLock}
          onOpacityChange={props.onOpacityChange}
          onDelete={props.onDeleteLayer}
          onReorder={props.onReorderLayers}
        />
      );
    case "text":
      return (
        <>
          <h2 className={styles.sectionTitle}>Text</h2>
          <TextPanel onAddText={props.onAddText} />
        </>
      );
    case "icons":
      return (
        <>
          <h2 className={styles.sectionTitle}>Elements</h2>
          <IconsPanel onAddShape={props.onAddShape} />
        </>
      );
    case "upload":
      return (
        <>
          <h2 className={styles.sectionTitle}>Upload</h2>
          <UploadPanel onUploadImage={props.onUploadAsset} />
        </>
      );
    case "generate":
      return (
        <>
          <h2 className={styles.sectionTitle}>Generate</h2>
          <PromptForm
            prompt={props.prompt}
            brandKit={props.brandKit}
            targetSize={props.targetSize}
            isGenerating={props.isGenerating}
            isUploading={props.isUploading}
            onPromptChange={props.onPromptChange}
            onBrandKitChange={props.onBrandKitChange}
            onTargetSizeChange={props.onTargetSizeChange}
            onSubmit={props.onSubmitPrompt}
            onUploadImage={props.onUploadImage}
          />
        </>
      );
    case "templates":
      return (
        <>
          <h2 className={styles.sectionTitle}>Templates</h2>
          <p className={styles.placeholder}>Template browsing is not part of v1 yet.</p>
        </>
      );
    case "photos":
      return (
        <>
          <h2 className={styles.sectionTitle}>Photos</h2>
          <PhotosPanel />
        </>
      );
    case "background":
      return (
        <>
          <h2 className={styles.sectionTitle}>Background</h2>
          <BackgroundPanel layers={props.layers} onUpdateBackground={props.onUpdateBackground || (() => {})} />
        </>
      );
    case "resize":
      return (
        <>
          <h2 className={styles.sectionTitle}>Resize</h2>
          <p className={styles.placeholder}>Artboard resize tools.</p>
        </>
      );
    default:
      return <p className={styles.placeholder}>Select a section.</p>;
  }
}
