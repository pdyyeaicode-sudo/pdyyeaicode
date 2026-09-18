// scene_renderer.cpp — the single scene traversal shared by every backend.
//
// C++ mirror of frontend/src/editor/renderer/sceneRenderer.ts. Keeping one
// traversal means paint order, transform composition, group isolation and
// culling cannot diverge between the SVG renderer, the Skia renderer, thumbnails
// and export targets.

#include "pydee/renderer.h"

namespace pydee {
namespace {

void DrawNodes(const std::vector<std::unique_ptr<Node>>& nodes,
               Renderer2D& renderer,
               const RenderOptions& options,
               RenderStats& stats);

void DrawLeaf(const Node& node, Renderer2D& renderer) {
  switch (node.kind) {
    case NodeKind::kRect:
      renderer.DrawRect(static_cast<const RectNode&>(node));
      return;
    case NodeKind::kEllipse:
      renderer.DrawEllipse(static_cast<const EllipseNode&>(node));
      return;
    case NodeKind::kPath:
      renderer.DrawPath(static_cast<const PathNode&>(node));
      return;
    case NodeKind::kText:
      renderer.DrawText(static_cast<const TextNode&>(node));
      return;
    case NodeKind::kGroup:
      // Groups are handled by DrawNode; reaching here would be a logic error.
      return;
  }
}

void DrawNode(const Node& node,
              Renderer2D& renderer,
              const RenderOptions& options,
              RenderStats& stats) {
  ++stats.nodes_visited;

  // Only cull when the bounds are known AND known to be outside the visible
  // region. Unknown bounds are always drawn.
  if (options.cull_rect.has_value() && node.local_bounds.has_value()) {
    const RectF world_bounds = TransformRect(node.local_transform, *node.local_bounds);
    if (!RectIntersects(world_bounds, *options.cull_rect)) {
      ++stats.nodes_culled;
      return;
    }
  }

  renderer.Save();
  renderer.ConcatTransform(node.local_transform);

  if (node.kind == NodeKind::kGroup) {
    const auto& group = static_cast<const GroupNode&>(node);
    if (group.isolate) {
      // Composite the children into their own layer so alpha and blend mode
      // apply to the composed result rather than to each child individually.
      renderer.BeginLayer(group, group.opacity, group.blend_mode);
      ++stats.layers_opened;
      DrawNodes(group.children, renderer, options, stats);
      renderer.EndLayer();
    } else {
      DrawNodes(group.children, renderer, options, stats);
    }
  } else {
    DrawLeaf(node, renderer);
    ++stats.nodes_drawn;
  }

  renderer.Restore();
}

void DrawNodes(const std::vector<std::unique_ptr<Node>>& nodes,
               Renderer2D& renderer,
               const RenderOptions& options,
               RenderStats& stats) {
  for (const std::unique_ptr<Node>& node : nodes) {
    if (node) {
      DrawNode(*node, renderer, options, stats);
    }
  }
}

}  // namespace

RenderStats RenderScene(const Scene& scene,
                        Renderer2D& renderer,
                        const RenderOptions& options) {
  RenderStats stats;

  FrameInfo frame;
  frame.width = scene.width;
  frame.height = scene.height;
  frame.view_transform = options.view_transform;
  frame.pixel_ratio = options.pixel_ratio;
  frame.dirty_rect = options.dirty_rect;

  renderer.BeginFrame(frame);

  if (options.background_color.has_value()) {
    renderer.Clear(*options.background_color);
  }

  renderer.SetTransform(options.view_transform);
  DrawNodes(scene.roots, renderer, options, stats);
  renderer.EndFrame();

  return stats;
}

}  // namespace pydee
