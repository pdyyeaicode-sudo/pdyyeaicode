import re

with open('src/editor/PropertiesPanel.test.tsx', 'r') as f:
    code = f.read()

def inject_clicks(match):
    before = match.group(1)
    return before + '''
    try { fireEvent.click(screen.getByRole("button", { name: /Fill & Stroke/i })); } catch (e) {}
    try { fireEvent.click(screen.getByRole("button", { name: /Blend & Opacity/i })); } catch (e) {}
'''

code = re.sub(r'(renderPanel[^;]*;)', inject_clicks, code)

with open('src/editor/PropertiesPanel.test.tsx', 'w') as f:
    f.write(code)
