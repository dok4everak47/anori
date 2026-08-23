import { type AnoriStorage, anoriSchema, type CustomTheme, getAnoriStorage } from "@anori/utils/storage";
import isEqual from "lodash/isEqual";
import {
  applyTheme,
  registerThemeBackgroundResolver,
  resolveColorScheme,
  type ThemeWallpaper,
  themes,
} from "./theme-base";

export type {
  BackgroundAnchor,
  BackgroundFit,
  BuiltinTheme,
  ColorScheme,
  CustomTheme,
  PartialCustomTheme,
  Theme,
  ThemeDecorations,
  ThemeWallpaper,
} from "./theme-base";
export {
  applyBuiltinTheme,
  applyTheme,
  applyThemeColors,
  applyThemeDecorations,
  BACKGROUND_ANCHOR_CSS,
  defaultTheme,
  getThemeWallpaper,
  resolveColorScheme,
  themes,
} from "./theme-base";

const getThemeBackgroundKey = (themeName: string, wallpaperId: string, variant: "original" | "blurred"): string => {
  return `${themeName}:${wallpaperId}:${variant}`;
};

export const getThemeBackground = async (themeName: string, wallpaperId = "default"): Promise<Blob> => {
  const storage = await getAnoriStorage();
  const key = getThemeBackgroundKey(themeName, wallpaperId, "blurred");
  const result = await storage.files.get(anoriSchema.themeBackgrounds.byId(key));

  if (!result) {
    throw new Error(`Theme background not found: ${themeName}/${wallpaperId}`);
  }

  return result.blob;
};

registerThemeBackgroundResolver(getThemeBackground);

export const saveThemeBackground = async (
  themeName: string,
  wallpaperId: string,
  variant: "original" | "blurred",
  content: ArrayBuffer | Blob,
) => {
  const storage = await getAnoriStorage();
  const blob = content instanceof Blob ? content : new Blob([content]);
  const key = getThemeBackgroundKey(themeName, wallpaperId, variant);

  await storage.files.set(anoriSchema.themeBackgrounds.byId(key), blob, {
    themeName,
    wallpaperId,
    variant,
  });
};

export const getThemeBackgroundOriginal = async (themeName: string, wallpaperId = "default"): Promise<Blob> => {
  const storage = await getAnoriStorage();
  const key = getThemeBackgroundKey(themeName, wallpaperId, "original");
  const result = await storage.files.get(anoriSchema.themeBackgrounds.byId(key));

  if (!result) {
    throw new Error(`Original theme background not found: ${themeName}/${wallpaperId}`);
  }

  return result.blob;
};

export const deleteThemeWallpaperFiles = async (themeName: string, wallpaperId: string) => {
  const storage = await getAnoriStorage();

  await storage.files.delete(
    anoriSchema.themeBackgrounds.byId(getThemeBackgroundKey(themeName, wallpaperId, "original")),
  );
  await storage.files.delete(
    anoriSchema.themeBackgrounds.byId(getThemeBackgroundKey(themeName, wallpaperId, "blurred")),
  );
};

export const deleteThemeBackgrounds = async (themeName: string) => {
  const storage = await getAnoriStorage();
  const allMeta = storage.files.getMeta(anoriSchema.themeBackgrounds.all());
  const prefix = `${themeName}:`;

  for (const key of Object.keys(allMeta)) {
    if (key.startsWith(prefix)) {
      await storage.files.delete(anoriSchema.themeBackgrounds.byId(key));
    }
  }
};

export const deleteAllThemeBackgrounds = async () => {
  const storage = await getAnoriStorage();
  const allMeta = storage.files.getMeta(anoriSchema.themeBackgrounds.all());

  for (const key of Object.keys(allMeta)) {
    await storage.files.delete(anoriSchema.themeBackgrounds.byId(key));
  }
};

export const getAllCustomThemeBackgroundFiles = async (): Promise<
  Array<{ themeName: string; wallpaperId: string; variant: "original" | "blurred" }>
> => {
  const storage = await getAnoriStorage();
  const allMeta = storage.files.getMeta(anoriSchema.themeBackgrounds.all());

  return Object.values(allMeta).map((meta) => ({
    themeName: meta.properties?.themeName ?? "",
    wallpaperId: meta.properties?.wallpaperId ?? "default",
    variant: meta.properties?.variant ?? "blurred",
  }));
};

export const getSelectedWallpaperId = (storage: AnoriStorage, themeName: string): string | undefined => {
  const selections = storage.get(anoriSchema.themeWallpaperSelections);
  return selections[themeName];
};

export const setSelectedWallpaperId = async (storage: AnoriStorage, themeName: string, wallpaperId: string) => {
  const selections = { ...storage.get(anoriSchema.themeWallpaperSelections) };
  selections[themeName] = wallpaperId;
  await storage.set(anoriSchema.themeWallpaperSelections, selections);
};

const pickRandomIndex = (length: number, avoid?: number): number => {
  if (length <= 1) return 0;
  if (avoid === undefined) return Math.floor(Math.random() * length);
  let idx = avoid;
  while (idx === avoid) idx = Math.floor(Math.random() * length);
  return idx;
};

