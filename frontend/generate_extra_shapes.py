import urllib.request
import json
import re

def fetch_lucide_icons():
    # Fetch from official iconify icon-sets repo
    url = "https://raw.githubusercontent.com/iconify/icon-sets/master/json/lucide.json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def generate_ts(icons_data):
    icons = icons_data.get("icons", {})
    
    categories = {
        "UI Elements": ["arrow-", "chevron-", "menu", "search", "home", "settings", "user", "bell", "calendar", "camera", "check", "x", "plus", "minus", "more-", "circle", "square", "triangle", "star", "heart", "play", "pause"],
        "Files & Folders": ["file-", "folder-", "save", "download", "upload", "cloud-", "database"],
        "Devices": ["smartphone", "laptop", "monitor", "tablet", "printer", "tv", "hard-drive", "server", "headphones", "mic", "speaker"],
        "Commerce": ["shopping-", "credit-card", "dollar-sign", "tag", "gift", "briefcase", "wallet"],
        "Weather": ["sun", "moon", "cloud", "rain", "snow", "wind", "lightning", "umbrella"],
    }
    
    selected_icons = []
    seen = set()
    
    for cat_name, keywords in categories.items():
        count = 0
        for icon_name, icon_info in icons.items():
            if icon_name in seen: continue
            
            if any(icon_name == kw or icon_name.startswith(kw) for kw in keywords):
                selected_icons.append((cat_name, icon_name, icon_info))
                seen.add(icon_name)
                count += 1
                if count > 50:
                    break
                    
    if len(selected_icons) < 250:
        for icon_name, icon_info in icons.items():
            if icon_name not in seen:
                selected_icons.append(("Misc", icon_name, icon_info))
                seen.add(icon_name)
                if len(selected_icons) >= 250:
                    break

    ts_code = []
    ts_code.append('import type { ShapeDefinition, ShapeCategory } from "./assetShapes";')
    ts_code.append('')
    ts_code.append('export const EXTRA_SHAPES: ShapeDefinition[] = [')
    
    for cat, name, info in selected_icons:
        body = info.get("body", "")
        
        def convert_to_paths(svg_body):
            s = svg_body
            all_d = re.findall(r'd="([^"]+)"', s)
            
            for cx, cy, r in re.findall(r'<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"[^>]*r="([^"]+)"', s):
                cx, cy, r = float(cx), float(cy), float(r)
                all_d.append(f"M {cx-r} {cy} a {r} {r} 0 1 0 {r*2} 0 a {r} {r} 0 1 0 {-r*2} 0")
            
            for x, y, w, h in re.findall(r'<rect[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"', s):
                x, y, w, h = float(x), float(y), float(w), float(h)
                all_d.append(f"M {x} {y} L {x+w} {y} L {x+w} {y+h} L {x} {y+h} Z")
                
            for x1, y1, x2, y2 in re.findall(r'<line[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"', s):
                all_d.append(f"M {x1} {y1} L {x2} {y2}")
                
            for pts in re.findall(r'<polygon[^>]*points="([^"]+)"', s):
                all_d.append(f"M {pts.replace(',', ' ')} Z")
                
            for pts in re.findall(r'<polyline[^>]*points="([^"]+)"', s):
                all_d.append(f"M {pts.replace(',', ' ')}")
                
            return " ".join(all_d)
            
        combined_d = convert_to_paths(body)
        if not combined_d:
            continue
            
        display_name = name.replace('-', ' ').title()
        
        ts_code.append('  {')
        ts_code.append(f'    id: "lucide-{name}",')
        ts_code.append(f'    name: "{display_name}",')
        ts_code.append(f'    category: "Icons" as ShapeCategory,')
        ts_code.append(f'    preview: `<path d="{combined_d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,')
        ts_code.append(f'    insert: (cx, cy, w = 100, h = 100) => ({{')
        ts_code.append(f'      kind: "path",')
        ts_code.append(f'      d: "{combined_d}",')
        ts_code.append(f'      transform: `translate(${{cx}} ${{cy}}) scale(${{w / 24}} ${{h / 24}}) translate(-12 -12)`')
        ts_code.append('    }),')
        ts_code.append('  },')

    ts_code.append('];')
    
    with open('h:/Sratup projects/Dreamer/frontend/src/pydree/extraShapes.ts', 'w', encoding='utf-8') as f:
        f.write("\n".join(ts_code))
        
    print(f"Generated {len(selected_icons)} shapes!")

if __name__ == '__main__':
    data = fetch_lucide_icons()
    generate_ts(data)
