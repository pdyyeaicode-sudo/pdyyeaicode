// paint_servers.cpp — SVG defs scanner and gradient resolver.
//
// A focused scanner rather than a general XML parser: it needs to recognise
// exactly `<linearGradient>`, `<radialGradient>` and their `<stop>` children,
// and it must not be able to fail in ways a general parser can (entity
// expansion, external references). Compiled without exceptions, so every
// failure is a return value.

#include "pydee/paint_servers.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <optional>
#include <unordered_set>
#include <utility>
#include <vector>

namespace pydee {
namespace {

bool IsSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f'; }

std::string Trim(const std::string& value) {
  size_t begin = 0;
  size_t end = value.size();
  while (begin < end && IsSpace(value[begin])) {
    ++begin;
  }
  while (end > begin && IsSpace(value[end - 1])) {
    --end;
  }
  return value.substr(begin, end - begin);
}

std::string ToLower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return value;
}

/** Parse a finite double. Returns false on trailing junk, never on a guess. */
bool ParseDouble(const std::string& text, double* out) {
  const std::string trimmed = Trim(text);
  if (trimmed.empty()) {
    return false;
  }
  char* end = nullptr;
  const double value = std::strtod(trimmed.c_str(), &end);
  if (end == trimmed.c_str() || !std::isfinite(value)) {
    return false;
  }
  while (end != nullptr && *end != '\0' && IsSpace(*end)) {
    ++end;
  }
  if (end != nullptr && *end != '\0') {
    return false;
  }
  *out = value;
  return true;
}

/**
 * Resolve a coordinate that may be a percentage.
 *
 * `reference` is what 100% means: 1.0 in objectBoundingBox units, or the
 * relevant viewport extent in user space.
 */
bool ParseCoordinate(const std::string& text, double reference, double* out) {
  const std::string trimmed = Trim(text);
  if (!trimmed.empty() && trimmed.back() == '%') {
    double percent = 0.0;
    if (!ParseDouble(trimmed.substr(0, trimmed.size() - 1), &percent)) {
      return false;
    }
    *out = percent / 100.0 * reference;
    return true;
  }
  return ParseDouble(trimmed, out);
}

int ClampByte(double value) {
  const double rounded = std::floor(value + 0.5);
  if (rounded < 0.0) {
    return 0;
  }
  if (rounded > 255.0) {
    return 255;
  }
  return static_cast<int>(rounded);
}

bool ParseHexDigits(const std::string& hex, Color* out) {
  std::string normalized;
  auto expand = [](char c) { return std::string(2, c); };

  if (hex.size() == 3) {
    normalized = "ff";
    for (char c : hex) {
      normalized += expand(c);
    }
  } else if (hex.size() == 4) {
    normalized = expand(hex[3]) + expand(hex[0]) + expand(hex[1]) + expand(hex[2]);
  } else if (hex.size() == 6) {
    normalized = "ff" + hex;
  } else if (hex.size() == 8) {
    // CSS hex is #RRGGBBAA while the engine's Color is AARRGGBB.
    normalized = hex.substr(6, 2) + hex.substr(0, 6);
  } else {
    return false;
  }

  uint32_t accumulated = 0;
  for (char c : normalized) {
    int digit;
    if (c >= '0' && c <= '9') {
      digit = c - '0';
    } else if (c >= 'a' && c <= 'f') {
      digit = c - 'a' + 10;
    } else {
      return false;
    }
    accumulated = (accumulated << 4) | static_cast<uint32_t>(digit);
  }
  *out = static_cast<Color>(accumulated);
  return true;
}

bool ParseRgbFunction(const std::string& body, Color* out) {
  std::vector<std::string> parts;
  std::string current;
  for (char c : body) {
    if (c == ',' || c == '/' || IsSpace(c)) {
      if (!Trim(current).empty()) {
        parts.push_back(Trim(current));
      }
      current.clear();
      continue;
    }
    current += c;
  }
  if (!Trim(current).empty()) {
    parts.push_back(Trim(current));
  }
  if (parts.size() < 3 || parts.size() > 4) {
    return false;
  }

  int channels[3] = {0, 0, 0};
  for (size_t index = 0; index < 3; ++index) {
    const std::string& part = parts[index];
    const bool percent = !part.empty() && part.back() == '%';
    double value = 0.0;
    if (!ParseDouble(percent ? part.substr(0, part.size() - 1) : part, &value)) {
      return false;
    }
    channels[index] = ClampByte(percent ? value / 100.0 * 255.0 : value);
  }

  int alpha = 255;
  if (parts.size() == 4) {
    const std::string& part = parts[3];
    const bool percent = !part.empty() && part.back() == '%';
    double value = 0.0;
    if (!ParseDouble(percent ? part.substr(0, part.size() - 1) : part, &value)) {
      return false;
    }
    alpha = ClampByte(percent ? value / 100.0 * 255.0 : value * 255.0);
  }

  *out = MakeColor(static_cast<uint8_t>(alpha), static_cast<uint8_t>(channels[0]),
                   static_cast<uint8_t>(channels[1]), static_cast<uint8_t>(channels[2]));
  return true;
}

/**
 * The same keyword set the TypeScript colour parser accepts, so a colour that
 * resolves in one half of the system resolves in the other.
 */
const std::unordered_map<std::string, Color>& NamedColors() {
  static const std::unordered_map<std::string, Color> table = {
      {"black", 0xff000000},   {"white", 0xffffffff},   {"red", 0xffff0000},
      {"lime", 0xff00ff00},    {"green", 0xff008000},   {"blue", 0xff0000ff},
      {"yellow", 0xffffff00},  {"cyan", 0xff00ffff},    {"aqua", 0xff00ffff},
      {"magenta", 0xffff00ff}, {"fuchsia", 0xffff00ff}, {"gray", 0xff808080},
      {"grey", 0xff808080},    {"silver", 0xffc0c0c0},  {"maroon", 0xff800000},
      {"olive", 0xff808000},   {"navy", 0xff000080},    {"teal", 0xff008080},
      {"purple", 0xff800080},  {"orange", 0xffffa500},
  };
  return table;
}

/** Split a transform function's argument list into numbers. */
bool ParseArguments(const std::string& body, std::vector<double>* out) {
  std::string current;
  auto flush = [&]() {
    const std::string trimmed = Trim(current);
    current.clear();
    if (trimmed.empty()) {
      return true;
    }
    double value = 0.0;
    if (!ParseDouble(trimmed, &value)) {
      return false;
    }
    out->push_back(value);
    return true;
  };

  for (char c : body) {
    if (c == ',' || IsSpace(c)) {
      if (!flush()) {
        return false;
      }
      continue;
    }
    current += c;
  }
  return flush();
}

// --------------------------------------------------------------------------- //
// Attribute scanning
// --------------------------------------------------------------------------- //

using Attributes = std::unordered_map<std::string, std::string>;

struct Tag {
  std::string name;
  Attributes attributes;
  bool self_closing = false;
  bool closing = false;
};

/**
 * Read the next tag starting at or after `cursor`.
 *
 * Comments, processing instructions and doctype declarations are skipped
 * outright, and `<style>` / `<script>` bodies are skipped whole so their text
 * can never be mistaken for markup.
 */
bool NextTag(const std::string& markup, size_t* cursor, Tag* out) {
  while (*cursor < markup.size()) {
    const size_t open = markup.find('<', *cursor);
    if (open == std::string::npos) {
      return false;
    }

    if (markup.compare(open, 4, "<!--") == 0) {
      const size_t close = markup.find("-->", open + 4);
      if (close == std::string::npos) {
        return false;
      }
      *cursor = close + 3;
      continue;
    }
    if (open + 1 < markup.size() && (markup[open + 1] == '?' || markup[open + 1] == '!')) {
      const size_t close = markup.find('>', open);
      if (close == std::string::npos) {
        return false;
      }
      *cursor = close + 1;
      continue;
    }

    size_t index = open + 1;
    Tag tag;
    if (index < markup.size() && markup[index] == '/') {
      tag.closing = true;
      ++index;
    }
    while (index < markup.size() && !IsSpace(markup[index]) && markup[index] != '>'
           && markup[index] != '/') {
      tag.name += markup[index];
      ++index;
    }
    if (tag.name.empty()) {
      *cursor = open + 1;
      continue;
    }

    // Attributes.
    while (index < markup.size() && markup[index] != '>') {
      if (markup[index] == '/') {
        tag.self_closing = true;
        ++index;
        continue;
      }
      if (IsSpace(markup[index])) {
        ++index;
        continue;
      }
      std::string name;
      while (index < markup.size() && !IsSpace(markup[index]) && markup[index] != '='
             && markup[index] != '>' && markup[index] != '/') {
        name += markup[index];
        ++index;
      }
      while (index < markup.size() && IsSpace(markup[index])) {
        ++index;
      }
      if (index < markup.size() && markup[index] == '=') {
        ++index;
        while (index < markup.size() && IsSpace(markup[index])) {
          ++index;
        }
        if (index >= markup.size()) {
          return false;
        }
        const char quote = markup[index];
        std::string value;
        if (quote == '"' || quote == '\'') {
          ++index;
          while (index < markup.size() && markup[index] != quote) {
            value += markup[index];
            ++index;
          }
          if (index >= markup.size()) {
            return false;
          }
          ++index;
        } else {
          while (index < markup.size() && !IsSpace(markup[index]) && markup[index] != '>') {
            value += markup[index];
            ++index;
          }
        }
        if (!name.empty()) {
          tag.attributes[ToLower(name)] = value;
        }
      } else if (!name.empty()) {
        tag.attributes[ToLower(name)] = std::string();
      }
    }
    if (index >= markup.size()) {
      return false;
    }
    *cursor = index + 1;

    const std::string lowered = ToLower(tag.name);
    if (!tag.closing && !tag.self_closing && (lowered == "style" || lowered == "script")) {
      const std::string end = "</" + lowered;
      const size_t close = markup.find(end, *cursor);
      *cursor = close == std::string::npos ? markup.size() : close;
      continue;
    }

    tag.name = lowered;
    *out = tag;
    return true;
  }
  return false;
}

std::optional<std::string> Attribute(const Attributes& attributes, const char* name) {
  const auto found = attributes.find(name);
  if (found == attributes.end()) {
    return std::nullopt;
  }
  return found->second;
}

/** Read one declaration out of a `style="a:b;c:d"` attribute. */
std::optional<std::string> StyleProperty(const Attributes& attributes, const std::string& property) {
  const std::optional<std::string> style = Attribute(attributes, "style");
  if (!style.has_value()) {
    return std::nullopt;
  }
  size_t cursor = 0;
  while (cursor < style->size()) {
    const size_t semicolon = style->find(';', cursor);
    const std::string declaration =
        style->substr(cursor, semicolon == std::string::npos ? std::string::npos : semicolon - cursor);
    const size_t colon = declaration.find(':');
    if (colon != std::string::npos
        && ToLower(Trim(declaration.substr(0, colon))) == property) {
      return Trim(declaration.substr(colon + 1));
    }
    if (semicolon == std::string::npos) {
      break;
    }
    cursor = semicolon + 1;
  }
  return std::nullopt;
}

/** Presentation attribute, falling back to the `style` attribute. */
std::optional<std::string> PresentationValue(const Attributes& attributes,
                                            const std::string& name) {
  const std::optional<std::string> direct = Attribute(attributes, name.c_str());
  if (direct.has_value() && !Trim(*direct).empty()) {
    return direct;
  }
  return StyleProperty(attributes, name);
}

// --------------------------------------------------------------------------- //
// Gradient records, before href inheritance is resolved
// --------------------------------------------------------------------------- //

struct RawGradient {
  std::string id;
  bool radial = false;
  std::string href;
  std::optional<std::string> x1, y1, x2, y2;
  std::optional<std::string> cx, cy, r, fx, fy;
  std::optional<std::string> units, spread, transform;
  std::vector<GradientStop> stops;
  bool rejected = false;
};

std::string StripHash(const std::string& reference) {
  const std::string trimmed = Trim(reference);
  if (!trimmed.empty() && trimmed.front() == '#') {
    return trimmed.substr(1);
  }
  // `url(#id)` also appears in the wild for href values.
  if (trimmed.size() > 6 && ToLower(trimmed.substr(0, 5)) == "url(#" && trimmed.back() == ')') {
    return trimmed.substr(5, trimmed.size() - 6);
  }
  return trimmed;
}

void CopyIfUnset(std::optional<std::string>* target, const std::optional<std::string>& source) {
  if (!target->has_value() && source.has_value()) {
    *target = source;
  }
}

/**
 * Fill unset attributes and missing stops from the `href` chain.
 *
 * Cycles are broken by a visited set rather than a depth limit, so a malformed
 * document cannot hang the renderer.
 */
void ResolveInheritance(RawGradient* gradient,
                        const std::unordered_map<std::string, RawGradient>& all) {
  std::unordered_set<std::string> visited;
  visited.insert(gradient->id);

  std::string next = gradient->href;
  while (!next.empty() && visited.insert(next).second) {
    const auto found = all.find(next);
    if (found == all.end()) {
      return;
    }
    const RawGradient& parent = found->second;
    CopyIfUnset(&gradient->x1, parent.x1);
    CopyIfUnset(&gradient->y1, parent.y1);
    CopyIfUnset(&gradient->x2, parent.x2);
    CopyIfUnset(&gradient->y2, parent.y2);
    CopyIfUnset(&gradient->cx, parent.cx);
    CopyIfUnset(&gradient->cy, parent.cy);
    CopyIfUnset(&gradient->r, parent.r);
    CopyIfUnset(&gradient->fx, parent.fx);
    CopyIfUnset(&gradient->fy, parent.fy);
    CopyIfUnset(&gradient->units, parent.units);
    CopyIfUnset(&gradient->spread, parent.spread);
    CopyIfUnset(&gradient->transform, parent.transform);
    if (gradient->stops.empty()) {
      gradient->stops = parent.stops;
    }
    next = parent.href;
  }
}

}  // namespace

