import enTranslation from "@anori/translations/en.json";
import type { Language } from "@anori/translations/metadata";
import { anoriSchema, getAnoriStorage } from "@anori/utils/storage";
import type { Mapping } from "@anori/utils/types";
import i18n from "i18next";
import moment from "moment";
import { initReactI18next } from "react-i18next";

type TranslationBundle = { translation: Mapping };

const applyHtmlLangAttributes = (lang: Language) => {
  const html = document.querySelector("html");
  if (html) {
    html.setAttribute("lang", lang);
    html.setAttribute("dir", "ltr");
  }
};

export const initTranslation = async () => {
  const storage = await getAnoriStorage();
  const lang = storage.get(anoriSchema.language);

  if (typeof document !== "undefined") {
    applyHtmlLangAttributes(lang);
  }

  moment.locale("en");

  i18n.use(initReactI18next).init({
    debug: true,
    returnNull: false,
    fallbackLng: "en",
    lng: "en",
    interpolation: {
      escapeValue: false,
    },
    resources: { en: enTranslation as TranslationBundle },
  });
};

export const translate = i18n.t;
