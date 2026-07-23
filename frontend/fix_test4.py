import re

with open('src/editor/PropertiesPanel.test.tsx', 'r') as f:
    code = f.read()

# We want to insert the clicks inside the test functions right after renderPanel(rectLayer(), dispatch);
# Let's target the specific test lines.

# Test 1: rejects an out-of-range position
code = code.replace(
    'renderPanel(rectLayer(), dispatch);\n\n    const input = screen.getByLabelText(\"X\");',
    'renderPanel(rectLayer(), dispatch);\n\n    const input = screen.getByLabelText(\"X\");'
) # Wait, X is NOT in a collapsible section, it's in fieldGrid!

# Test 2: rejects an invalid color
code = code.replace(
    'renderPanel(rectLayer(), dispatch);\n\n    const input = screen.getByLabelText(\"Fill\");',
    'renderPanel(rectLayer(), dispatch);\n    fireEvent.click(screen.getByRole(\"button\", { name: \"Fill & Stroke\" }));\n\n    const input = screen.getByLabelText(\"Fill\");'
)

# Test 3: rejects an out-of-range opacity
code = code.replace(
    'renderPanel(rectLayer(), dispatch);\n\n    const input = screen.getByLabelText(\"Opacity\");',
    'renderPanel(rectLayer(), dispatch);\n    fireEvent.click(screen.getByRole(\"button\", { name: \"Blend & Opacity\" }));\n\n    const input = screen.getByLabelText(\"Opacity\");'
)

# Test 4: displays position, size, fill, stroke, stroke width, and opacity
code = code.replace(
    'renderPanel(rectLayer(), dispatch);\n\n    const input = screen.getByLabelText(\"Fill\");',
    'renderPanel(rectLayer(), dispatch);\n    fireEvent.click(screen.getByRole(\"button\", { name: \"Fill & Stroke\" }));\n    fireEvent.click(screen.getByRole(\"button\", { name: \"Blend & Opacity\" }));\n\n    const input = screen.getByLabelText(\"Fill\");'
)

with open('src/editor/PropertiesPanel.test.tsx', 'w') as f:
    f.write(code)
