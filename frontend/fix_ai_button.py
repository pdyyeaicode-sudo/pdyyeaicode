with open('src/editor/PropertiesPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the broken syntax
broken_ui = '''          </CollapsibleSection>
          <CollapsibleSection title="Edge AI Tools">'''

fixed_ui = '''          </CollapsibleSection>
          <CollapsibleSection title="Edge AI Tools">'''

# Let's just find the ternary operator and wrap it.
content = content.replace('{layer.kind === "image" ? (\n          <CollapsibleSection title="Frame & Mask">', '{layer.kind === "image" ? (\n          <>\n          <CollapsibleSection title="Frame & Mask">')
content = content.replace('          </CollapsibleSection>\n          <CollapsibleSection title="Edge AI Tools">', '          </CollapsibleSection>\n          <CollapsibleSection title="Edge AI Tools">')

# But wait, we also have Invalid character at 825.
# Let's fix the whole block using git restore if possible. But no git here.
