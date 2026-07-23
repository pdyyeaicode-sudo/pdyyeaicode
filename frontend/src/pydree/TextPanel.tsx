import React from "react";
import styles from "./TextPanel.module.css";
import { ListItem } from "@astryxdesign/core/List";
import { Type } from "lucide-react";

export interface TextPanelProps {
  onAddText: (content: string, fontSize: number, fontWeight: "normal" | "bold") => void;
}

export function TextPanel({ onAddText }: TextPanelProps): JSX.Element {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Text</span>
      </div>
      <div className={styles.content} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ListItem 
          label="Add a text box" 
          onClick={() => onAddText("Add a text box", 24, "normal")} 
        />

        <div className={styles.typographyGroup} style={{ marginTop: 12 }}>
          <div className={styles.groupTitle} style={{ marginBottom: 8, paddingLeft: 8 }}>Default text styles</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ListItem 
              label={<span style={{ fontSize: 24, fontWeight: 'bold' }}>Add a heading</span>} 
              onClick={() => onAddText("Add a heading", 64, "bold")}
            />
            <ListItem 
              label={<span style={{ fontSize: 18, fontWeight: 'bold' }}>Add a subheading</span>} 
              onClick={() => onAddText("Add a subheading", 36, "bold")}
            />
            <ListItem 
              label={<span style={{ fontSize: 14 }}>Add a little bit of body text</span>} 
              onClick={() => onAddText("Add a little bit of body text", 24, "normal")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
