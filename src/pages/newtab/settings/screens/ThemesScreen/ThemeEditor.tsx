import { detectGamut, type Mode } from "@anori/design-system/color-engine";
import { Button as DSButton } from "@anori/design-system/components/Button/Button";
import { Checkbox } from "@anori/design-system/components/Checkbox/Checkbox";
import { Field } from "@anori/design-system/components/Field/Field";
import { Heading } from "@anori/design-system/components/Heading/Heading";
import { HueChromaPicker } from "@anori/design-system/components/HueChromaPicker/HueChromaPicker";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Icon } from "@anori/design-system/components/Icon/Icon";
import { IconButton } from "@anori/design-system/components/IconButton/IconButton";
import { Select } from "@anori/design-system/components/Select/Select";
import { Slider } from "@anori/design-system/components/Slider/Slider";
import { showOpenFilePicker } from "@anori/utils/files";
import { useMirrorStateToRef, useRunAfterNextRender } from "@anori/utils/hooks";
import { guid } from "@anori/utils/misc";
import { setPageBackground } from "@anori/utils/page";
import { anoriSchema, type CustomTheme, getAnoriStorage } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import {
  applyTheme,
  applyThemeColors,
  applyThemeDecorations,
  BACKGROUND_ANCHOR_CSS,
  type BackgroundAnchor,
  type BackgroundFit,
  deleteThemeWallpaperFiles,
  getThemeBackground,
  getThemeBackgroundOriginal,
  resolveColorScheme,
  saveThemeBackground,
  type ThemeWallpaper,
} from "@anori/utils/user-data/theme";
import { useCurrentTheme } from "@anori/utils/user-data/theme-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css, cva, cx } from "styled-system/css";

const PREVIEW_MODES: Mode[] = ["light", "dark"];
const PREVIEW_MODE_LABEL_KEY: Record<Mode, string> = {
  light: "settings.theme.colorSchemeLight",
  dark: "settings.theme.colorSchemeDark",
};

const BACKGROUND_FITS: BackgroundFit[] = ["cover", "contain", "tile"];
const BACKGROUND_FIT_LABEL_KEY: Record<BackgroundFit, string> = {
  cover: "settings.theme.fitCover",
  contain: "settings.theme.fitContain",
  tile: "settings.theme.fitTile",
};

const BACKGROUND_ANCHORS: BackgroundAnchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
const BACKGROUND_ANCHOR_LABEL_KEY: Record<BackgroundAnchor, string> = {
  "top-left": "settings.theme.anchorTopLeft",
  "top-center": "settings.theme.anchorTopCenter",
  "top-right": "settings.theme.anchorTopRight",
  "center-left": "settings.theme.anchorCenterLeft",
  center: "settings.theme.anchorCenter",
  "center-right": "settings.theme.anchorCenterRight",
  "bottom-left": "settings.theme.anchorBottomLeft",
  "bottom-center": "settings.theme.anchorBottomCenter",
  "bottom-right": "settings.theme.anchorBottomRight",
};

const DEFAULT_FILL = "#121615";
const FILL_PRESETS = ["#000000", DEFAULT_FILL, "#6e7a7f", "#f4f7f5", "#ffffff"];

const editorPanel = css({ display: "flex", flexDirection: "column", gap: "4" });
const preview = css({
  position: "relative",
  overflow: "hidden",
  height: "160px",
  borderRadius: "md",
  background: "repeating-conic-gradient(var(--ds-frosted-strong) 0% 25%, transparent 0% 50%) 50% / 18px 18px",
});
const previewImage = css({ position: "absolute" });
const backgroundSection = css({ display: "flex", flexDirection: "column", gap: "2" });
const editorActions = css({ display: "flex", justifyContent: "flex-end", gap: "3" });
const wallpaperStrip = css({ display: "flex", gap: "2", flexWrap: "wrap" });

const wallpaperThumb = cva({
  base: {
    position: "relative",
    width: "3.5rem",
    height: "3.5rem",
    padding: 0,
    borderRadius: "md",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundColor: "frosted.strong",
    cursor: "pointer",
    overflow: "hidden",
  },
  variants: { active: { true: { borderColor: "accent" } } },
});

const wallpaperThumbAdd = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "text.subtle",
  borderStyle: "dashed",
  borderColor: "frosted.strong",
});

const wallpaperThumbRemove = css({
  position: "absolute",
  top: "0.5",
  right: "0.5",
});

