export const availableTranslations = ["en"] as const;

export type Language = (typeof availableTranslations)[number];

export const availableTranslationsPrettyNames = {
  en: "English",
} satisfies Record<Language, string>;

export const languageDirections = {
  en: "ltr",
} satisfies Record<Language, "rtl" | "ltr">;
