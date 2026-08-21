# Localization

* Anori ships English-only. i18next and react-i18next remain for key resolution; there are no non-English translation files, no translation manager, no fingerprints, and no CI translation check.

* When translating a string inside a React component, use the `useTranslation` hook from `react-i18next`. It returns a `t` function you call with a nested key (e.g. `onboarding.presets.title`).

* When translating outside React components, use the `translate` helper from `@anori/translations/utils` (same signature as `t`).

* `src/translations/en.json` (nested under a top-level `translation` key) is the single source of truth. `src/translations/metadata.ts` lists `en` as the only available language, and `src/translations/utils.ts` wires i18next with English resources and `moment.locale("en")`.

* Authoring `en` strings: keep quotation marks straight (`'` and `"`). To reference another UI label inside a string, use i18next nesting `$t(key)` (e.g. `click '$t(next)'`) so it resolves through i18next instead of hardcoding the label.

* To add a new string, add it to `src/translations/en.json`. To change a string, edit it directly in `en.json`. There is no incremental-translation step.
