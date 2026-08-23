import { detectGamut } from "@anori/design-system/color-engine";
import { Button as DSButton } from "@anori/design-system/components/Button/Button";
import { Field } from "@anori/design-system/components/Field/Field";
import { Heading } from "@anori/design-system/components/Heading/Heading";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Select } from "@anori/design-system/components/Select/Select";
import { Slider } from "@anori/design-system/components/Slider/Slider";
import { anoriSchema, type CustomTheme, getAnoriStorage } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import {
  applyTheme,
  type ColorScheme,
  defaultTheme,
  deleteThemeBackgrounds,
  pickWallpaperForTheme,
  resolveColorScheme,
  setSelectedWallpaperId,
  themes,
} from "@anori/utils/user-data/theme";
import { m } from "motion/react";
import { type ComponentProps, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";
import { ThemeEditor } from "./ThemeEditor";
import { ThemePlate } from "./ThemePlate";

const COLOR_SCHEMES: ColorScheme[] = ["system", "light", "dark"];
const COLOR_SCHEME_LABEL_KEY: Record<ColorScheme, string> = {
  system: "settings.theme.colorSchemeSystem",
  light: "settings.theme.colorSchemeLight",
  dark: "settings.theme.colorSchemeDark",
};

const screen = css({ display: "flex", flexDirection: "column", gap: "4" });
const header = css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4" });
const grid = css({ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "3" });

export const ThemesScreen = (props: ComponentProps<typeof m.div>) => {
  const { t } = useTranslation();
  const [customThemes, setCustomThemes] = useStorageValue(anoriSchema.customThemes);
  const [currentTheme, setTheme] = useStorageValue(anoriSchema.theme);
  const [colorScheme, setColorScheme] = useStorageValue(anoriSchema.colorScheme);
  const [widgetBackgroundOpacity, setWidgetBackgroundOpacity] = useStorageValue(anoriSchema.widgetBackgroundOpacity);
  const [editorActive, setEditorActive] = useState(false);
  const [editorTheme, setEditorTheme] = useState<CustomTheme | undefined>(undefined);

  const mode = resolveColorScheme(colorScheme);
  const gamut = useMemo(() => detectGamut(), []);

  const openEditor = (theme?: CustomTheme) => {
    setEditorTheme(theme);
    setEditorActive(true);
  };

  const selectTheme = async (themeName: string) => {
    const storage = await getAnoriStorage();
    const t = [...themes, ...customThemes].find((x) => x.name === themeName);
    if (!t) return;
    let wallpaperId: string | undefined;
    if (t.type === "custom" && t.wallpapers.length > 1) {
      const picked = pickWallpaperForTheme(t);
      if (picked) {
        wallpaperId = picked.id;
        await setSelectedWallpaperId(storage, t.name, picked.id);
      }
    }
    setTheme(themeName);
    await applyTheme(t, mode, wallpaperId);
  };

  return (
    <m.div {...props} className={screen}>
      <div className={header}>
        <Heading level={2} size={1}>
          {t("settings.theme.title")}
        </Heading>
        {!editorActive && (
          <DSButton iconStart={builtinIcons.add} onClick={() => openEditor()}>
            {t("settings.theme.newTheme")}
          </DSButton>
        )}
      </div>

      {editorActive ? (
        <ThemeEditor key={editorTheme?.name ?? "new"} theme={editorTheme} onClose={() => setEditorActive(false)} />
      ) : (
        <>
          <div className={grid}>
            {[...themes, ...customThemes].map((theme) => (
              <ThemePlate
                key={theme.name}
                theme={theme}
                active={theme.name === currentTheme}
                gamut={gamut}
                mode={mode}
                onSelect={() => {
                  selectTheme(theme.name);
                }}
                onEdit={theme.type === "custom" ? () => openEditor(theme) : undefined}
                onDelete={
                  theme.type === "custom"
                    ? () => {
                        setCustomThemes((prev) => prev.filter((t) => t.name !== theme.name));
                        deleteThemeBackgrounds(theme.name);
                        if (currentTheme === theme.name) {
                          setTheme(defaultTheme.name);
                          applyTheme(defaultTheme, mode);
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>

          <Field label={`${t("settings.theme.colorScheme")}:`}>
            <Select<ColorScheme>
              options={COLOR_SCHEMES}
              value={colorScheme}
              onChange={setColorScheme}
              getOptionKey={(s) => s}
              getOptionLabel={(s) => t(COLOR_SCHEME_LABEL_KEY[s])}
            />
          </Field>

          <Field
            label={`${t("settings.theme.widgetBackgroundOpacity")}: ${widgetBackgroundOpacity}%`}
            description={t("settings.theme.widgetBackgroundOpacityHint")}
          >
            <Slider value={widgetBackgroundOpacity} min={0} max={100} step={5} onChange={setWidgetBackgroundOpacity} />
          </Field>
        </>
      )}
    </m.div>
  );
};
