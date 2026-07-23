import sys

with open('src/pydree/PydreeStudio.module.css', 'r', encoding='utf-8') as f:
    content = f.read()

# I need to find `.assetsBody { min-height: 160px; }`
# and `  background-color: var(--p-check-1);`
# and replace everything in between.

start_marker = '.assetsBody { min-height: 160px; }\n'
end_marker = '  background-color: var(--p-check-1);\n'

start_idx = content.find(start_marker)
if start_idx == -1:
    print('Start not found')
    sys.exit(1)
start_idx += len(start_marker)

end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print('End not found')
    sys.exit(1)

new_block = """.assetsEmpty { padding: 12px; text-align: left; }
.assetGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 6px; }
.assetCard { display: flex; flex-direction: column; gap: 6px; align-items: center; padding: 8px; background: var(--p-bg-2); border: 1px solid var(--p-line); border-radius: 8px; cursor: pointer; }
.assetPreview { width: 64px; height: 64px; display: grid; place-items: center; background: linear-gradient(180deg, rgba(0,0,0,0.02), transparent); border-radius: 6px; }
.assetName { font-size: 12px; color: var(--p-fg-1); }

.treeRow { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px; border-radius: 8px; color: #A6A6A6; font-size: 16px; cursor: pointer; white-space: nowrap; margin-bottom: 4px; transition: background 0.15s; }
.treeRow:hover { background: rgba(255, 255, 255, 0.03); }
.treeSelected { color: #FFFFFF; font-weight: 500; }
.treeTwisty { display: inline-grid; place-items: center; width: 14px; height: 14px; color: #6F6F6F; flex: 0 0 auto; margin-right: 2px; }
.treeIconBox { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: #2C2C2C; color: #A6A6A6; flex: 0 0 auto; transition: all 0.15s; }
.treeSelected .treeIconBox { background: #FFF48B; color: #1E1E1E; }
.treeName { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.treeChildren { position: relative; margin-left: 22px; padding-left: 10px; border-left: 1px solid rgba(255, 255, 255, 0.08); }

/* ===== Canvas ===== */
.canvas {
  flex: 1; min-width: 0; position: relative; overflow: hidden;
  display: flex; flex-direction: column;
"""

new_content = content[:start_idx] + new_block + content[end_idx:]

with open('src/pydree/PydreeStudio.module.css', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Restored successfully')
