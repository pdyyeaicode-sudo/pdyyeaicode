import re

with open('src/editor/PropertiesPanel.test.tsx', 'r') as f:
    code = f.read()

code = code.replace('try { fireEvent.click(screen.getByRole(\"button\", { name: /Fill & Stroke/i })); } catch (e) {}', 'fireEvent.click(screen.getByRole(\"button\", { name: /Fill & Stroke/i }));')
code = code.replace('try { fireEvent.click(screen.getByRole(\"button\", { name: /Blend & Opacity/i })); } catch (e) {}', 'fireEvent.click(screen.getByRole(\"button\", { name: /Blend & Opacity/i }));')

with open('src/editor/PropertiesPanel.test.tsx', 'w') as f:
    f.write(code)
