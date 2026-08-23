import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { IconButton } from "@anori/design-system/components/IconButton/IconButton";
import { anoriSchema, getAnoriStorage } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import {
  applyTheme,
  nextWallpaper,
  resolveColorScheme,
  setSelectedWallpaperId,
  themes,
} from "@anori/utils/user-data/theme";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";

const switcher = css({
  position: "absolute",
  insetBlockEnd: "4",
  insetInlineEnd: "4",
  zIndex: "docked",
});

export const WallpaperSwitcher = memo(function WallpaperSwitcher() {
  const { t } = useTranslation();
  const [themeName] = useStorageValue(anoriSchema.theme);
  const [customThemes] = useStorageValue(anoriSchema.customThemes);
  const [colorScheme] = useStorageValue(anoriSchema.colorScheme);
  const [selections] = useStorageValue(anoriSchema.themeWallpaperSelections);

  const theme = [...themes, ...customThemes].find((x) => x.name === themeName);
  const visible = theme?.type === "custom" && theme.wallpapers.length > 1;

  const advance = useCallback(async () => {
    if (theme?.type !== "custom" || theme.wallpapers.length <= 1) return;
    const currentId = selections[theme.name];
    const next = nextWallpaper(theme, currentId);
    if (!next) return;
    const storage = await getAnoriStorage();
    await setSelectedWallpaperId(storage, theme.name, next.id);
    await applyTheme(theme, resolveColorScheme(colorScheme), next.id);
  }, [theme, selections, colorScheme]);

  if (!visible) return null;

  return (
    <div className={switcher}>
      <IconButton
        variant="secondary"
        size="medium"
        icon={builtinIcons.refresh}
        label={t("settings.theme.nextWallpaper")}
        onClick={advance}
      />
    </div>
  );
});
