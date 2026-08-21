import { Button } from "@anori/design-system/components/Button/Button";
import { Heading } from "@anori/design-system/components/Heading/Heading";
import { trackEvent } from "@anori/utils/analytics";
import { downloadBlob, showOpenFilePicker } from "@anori/utils/files";
import { createBackupZip, restoreBackupFromZip } from "@anori/utils/storage/backup";
import { useStorage } from "@anori/utils/storage-lib";
import moment from "moment-timezone";
import { m } from "motion/react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";

const screen = css({ display: "flex", flexDirection: "column", gap: "3" });
const buttons = css({ display: "flex", justifyContent: "space-around", marginTop: "2" });

export const ImportExportScreen = (props: ComponentProps<typeof m.div>) => {
  const { t } = useTranslation();
  const storage = useStorage();
  const exportSettings = async () => {
    const zipBlob = await createBackupZip(storage);
    const datetime = moment().format("yyyy-MM-DD_HH-mm");
    downloadBlob(`anori-backup-${datetime}.zip`, zipBlob);
    trackEvent("Configuration exported");
  };

  const importSettings = async () => {
    const files = await showOpenFilePicker(false, ".zip");
    const file = files[0];
    if (!file) return;

    try {
      await restoreBackupFromZip(storage, file);
      trackEvent("Configuration imported");
      window.location.reload();
    } catch (err) {
      console.error("Error while importing backup", err);
      alert(t("settings.importExport.importError", { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <m.div {...props} className={screen}>
      <Heading level={2} size={1}>
        {t("settings.importExport.title")}
      </Heading>
      <div>{t("settings.importExport.info")}</div>
      <div className={buttons}>
        <Button variant="secondary" onClick={importSettings}>
          {t("settings.importExport.import")}
        </Button>
        <Button variant="secondary" onClick={exportSettings}>
          {t("settings.importExport.export")}
        </Button>
      </div>
    </m.div>
  );
};
