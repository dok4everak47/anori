import { applyTheme, applyThemeColors, defaultTheme, resolveColorScheme, themes } from "@anori/utils/user-data/theme-base";
import browser from 'webextension-polyfill';

const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches === true;
applyThemeColors(defaultTheme.accent, prefersLight ? "light" : "dark");

browser.storage.local.get({
    theme: { value: defaultTheme.name },
    customThemes: { value: [] },
    colorScheme: { value: "dark" },
    themeWallpaperSelections: { value: {} },
}).then(({ theme, customThemes, colorScheme, themeWallpaperSelections }) => {
    const themeName = theme.value;
    const allCustom = customThemes.value || [];
    const activeTheme = [...themes, ...allCustom].find((t) => t.name === themeName && t.accent);
    const resolvedTheme = activeTheme || defaultTheme;

    let wallpaperId;
    if (resolvedTheme.type === "custom" && Array.isArray(resolvedTheme.wallpapers) && resolvedTheme.wallpapers.length > 0) {
        const selections = themeWallpaperSelections.value || {};
        const previous = selections[themeName];
        if (resolvedTheme.wallpapers.length === 1) {
            wallpaperId = resolvedTheme.wallpapers[0].id;
        } else {
            const avoidIndex = previous ? resolvedTheme.wallpapers.findIndex((w) => w.id === previous) : -1;
            let idx = Math.floor(Math.random() * resolvedTheme.wallpapers.length);
            if (avoidIndex >= 0) {
                while (idx === avoidIndex) idx = Math.floor(Math.random() * resolvedTheme.wallpapers.length);
            }
            wallpaperId = resolvedTheme.wallpapers[idx].id;
        }
    }

    window.__anoriThemeReady = applyTheme(resolvedTheme, resolveColorScheme(colorScheme.value || "dark"), wallpaperId);
});
