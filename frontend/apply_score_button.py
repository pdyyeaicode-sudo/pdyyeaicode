with open('src/editor/PropertiesPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_str = 'import { calculateAestheticScore } from "./tools/aiScoring";'
if import_str not in content:
    idx = content.find('import { Trash2')
    content = content[:idx] + import_str + '\n' + content[idx:]

# Modify DocumentView signature
content = content.replace('function DocumentView(): JSX.Element {', 'function DocumentView({ document }: { document: CreativeDocument }): JSX.Element {')

# Modify DocumentView call
content = content.replace('<DocumentView />', '<DocumentView document={document} />')

# Modify DocumentView body to include score
score_ui = '''        <CollapsibleSection title="AI Aesthetic Scoring">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
            {(() => {
              const score = calculateAestheticScore(document);
              const color = score.overall > 80 ? 'var(--color-success)' : score.overall > 50 ? 'var(--color-warning)' : 'var(--color-danger)';
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>Overall Score</span>
                    <span style={{ fontWeight: 800, fontSize: 18, color }}>{score.overall}/100</span>
                  </div>
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Contrast:</span><span>{score.contrastScore}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Alignment:</span><span>{score.alignmentScore}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Hierarchy:</span><span>{score.hierarchyScore}</span>
                    </div>
                  </div>
                  {score.suggestions.length > 0 && (
                    <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 12 }}>
                      <strong>AI Suggestions:</strong>
                      <ul style={{ paddingLeft: 16, margin: "4px 0 0 0" }}>
                        {score.suggestions.map((s, i) => <li key={i} style={{marginBottom: 4}}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </CollapsibleSection>'''

# Find the end of Export options and insert score_ui
content = content.replace('</CollapsibleSection>\n\n  import', '</CollapsibleSection>\n' + score_ui + '\n\n  import')
content = content.replace('</CollapsibleSection>\nfunction getCommon', '</CollapsibleSection>\n' + score_ui + '\nfunction getCommon')

with open('src/editor/PropertiesPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
