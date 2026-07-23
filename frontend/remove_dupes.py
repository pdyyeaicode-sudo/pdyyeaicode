with open('src/editor/PropertiesPanel.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
found_ai = False
found_score = False

for line in lines:
    if 'import { removeImageBackground }' in line:
        if not found_ai:
            found_ai = True
            new_lines.append(line)
        continue
    if 'import { calculateAestheticScore }' in line:
        if not found_score:
            found_score = True
            new_lines.append(line)
        continue
    new_lines.append(line)

with open('src/editor/PropertiesPanel.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
