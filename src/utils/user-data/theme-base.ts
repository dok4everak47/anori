import { applyDesignSystemTokens } from "@anori/design-system/apply";
import type { Mode } from "@anori/design-system/color-engine";
import type { OklchColor } from "@anori/utils/color";
import { setPageBackground } from "@anori/utils/page";
import browser from "webextension-polyfill";

// A theme is just an accent colour (OKLCH) + a background image; the full palette is generated from the
// accent, and light/dark is a separate global knob (`colorScheme`), not a per-theme property.
export type BuiltinTheme = {
  name: string;
  type: "builtin";
  background: Record<Mode, string>;
  accent: OklchColor;
};

export type BackgroundFit = "cover" | "contain" | "tile";
export type BackgroundAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type ThemeWallpaper = {
  id: string;
  blur: number;
  fit: BackgroundFit;
  anchor: BackgroundAnchor;
  fillColor?: string;
};

export type CustomTheme = {
  name: string;
  type: "custom";
  blur: number;
  accent: OklchColor;
  hideDotPattern?: boolean;
  /** @deprecated Use wallpapers[].fit instead. Kept for migrated themes without a wallpapers array. */
  backgroundFit?: BackgroundFit;
  /** @deprecated Use wallpapers[].anchor instead. */
  backgroundAnchor?: BackgroundAnchor;
  /** @deprecated Use wallpapers[].fillColor instead. */
  backgroundColor?: string;
  wallpapers: ThemeWallpaper[];
};

export type PartialCustomTheme = {
  name: string;
  type: "custom";
  blur: number;
  accent: OklchColor;
  hideDotPattern?: boolean;
  backgroundFit?: BackgroundFit;
  backgroundAnchor?: BackgroundAnchor;
  backgroundColor?: string;
  wallpapers?: ThemeWallpaper[];
  background?: string;
  originalBackground?: string;
};

export type Theme = BuiltinTheme | CustomTheme;

export type ColorScheme = "light" | "dark" | "system";

const bg = (dark: string, light: string = dark): Record<Mode, string> => ({ light, dark });

export const themes: BuiltinTheme[] = [
  {
    name: "Greenery",
    type: "builtin",
    background: bg("greenery.jpg", "greenery-light.jpg"),
    accent: { l: 0.38, c: 0.13, h: 160.26 },
  },
  {
    name: "Forest lake",
    type: "builtin",
    background: bg("forest-lake.jpg", "forest-lake-light.jpg"),
    accent: { l: 0.38, c: 0.114, h: 219.46 },
  },
  {
    name: "Mountains",
    type: "builtin",
    background: bg("mountains.jpg", "mountains-light.jpg"),
    accent: { l: 0.38, c: 0.1589, h: 251.13 },
  },
  {
    name: "Sakura",
    type: "builtin",
    background: bg("sakura.jpg", "sakura-light.jpg"),
    accent: { l: 0.38, c: 0.0838, h: 345.08 },
  },
  {
    name: "Sunflowers",
    type: "builtin",
    background: bg("sunflowers.jpg", "sunflowers-light.jpg"),
    accent: { l: 0.38, c: 0.0831, h: 209.0 },
  },
  {
    name: "Hygge",
    type: "builtin",
    background: bg("table.jpg", "table-light.jpg"),
    accent: { l: 0.38, c: 0.0063, h: 84.57 },
  },
  {
    name: "Maples",
    type: "builtin",
    background: bg("maple.jpg", "maple-light.jpg"),
    accent: { l: 0.38, c: 0.1783, h: 32.38 },
  },
  {
    name: "Highlands",
    type: "builtin",
    background: bg("highlands.jpg", "highlands-light.jpg"),
    accent: { l: 0.38, c: 0.1611, h: 73.8 },
  },
];

export const defaultTheme = themes[0];

export const resolveColorScheme = (scheme: ColorScheme): Mode => {
  if (scheme !== "system") return scheme;
  const prefersLight =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches === true;
  return prefersLight ? "light" : "dark";
};

export const getThemeWallpaper = (theme: CustomTheme, wallpaperId?: string): ThemeWallpaper => {
  if (theme.wallpapers.length === 0) {
    return {
      id: "default",
      blur: theme.blur,
      fit: theme.backgroundFit ?? "cover",
      anchor: theme.backgroundAnchor ?? "center",
      fillColor: theme.backgroundColor,
    };
  }
  return theme.wallpapers.find((w) => w.id === wallpaperId) ?? theme.wallpapers[0];
};

