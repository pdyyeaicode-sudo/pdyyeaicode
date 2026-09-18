// scene_codec.h — binary scene transfer format between TypeScript and the engine.
//
// Why binary rather than JSON:
//
//  * No JSON parser dependency in the engine.
//  * The editor sends a scene on every document change; parsing text on the hot
//    path is wasted work (spec §46: avoid excessive WASM boundary traffic).
//  * A versioned header lets the format evolve without silent misreads.
//
// The wire format is a FLAT node array in paint order with parent indices, not a
// nested structure. Flat encoding avoids recursive serialisation on the
// TypeScript side and lets the decoder allocate once. Parents always precede
// their children, so the tree can be rebuilt in a single pass.
//
// All integers and floats are little-endian. Geometry uses f64 so values match
// JavaScript numbers exactly and no precision is silently lost in transit.
//
// Layout (version 1):
//
//   header:
//     u32 magic = kMagic
//     u32 version
//     f64 width
//     f64 height
//     u32 node_count
//
//   per node:
//     u32 parent_index      (kNoParent for a root)
//     u8  kind              (see NodeKind ordering below)
//     u8  blend_mode
//     u8  flags             (bit0 isolate, bit1 has_local_bounds)
//     u8  reserved          (must be 0)
//     f64 opacity
//     f64 matrix[6]         (a, b, c, d, e, f)
//     f64 bounds[4]         (only when bit1 of flags is set)
//     u16 id_length, then id_length bytes of UTF-8
//     kind-specific payload:
//       rect     : f64 x, y, width, height, corner_radius; paint fill; stroke
//       ellipse  : f64 cx, cy, rx, ry;                     paint fill; stroke
//       path     : u32 d_length + bytes;                   paint fill; stroke
//       text     : f64 x, y, font_size, letter_spacing, line_height;
//                  u8 style_flags (bit0 bold, bit1 italic, bit2 rtl,
//                                  bit3 underline, bit4 line-through);
//                  u8 align (0 left, 1 center, 2 right);
//                  u16 family_length + bytes;
//                  u32 content_length + bytes;
//                  paint fill
//       group    : (nothing)
//
//   paint : u8 kind (0 none, 1 solid, 2 linear gradient, 3 radial gradient,
//                    4 paint-server reference)
//           u32 color (0xAARRGGBB; 0 and unused for kinds 2, 3 and 4)
//           when kind is 2 or 3, a gradient payload follows:
//             u8  spread (0 pad, 1 reflect, 2 repeat)
//             u8  units  (0 userSpaceOnUse, 1 objectBoundingBox)
//             u8  stop_count
//             u8  reserved (must be 0)
//             f64 gradient_transform[6]
//             linear: f64 x1, y1, x2, y2
//             radial: f64 cx, cy, r, fx, fy
//             per stop: f64 offset, u32 color (0xAARRGGBB)
//           when kind is 4:
//             u16 id_length, then id_length bytes of UTF-8
//           A reference is resolved against the PaintServerTable parsed from the
//           artboard's <defs>. That parsing lives in C++ so gradient geometry,
//           percentage resolution and transform composition have exactly one
//           implementation; TypeScript only forwards the id.
//   stroke: paint, f64 width
//
// The decoder validates every read against the buffer length and reports a
// reason on failure. Malformed input is rejected, never partially applied.
//
// Version history:
//   1 — rect, ellipse, path, group
//   2 — adds text
//   3 — adds linear/radial gradient paints, paint-server references and text
//       decoration
//
// One responsibility per file: scene wire format decoding.

#ifndef PYDEE_SCENE_CODEC_H_
#define PYDEE_SCENE_CODEC_H_

#include <cstddef>
#include <cstdint>
#include <string>

#include "pydee/paint_servers.h"
#include "pydee/scene.h"

namespace pydee {

// 'PYDS' little-endian.
constexpr uint32_t kSceneMagic = 0x53445950u;
constexpr uint32_t kSceneVersion = 3u;
constexpr uint32_t kNoParent = 0xFFFFFFFFu;

// Wire values for NodeKind. Must stay in sync with the TypeScript encoder.
enum class WireNodeKind : uint8_t {
  kRect = 0,
  kEllipse = 1,
  kPath = 2,
  kGroup = 3,
  kText = 4,
};

/** Wire values for Paint::Kind. Must stay in sync with the TypeScript encoder. */
enum class WirePaintKind : uint8_t {
  kNone = 0,
  kSolid = 1,
  kLinearGradient = 2,
  kRadialGradient = 3,
  kReference = 4,
};

constexpr uint8_t kFlagIsolate = 1u << 0;
constexpr uint8_t kFlagHasLocalBounds = 1u << 1;

/** Text style bits packed into the text payload. */
constexpr uint8_t kTextStyleBold = 1u << 0;
constexpr uint8_t kTextStyleItalic = 1u << 1;
constexpr uint8_t kTextStyleRtl = 1u << 2;
constexpr uint8_t kTextStyleUnderline = 1u << 3;
constexpr uint8_t kTextStyleLineThrough = 1u << 4;

// Decode a scene. On failure returns false, leaves `out` untouched and sets
// `error` to a human-readable reason.
//
// `paint_servers` resolves `url(#id)` paints. When it is null, or when an id is
// absent from it, the paint is left unpainted and counted in
// `Scene::unresolved_paint_references` — never substituted with a colour.
bool DecodeScene(const uint8_t* data, size_t size, Scene* out, std::string* error,
                 const PaintServerTable* paint_servers = nullptr);

}  // namespace pydee

#endif  // PYDEE_SCENE_CODEC_H_
