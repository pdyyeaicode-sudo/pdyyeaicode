/**
 * Creative Studio theme resolution.
 *
 * Single responsibility: resolve, apply, and persist the active {@link Theme}
 * for the editor shell. Dark is the default (Req 13.1); a saved preference in
 * `localStorage` overrides it (Req 13.2, 13.3) and is read synchronously so the
 * shell can pick the correct tokens on first paint.
 *
 * The monochrome-plus-single-accent token set lives in `./theme.css` and is
 * imported here so that any module wiring up the theme also pulls in the
 * `:root[data-theme="dark|light"]` custom properties.
 *
 * All `localStorage` access is wrapped in try/catch: storage can throw (private
 * mode, disabled cookies, quota). Reads degrade to the default and writes report
 * failure via a boolean rather than throwing to callers.
 */

import "./theme.css";

/**
 * Active visual appearance of Creative Studio.
 *
 * NOTE: This mirrors the `Theme` type that `editor/types/documentModel.ts` will
 * own once it exists (see tasks 2.1 / 4.1). It is defined locally here so theme
 * resolution can ship independently; the two definitions are structurally
 * identical and will be reconciled to a single source when the document model
 * module lands.
 */
export type Theme = "dark" | "light";

/** Stable storage key for the persisted theme preference. */
export const THEME_STORAGE_KEY = "creative-studio:theme";

/** Theme used when no valid saved preference exists (Req 13.1). */
export const DEFAULT_THEME: Theme = "dark";

/** Type guard narrowing an unknown stored value to a {@link Theme}. */
function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Read the saved theme preference from `localStorage`.
 *
 * @returns the stored {@link Theme}, or `null` when no valid preference is
 * stored or storage is unavailable. Never throws.
 */
export function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    // Storage may be unavailable (private mode, disabled, quota). Treat as "no
    // preference" so resolution falls back to the default.
    return null;
  }
}

/**
 * Resolve the theme to apply: the saved preference when present, otherwise the
 * default dark theme (Req 13.1, 13.2).
 */
export function resolveTheme(): Theme {
  return readStoredTheme() ?? DEFAULT_THEME;
}

/**
 * Persist the selected theme so it is re-applied on subsequent loads (Req 13.3).
 *
 * @returns `true` when the write succeeded, `false` when storage threw. Never
 * throws to callers.
 */
export function persistTheme(theme: Theme): boolean {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a theme by setting the `data-theme` attribute on the document root,
 * which activates the matching `:root[data-theme=...]` token set in `theme.css`.
 *
 * @param theme the theme to apply.
 * @param root the element to mark; defaults to the document root (`:root`).
 */
export function applyTheme(
  theme: Theme,
  root: HTMLElement = document.documentElement,
): void {
  root.setAttribute("data-theme", theme);
}

/**
 * Convenience helper for first paint: resolve the active theme and apply it to
 * the document root in one step, returning the theme that was applied.
 */
export function initializeTheme(
  root: HTMLElement = document.documentElement,
): Theme {
  const theme = resolveTheme();
  applyTheme(theme, root);
  return theme;
}