bool ParseCssColor(const std::string& value, Color* out) {
  if (out == nullptr) {
    return false;
  }
  const std::string input = ToLower(Trim(value));
  if (input.empty() || input == "none" || input == "transparent") {
    return false;
  }

  const auto named = NamedColors().find(input);
  if (named != NamedColors().end()) {
    *out = named->second;
    return true;
  }
  if (input.front() == '#') {
    return ParseHexDigits(input.substr(1), out);
  }
  if (input.compare(0, 4, "rgba") == 0 || input.compare(0, 3, "rgb") == 0) {
    const size_t open = input.find('(');
    const size_t close = input.rfind(')');
    if (open == std::string::npos || close == std::string::npos || close < open) {
      return false;
    }
    return ParseRgbFunction(input.substr(open + 1, close - open - 1), out);
  }
  return false;
}

bool ParseSvgTransform(const std::string& value, Matrix2D* out) {
  if (out == nullptr) {
    return false;
  }
  Matrix2D result = Identity();
  size_t cursor = 0;
  bool saw_function = false;

  while (cursor < value.size()) {
    while (cursor < value.size() && (IsSpace(value[cursor]) || value[cursor] == ',')) {
      ++cursor;
    }
    if (cursor >= value.size()) {
      break;
    }
    const size_t open = value.find('(', cursor);
    if (open == std::string::npos) {
      return false;
    }
    const std::string name = ToLower(Trim(value.substr(cursor, open - cursor)));
    const size_t close = value.find(')', open);
    if (close == std::string::npos) {
      return false;
    }
    std::vector<double> args;
    if (!ParseArguments(value.substr(open + 1, close - open - 1), &args)) {
      return false;
    }
    cursor = close + 1;
    saw_function = true;

    Matrix2D step;
    if (name == "matrix" && args.size() == 6) {
      step = Matrix2D{args[0], args[1], args[2], args[3], args[4], args[5]};
    } else if (name == "translate" && (args.size() == 1 || args.size() == 2)) {
      step = Translation(args[0], args.size() == 2 ? args[1] : 0.0);
    } else if (name == "scale" && (args.size() == 1 || args.size() == 2)) {
      step = Scaling(args[0], args.size() == 2 ? args[1] : args[0]);
    } else if (name == "rotate" && args.size() == 1) {
      step = Rotation(args[0]);
    } else if (name == "rotate" && args.size() == 3) {
      step = Rotation(args[0], args[1], args[2]);
    } else if (name == "skewx" && args.size() == 1) {
      step = SkewX(args[0]);
    } else if (name == "skewy" && args.size() == 1) {
      step = SkewY(args[0]);
    } else {
      return false;
    }
    // Left to right: the first function listed is the outermost.
    result = Multiply(result, step);
  }

  if (!saw_function) {
    return false;
  }
  *out = result;
  return true;
}

