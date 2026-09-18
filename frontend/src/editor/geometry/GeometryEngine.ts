/**
 * GeometryEngine - Generates parametric paths and handles.
 */

export interface ShapeHandle {
  id: string;
  type: "resize" | "radius" | "angle" | "parameter";
  position: [number, number];
  cursor: string;
  hitRadius: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShapeProperties = Record<string, number | boolean | string>;

export interface GeometryProvider {
  buildPath(bounds: Bounds, properties: ShapeProperties): string;
  getHandles(bounds: Bounds, properties: ShapeProperties): ShapeHandle[];
  updateFromHandle(handleId: string, pointer: [number, number], bounds: Bounds, properties: ShapeProperties): ShapeProperties;
}

const providers: Record<string, GeometryProvider> = {};

export function registerGeometryProvider(type: string, provider: GeometryProvider) {
  providers[type] = provider;
}

export function buildParametricPath(type: string, bounds: Bounds, properties: ShapeProperties): string {
  const provider = providers[type];
  if (!provider) return "";
  return provider.buildPath(bounds, properties);
}

export function getParametricHandles(type: string, bounds: Bounds, properties: ShapeProperties): ShapeHandle[] {
  const provider = providers[type];
  if (!provider) return [];
  return provider.getHandles(bounds, properties);
}

export function updateParametricGeometryFromHandle(type: string, handleId: string, pointer: [number, number], bounds: Bounds, properties: ShapeProperties): ShapeProperties {
  const provider = providers[type];
  if (!provider) return properties;
  return provider.updateFromHandle(handleId, pointer, bounds, properties);
}

// ---------------------------------------------------------------------------
// Native Shape Providers
// ---------------------------------------------------------------------------

registerGeometryProvider("star", {
  buildPath(bounds, properties) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const outerRx = bounds.width / 2;
    const outerRy = bounds.height / 2;
    
    // Default to 5 points and 0.45 inner ratio
    const points = typeof properties.points === "number" ? properties.points : 5;
    const innerRatio = typeof properties.innerRatio === "number" ? properties.innerRatio : 0.45;
    
    const innerRx = outerRx * innerRatio;
    const innerRy = outerRy * innerRatio;
    
    const totalVertices = points * 2;
    let d = "";
    
    for (let i = 0; i < totalVertices; i++) {
      const a = (Math.PI * 2 * i) / totalVertices - Math.PI / 2;
      const rx = i % 2 === 0 ? outerRx : innerRx;
      const ry = i % 2 === 0 ? outerRy : innerRy;
      
      const px = cx + rx * Math.cos(a);
      const py = cy + ry * Math.sin(a);
      
      if (i === 0) d += `M ${px} ${py} `;
      else d += `L ${px} ${py} `;
    }
    d += "Z";
    return d;
  },
  getHandles(bounds, properties) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const outerRy = bounds.height / 2;
    const innerRatio = typeof properties.innerRatio === "number" ? properties.innerRatio : 0.45;
    const points = typeof properties.points === "number" ? properties.points : 5;
    const totalVertices = points * 2;
    
    // Handle for inner radius
    const aInner = (Math.PI * 2 * 1) / totalVertices - Math.PI / 2;
    const pyInner = cy + (outerRy * innerRatio) * Math.sin(aInner);
    const pxInner = cx + (bounds.width / 2 * innerRatio) * Math.cos(aInner);
    
    return [
      {
        id: "innerRatio",
        type: "parameter",
        position: [pxInner, pyInner],
        cursor: "pointer",
        hitRadius: 10
      }
    ];
  },
  updateFromHandle(handleId, pointer, bounds, properties) {
    if (handleId === "innerRatio") {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      
      // Calculate distance from center to pointer
      const dx = pointer[0] - cx;
      const dy = pointer[1] - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate max possible radius (assuming roughly uniform bounds)
      const maxR = Math.min(bounds.width / 2, bounds.height / 2);
      
      let newRatio = dist / maxR;
      newRatio = Math.max(0.01, Math.min(1.0, newRatio));
      
      return { ...properties, innerRatio: newRatio };
    }
    return properties;
  }
});

