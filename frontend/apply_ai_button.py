with open('src/editor/PropertiesPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_str = 'import { removeImageBackground } from "./tools/aiTool";'
if import_str not in content:
    idx = content.find('import { Trash2')
    content = content[:idx] + import_str + '\n' + content[idx:]

# Add State
state_str = '  const [aiState, setAiState] = useState<{ active: boolean; percent: number; error: string | null }>({ active: false, percent: 0, error: null });'
if 'const [aiState' not in content:
    idx = content.find('  const layer = documentLayer;\n')
    content = content[:idx] + state_str + '\n' + content[idx:]

# Add UI
ui_str = '''          </CollapsibleSection>
          <CollapsibleSection title="Edge AI Tools">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ width: "100%", justifyContent: "center" }}
                disabled={aiState.active}
                onClick={async () => {
                  setAiState({ active: true, percent: 0, error: null });
                  const res = await removeImageBackground(layer, (progress) => {
                     setAiState(prev => ({ ...prev, percent: progress }));
                  });
                  if (res.ok && res.command) {
                     dispatchCommand(res.command);
                     setAiState({ active: false, percent: 0, error: null });
                  } else {
                     setAiState({ active: false, percent: 0, error: res.error || "Failed" });
                  }
                }}
              >
                {aiState.active ? \Removing Background... \%\ : "?? Remove Background"}
              </button>
              {aiState.error && <p style={{ color: "var(--color-danger)", fontSize: 12 }}>{aiState.error}</p>}
            </div>
          </CollapsibleSection>'''
content = content.replace('          </CollapsibleSection>\n        ) : null}', ui_str + '\n        ) : null}')

with open('src/editor/PropertiesPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