void PaintServerTable::Clear() {
  gradients_.clear();
  unsupported_ = 0;
}

bool PaintServerTable::Parse(const std::string& markup, double viewport_width,
                             double viewport_height, std::string* error) {
  auto fail = [&](const char* reason) {
    if (error != nullptr) {
      *error = reason;
    }
    return false;
  };

  Clear();
  if (error != nullptr) {
    error->clear();
  }
  if (Trim(markup).empty()) {
    return true;
  }

  std::unordered_map<std::string, RawGradient> raw;
  std::vector<std::string> order;
  std::string open_gradient;
  size_t cursor = 0;
  Tag tag;

  while (NextTag(markup, &cursor, &tag)) {
    const bool is_linear = tag.name == "lineargradient";
    const bool is_radial = tag.name == "radialgradient";

    if (tag.closing) {
      if ((is_linear || is_radial) && !open_gradient.empty()) {
        open_gradient.clear();
      }
      continue;
    }

    if (is_linear || is_radial) {
      const std::optional<std::string> id = Attribute(tag.attributes, "id");
      if (!id.has_value() || Trim(*id).empty()) {
        // An unreferenceable gradient cannot be used, but it is not an error in
        // the document either.
        ++unsupported_;
        continue;
      }
      RawGradient gradient;
      gradient.id = Trim(*id);
      gradient.radial = is_radial;
      const std::optional<std::string> href = Attribute(tag.attributes, "href");
      const std::optional<std::string> xlink = Attribute(tag.attributes, "xlink:href");
      if (href.has_value()) {
        gradient.href = StripHash(*href);
      } else if (xlink.has_value()) {
        gradient.href = StripHash(*xlink);
      }
      gradient.x1 = Attribute(tag.attributes, "x1");
      gradient.y1 = Attribute(tag.attributes, "y1");
      gradient.x2 = Attribute(tag.attributes, "x2");
      gradient.y2 = Attribute(tag.attributes, "y2");
      gradient.cx = Attribute(tag.attributes, "cx");
      gradient.cy = Attribute(tag.attributes, "cy");
      gradient.r = Attribute(tag.attributes, "r");
      gradient.fx = Attribute(tag.attributes, "fx");
      gradient.fy = Attribute(tag.attributes, "fy");
      gradient.units = Attribute(tag.attributes, "gradientunits");
      gradient.spread = Attribute(tag.attributes, "spreadmethod");
      gradient.transform = Attribute(tag.attributes, "gradienttransform");

      if (raw.find(gradient.id) == raw.end()) {
        order.push_back(gradient.id);
      }
      raw[gradient.id] = std::move(gradient);
      open_gradient = tag.self_closing ? std::string() : Trim(*id);
      continue;
    }

    if (tag.name == "stop" && !open_gradient.empty()) {
      RawGradient& gradient = raw[open_gradient];
      GradientStop stop;

      double offset = 0.0;
      const std::optional<std::string> offset_text = Attribute(tag.attributes, "offset");
      if (offset_text.has_value() && !ParseCoordinate(*offset_text, 1.0, &offset)) {
        gradient.rejected = true;
        continue;
      }
      stop.offset = std::min(1.0, std::max(0.0, offset));
      // SVG clamps each offset to be no smaller than the previous one.
      if (!gradient.stops.empty()) {
        stop.offset = std::max(stop.offset, gradient.stops.back().offset);
      }

      Color color = MakeColor(255, 0, 0, 0);
      const std::optional<std::string> color_text =
          PresentationValue(tag.attributes, "stop-color");
      if (color_text.has_value() && !ParseCssColor(*color_text, &color)) {
        // A stop colour we cannot resolve would change the whole ramp, so the
        // gradient is dropped and reported rather than partially honoured.
        gradient.rejected = true;
        continue;
      }

      const std::optional<std::string> opacity_text =
          PresentationValue(tag.attributes, "stop-opacity");
      if (opacity_text.has_value()) {
        double opacity = 1.0;
        if (!ParseCoordinate(*opacity_text, 1.0, &opacity)) {
          gradient.rejected = true;
          continue;
        }
        const double clamped = std::min(1.0, std::max(0.0, opacity));
        const unsigned alpha = static_cast<unsigned>(((color >> 24) & 0xFF) * clamped + 0.5);
        color = static_cast<Color>((alpha << 24) | (color & 0x00FFFFFFu));
      }

      stop.color = color;
      gradient.stops.push_back(stop);
      continue;
    }

    if (tag.name == "pattern" || tag.name == "meshgradient") {
      ++unsupported_;
    }
  }

  if (cursor < markup.size() && markup.find('<', cursor) != std::string::npos) {
    return fail("unterminated tag in defs markup");
  }

  // Second pass: inheritance, then materialise real gradients.
  for (const std::string& id : order) {
    RawGradient gradient = raw[id];
    ResolveInheritance(&gradient, raw);

    if (gradient.rejected) {
      ++unsupported_;
      continue;
    }
    if (gradient.stops.empty()) {
      // A gradient with no stops paints nothing in SVG. Recording it as
      // unsupported keeps the reference reported rather than silently absent.
      ++unsupported_;
      continue;
    }

    auto resolved = std::make_shared<Gradient>();
    resolved->type = gradient.radial ? Gradient::Type::kRadial : Gradient::Type::kLinear;
    resolved->stops = gradient.stops;

    const std::string units = ToLower(Trim(gradient.units.value_or("")));
    resolved->units = units == "userspaceonuse" ? GradientUnits::kUserSpace
                                                : GradientUnits::kObjectBoundingBox;

    const std::string spread = ToLower(Trim(gradient.spread.value_or("")));
    resolved->spread = spread == "reflect"  ? GradientSpread::kReflect
                     : spread == "repeat"   ? GradientSpread::kRepeat
                                            : GradientSpread::kPad;

    if (gradient.transform.has_value() && !Trim(*gradient.transform).empty()
        && !ParseSvgTransform(*gradient.transform, &resolved->transform)) {
      ++unsupported_;
      continue;
    }

    const bool user_space = resolved->units == GradientUnits::kUserSpace;
    const double x_reference = user_space ? viewport_width : 1.0;
    const double y_reference = user_space ? viewport_height : 1.0;
    // SVG resolves a percentage radius against the normalised diagonal.
    const double r_reference =
        user_space ? std::sqrt((viewport_width * viewport_width
                                + viewport_height * viewport_height) / 2.0)
                   : 1.0;

    bool ok = true;
    auto coordinate = [&](const std::optional<std::string>& text, double reference, double fallback,
                          double* target) {
      if (!text.has_value() || Trim(*text).empty()) {
        *target = fallback;
        return;
      }
      if (!ParseCoordinate(*text, reference, target)) {
        ok = false;
      }
    };

    if (resolved->type == Gradient::Type::kLinear) {
      // SVG defaults: x1=0%, y1=0%, x2=100%, y2=0%.
      coordinate(gradient.x1, x_reference, 0.0, &resolved->x1);
      coordinate(gradient.y1, y_reference, 0.0, &resolved->y1);
      coordinate(gradient.x2, x_reference, x_reference, &resolved->x2);
      coordinate(gradient.y2, y_reference, 0.0, &resolved->y2);
    } else {
      // SVG defaults: cx=cy=r=50%, and the focal point defaults to the centre.
      coordinate(gradient.cx, x_reference, 0.5 * x_reference, &resolved->cx);
      coordinate(gradient.cy, y_reference, 0.5 * y_reference, &resolved->cy);
      coordinate(gradient.r, r_reference, 0.5 * r_reference, &resolved->r);
      coordinate(gradient.fx, x_reference, resolved->cx, &resolved->fx);
      coordinate(gradient.fy, y_reference, resolved->cy, &resolved->fy);
    }

    if (!ok) {
      ++unsupported_;
      continue;
    }
    gradients_[gradient.id] = std::move(resolved);
  }

  return true;
}

std::shared_ptr<const Gradient> PaintServerTable::Find(const std::string& id) const {
  const auto found = gradients_.find(id);
  return found == gradients_.end() ? nullptr : found->second;
}

}  // namespace pydee
