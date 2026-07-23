import sys
import re

with open('frontend/src/pydree/PydreeStudio.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'\s*</div>\s*</div>\s*\)\s*:\s*rail === "effects" \? \(.*?(?=\s*</aside>)', re.DOTALL)
match = pattern.search(content)

if match:
    new_content = content[:match.start()] + "\n        " + content[match.end():]
    with open('frontend/src/pydree/PydreeStudio.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Fixed!")
else:
    print("Not found")

