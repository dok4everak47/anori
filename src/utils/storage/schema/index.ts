import { availableTranslations, type Language } from "@anori/translations/metadata";
import { type HslColor, hslColorToOklch } from "@anori/utils/color";
import { StashEntrySchema, StashSchema } from "@anori/utils/storage/schema/stash";
import {
  BookmarkWidgetStoreSchema,
  NotesWidgetStoreSchema,
  RssWidgetStoreSchema,
  TasksWidgetStoreSchema,
  TopSitesWidgetStoreSchema,
  WeatherCurrentWidgetStoreSchema,
  WeatherForecastWidgetStoreSchema,
} from "@anori/utils/storage/schema/widget-store";
import {
  cell,
  collection,
  createMigration,
  defineSchemaVersion,
  defineVersionedSchema,
  entity,
  fileCollection,
} from "@anori/utils/storage-lib/schema";
import { z } from "zod";

const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
});

export type Folder = z.infer<typeof FolderSchema>;

const WidgetInFolderSchema = z.object({
  pluginId: z.string(),
  widgetId: z.string(),
  instanceId: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const FolderDetailsSchema = z.object({
  widgets: z.array(WidgetInFolderSchema),
});

export type FolderDetails = z.infer<typeof FolderDetailsSchema>;

const HslColorSchema: z.ZodType<HslColor> = z.object({
  hue: z.number(),
  saturation: z.number(),
  lightness: z.number(),
  alpha: z.number(),
});

const CustomThemeSchemaV1 = z.object({
  name: z.string(),
  type: z.literal("custom"),
  blur: z.number(),
  colors: z.object({
    accent: HslColorSchema,
    background: HslColorSchema,
    text: HslColorSchema,
  }),
});

const OklchColorSchema = z.object({ l: z.number(), c: z.number(), h: z.number() });

const BackgroundFitSchema = z.enum(["cover", "contain", "tile"]);
const BackgroundAnchorSchema = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

const CustomThemeSchema = z.object({
  name: z.string(),
  type: z.literal("custom"),
  blur: z.number(),
  accent: OklchColorSchema,
  hideDotPattern: z.boolean().optional(),
  backgroundFit: BackgroundFitSchema.optional(),
  backgroundAnchor: BackgroundAnchorSchema.optional(),
});

const CustomThemeSchemaV4 = CustomThemeSchema.extend({
  backgroundColor: z.string().optional(),
});

export type CustomTheme = z.infer<typeof CustomThemeSchemaV4>;

const ColorSchemeSchema = z.enum(["light", "dark", "system"]);
export type ColorScheme = z.infer<typeof ColorSchemeSchema>;

const SidebarOrientationSchema = z.enum(["vertical", "horizontal", "auto"]);
export type SidebarOrientation = z.infer<typeof SidebarOrientationSchema>;

const LanguageSchema: z.ZodType<Language> = z.enum(availableTranslations);

// ============================================================================
// Schema Definition
// ============================================================================

export const schemaV1 = defineSchemaVersion(1, {
  // Core data
  folders: cell({
    key: "folders",
    schema: z.array(FolderSchema),
    defaultValue: [],
    sync: "profile",
    includedInBackup: true,
  }),
  folderDetails: collection({
    keyPrefix: "Folder",
    entities: {
      folder: entity({
        brand: "FolderDetails",
        schema: FolderDetailsSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  newTabTitle: cell({
    key: "newTabTitle",
    schema: z.string(),
    defaultValue: "Anori",
    sync: "profile",
    includedInBackup: true,
  }),

  // Appearance settings
  theme: cell({
    key: "theme",
    schema: z.string(),
    defaultValue: "Greenery",
    sync: "profile",
    includedInBackup: true,
  }),
  customThemes: cell({
    key: "customThemes",
    schema: z.array(CustomThemeSchemaV1),
    defaultValue: [],
    sync: "profile",
    includedInBackup: true,
  }),
  widgetBackgroundOpacity: cell({
    key: "widgetBackgroundOpacity",
    schema: z.number().min(0).max(100),
    defaultValue: 100,
    sync: "profile",
    includedInBackup: true,
  }),

  // Layout settings
  sidebarOrientation: cell({
    key: "sidebarOrientation",
    schema: SidebarOrientationSchema,
    defaultValue: "auto" as const,
    sync: "profile",
    includedInBackup: true,
  }),
  autoHideSidebar: cell({
    key: "autoHideSidebar",
    schema: z.boolean(),
    defaultValue: false,
    sync: "profile",
    includedInBackup: true,
  }),
  showBookmarksBar: cell({
    key: "showBookmarksBar",
    schema: z.boolean(),
    defaultValue: false,
    sync: "profile",
    includedInBackup: true,
  }),

  // Navigation settings
  rememberLastFolder: cell({
    key: "rememberLastFolder",
    schema: z.boolean(),
    defaultValue: false,
    sync: "profile",
    includedInBackup: true,
  }),
  lastFolder: cell({
    key: "lastFolder",
    schema: z.string().optional(),
    defaultValue: undefined,
    sync: "off",
    includedInBackup: true,
  }),

  // Display mode settings
  compactMode: cell({
    key: "compactMode",
    schema: z.boolean(),
    defaultValue: false,
    sync: "profile",
    includedInBackup: true,
  }),
  automaticCompactMode: cell({
    key: "automaticCompactMode",
    schema: z.boolean(),
    defaultValue: true,
    sync: "profile",
    includedInBackup: true,
  }),
  automaticCompactModeThreshold: cell({
    key: "automaticCompactModeThreshold",
    schema: z.number(),
    defaultValue: 1500,
    sync: "off",
    includedInBackup: true,
  }),
  showLoadAnimation: cell({
    key: "showLoadAnimation",
    schema: z.boolean(),
    defaultValue: false,
    sync: "profile",
    includedInBackup: true,
  }),

  // Localization
  language: cell({
    key: "language",
    schema: LanguageSchema,
    defaultValue: "en" as Language,
    sync: "profile",
    includedInBackup: true,
  }),

  // User state (not synced)
  hasUnreadReleaseNotes: cell({
    key: "hasUnreadReleaseNotes",
    schema: z.boolean(),
    defaultValue: false,
    sync: "off",
    includedInBackup: true,
  }),
  finishedOnboarding: cell({
    key: "finishedOnboarding",
    schema: z.boolean(),
    defaultValue: false,
    sync: "off",
    includedInBackup: true,
  }),

  // Plugin storage collections
  pluginConfig: collection({
    keyPrefix: "PluginConfig",
    entities: {
      config: entity({
        brand: "PluginConfig",
        schema: z.record(z.string(), z.unknown()),
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  pluginStorage: collection({
    keyPrefix: "PluginStorage",
    entities: {
      storage: entity({
        brand: "PluginStorage",
        schema: z.record(z.string(), z.unknown()),
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),

  // Widget-specific stores
  tasksWidgetStore: collection({
    keyPrefix: "TasksWidgetStore",
    entities: {
      store: entity({
        brand: "TasksWidgetStore",
        schema: TasksWidgetStoreSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  notesWidgetStore: collection({
    keyPrefix: "NotesWidgetStore",
    entities: {
      store: entity({
        brand: "NotesWidgetStore",
        schema: NotesWidgetStoreSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  weatherCurrentWidgetStore: collection({
    keyPrefix: "WeatherCurrentWidgetStore",
    entities: {
      store: entity({
        brand: "WeatherCurrentWidgetStore",
        schema: WeatherCurrentWidgetStoreSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  weatherForecastWidgetStore: collection({
    keyPrefix: "WeatherForecastWidgetStore",
    entities: {
      store: entity({
        brand: "WeatherForecastWidgetStore",
        schema: WeatherForecastWidgetStoreSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  topSitesWidgetStore: collection({
    keyPrefix: "TopSitesWidgetStore",
    entities: {
      store: entity({
        brand: "TopSitesWidgetStore",
        schema: TopSitesWidgetStoreSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  rssWidgetStore: collection({
    keyPrefix: "RssWidgetStore",
    entities: {
      store: entity({
        brand: "RssWidgetStore",
        schema: RssWidgetStoreSchema,
      }),
    },
    sync: "profile",
    includedInBackup: true,
  }),
  bookmarkWidgetStore: collection({
    keyPrefix: "BookmarkWidgetStore",
    entities: {
      store: entity({
        brand: "BookmarkWidgetStore",
        schema: BookmarkWidgetStoreSchema,
      }),
    },
    sync: "off",
    includedInBackup: true,
  }),

  // File collections
  customIcons: fileCollection({
    keyPrefix: "CustomIcon",
    sync: "profile",
    includedInBackup: true,
    propertiesSchema: z.object({
      mimeType: z.string().optional(),
    }),
  }),
  themeBackgrounds: fileCollection({
    keyPrefix: "ThemeBackground",
    sync: "profile",
    includedInBackup: true,
  }),
  pictureWidgetImages: fileCollection({
    keyPrefix: "PictureWidgetImage",
    sync: "profile",
    includedInBackup: true,
    propertiesSchema: z.object({
      mimeType: z.string().optional(),
    }),
  }),
});

export type AnoriSchemaV1 = typeof schemaV1.definition;

export const schemaV2 = defineSchemaVersion(2, {
  ...schemaV1.definition,
  customThemes: cell({
    key: "customThemes",
    schema: z.array(CustomThemeSchema),
    defaultValue: [],
    sync: "profile",
    includedInBackup: true,
  }),
  colorScheme: cell({
    key: "colorScheme",
    schema: ColorSchemeSchema,
    defaultValue: "dark" as const,
    sync: "profile",
    includedInBackup: true,
  }),

  // Stashes are user-scoped; entries are split into separate records so concurrent adds touch distinct keys.
  stashes: collection({
    keyPrefix: "Stash",
    entities: {
      stash: entity({ brand: "Stash", schema: StashSchema }),
    },
    sync: "user",
    includedInBackup: true,
  }),
  stashEntries: collection({
    keyPrefix: "StashEntry",
    entities: {
      entry: entity({ brand: "StashEntry", schema: StashEntrySchema }),
    },
    sync: "user",
    includedInBackup: true,
  }),
});

export type AnoriSchemaV2 = typeof schemaV2.definition;

const migrateV1ToV2 = createMigration(schemaV1, schemaV2, async (ctx) => {
  const oldThemes = ctx.from.get(ctx.from.schema.customThemes) ?? [];
  ctx.to.set(
    ctx.to.schema.customThemes,
    oldThemes.map((t) => ({
      name: t.name,
      type: "custom" as const,
      blur: t.blur,
      accent: hslColorToOklch(t.colors.accent),
    })),
  );
});

export const schemaV3 = defineSchemaVersion(3, {
  ...schemaV2.definition,
  customThemes: cell({
    key: "customThemes",
    schema: z.array(CustomThemeSchema),
    defaultValue: [],
    sync: "profile",
    includedInBackup: true,
  }),
});

export type AnoriSchemaV3 = typeof schemaV3.definition;

// Up to v2 the engine ignored accent.l and always rendered surfaces at L 0.38; from v3 on accent.l is
// live, so pin stored themes to 0.38 to keep them looking exactly as they did.
const migrateV2ToV3 = createMigration(schemaV2, schemaV3, async (ctx) => {
  const oldThemes = ctx.from.get(ctx.from.schema.customThemes) ?? [];
  ctx.to.set(
    ctx.to.schema.customThemes,
    oldThemes.map((theme) => ({ ...theme, accent: { ...theme.accent, l: 0.38 } })),
  );
});

export const schemaV4 = defineSchemaVersion(4, {
  ...schemaV3.definition,
  customThemes: cell({
    key: "customThemes",
    schema: z.array(CustomThemeSchemaV4),
    defaultValue: [],
    sync: "profile",
    includedInBackup: true,
  }),
});

export type AnoriSchemaV4 = typeof schemaV4.definition;

const migrateV3ToV4 = createMigration(schemaV3, schemaV4, async (ctx) => {
  const oldThemes = ctx.from.get(ctx.from.schema.customThemes) ?? [];
  ctx.to.set(ctx.to.schema.customThemes, oldThemes);
});

export const schemaV5 = defineSchemaVersion(5, {
  ...schemaV4.definition,
  crtEffect: cell({
    key: "crtEffect",
    schema: z.boolean(),
    defaultValue: false,
    sync: "profile",
    includedInBackup: true,
  }),
});

export type AnoriSchemaV5 = typeof schemaV5.definition;

const migrateV4ToV5 = createMigration(schemaV4, schemaV5, async (ctx) => {
  ctx.to.set(ctx.to.schema.crtEffect, false);
});

export const anoriVersionedSchema = defineVersionedSchema({
  versions: [schemaV1, schemaV2, schemaV3, schemaV4, schemaV5],
  migrations: [migrateV1ToV2, migrateV2ToV3, migrateV3ToV4, migrateV4ToV5],
});

export const anoriSchema = anoriVersionedSchema.latestSchema.definition;

export type {
  Stash,
  StashEntry,
  StashGroupEntry,
  StashLink,
  StashLinkEntry,
} from "./stash";
export type {
  BookmarkWidgetStore,
  NotesWidgetStore,
  RssFeed,
  RssPost,
  RssWidgetStore,
  Task,
  TasksWidgetStore,
  TopSitesWidgetStore,
  WeatherCurrentWidgetStore,
  WeatherForecastWidgetStore,
} from "./widget-store";
