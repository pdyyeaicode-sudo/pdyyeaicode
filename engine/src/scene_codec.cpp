// scene_codec.cpp — decoder for the binary scene wire format.
//
// Every read is bounds-checked. Because the engine is compiled without
// exceptions, failures are reported through the return value and `error` string
// rather than thrown, and a rejected buffer never partially mutates the output.

#include "pydee/scene_codec.h"

#include <cstring>
#include <memory>
#include <utility>
#include <vector>

namespace pydee {
namespace {

// Sequential little-endian reader that refuses to read past the end.
class Reader {
 public:
  Reader(const uint8_t* data, size_t size) : data_(data), size_(size) {}

  bool ok() const { return ok_; }
  size_t offset() const { return offset_; }

  bool ReadU8(uint8_t* out) { return ReadRaw(out, sizeof(*out)); }
  bool ReadU16(uint16_t* out) { return ReadRaw(out, sizeof(*out)); }
  bool ReadU32(uint32_t* out) { return ReadRaw(out, sizeof(*out)); }
  bool ReadF64(double* out) { return ReadRaw(out, sizeof(*out)); }

  bool ReadString(size_t length, std::string* out) {
    if (!Available(length)) {
      return Fail();
    }
    out->assign(reinterpret_cast<const char*>(data_ + offset_), length);
    offset_ += length;
    return true;
  }

 private:
  bool Available(size_t bytes) const { return ok_ && offset_ + bytes <= size_; }

  bool Fail() {
    ok_ = false;
    return false;
  }

  bool ReadRaw(void* destination, size_t bytes) {
    if (!Available(bytes)) {
      return Fail();
    }
    std::memcpy(destination, data_ + offset_, bytes);
    offset_ += bytes;
    return true;
  }

