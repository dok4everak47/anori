import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Icon } from "@anori/design-system/components/Icon/Icon";
import { useSizeSettings } from "@anori/utils/compact";
import { useLinkNavigationState } from "@anori/utils/hooks";
import { normalizeUrl } from "@anori/utils/misc";
import type { WidgetRenderProps } from "@anori/utils/plugins/define";
import { isMacLike } from "@anori/utils/shortcuts";
import type { MouseEventHandler } from "react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { sendMessage } from "../messaging";
import type { BookmarkGroupWidgetConfig } from "../types";
import { bookmarkContent, bookmarkH2, bookmarkHost, bookmarkText, loadingIcon, widget } from "./widget-styles";

export const BookmarkGroupWidget = memo(function BookmarkGroupWidget({
  config,
}: WidgetRenderProps<BookmarkGroupWidgetConfig> & { isMock?: boolean }) {
  const { rem } = useSizeSettings();
  const { onLinkClick, isNavigating } = useLinkNavigationState();
  const { t } = useTranslation();

  const openGroup: MouseEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    if (e.type === "auxclick" && e.button !== 1) {
      return;
    }
    onLinkClick(e);
    const shouldKeepCurrentTab = e.ctrlKey || (isMacLike && e.metaKey) || e.type === "auxclick";
    sendMessage("openGroup", {
      urls: config.urls.map((u) => normalizeUrl(u)),
      openInTabGroup: config.openInTabGroup,
      closeCurrentTab: !shouldKeepCurrentTab,
      title: config.title,
    });
  };

  return (
    <button type="button" className={widget} onClick={openGroup} onAuxClick={openGroup}>
      <div className={bookmarkContent({ size: "s" })}>
        <div className={bookmarkText}>
          <span className={bookmarkH2({ size: "s" })}>{config.title}</span>
          <div className={bookmarkHost}>{t("bookmark-plugin.group")}</div>
        </div>
        {isNavigating ? (
          <Icon className={loadingIcon} icon={builtinIcons.spinner} width={rem(1.25)} height={rem(1.25)} />
        ) : (
          <Icon icon={config.icon} width={rem(1.25)} height={rem(1.25)} />
        )}
      </div>
    </button>
  );
});
