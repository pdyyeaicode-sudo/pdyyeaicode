"use client";
import { ListItem } from "@astryxdesign/core/List";

import { ChangeEvent, useRef } from "react";

export interface AddElementPanelProps {
  onAddText: () => void;
  onAddShape: (shapeType: "rectangle" | "circle" | "triangle" | "line") => void;
  onUploadImage: (file: File) => Promise<void>;
}

export function AddElementPanel({
  onAddText,
  onAddShape,
  onUploadImage,
}: AddElementPanelProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleImageSelection(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onUploadImage(file);
    event.target.value = "";
  }

  return (
    <section className="add-element-panel" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <ListItem label="Add Text" onClick={onAddText} />
      <div className="add-shape-section" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, marginBottom: 8 }}>
        <ListItem 
          label="Rectangle" 
          onClick={() => onAddShape("rectangle")} 
          draggable 
          onDragStart={(e: React.DragEvent) => {
            e.dataTransfer.setData("application/x-printrocket-shape", "rectangle");
            e.dataTransfer.effectAllowed = "copy";
          }}
        />
        <ListItem 
          label="Circle" 
          onClick={() => onAddShape("circle")} 
          draggable 
          onDragStart={(e: React.DragEvent) => {
            e.dataTransfer.setData("application/x-printrocket-shape", "circle");
            e.dataTransfer.effectAllowed = "copy";
          }}
        />
        <ListItem 
          label="Triangle" 
          onClick={() => onAddShape("triangle")} 
          draggable 
          onDragStart={(e: React.DragEvent) => {
            e.dataTransfer.setData("application/x-printrocket-shape", "triangle");
            e.dataTransfer.effectAllowed = "copy";
          }}
        />
        <ListItem 
          label="Line" 
          onClick={() => onAddShape("line")} 
          draggable 
          onDragStart={(e: React.DragEvent) => {
            e.dataTransfer.setData("application/x-printrocket-shape", "line");
            e.dataTransfer.effectAllowed = "copy";
          }}
        />
      </div>
      <ListItem
        label="Upload Image"
        onClick={() => {
          fileInputRef.current?.click();
        }}
      />
      <input
        ref={fileInputRef}
        className="upload-image-input"
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void handleImageSelection(event);
        }}
      />
    </section>
  );
}
