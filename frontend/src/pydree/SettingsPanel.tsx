import React from "react";
import styles from "./PydreeStudio.module.css";

interface SettingsPanelProps {
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  snap: boolean;
  setSnap: (s: boolean) => void;
  showGrid: boolean;
  setShowGrid: (s: boolean) => void;
  showRulers: boolean;
  setShowRulers: (s: boolean) => void;
}

import { List, ListItem } from "@astryxdesign/core/List";
import { Switch } from "@astryxdesign/core/Switch";
import { Grid, Ruler, Magnet, Palette } from "lucide-react";

export function SettingsPanel({
  theme, setTheme,
  snap, setSnap,
  showGrid, setShowGrid,
  showRulers, setShowRulers
}: SettingsPanelProps) {
  return (
    <div className={styles.lpBody} style={{ padding: 16 }}>
      <div className={styles.secHead}><span className={styles.secTitle}>Application Settings</span></div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 16 }}>
        
        {/* Appearance Group */}
        <section style={{ padding: 8, background: 'var(--p-bg-2)', borderRadius: 8, border: '1px solid var(--p-line)' }}>
          <List
            density="compact"
            header={<h3 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--p-fg-2)', margin: '4px 8px 12px 8px', fontWeight: 600, letterSpacing: '0.05em' }}>Appearance</h3>}
          >
          <ListItem
            startContent={<Palette size={16} />}
            label={<span style={{ fontSize: 13, color: 'var(--p-fg-1)' }}>Theme</span>}
            description="Editor colors"
            endContent={
              <select 
                value={theme} 
                onChange={(e) => setTheme(e.target.value as "dark" | "light")}
                style={{ background: 'var(--p-bg-3)', color: 'var(--p-fg-1)', border: '1px solid var(--p-line)', borderRadius: 4, padding: '4px 8px' }}
              >
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
              </select>
            }
          />
          </List>
        </section>

        {/* Canvas Guides Group */}
        <section style={{ padding: 8, background: 'var(--p-bg-2)', borderRadius: 8, border: '1px solid var(--p-line)' }}>
          <List
            density="compact"
            hasDividers
            header={<h3 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--p-fg-2)', margin: '4px 8px 8px 8px', fontWeight: 600, letterSpacing: '0.05em' }}>Canvas Guides</h3>}
          >
          <ListItem
            startContent={<Magnet size={16} />}
            label={<span style={{ fontSize: 13, color: 'var(--p-fg-1)' }}>Snap to Grid</span>}
            description="Align to grid"
            endContent={<Switch value={snap} onChange={() => setSnap(!snap)} label="Snap to Grid" isLabelHidden />}
          />
          <ListItem
            startContent={<Grid size={16} />}
            label={<span style={{ fontSize: 13, color: 'var(--p-fg-1)' }}>Show Grid</span>}
            description="Canvas grid"
            endContent={<Switch value={showGrid} onChange={() => setShowGrid(!showGrid)} label="Show Grid" isLabelHidden />}
          />
          <ListItem
            startContent={<Ruler size={16} />}
            label={<span style={{ fontSize: 13, color: 'var(--p-fg-1)' }}>Show Rulers</span>}
            description="Canvas rulers"
            endContent={<Switch value={showRulers} onChange={() => setShowRulers(!showRulers)} label="Show Rulers" isLabelHidden />}
          />
          </List>
        </section>

      </div>
    </div>
  );
}