  const uint8_t* data_;
  size_t size_;
  size_t offset_ = 0;
  bool ok_ = true;
};

bool DecodeBlendMode(uint8_t value, BlendMode* out) {
  if (value > static_cast<uint8_t>(BlendMode::kPlusLighter)) {
    return false;
  }
  *out = static_cast<BlendMode>(value);
  return true;
}

bool DecodeMatrix(Reader& reader, Matrix2D* out) {
  return reader.ReadF64(&out->a) && reader.ReadF64(&out->b) && reader.ReadF64(&out->c)
      && reader.ReadF64(&out->d) && reader.ReadF64(&out->e) && reader.ReadF64(&out->f);
}

/**
 * Decode the gradient payload that follows a gradient paint's kind and colour.
 *
 * Stops are validated rather than trusted: offsets must be finite and in 0..1,
 * and they must be non-decreasing. A gradient whose stops are out of order would
 * render differently in Skia than in the SVG backend, which is exactly the class
 * of silent divergence the parity harness exists to catch.
 */
bool DecodeGradient(Reader& reader, Gradient::Type type, std::shared_ptr<const Gradient>* out) {
  auto gradient = std::make_shared<Gradient>();
  gradient->type = type;

  uint8_t spread_value = 0;
  uint8_t units_value = 0;
  uint8_t stop_count = 0;
  uint8_t reserved = 0;
  if (!reader.ReadU8(&spread_value) || !reader.ReadU8(&units_value)
      || !reader.ReadU8(&stop_count) || !reader.ReadU8(&reserved)) {
    return false;
  }
  if (reserved != 0 || spread_value > 2 || units_value > 1) {
    return false;
  }
  gradient->spread = static_cast<GradientSpread>(spread_value);
  gradient->units =
      units_value == 1 ? GradientUnits::kObjectBoundingBox : GradientUnits::kUserSpace;

  if (!DecodeMatrix(reader, &gradient->transform)) {
    return false;
  }

  if (type == Gradient::Type::kLinear) {
    if (!reader.ReadF64(&gradient->x1) || !reader.ReadF64(&gradient->y1)
        || !reader.ReadF64(&gradient->x2) || !reader.ReadF64(&gradient->y2)) {
      return false;
    }
  } else {
    if (!reader.ReadF64(&gradient->cx) || !reader.ReadF64(&gradient->cy)
        || !reader.ReadF64(&gradient->r) || !reader.ReadF64(&gradient->fx)
        || !reader.ReadF64(&gradient->fy)) {
      return false;
    }
  }

  gradient->stops.reserve(stop_count);
  double previous_offset = 0.0;
  for (uint8_t index = 0; index < stop_count; ++index) {
    GradientStop stop;
    uint32_t color = 0;
    if (!reader.ReadF64(&stop.offset) || !reader.ReadU32(&color)) {
      return false;
    }
    if (!(stop.offset >= 0.0 && stop.offset <= 1.0) || stop.offset < previous_offset) {
      return false;
    }
    previous_offset = stop.offset;
    stop.color = static_cast<Color>(color);
    gradient->stops.push_back(stop);
  }

  *out = std::move(gradient);
  return true;
}

bool DecodePaint(Reader& reader, const PaintServerTable* paint_servers,
                 uint32_t* unresolved_references, Paint* out) {
  uint8_t kind = 0;
  uint32_t color = 0;
  if (!reader.ReadU8(&kind) || !reader.ReadU32(&color)) {
    return false;
  }
  switch (static_cast<WirePaintKind>(kind)) {
    case WirePaintKind::kNone:
      *out = Paint::None();
      return true;
    case WirePaintKind::kSolid:
      *out = Paint::Solid(static_cast<Color>(color));
      return true;
    case WirePaintKind::kLinearGradient:
    case WirePaintKind::kRadialGradient: {
      const Gradient::Type type =
          static_cast<WirePaintKind>(kind) == WirePaintKind::kLinearGradient
              ? Gradient::Type::kLinear
              : Gradient::Type::kRadial;
      std::shared_ptr<const Gradient> gradient;
      if (!DecodeGradient(reader, type, &gradient)) {
        return false;
      }
      *out = Paint::FromGradient(std::move(gradient));
      return true;
    }
    case WirePaintKind::kReference: {
      uint16_t id_length = 0;
      std::string id;
      if (!reader.ReadU16(&id_length) || !reader.ReadString(id_length, &id)) {
        return false;
      }
      std::shared_ptr<const Gradient> gradient =
          paint_servers == nullptr ? nullptr : paint_servers->Find(id);
      if (gradient == nullptr) {
        // Counted, never substituted: an invented colour would be
        // indistinguishable from a deliberate design choice.
        ++(*unresolved_references);
        *out = Paint::None();
        return true;
      }
      *out = Paint::FromGradient(std::move(gradient));
      return true;
    }
    default:
      return false;
  }
}

bool DecodeStroke(Reader& reader, const PaintServerTable* paint_servers,
                  uint32_t* unresolved_references, Stroke* out) {
  if (!DecodePaint(reader, paint_servers, unresolved_references, &out->paint)) {
    return false;
  }
  return reader.ReadF64(&out->width);
}

}  // namespace

bool DecodeScene(const uint8_t* data, size_t size, Scene* out, std::string* error,
                 const PaintServerTable* paint_servers) {
  uint32_t unresolved_references = 0;

  auto fail = [&](const char* reason) {
    if (error != nullptr) {
      *error = reason;
    }
    return false;
  };

  if (data == nullptr || out == nullptr) {
    return fail("null argument");
  }

  Reader reader(data, size);

  uint32_t magic = 0;
  uint32_t version = 0;
  double width = 0.0;
  double height = 0.0;
  uint32_t node_count = 0;
  if (!reader.ReadU32(&magic) || !reader.ReadU32(&version) || !reader.ReadF64(&width)
      || !reader.ReadF64(&height) || !reader.ReadU32(&node_count)) {
    return fail("buffer too small for scene header");
  }
  if (magic != kSceneMagic) {
    return fail("bad magic: not a Pydee scene buffer");
  }
  if (version != kSceneVersion) {
    return fail("unsupported scene format version");
  }

  // Build every node first, then attach children. Parents always precede their
  // children on the wire, so a single pass suffices.
  std::vector<std::unique_ptr<Node>> nodes;
  std::vector<uint32_t> parents;
  nodes.reserve(node_count);
  parents.reserve(node_count);

  for (uint32_t index = 0; index < node_count; ++index) {
    uint32_t parent_index = 0;
    uint8_t kind_value = 0;
    uint8_t blend_value = 0;
    uint8_t flags = 0;
    uint8_t reserved = 0;
    if (!reader.ReadU32(&parent_index) || !reader.ReadU8(&kind_value)
        || !reader.ReadU8(&blend_value) || !reader.ReadU8(&flags) || !reader.ReadU8(&reserved)) {
      return fail("truncated node header");
    }
    if (reserved != 0) {
      return fail("reserved byte must be zero");
    }
    if (parent_index != kNoParent && parent_index >= index) {
      // Guarantees the tree is acyclic and buildable in one pass.
      return fail("parent index must refer to an earlier node");
    }

    BlendMode blend_mode = BlendMode::kNormal;
    if (!DecodeBlendMode(blend_value, &blend_mode)) {
      return fail("unknown blend mode");
    }

    double opacity = 1.0;
    Matrix2D transform;
    if (!reader.ReadF64(&opacity) || !DecodeMatrix(reader, &transform)) {
      return fail("truncated node transform");
    }

    std::optional<RectF> local_bounds;
    if ((flags & kFlagHasLocalBounds) != 0) {
      RectF bounds;
      if (!reader.ReadF64(&bounds.x) || !reader.ReadF64(&bounds.y)
          || !reader.ReadF64(&bounds.width) || !reader.ReadF64(&bounds.height)) {
        return fail("truncated node bounds");
      }
      local_bounds = bounds;
    }

    uint16_t id_length = 0;
    std::string id;
    if (!reader.ReadU16(&id_length) || !reader.ReadString(id_length, &id)) {
      return fail("truncated node id");
    }

    std::unique_ptr<Node> node;
    switch (static_cast<WireNodeKind>(kind_value)) {
      case WireNodeKind::kRect: {
        auto rect = std::make_unique<RectNode>();
        if (!reader.ReadF64(&rect->x) || !reader.ReadF64(&rect->y)
            || !reader.ReadF64(&rect->width) || !reader.ReadF64(&rect->height)
            || !reader.ReadF64(&rect->corner_radius)
            || !DecodePaint(reader, paint_servers, &unresolved_references, &rect->fill)
            || !DecodeStroke(reader, paint_servers, &unresolved_references, &rect->stroke)) {
          return fail("truncated rect node");
        }
        node = std::move(rect);
        break;
      }
      case WireNodeKind::kEllipse: {
        auto ellipse = std::make_unique<EllipseNode>();
        if (!reader.ReadF64(&ellipse->cx) || !reader.ReadF64(&ellipse->cy)
            || !reader.ReadF64(&ellipse->rx) || !reader.ReadF64(&ellipse->ry)
            || !DecodePaint(reader, paint_servers, &unresolved_references, &ellipse->fill)
            || !DecodeStroke(reader, paint_servers, &unresolved_references, &ellipse->stroke)) {
          return fail("truncated ellipse node");
        }
        node = std::move(ellipse);
        break;
      }
      case WireNodeKind::kPath: {
        auto path = std::make_unique<PathNode>();
        uint32_t d_length = 0;
        if (!reader.ReadU32(&d_length) || !reader.ReadString(d_length, &path->d)
            || !DecodePaint(reader, paint_servers, &unresolved_references, &path->fill)
            || !DecodeStroke(reader, paint_servers, &unresolved_references, &path->stroke)) {
          return fail("truncated path node");
        }
        node = std::move(path);
        break;
      }
      case WireNodeKind::kText: {
        auto text = std::make_unique<TextNode>();
        uint8_t style_flags = 0;
        uint8_t align_value = 0;
        uint16_t family_length = 0;
        uint32_t content_length = 0;
        if (!reader.ReadF64(&text->x) || !reader.ReadF64(&text->y)
            || !reader.ReadF64(&text->font_size) || !reader.ReadF64(&text->letter_spacing)
            || !reader.ReadF64(&text->line_height) || !reader.ReadU8(&style_flags)
            || !reader.ReadU8(&align_value) || !reader.ReadU16(&family_length)
            || !reader.ReadString(family_length, &text->font_family)
            || !reader.ReadU32(&content_length)
            || !reader.ReadString(content_length, &text->content)
            || !DecodePaint(reader, paint_servers, &unresolved_references, &text->fill)) {
          return fail("truncated text node");
        }
        if (align_value > 2) {
          return fail("unknown text alignment");
        }
        text->bold = (style_flags & kTextStyleBold) != 0;
        text->italic = (style_flags & kTextStyleItalic) != 0;
        text->direction =
            (style_flags & kTextStyleRtl) != 0 ? TextDirection::kRtl : TextDirection::kLtr;
        if ((style_flags & kTextStyleUnderline) != 0
            && (style_flags & kTextStyleLineThrough) != 0) {
          // The document model produces one decoration, so both bits set means
          // the encoder and decoder disagree. Rejecting is safer than picking.
          return fail("text cannot be both underlined and struck through");
        }
        text->decoration = (style_flags & kTextStyleUnderline) != 0
                               ? TextDecoration::kUnderline
                               : (style_flags & kTextStyleLineThrough) != 0
                                     ? TextDecoration::kLineThrough
                                     : TextDecoration::kNone;
        text->align = align_value == 1 ? TextAlign::kCenter
                    : align_value == 2 ? TextAlign::kRight
                                       : TextAlign::kLeft;
        node = std::move(text);
        break;
      }
      case WireNodeKind::kGroup: {
        auto group = std::make_unique<GroupNode>();
        group->isolate = (flags & kFlagIsolate) != 0;
        node = std::move(group);
        break;
      }
      default:
        return fail("unknown node kind");
    }

    node->id = std::move(id);
    node->opacity = opacity;
    node->blend_mode = blend_mode;
    node->local_transform = transform;
    node->local_bounds = local_bounds;

    nodes.push_back(std::move(node));
    parents.push_back(parent_index);
  }

  if (!reader.ok()) {
    return fail("scene buffer is truncated");
  }

  // Raw pointers stay valid across the moves below because unique_ptr transfers
  // ownership without relocating the pointee.
  std::vector<Node*> raw(nodes.size(), nullptr);
  for (size_t index = 0; index < nodes.size(); ++index) {
    raw[index] = nodes[index].get();
  }

  Scene scene;
  scene.width = width;
  scene.height = height;
  scene.unresolved_paint_references = unresolved_references;

  for (size_t index = 0; index < nodes.size(); ++index) {
    const uint32_t parent_index = parents[index];
    if (parent_index == kNoParent) {
      scene.roots.push_back(std::move(nodes[index]));
      continue;
    }
    Node* parent = raw[parent_index];
    if (parent->kind != NodeKind::kGroup) {
      return fail("parent node is not a group");
    }
    static_cast<GroupNode*>(parent)->children.push_back(std::move(nodes[index]));
  }

  *out = std::move(scene);
  if (error != nullptr) {
    error->clear();
  }
  return true;
}

}  // namespace pydee
