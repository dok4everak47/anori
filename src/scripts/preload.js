// Runs before the main page script: applies the saved theme as early as possible and warms the
// active language's lazily-loaded chunks so the page resolves them from cache.
import { momentLocaleLoaders, translationLoaders } from "@anori/translations/loaders";
import { applyTheme, applyThemeColors, defaultTheme, resolveColorScheme, themes } from "@anori/utils/user-data/theme-base";
import browser from 'webextension-polyfill';

const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches === true;
applyThemeColors(defaultTheme.accent, prefersLight ? "light" : "dark");

browser.storage.local.get({
    theme: { value: defaultTheme.name },
    customThemes: { value: [] },
    colorScheme: { value: "dark" },
    language: { value: "en" },
}).then(({ theme, customThemes, colorScheme, language }) => {
    // Warm the active language's chunks (translation + moment locale) now, before the main page script runs,
    // so its dynamic imports resolve from cache.
    const lang = language.value;
    translationLoaders[lang]?.();
    momentLocaleLoaders[lang]?.();

    const themeName = theme.value;
    const activeTheme = [...themes, ...(customThemes.value || [])].find((t) => t.name === themeName && t.accent);
    window.__anoriThemeReady = applyTheme(activeTheme || defaultTheme, resolveColorScheme(colorScheme.value || "dark"));
});
