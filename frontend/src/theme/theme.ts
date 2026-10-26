import { useEffect, useState } from "react";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "cartoRinf.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** A per-viewer convenience, so storage failures (private mode, blocked
 *  site data) just fall back to following the OS. */
export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "auto") delete root.dataset.theme;
  else root.dataset.theme = preference;
  try {
    if (preference === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // fine — the choice just won't survive a reload
  }
}

/** The theme actually in effect, for things CSS can't reach (MapLibre
 *  paint properties, SVG data colours). */
export function useResolvedTheme(preference: ThemePreference): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  if (preference === "auto") return systemDark ? "dark" : "light";
  return preference;
}

/** True below the phone breakpoint (matches the CSS one in theme.css). */
export function useIsPhone(): boolean {
  const query = "(max-width: 640px)";
  const [matches, setMatches] = useState(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return matches;
}