registerGeometryProvider("polygon", {
  buildPath(bounds, properties) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    
    const sides = typeof properties.sides === "number" ? properties.sides : 6;
    
    let d = "";
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
      const px = cx + rx * Math.cos(a);
      const py = cy + ry * Math.sin(a);
      
      if (i === 0) d += `M ${px} ${py} `;
      else d += `L ${px} ${py} `;
    }
    d += "Z";
    return d;
  },
  getHandles(bounds, properties) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    const sides = typeof properties.sides === "number" ? properties.sides : 6;
    const a = (Math.PI * 2 * 0) / sides - Math.PI / 2;
    
    return [
      {
        id: "sides",
        type: "parameter",
        position: [cx + rx * Math.cos(a), cy + ry * Math.sin(a)],
        cursor: "pointer",
        hitRadius: 10
      }
    ];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "sides") {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const dx = pointer[0] - cx;
      const dy = pointer[1] - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const r = Math.min(bounds.width / 2, bounds.height / 2);
      
      let sides = Math.max(3, Math.round((dist / r) * 12));
      return { ...props, sides };
    }
    return props;
  }
});

registerGeometryProvider("rectangle", {
  buildPath(bounds, properties) {
    const cornerRadius = typeof properties.cornerRadius === "number" ? properties.cornerRadius : 0;
    const r = Math.min(cornerRadius, bounds.width / 2, bounds.height / 2);
    
    if (r <= 0) {
      return `M ${bounds.x} ${bounds.y} H ${bounds.x + bounds.width} V ${bounds.y + bounds.height} H ${bounds.x} Z`;
    }
    
    const { x, y, width, height } = bounds;
    return `
      M ${x + r} ${y}
      H ${x + width - r}
      A ${r} ${r} 0 0 1 ${x + width} ${y + r}
      V ${y + height - r}
      A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}
      H ${x + r}
      A ${r} ${r} 0 0 1 ${x} ${y + height - r}
      V ${y + r}
      A ${r} ${r} 0 0 1 ${x + r} ${y}
      Z
    `.trim().replace(/\s+/g, ' ');
  },
  getHandles(bounds, properties) {
    const r = typeof properties.cornerRadius === "number" ? properties.cornerRadius : 0;
    const maxR = Math.min(bounds.width / 2, bounds.height / 2);
    const validR = Math.min(r, maxR);
    
    return [
      {
        id: "cornerRadius",
        type: "parameter",
        position: [bounds.x + validR, bounds.y + validR],
        cursor: "pointer",
        hitRadius: 10
      }
    ];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "cornerRadius") {
      const maxR = Math.min(bounds.width / 2, bounds.height / 2);
      // We project pointer[0] to the x-axis relative to bounds.x
      let r = pointer[0] - bounds.x;
      r = Math.max(0, Math.min(maxR, r));
      return { ...props, cornerRadius: r };
    }
    return props;
  }
});

registerGeometryProvider("arrow", {
  buildPath(bounds, properties) {
    const headLength = typeof properties.headLength === "number" ? properties.headLength : 0.3;
    const shaftWidth = typeof properties.shaftWidth === "number" ? properties.shaftWidth : 0.4;
    
    const { x, y, width, height } = bounds;
    const hLengthPx = width * headLength;
    const sWidthPx = height * shaftWidth;
    
    const yCenter = y + height / 2;
    const yTopShaft = yCenter - sWidthPx / 2;
    const yBotShaft = yCenter + sWidthPx / 2;
    
    const xShaftEnd = x + width - hLengthPx;
    
    return `
      M ${x} ${yTopShaft}
      H ${xShaftEnd}
      V ${y}
      L ${x + width} ${yCenter}
      L ${xShaftEnd} ${y + height}
      V ${yBotShaft}
      H ${x}
      Z
    `.trim().replace(/\s+/g, ' ');
  },
  getHandles(bounds, properties) {
    const headLength = typeof properties.headLength === "number" ? properties.headLength : 0.3;
    const shaftWidth = typeof properties.shaftWidth === "number" ? properties.shaftWidth : 0.4;
    
    const xHead = bounds.x + bounds.width * (1 - headLength);
    const yShaft = bounds.y + bounds.height / 2 - (bounds.height * shaftWidth) / 2;
    
    return [
      { id: "headLength", type: "parameter", position: [xHead, bounds.y], cursor: "ew-resize", hitRadius: 10 },
      { id: "shaftWidth", type: "parameter", position: [bounds.x, yShaft], cursor: "ns-resize", hitRadius: 10 }
    ];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "headLength") {
      let hl = 1 - (pointer[0] - bounds.x) / bounds.width;
      hl = Math.max(0.1, Math.min(0.9, hl));
      return { ...props, headLength: hl };
    } else if (id === "shaftWidth") {
      let sw = 1 - ((pointer[1] - bounds.y) / (bounds.height / 2));
      sw = Math.max(0.1, Math.min(1.0, sw));
      return { ...props, shaftWidth: sw };
    }
    return props;
  }
});

