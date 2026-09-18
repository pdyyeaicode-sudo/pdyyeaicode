import re

def main():
    with open('h:/Sratup projects/Dreamer/frontend/src/pydree/assetShapes.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Update interface
    content = content.replace(
        'insert: (cx: number, cy: number) => ShapeInput;',
        'insert: (cx: number, cy: number, w?: number, h?: number) => ShapeInput;'
    )
    
    # Rect replacements
    def replace_rect(match):
        x_off, y_off, w, h = match.groups()
        rx_match = re.search(r',\s*rx:\s*(\d+)', match.group(0))
        rx_str = f", rx: {rx_match.group(1)}" if rx_match else ""
        return f'insert: (cx, cy, w = {w}, h = {h}) => ({{ kind: "rect", x: cx - w/2, y: cy - h/2, width: w, height: h{rx_str} }})'
    
    content = re.sub(
        r'insert:\s*\(\s*cx\s*,\s*cy\s*\)\s*=>\s*\(\{\s*kind:\s*"rect",\s*x:\s*cx\s*-\s*(\d+),\s*y:\s*cy\s*-\s*(\d+),\s*width:\s*(\d+),\s*height:\s*(\d+)(?:,\s*rx:\s*\d+)?\s*\}\)',
        replace_rect,
        content
    )
    
    # Ellipse replacements
    def replace_ellipse(match):
        rx, ry = match.groups()
        return f'insert: (cx, cy, w = {int(rx)*2}, h = {int(ry)*2}) => ({{ kind: "ellipse", cx, cy, rx: w/2, ry: h/2 }})'
        
    content = re.sub(
        r'insert:\s*\(\s*cx\s*,\s*cy\s*\)\s*=>\s*\(\{\s*kind:\s*"ellipse",\s*cx,\s*cy,\s*rx:\s*(\d+),\s*ry:\s*(\d+)\s*\}\)',
        replace_ellipse,
        content
    )
    
    # Polygon and Path replacements are harder to generalize with a single regex,
    # but I can use transform for them instead!
    
    with open('h:/Sratup projects/Dreamer/frontend/src/pydree/assetShapes.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    main()