export const pickWallpaperForTheme = (theme: CustomTheme, previousId?: string): ThemeWallpaper | undefined => {
  if (theme.wallpapers.length === 0) return undefined;
  const previousIndex = previousId ? theme.wallpapers.findIndex((w) => w.id === previousId) : -1;
  const idx = pickRandomIndex(theme.wallpapers.length, previousIndex >= 0 ? previousIndex : undefined);
  return theme.wallpapers[idx];
};

export const nextWallpaper = (theme: CustomTheme, currentId?: string): ThemeWallpaper | undefined => {
  if (theme.wallpapers.length === 0) return undefined;
  const currentIndex = currentId ? theme.wallpapers.findIndex((w) => w.id === currentId) : -1;
  const idx = currentIndex < 0 ? 0 : (currentIndex + 1) % theme.wallpapers.length;
  return theme.wallpapers[idx];
};

export const resolveWallpaperId = (theme: CustomTheme, storage: AnoriStorage): string | undefined => {
  if (theme.wallpapers.length === 0) return undefined;
  const stored = getSelectedWallpaperId(storage, theme.name);
  if (stored && theme.wallpapers.some((w) => w.id === stored)) return stored;
  return pickWallpaperForTheme(theme)?.id;
};

export const ensureInitialWallpaper = async (storage: AnoriStorage) => {
  const themeName = storage.get(anoriSchema.theme);
  const customThemes = storage.get(anoriSchema.customThemes);
  const theme = customThemes.find((t) => t.name === themeName);
  if (!theme || theme.wallpapers.length === 0) return;

  const stored = getSelectedWallpaperId(storage, theme.name);
  if (stored && theme.wallpapers.some((w) => w.id === stored)) {
    await applyTheme(theme, resolveColorScheme(storage.get(anoriSchema.colorScheme)), stored);
    return;
  }

  const picked = pickWallpaperForTheme(theme);
  if (picked) {
    await setSelectedWallpaperId(storage, theme.name, picked.id);
    await applyTheme(theme, resolveColorScheme(storage.get(anoriSchema.colorScheme)), picked.id);
  }
};

export const watchForThemeUpdates = (storage: AnoriStorage) => {
  const applyCurrentTheme = () => {
    const themeName = storage.get(anoriSchema.theme);
    const customThemes = storage.get(anoriSchema.customThemes);
    const theme = [...themes, ...customThemes].find((t) => t.name === themeName);
    if (theme) {
      const wallpaperId = theme.type === "custom" ? resolveWallpaperId(theme, storage) : undefined;
      applyTheme(theme, resolveColorScheme(storage.get(anoriSchema.colorScheme)), wallpaperId);
    }
  };

  const subscribeToCurrentThemeParameters = () => {
    const themeName = storage.get(anoriSchema.theme);
    const customThemes = storage.get(anoriSchema.customThemes);
    const currentCustomTheme = customThemes.find((t) => t.name === themeName);
    const currentWallpaperId = currentCustomTheme ? resolveWallpaperId(currentCustomTheme, storage) : undefined;

    const unsubBackground =
      currentCustomTheme && currentWallpaperId
        ? storage.files.subscribe(
            anoriSchema.themeBackgrounds.byId(`${themeName}:${currentWallpaperId}:blurred`),
            async (meta, oldMeta, info) => {
              if (info.source === "remote" || info.source === "external") {
                if (meta && meta.path !== oldMeta?.path) {
                  applyCurrentTheme();
                }
              }
            },
          )
        : () => {};
    const unsubParameters = storage.subscribe(anoriSchema.customThemes, (newCustomThemes, oldCustomThemes, info) => {
      if (info.source === "remote" || info.source === "external") {
        const newCustomTheme = newCustomThemes?.find((t) => t.name === themeName);
        const oldCustomTheme = oldCustomThemes?.find((t) => t.name === themeName);
        if (!isEqual(newCustomTheme, oldCustomTheme)) {
          applyCurrentTheme();
        }
      }
    });
    const unsubSelection = storage.subscribe(anoriSchema.themeWallpaperSelections, (_next, _prev, info) => {
      if (info.source === "remote" || info.source === "external") {
        applyCurrentTheme();
      }
    });

    unsubCurrentThemeParameters?.();
    unsubCurrentThemeParameters = () => {
      unsubBackground();
      unsubParameters();
      unsubSelection();
    };
  };

  let unsubCurrentThemeParameters: VoidFunction | null = null;

  const unsubActiveTheme = storage.subscribe(anoriSchema.theme, (_newTheme, _oldTheme, info) => {
    subscribeToCurrentThemeParameters();
    if (info.source === "remote" || info.source === "external") {
      applyCurrentTheme();
    }
  });

  // The light/dark knob re-applies on any change (local toggle or synced) — the palette flips wholesale.
  const unsubColorScheme = storage.subscribe(anoriSchema.colorScheme, () => applyCurrentTheme());

  // When following the OS, re-apply if its preference changes.
  const mql = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: light)") : undefined;
  const onSystemPreferenceChange = () => {
    if (storage.get(anoriSchema.colorScheme) === "system") applyCurrentTheme();
  };
  mql?.addEventListener("change", onSystemPreferenceChange);

  subscribeToCurrentThemeParameters();

  return () => {
    unsubActiveTheme();
    unsubCurrentThemeParameters?.();
    unsubColorScheme();
    mql?.removeEventListener("change", onSystemPreferenceChange);
  };
};
