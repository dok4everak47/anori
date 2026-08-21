import { applyTheme, applyThemeColors, defaultTheme, resolveColorScheme, themes } from "@anori/utils/user-data/theme-base";
import browser from 'webextension-polyfill';

const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches === true;
applyThemeColors(defaultTheme.accent, prefersLight ? "light" : "dark");

browser.storage.local.get({
    theme: { value: defaultTheme.name },
    customThemes: { value: [] },
    colorScheme: { value: "dark" },
}).then(({ theme, customThemes, colorScheme }) => {
    const themeName = theme.value;
    const activeTheme = [...themes, ...(customThemes.value || [])].find((t) => t.name === themeName && t.accent);
    window.__anoriThemeReady = applyTheme(activeTheme || defaultTheme, resolveColorScheme(colorScheme.value || "dark"));
});
