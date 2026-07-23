"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var jsdom_1 = require("jsdom");
var dom = new jsdom_1.JSDOM();
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
var canonicalSvg_1 = require("./src/editor/canonicalSvg");
var helpers_1 = require("./src/editor/commands/helpers");
var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1080\" height=\"1080\" data-printrocket=\"true\">\n  <g data-role=\"shapes\" data-editable=\"true\" data-layer-id=\"shapes-0\">\n    <rect x=\"100\" y=\"100\" width=\"100\" height=\"100\" data-element-id=\"child-1\" />\n  </g>\n</svg>";
try {
    console.log("Parsing SVG...");
    var artboard = (0, canonicalSvg_1.parseCanonicalSvg)(svg);
    console.log("Parsed Artboard layers:", JSON.stringify(artboard.layers, null, 2));
    // Simulating createLayerCommand
    var newShape_1 = {
        id: "shape-rect-2",
        role: "shapes",
        name: "Rectangle",
        editable: true,
        locked: false,
        visible: true,
        opacity: 100,
        kind: "rect",
        field: "shape-rect",
        geometry: { type: "rect", x: 200, y: 200, width: 50, height: 50 }
    };
    var layers = artboard.layers;
    var groupIndex = layers.findIndex(function (l) { return l.kind === "group" && l.role === newShape_1.role; });
    var nextLayers = void 0;
    if (groupIndex === -1) {
        console.log("Group not found! Inserting at top level.");
        nextLayers = (0, helpers_1.insertLayerAt)(layers, newShape_1, layers.length);
    }
    else {
        console.log("Group found! Inserting as child.");
        var group = layers[groupIndex];
        var nextGroup = __assign(__assign({}, group), { children: (0, helpers_1.insertLayerAt)(group.children, newShape_1, group.children.length) });
        nextLayers = __spreadArray([], layers, true);
        nextLayers[groupIndex] = nextGroup;
    }
    var nextArtboard = __assign(__assign({}, artboard), { layers: nextLayers });
    console.log("Serializing new artboard...");
    var newSvg = (0, canonicalSvg_1.serializeArtboard)(nextArtboard);
    console.log("New SVG:\n" + newSvg);
}
catch (err) {
    console.error("Error!", err);
}