registerGeometryProvider("donut", {
  buildPath(bounds, properties) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    const innerRatio = typeof properties.innerRatio === "number" ? properties.innerRatio : 0.5;
    
    const irx = rx * innerRatio;
    const iry = ry * innerRatio;
    
    // SVG path for a donut using two subpaths (outer circle, inner circle reversed)
    return `
      M ${cx + rx} ${cy}
      A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}
      A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}
      M ${cx + irx} ${cy}
      A ${irx} ${iry} 0 1 1 ${cx - irx} ${cy}
      A ${irx} ${iry} 0 1 1 ${cx + irx} ${cy}
      Z
    `.trim().replace(/\s+/g, ' ');
  },
  getHandles(bounds, properties) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const innerRatio = typeof properties.innerRatio === "number" ? properties.innerRatio : 0.5;
    
    return [
      {
        id: "innerRatio",
        type: "parameter",
        position: [cx + rx * innerRatio, cy],
        cursor: "ew-resize",
        hitRadius: 10
      }
    ];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "innerRatio") {
      const cx = bounds.x + bounds.width / 2;
      let ratio = (pointer[0] - cx) / (bounds.width / 2);
      ratio = Math.max(0.1, Math.min(0.9, ratio));
      return { ...props, innerRatio: ratio };
    }
    return props;
  }
});

// Fallback for missing/unimplemented shapes
const fallbackShape: GeometryProvider = {
  buildPath(bounds) {
    return `M ${bounds.x} ${bounds.y} H ${bounds.x + bounds.width} V ${bounds.y + bounds.height} H ${bounds.x} Z`;
  },
  getHandles() { return []; },
  updateFromHandle(_id, _pt, _bounds, props) { return props; }
};

registerGeometryProvider("ellipse", {
  buildPath(bounds) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  },
  getHandles() { return []; },
  updateFromHandle(_id, _pointer, _bounds, props) { return props; }
});

registerGeometryProvider("speech-bubble", {
  getHandles(bounds, properties) {
    const tailPos = typeof properties.tailPos === "number" ? properties.tailPos : 0.2;
    return [{
      id: "tailPos", type: "parameter",
      position: [bounds.x + bounds.width * tailPos, bounds.y + bounds.height],
      cursor: "ew-resize", hitRadius: 10
    }];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "tailPos") {
      let tailPos = (pointer[0] - bounds.x) / bounds.width;
      tailPos = Math.max(0, Math.min(1, tailPos));
      return { ...props, tailPos };
    }
    return props;
  },
  buildPath(bounds, properties) {
    const { x, y, width, height } = bounds;
    const tailPos = typeof properties.tailPos === "number" ? properties.tailPos : 0.2;
    const r = Math.min(width, height) * 0.15;
    const boxH = height - 20;
    const tailCenter = width * tailPos;
    const tailHalfWidth = Math.min(width * 0.1, 10);
    const leftBase = Math.max(r, Math.min(width - r - tailHalfWidth * 2, tailCenter - tailHalfWidth));
    const rightBase = Math.min(width - r, Math.max(r + tailHalfWidth * 2, tailCenter + tailHalfWidth));
    return `
      M ${x} ${y + r}
      Q ${x} ${y} ${x + r} ${y}
      H ${x + width - r}
      Q ${x + width} ${y} ${x + width} ${y + r}
      V ${y + boxH - r}
      Q ${x + width} ${y + boxH} ${x + width - r} ${y + boxH}
      H ${x + rightBase}
      L ${x + tailCenter} ${y + height}
      L ${x + leftBase} ${y + boxH}
      H ${x + r}
      Q ${x} ${y + boxH} ${x} ${y + boxH - r}
      Z
    `.trim().replace(/\s+/g, ' ');
  }
});

registerGeometryProvider("banner", {
  getHandles(bounds, properties) {
    const indent = typeof properties.indent === "number" ? properties.indent : 0.166;
    return [{
      id: "indent", type: "parameter",
      position: [bounds.x + bounds.width * indent, bounds.y + bounds.height / 2],
      cursor: "ew-resize", hitRadius: 10
    }];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "indent") {
      let indent = (pointer[0] - bounds.x) / bounds.width;
      indent = Math.max(0, Math.min(0.4, indent));
      return { ...props, indent };
    }
    return props;
  },
  buildPath(bounds, properties) {
    const { x, y, width, height } = bounds;
    const indent = typeof properties.indent === "number" ? properties.indent : 0.166;
    const dx = width * indent;
    return `
      M ${x} ${y}
      L ${x + dx} ${y + height / 2}
      L ${x} ${y + height}
      H ${x + width}
      L ${x + width - dx} ${y + height / 2}
      L ${x + width} ${y}
      Z
    `.trim().replace(/\s+/g, ' ');
  }
});

