import { JSDOM } from "jsdom";
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;

function wrapSvgWithViewport(svgMarkup, zoom, panX, panY) {
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
    if (parsed.querySelector("parsererror")) {
      return svgMarkup;
    }
    const root = parsed.documentElement;
    if (root.tagName.toLowerCase() !== "svg") {
      return svgMarkup;
    }
    
    const roleGroups = Array.from(root.children).filter(
      (el) => el.tagName.toLowerCase() === "g" && el.hasAttribute("data-role")
    );
    if (roleGroups.length === 0) {
      return svgMarkup;
    }

    const wrapper = parsed.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.setAttribute("data-viewport", "true");
    wrapper.setAttribute("transform", `translate(${panX}, ${panY}) scale(${zoom})`);

    root.insertBefore(wrapper, roleGroups[0]);
    roleGroups.forEach((group) => {
      wrapper.appendChild(group);
    });

    return new XMLSerializer().serializeToString(root);
  } catch (e) {
    return svgMarkup;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" data-printrocket="true">
<g data-role="shapes" data-editable="true" data-layer-id="shapes-0">
<rect data-layer-id="shapes-0" data-element-id="child-1" x="100" y="100" width="100" height="100"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="shape-rect-2" data-name="Rectangle">
<rect data-layer-id="shape-rect-2" data-field="shape-rect" x="200" y="200" width="50" height="50"/>
</g>
</svg>`;

console.log(wrapSvgWithViewport(svg, 1, 0, 0));