const fillSwatches = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const fillSwatch = cva({
  base: {
    position: "relative",
    width: "1.75rem",
    height: "1.75rem",
    padding: 0,
    borderRadius: "full",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "frosted.strong",
    overflow: "hidden",
    cursor: "pointer",
  },
  variants: { active: { true: { borderColor: "accent" } } },
});
const fillNoneSwatch = css({
  backgroundImage:
    "linear-gradient(135deg, transparent calc(50% - 0.5px), var(--ds-text-subtle) calc(50% - 0.5px), var(--ds-text-subtle) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
});
const fillColorInput = css({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
});

type DraftWallpaper = ThemeWallpaper & {
  originalBlob?: Blob;
  blurredBlob?: Blob;
  originalUrl?: string;
  blurredUrl?: string;
  dirtyImage?: boolean;
};

const bakeBlur = (source: Blob, blur: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const bgUrl = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      const padding = blur * 2;
      const canvas = document.createElement("canvas");
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(bgUrl);
        reject(new Error("couldn't get 2D context from canvas"));
        return;
      }
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const cropped = document.createElement("canvas");
      cropped.width = img.width;
      cropped.height = img.height;
      const croppedCtx = cropped.getContext("2d");
      if (!croppedCtx) {
        URL.revokeObjectURL(bgUrl);
        reject(new Error("couldn't get 2D context from canvas"));
        return;
      }
      croppedCtx.drawImage(canvas, padding, padding, img.width, img.height, 0, 0, img.width, img.height);
      URL.revokeObjectURL(bgUrl);
      cropped.toBlob((blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(blob);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(bgUrl);
      reject(new Error("image failed to load"));
    };
    img.src = bgUrl;
  });
};