registerGeometryProvider("badge", {
  getHandles(bounds, properties) {
    const indent = typeof properties.indent === "number" ? properties.indent : 0.36;
    const cx = bounds.x + bounds.width / 2;
    return [{
      id: "indent", type: "parameter",
      position: [cx + bounds.width/2 * indent, bounds.y + bounds.height/2 * (1 - 0.7)],
      cursor: "ew-resize", hitRadius: 10
    }];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "indent") {
      const cx = bounds.x + bounds.width / 2;
      let indent = (pointer[0] - cx) / (bounds.width/2);
      indent = Math.max(0, Math.min(0.8, indent));
      return { ...props, indent };
    }
    return props;
  },
  buildPath(bounds, properties) {
    const { x, y, width, height } = bounds;
    const indent = typeof properties.indent === "number" ? properties.indent : 0.36;
    const rx = width / 2;
    const ry = height / 2;
    const cx = x + rx;
    const cy = y + ry;
    const pts = [
      [0, -1], [indent, -0.7], [0.818, -0.7], [0.818, -indent * 0.555],
      [1, 0], [0.818, indent * 0.555], [0.818, 0.7], [indent, 0.7],
      [0, 1], [-indent, 0.7], [-0.818, 0.7], [-0.818, indent * 0.555],
      [-1, 0], [-0.818, -indent * 0.555], [-0.818, -0.7], [-indent, -0.7]
    ];
    const path = pts.map((p, i) => {
      const cmd = i === 0 ? "M" : "L";
      return `${cmd} ${cx + p[0] * rx} ${cy + p[1] * ry}`;
    }).join(" ");
    return `${path} Z`;
  }
});

registerGeometryProvider("shield", {
  getHandles(bounds, properties) {
    const cornerY = typeof properties.cornerY === "number" ? properties.cornerY : 0.15;
    return [{
      id: "cornerY", type: "parameter",
      position: [bounds.x + bounds.width, bounds.y + bounds.height * cornerY],
      cursor: "ns-resize", hitRadius: 10
    }];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "cornerY") {
      let cornerY = (pointer[1] - bounds.y) / bounds.height;
      cornerY = Math.max(0, Math.min(0.5, cornerY));
      return { ...props, cornerY };
    }
    return props;
  },
  buildPath(bounds, properties) {
    const { x, y, width, height } = bounds;
    const cornerY = typeof properties.cornerY === "number" ? properties.cornerY : 0.15;
    const curveStartY = 0.45;
    const controlY = 0.75;
    return `
      M ${x + width / 2} ${y}
      L ${x + width} ${y + height * cornerY}
      V ${y + height * curveStartY}
      Q ${x + width} ${y + height * controlY} ${x + width / 2} ${y + height}
      Q ${x} ${y + height * controlY} ${x} ${y + height * curveStartY}
      V ${y + height * cornerY}
      Z
    `.trim().replace(/\s+/g, ' ');
  }
});

registerGeometryProvider("cloud", {
  getHandles(bounds, properties) {
    const puff = typeof properties.puff === "number" ? properties.puff : 1.0;
    const sY = bounds.height / 48;
    const sX = bounds.width / 48;
    const peakX = bounds.x + 25.5 * sX;
    const peakY = bounds.y + 20.5 * sY - 10 * sY * puff;
    return [{
      id: "puff", type: "parameter", position: [peakX, peakY], cursor: "ns-resize", hitRadius: 10
    }];
  },
  updateFromHandle(id, pointer, bounds, props) {
    if (id === "puff") {
      const sY = bounds.height / 48;
      const baseTopY = bounds.y + 20.5 * sY;
      let dist = baseTopY - pointer[1];
      let puff = dist / (10 * sY);
      puff = Math.max(0.5, Math.min(1.5, puff));
      return { ...props, puff };
    }
    return props;
  },
  buildPath(bounds, properties) {
    const { x, y, width, height } = bounds;
    const puff = typeof properties.puff === "number" ? properties.puff : 1.0;
    const sX = width / 168;
    const sY = height / 98;
    const cx = x + width / 2;
    const cy = y + height / 2 - 10 * sY;
    return `
      M ${cx - 60 * sX} ${cy + 30 * sY}
      a ${25 * sX * puff} ${25 * sY * puff} 0 0 1 ${-5 * sX} ${-49 * sY}
      a ${35 * sX * puff} ${35 * sY * puff} 0 0 1 ${68 * sX} ${-15 * sY}
      a ${30 * sX * puff} ${30 * sY * puff} 0 0 1 ${27 * sX} ${34 * sY}
      a ${25 * sX * puff} ${25 * sY * puff} 0 0 1 ${-15 * sX} ${30 * sY}
      Z
    `.trim().replace(/\s+/g, ' ');
  }
});