export const applyBuiltinTheme = (themeName: Theme["name"], mode: Mode) => {
  const theme = themes.find((t) => t.name === themeName);
  if (!theme) return;
  applyTheme(theme, mode);
};

export const applyTheme = async (theme: Theme, mode: Mode, wallpaperId?: string) => {
  let prom = Promise.resolve();
  if (theme.type === "builtin") {
    setPageBackground(browser.runtime.getURL(`/assets/images/backgrounds/${theme.background[mode]}`));
    if (currentBackgroundBlobUrl) {
      URL.revokeObjectURL(currentBackgroundBlobUrl);
      currentBackgroundBlobUrl = null;
    }
  } else {
    const wallpaper = getThemeWallpaper(theme, wallpaperId);
    prom = getThemeBackgroundImpl(theme.name, wallpaper.id).then((blob) => {
      const url = URL.createObjectURL(blob);
      const previous = currentBackgroundBlobUrl;
      setPageBackground(url, previous);
      currentBackgroundBlobUrl = url;
    });
  }

  applyThemeColors(theme.accent, mode);
  if (theme.type === "custom") {
    const wallpaper = getThemeWallpaper(theme, wallpaperId);
    applyThemeDecorations({
      hideDotPattern: theme.hideDotPattern,
      fit: wallpaper.fit,
      anchor: wallpaper.anchor,
      backgroundColor: wallpaper.fillColor,
    });
  } else {
    applyThemeDecorations({});
  }
  await prom;
};

export type ThemeDecorations = {
  hideDotPattern?: boolean;
  fit?: BackgroundFit;
  anchor?: BackgroundAnchor;
  backgroundColor?: string;
};

const BACKGROUND_SIZE: Record<BackgroundFit, string> = {
  cover: "cover",
  contain: "contain",
  tile: "auto",
};

export const BACKGROUND_ANCHOR_CSS: Record<BackgroundAnchor, string> = {
  "top-left": "left top",
  "top-center": "center top",
  "top-right": "right top",
  "center-left": "left center",
  center: "center center",
  "center-right": "right center",
  "bottom-left": "left bottom",
  "bottom-center": "center bottom",
  "bottom-right": "right bottom",
};

export const applyThemeDecorations = (decorations: ThemeDecorations) => {
  document.documentElement.classList.toggle("theme-hide-dot-pattern", !!decorations.hideDotPattern);
  document.documentElement.style.setProperty("--background-size", BACKGROUND_SIZE[decorations.fit ?? "cover"]);
  document.documentElement.style.setProperty(
    "--background-position",
    BACKGROUND_ANCHOR_CSS[decorations.anchor ?? "center"],
  );
  document.documentElement.style.setProperty(
    "--background-repeat",
    decorations.fit === "tile" ? "repeat" : "no-repeat",
  );
  if (decorations.backgroundColor) {
    document.documentElement.style.setProperty("--background-color", decorations.backgroundColor);
  } else {
    document.documentElement.style.removeProperty("--background-color");
  }
};

export const applyThemeColors = (accent: OklchColor, mode: Mode) => {
  const { tokens } = applyDesignSystemTokens(accent, mode);

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = tokens.surface;
};

type ThemeBackgroundResolver = (themeName: string, wallpaperId: string) => Promise<Blob>;

const g = self as typeof self & {
  __anoriThemeBgResolver?: ThemeBackgroundResolver;
  __anoriThemeBgResolverReady?: (resolver: ThemeBackgroundResolver) => void;
  __anoriThemeBgResolverPromise?: Promise<ThemeBackgroundResolver>;
};

const getResolverPromise = (): Promise<ThemeBackgroundResolver> => {
  if (!g.__anoriThemeBgResolverPromise) {
    g.__anoriThemeBgResolverPromise = new Promise<ThemeBackgroundResolver>((resolve) => {
      g.__anoriThemeBgResolverReady = resolve;
    });
  }
  return g.__anoriThemeBgResolverPromise;
};

const getThemeBackgroundImpl: ThemeBackgroundResolver = (themeName, wallpaperId) => {
  if (g.__anoriThemeBgResolver) return g.__anoriThemeBgResolver(themeName, wallpaperId);
  return getResolverPromise().then((resolver) => resolver(themeName, wallpaperId));
};

export const registerThemeBackgroundResolver = (resolver: ThemeBackgroundResolver) => {
  g.__anoriThemeBgResolver = resolver;
  g.__anoriThemeBgResolverReady?.(resolver);
};

let currentBackgroundBlobUrl: string | null = null;
