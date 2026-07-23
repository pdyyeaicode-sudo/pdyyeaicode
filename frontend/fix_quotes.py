with open('src/editor/SelectionOverlay.tsx', 'r') as f:
    code = f.read()

code = code.replace(
    'const group = Array.from(svg.querySelectorAll(\\\'g[data-role]\\\')).find(g => g.getAttribute(\\\'data-layer-id\\\') === primaryId);',
    'const group = Array.from(svg.querySelectorAll(\"g[data-role]\")).find(g => g.getAttribute(\"data-layer-id\") === primaryId);'
)
code = code.replace(
    'if (group && group.getAttribute(\\\'pointer-events\\\') === \\\'none\\\') return;',
    'if (group && group.getAttribute(\"pointer-events\") === \"none\") return;'
)

with open('src/editor/SelectionOverlay.tsx', 'w') as f:
    f.write(code)
