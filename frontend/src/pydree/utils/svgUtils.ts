export function svgToPathData(svgElement: SVGSVGElement): string {
  const paths: string[] = [];
  
  // Helper to convert basic shapes to path commands
  svgElement.querySelectorAll("path, rect, circle, ellipse, line, polygon, polyline").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "path") {
      const d = el.getAttribute("d");
      if (d) paths.push(d);
    } else if (tag === "rect") {
      const x = Number(el.getAttribute("x") || 0);
      const y = Number(el.getAttribute("y") || 0);
      const w = Number(el.getAttribute("width") || 0);
      const h = Number(el.getAttribute("height") || 0);
      paths.push(`M ${x} ${y} h ${w} v ${h} h ${-w} z`);
    } else if (tag === "circle") {
      const cx = Number(el.getAttribute("cx") || 0);
      const cy = Number(el.getAttribute("cy") || 0);
      const r = Number(el.getAttribute("r") || 0);
      paths.push(`M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`);
    } else if (tag === "ellipse") {
      const cx = Number(el.getAttribute("cx") || 0);
      const cy = Number(el.getAttribute("cy") || 0);
      const rx = Number(el.getAttribute("rx") || 0);
      const ry = Number(el.getAttribute("ry") || 0);
      paths.push(`M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`);
    } else if (tag === "line") {
      const x1 = Number(el.getAttribute("x1") || 0);
      const y1 = Number(el.getAttribute("y1") || 0);
      const x2 = Number(el.getAttribute("x2") || 0);
      const y2 = Number(el.getAttribute("y2") || 0);
      paths.push(`M ${x1} ${y1} L ${x2} ${y2}`);
    } else if (tag === "polygon" || tag === "polyline") {
      const pointsAttr = el.getAttribute("points") || "";
      const coords = pointsAttr.trim().split(/[\s,]+/).map(Number);
      if (coords.length >= 4) {
        const parts = [`M ${coords[0]} ${coords[1]}`];
        for (let i = 2; i < coords.length; i += 2) {
          if (i + 1 < coords.length) {
            parts.push(`L ${coords[i]} ${coords[i+1]}`);
          }
        }
        if (tag === "polygon") parts.push("Z");
        paths.push(parts.join(" "));
      }
    }
  });
  
  return paths.join(" ");
}
