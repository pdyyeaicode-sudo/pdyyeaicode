/**
 * Minimal ESLint config for the Creative Studio frontend.
 *
 * Icon system guard (Requirements 13.5 / 13.6):
 *  - Direct `lucide-react` imports are BANNED everywhere except
 *    `src/editor/Icon.tsx`. Every chrome icon must be rendered through the
 *    <Icon name="..." /> wrapper, which hard-sets strokeWidth in [1.0, 1.5],
 *    fill="none", and a single color from the CSS tokens (--fg-1 / --accent).
 *  - Raster image assets (.png/.jpg/.jpeg/.webp/.gif) must NOT be imported for
 *    interface chrome; chrome icons are stroke-based single-color SVGs only.
 *  - Inline `fill=` on chrome icon SVGs is forbidden — icon color always comes
 *    from the `color`/currentColor token, never a hardcoded fill. The <Icon>
 *    wrapper structurally enforces this; this file documents it as the project
 *    rule, and code review rejects raw <svg fill="..."> / <img> icon chrome.
 *
 * This config intentionally uses only core ESLint rules so it requires no
 * extra plugins/parsers to express the icon guard.
 */
module.exports = {
  root: true,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "lucide-react",
            message:
              "Do not import lucide-react directly. Render chrome icons via <Icon name=\"...\" /> from src/editor/Icon.tsx (Req 13.5/13.6).",
          },
        ],
        patterns: [
          {
            group: ["*.png", "*.jpg", "*.jpeg", "*.webp", "*.gif"],
            message:
              "Raster images must not be used for interface chrome icons (Req 13.6). Use stroke-based single-color SVG line icons via <Icon />.",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Icon.tsx is the ONLY sanctioned place to import lucide-react.
      files: ["src/editor/Icon.tsx"],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};