export const ThemeEditor = ({ theme: themeFromProps, onClose }: { theme?: CustomTheme; onClose: VoidFunction }) => {
  const { t } = useTranslation();
  const [colorScheme] = useStorageValue(anoriSchema.colorScheme);
  const [previewMode, setPreviewMode] = useState<Mode>(() => resolveColorScheme(colorScheme));
  const previewModeRef = useMirrorStateToRef(previewMode);
  const [currentTheme, setCurrentTheme] = useCurrentTheme();
  const currentThemeRef = useMirrorStateToRef(currentTheme);
  const colorSchemeRef = useMirrorStateToRef(colorScheme);
  const savedRef = useRef(false);
  const gamut = useMemo(() => detectGamut(), []);

  const [accent, setAccent] = useState(themeFromProps?.accent ?? currentTheme.accent);
  const accentRef = useMirrorStateToRef(accent);
  const [hideDotPattern, setHideDotPattern] = useState(!!themeFromProps?.hideDotPattern);

  const [wallpapers, setWallpapers] = useState<DraftWallpaper[]>(() => {
    if (themeFromProps && themeFromProps.wallpapers.length > 0) {
      return themeFromProps.wallpapers.map((w) => ({ ...w }));
    }
    if (themeFromProps) {
      return [
        {
          id: guid(),
          blur: themeFromProps.blur,
          fit: themeFromProps.backgroundFit ?? "cover",
          anchor: themeFromProps.backgroundAnchor ?? "center",
          fillColor: themeFromProps.backgroundColor,
        },
      ];
    }
    return [];
  });

  const [activeWallpaperId, setActiveWallpaperId] = useState<string | null>(wallpapers[0]?.id ?? null);
  const activeWallpaper = wallpapers.find((w) => w.id === activeWallpaperId) ?? wallpapers[0];
  const hasAnyImage = wallpapers.some((w) => !!w.blurredUrl);

  const runAfterRender = useRunAfterNextRender();

  useEffect(() => {
    return () => {
      if (!savedRef.current) applyTheme(currentThemeRef.current, resolveColorScheme(colorSchemeRef.current));
    };
  }, []);

  const wallpapersRef = useRef<DraftWallpaper[]>(wallpapers);
  wallpapersRef.current = wallpapers;
  useEffect(() => {
    return () => {
      for (const w of wallpapersRef.current) {
        if (w.originalUrl) URL.revokeObjectURL(w.originalUrl);
        if (w.blurredUrl) URL.revokeObjectURL(w.blurredUrl);
      }
    };
  }, []);

  const themeNameRef = useRef(themeFromProps?.name ?? guid());
  const themeId = themeNameRef.current;

  useEffect(() => {
    if (!themeFromProps) return;
    let cancelled = false;
    const loaded: string[] = [];
    (async () => {
      for (const wp of themeFromProps.wallpapers) {
        try {
          const original = await getThemeBackgroundOriginal(themeFromProps.name, wp.id);
          const blurred = await getThemeBackground(themeFromProps.name, wp.id);
          if (cancelled) return;
          loaded.push(wp.id);
          setWallpapers((prev) =>
            prev.map((w) => {
              if (w.id !== wp.id) return w;
              return {
                ...w,
                originalBlob: original,
                blurredBlob: blurred,
                originalUrl: URL.createObjectURL(original),
                blurredUrl: URL.createObjectURL(blurred),
              };
            }),
          );
        } catch (err) {
          console.log("Error while loading theme background", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [themeFromProps]);

  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => setPreviewScale(el.clientWidth / window.innerWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const backgroundUrlRef = useRef<string | null>(null);
  const blurredUrlForRef = activeWallpaper?.blurredUrl ?? null;
  useEffect(() => {
    backgroundUrlRef.current = blurredUrlForRef;
  }, [blurredUrlForRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: colorScheme flips global theme, re-assert draft preview via refs
  useEffect(() => {
    applyThemeColors(accentRef.current, previewModeRef.current);
    if (backgroundUrlRef.current) setPageBackground(backgroundUrlRef.current);
  }, [colorScheme]);

  const applyPreview = (nextAccent = accent) => {
    runAfterRender(() => applyThemeColors(nextAccent, previewMode));
  };

  const applyDecorationsPreview = (wp: DraftWallpaper) => {
    applyThemeDecorations({
      hideDotPattern,
      fit: wp.fit,
      anchor: wp.anchor,
      backgroundColor: wp.fillColor,
    });
  };

  const selectWallpaper = (wp: DraftWallpaper) => {
    setActiveWallpaperId(wp.id);
    applyDecorationsPreview(wp);
    if (wp.blurredUrl) setPageBackground(wp.blurredUrl);
  };

  const addWallpaper = async () => {
    const files = await showOpenFilePicker(false, ".jpg,.jpeg,.png");
    if (!files[0]) return;
    const original = files[0];
    const wp: DraftWallpaper = {
      id: guid(),
      blur: 5,
      fit: "cover",
      anchor: "center",
      originalBlob: original,
      originalUrl: URL.createObjectURL(original),
    };
    try {
      const blurred = await bakeBlur(original, wp.blur);
      wp.blurredBlob = blurred;
      wp.blurredUrl = URL.createObjectURL(blurred);
    } catch (err) {
      console.log("Error while baking blur", err);
    }
    setWallpapers((prev) => [...prev, wp]);
    setActiveWallpaperId(wp.id);
    applyDecorationsPreview(wp);
    if (wp.blurredUrl) setPageBackground(wp.blurredUrl);
  };

  const updateWallpaper = (id: string, patch: Partial<DraftWallpaper>) => {
    setWallpapers((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const rebakeWallpaperBlur = async (wp: DraftWallpaper, blur: number) => {
    if (!wp.originalBlob) return;
    try {
      const blob = await bakeBlur(wp.originalBlob, blur);
      const previousUrl = wp.blurredUrl;
      const url = URL.createObjectURL(blob);
      updateWallpaper(wp.id, { blur, blurredBlob: blob, blurredUrl: url, dirtyImage: true });
      if (activeWallpaperId === wp.id) setPageBackground(url, previousUrl);
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    } catch (err) {
      console.log("Error while applying blur", err);
    }
  };

  const replaceWallpaperImage = async (wp: DraftWallpaper) => {
    const files = await showOpenFilePicker(false, ".jpg,.jpeg,.png");
    if (!files[0]) return;
    const original = files[0];
    const originalUrl = URL.createObjectURL(original);
    try {
      const blurred = await bakeBlur(original, wp.blur);
      const blurredUrl = URL.createObjectURL(blurred);
      if (wp.originalUrl) URL.revokeObjectURL(wp.originalUrl);
      if (wp.blurredUrl && wp.blurredUrl !== blurredUrl) URL.revokeObjectURL(wp.blurredUrl);
      updateWallpaper(wp.id, {
        originalBlob: original,
        blurredBlob: blurred,
        originalUrl,
        blurredUrl,
        dirtyImage: true,
      });
      if (activeWallpaperId === wp.id) setPageBackground(blurredUrl);
    } catch (err) {
      URL.revokeObjectURL(originalUrl);
      console.log("Error while changing background", err);
    }
  };

  const removeWallpaper = async (wp: DraftWallpaper) => {
    if (themeFromProps) {
      try {
        await deleteThemeWallpaperFiles(themeFromProps.name, wp.id);
      } catch (err) {
        console.log("Error while removing wallpaper files", err);
      }
    }
    if (wp.originalUrl) URL.revokeObjectURL(wp.originalUrl);
    if (wp.blurredUrl) URL.revokeObjectURL(wp.blurredUrl);
    setWallpapers((prev) => {
      const next = prev.filter((w) => w.id !== wp.id);
      if (activeWallpaperId === wp.id) {
        const fallback = next[0];
        setActiveWallpaperId(fallback?.id ?? null);
        if (fallback) {
          applyDecorationsPreview(fallback);
          if (fallback.blurredUrl) setPageBackground(fallback.blurredUrl);
        }
      }
      return next;
    });
  };

  const saveTheme = async () => {
    const valid = wallpapers.filter((w): w is DraftWallpaper & { blurredBlob: Blob; originalBlob: Blob } => {
      return !!w.originalBlob && !!w.blurredBlob;
    });
    if (valid.length === 0) return;

    const storage = await getAnoriStorage();
    const existing = themeFromProps ? storage.get(anoriSchema.customThemes).find((t) => t.name === themeId) : undefined;
    const existingIds = new Set(existing?.wallpapers.map((w) => w.id) ?? []);

    for (const wp of valid) {
      const isNew = !existingIds.has(wp.id);
      const imageChanged = isNew || wp.dirtyImage;
      await saveThemeBackground(themeId, wp.id, "original", wp.originalBlob);
      if (imageChanged || isNew) {
        await saveThemeBackground(themeId, wp.id, "blurred", wp.blurredBlob);
      }
    }

    const removedIds = existing
      ? existing.wallpapers.filter((w) => !valid.some((v) => v.id === w.id)).map((w) => w.id)
      : [];
    for (const id of removedIds) {
      await deleteThemeWallpaperFiles(themeId, id);
    }

    const toSave: CustomTheme = {
      name: themeId,
      type: "custom",
      blur: valid[0].blur,
      accent,
      hideDotPattern,
      wallpapers: valid.map((w) => ({
        id: w.id,
        blur: w.blur,
        fit: w.fit,
        anchor: w.anchor,
        fillColor: w.fillColor,
      })),
    };

    let customThemes = storage.get(anoriSchema.customThemes);
    if (themeFromProps) {
      customThemes = customThemes.map((t) => (t.name === themeId ? toSave : t));
    } else {
      customThemes.push(toSave);
    }
    await storage.set(anoriSchema.customThemes, customThemes);

    savedRef.current = true;
    setCurrentTheme(themeId);
    applyThemeColors(accent, resolveColorScheme(colorScheme));
    const selected = activeWallpaper ?? toSave.wallpapers[0];
    if (selected) {
      applyThemeDecorations({
        hideDotPattern,
        fit: selected.fit,
        anchor: selected.anchor,
        backgroundColor: selected.fillColor,
      });
      await applyTheme(toSave, resolveColorScheme(colorScheme), selected.id);
    }
    onClose();
  };

  const previewBlur = activeWallpaper ? activeWallpaper.blur * previewScale : 0;

  return (
    <div className={editorPanel}>
      <Heading level={3}>{themeFromProps ? t("settings.theme.editTheme") : t("settings.theme.newTheme")}</Heading>

      <Field label={`${t("settings.theme.previewColorScheme")}:`}>
        <Select<Mode>
          options={PREVIEW_MODES}
          value={previewMode}
          onChange={(mode) => {
            setPreviewMode(mode);
            applyThemeColors(accent, mode);
          }}
          getOptionKey={(m) => m}
          getOptionLabel={(m) => t(PREVIEW_MODE_LABEL_KEY[m])}
        />
      </Field>

      <Field label={`${t("settings.theme.wallpapers")}:`} description={t("settings.theme.wallpapersHint")}>
        <div className={wallpaperStrip}>
          {wallpapers.map((wp) => (
            <div key={wp.id} className={css({ position: "relative" })}>
              <button
                type="button"
                className={wallpaperThumb({ active: wp.id === activeWallpaperId })}
                style={{ backgroundImage: wp.blurredUrl ? `url(${wp.blurredUrl})` : undefined }}
                onClick={() => selectWallpaper(wp)}
                aria-label={t("settings.theme.selectWallpaper", { index: wallpapers.indexOf(wp) + 1 })}
              />
              {wallpapers.length > 1 && (
                <div className={wallpaperThumbRemove}>
                  <IconButton
                    variant="secondary"
                    size="compact"
                    icon={builtinIcons.trash}
                    label={t("settings.theme.removeWallpaper")}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWallpaper(wp);
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          <button type="button" className={cx(wallpaperThumb(), wallpaperThumbAdd)} onClick={addWallpaper}>
            <Icon icon={builtinIcons.add} />
          </button>
        </div>
      </Field>

      {activeWallpaper && (
        <>
          <Field label={`${t("settings.theme.colorBackground")}:`}>
            <div className={backgroundSection}>
              <div ref={previewRef} className={preview}>
                {activeWallpaper.originalUrl && (
                  <div
                    className={previewImage}
                    style={{
                      inset: `-${previewBlur * 2}px`,
                      backgroundImage: `url(${activeWallpaper.originalUrl})`,
                      filter: `blur(${previewBlur}px)`,
                      backgroundSize: activeWallpaper.fit === "tile" ? "auto" : activeWallpaper.fit,
                      backgroundPosition: BACKGROUND_ANCHOR_CSS[activeWallpaper.anchor],
                      backgroundRepeat: activeWallpaper.fit === "tile" ? "repeat" : "no-repeat",
                    }}
                  />
                )}
              </div>
              <DSButton variant="secondary" onClick={() => replaceWallpaperImage(activeWallpaper)}>
                {activeWallpaper.blurredUrl
                  ? t("settings.theme.changeBackground")
                  : t("settings.theme.selectBackground")}
              </DSButton>
            </div>
          </Field>

          <Field label={`${t("settings.theme.blur")}:`}>
            <Slider
              value={activeWallpaper.blur}
              min={0}
              max={50}
              onChange={(val) => updateWallpaper(activeWallpaper.id, { blur: val })}
              onCommit={(val) => rebakeWallpaperBlur(activeWallpaper, val)}
            />
          </Field>

          <Field label={`${t("settings.theme.fit")}:`}>
            <Select<BackgroundFit>
              options={BACKGROUND_FITS}
              value={activeWallpaper.fit}
              onChange={(fit) => {
                updateWallpaper(activeWallpaper.id, { fit });
                applyDecorationsPreview({ ...activeWallpaper, fit });
              }}
              getOptionKey={(o) => o}
              getOptionLabel={(o) => t(BACKGROUND_FIT_LABEL_KEY[o])}
            />
          </Field>

          <Field label={`${t("settings.theme.anchor")}:`}>
            <Select<BackgroundAnchor>
              options={BACKGROUND_ANCHORS}
              value={activeWallpaper.anchor}
              onChange={(anchor) => {
                updateWallpaper(activeWallpaper.id, { anchor });
                applyDecorationsPreview({ ...activeWallpaper, anchor });
              }}
              getOptionKey={(o) => o}
              getOptionLabel={(o) => t(BACKGROUND_ANCHOR_LABEL_KEY[o])}
            />
          </Field>

          <Field label={`${t("settings.theme.fillColor")}:`} description={t("settings.theme.fillColorHint")}>
            <div className={fillSwatches}>
              <button
                type="button"
                className={cx(fillSwatch({ active: !activeWallpaper.fillColor }), fillNoneSwatch)}
                onClick={() => {
                  updateWallpaper(activeWallpaper.id, { fillColor: undefined });
                  applyDecorationsPreview({ ...activeWallpaper, fillColor: undefined });
                }}
                aria-label={t("settings.theme.fillColorNone")}
              />
              {FILL_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={fillSwatch({ active: activeWallpaper.fillColor === color })}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    updateWallpaper(activeWallpaper.id, { fillColor: color });
                    applyDecorationsPreview({ ...activeWallpaper, fillColor: color });
                  }}
                  aria-label={color}
                />
              ))}
              <div
                className={cx(
                  fillSwatch({
                    active: !!activeWallpaper.fillColor && !FILL_PRESETS.includes(activeWallpaper.fillColor),
                  }),
                )}
                style={{ backgroundColor: activeWallpaper.fillColor ?? DEFAULT_FILL }}
              >
                <input
                  type="color"
                  className={fillColorInput}
                  value={activeWallpaper.fillColor ?? DEFAULT_FILL}
                  onChange={(e) => {
                    updateWallpaper(activeWallpaper.id, { fillColor: e.target.value });
                    applyDecorationsPreview({ ...activeWallpaper, fillColor: e.target.value });
                  }}
                />
              </div>
            </div>
          </Field>
        </>
      )}

      <HueChromaPicker
        label={`${t("settings.theme.colorAccent")}:`}
        value={accent}
        mode={previewMode}
        gamut={gamut}
        onChange={(next) => {
          setAccent(next);
          applyPreview(next);
        }}
      />

      <Checkbox checked={hideDotPattern} onChange={(v) => setHideDotPattern(v)}>
        {t("settings.theme.hideDotPattern")}
      </Checkbox>

      <div className={editorActions}>
        <DSButton variant="secondary" onClick={onClose}>
          {t("back")}
        </DSButton>
        <DSButton disabled={!hasAnyImage} onClick={saveTheme}>
          {t("save")}
        </DSButton>
      </div>
    </div>
  );
};
