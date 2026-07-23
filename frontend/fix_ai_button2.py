with open('src/editor/PropertiesPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Fragment
content = content.replace('{layer.kind === "image" ? (\n          <CollapsibleSection title="Frame & Mask">', '{layer.kind === "image" ? (\n          <>\n          <CollapsibleSection title="Frame & Mask">')
content = content.replace('          </CollapsibleSection>\n        ) : null}', '          </CollapsibleSection>\n          </>\n        ) : null}')

# Fix Template string Invalid character
content = content.replace('\', '')
content = content.replace('\Removing', 'Removing')
content = content.replace('%\', '%')

with open('src/editor/PropertiesPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
