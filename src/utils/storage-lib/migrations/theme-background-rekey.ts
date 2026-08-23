import type { FileMetaValue } from "@anori/utils/storage-lib";
import browser from "webextension-polyfill";
import { createHlc, type HlcState, type HlcTimestamp } from "../hlc";
import { HLC_STATE_KEY } from "../keys";
import type { StorageRecord } from "../types";

const THEME_BACKGROUND_PREFIX = "ThemeBackground:";
const DEFAULT_WALLPAPER_ID = "default";

type LegacyThemeBgProperties = {
  themeName?: string;
  variant?: "original" | "blurred";
};

type ThemeBgProperties = LegacyThemeBgProperties & {
  wallpaperId?: string;
};

const isRecord = (value: unknown): value is StorageRecord<FileMetaValue<ThemeBgProperties>> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as { value?: unknown }).value === "object" &&
    (value as { value?: unknown }).value !== null &&
    "path" in ((value as { value?: object }).value ?? {})
  );
};

const isLegacyKey = (key: string): key is `${string}:${"original" | "blurred"}` => {
  if (!key.startsWith(THEME_BACKGROUND_PREFIX)) return false;
  const suffix = key.slice(THEME_BACKGROUND_PREFIX.length);
  const parts = suffix.split(":");
  if (parts.length !== 2) return false;
  return parts[1] === "original" || parts[1] === "blurred";
};

export const rekeyLegacyThemeBackgrounds = async (): Promise<number> => {
  const all = (await browser.storage.local.get(null)) as Record<string, unknown>;
  const hlcState = all[HLC_STATE_KEY] as HlcState | undefined;
  const hlc = hlcState ? createHlc(hlcState.nodeId, hlcState.last) : undefined;
  const tick = (): HlcTimestamp => (hlc ? hlc.tick() : ({ pt: 0, lc: 0, node: "" } as HlcTimestamp));

  const writes: Record<string, StorageRecord<FileMetaValue<ThemeBgProperties>>> = {};
  const removals: string[] = [];
  let count = 0;

  for (const [key, raw] of Object.entries(all)) {
    if (!isLegacyKey(key) || !isRecord(raw)) continue;
    const suffix = key.slice(THEME_BACKGROUND_PREFIX.length);
    const colonIndex = suffix.lastIndexOf(":");
    const themeName = suffix.slice(0, colonIndex);
    const variant = suffix.slice(colonIndex + 1) as "original" | "blurred";
    const newKey = `${THEME_BACKGROUND_PREFIX}${themeName}:${DEFAULT_WALLPAPER_ID}:${variant}`;
    if (all[newKey]) continue;

    const existing = raw.value as FileMetaValue<LegacyThemeBgProperties>;
    const next: FileMetaValue<ThemeBgProperties> = {
      path: existing.path,
      properties: {
        themeName: existing.properties?.themeName ?? themeName,
        variant: existing.properties?.variant ?? variant,
        wallpaperId: DEFAULT_WALLPAPER_ID,
      },
    };
    writes[newKey] = { ...raw, hlc: tick(), value: next };
    removals.push(key);
    count++;
  }

  if (count > 0) {
    await browser.storage.local.set(writes);
    await browser.storage.local.remove(removals);
    if (hlc) {
      await browser.storage.local.set({ [HLC_STATE_KEY]: hlc.getState() });
    }
  }
  return count;
};
