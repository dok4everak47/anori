import { Button } from "@anori/design-system/components/Button/Button";
import { Field } from "@anori/design-system/components/Field/Field";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Icon } from "@anori/design-system/components/Icon/Icon";
import { IconButton } from "@anori/design-system/components/IconButton/IconButton";
import { Input } from "@anori/design-system/components/Input/Input";
import { Link } from "@anori/design-system/components/Link/Link";
import { Modal } from "@anori/design-system/components/Modal/Modal";
import { useSizeSettings } from "@anori/utils/compact";
import { useParentFolder } from "@anori/utils/FolderContentContext";
import { useLinkNavigationState } from "@anori/utils/hooks";
import { guid, normalizeUrl, parseHost } from "@anori/utils/misc";
import type { CorrectPermission } from "@anori/utils/permissions";
import type { WidgetRenderProps } from "@anori/utils/plugins/define";
import { useWidgetMetadata } from "@anori/utils/plugins/widget";
import type { PinnedSite } from "@anori/utils/storage";
import type { EmptyObject } from "@anori/utils/types";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { css, cva, cx } from "styled-system/css";
import browser from "webextension-polyfill";
import { useTopSitesStore } from "../storage";

const widget = cva({
  base: { display: "grid", gap: "2", flexGrow: 1, alignSelf: "stretch" },
  variants: {
    type: {
      horizontal: { gridTemplateColumns: "repeat(6, 1fr)" },
      vertical: { gridTemplateRows: "repeat(6, 1fr)", gridAutoFlow: "column" },
    },
  },
});
const linkPlateBase = css({
  textDecoration: "none",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  alignItems: "center",
  justifyContent: "center",
  padding: "2",
  borderRadius: "md",
  transition: "0.1s ease-in-out",
  width: 0,
  minWidth: "100%",
  position: "relative",
  "& .plate-control": { opacity: 0, pointerEvents: "none" },
  "@media (any-hover: hover)": {
    "&:hover": { background: "ghost.hover", "& .plate-control": { opacity: 1, pointerEvents: "auto" } },
  },
});
const linkPlateEditing = css({ "& .plate-control": { opacity: 1, pointerEvents: "auto" } });
const addPlate = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2",
  borderRadius: "md",
  width: 0,
  minWidth: "100%",
  minHeight: 0,
  color: "text.subtle",
  cursor: "pointer",
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "control",
  transition: "0.1s ease-in-out",
  bg: "transparent",
  appearance: "none",
  font: "inherit",
  "@media (any-hover: hover)": { "&:hover": { color: "accent", borderColor: "accent", background: "ghost.hover" } },
});
const plateIcon = css({ margin: "2", width: "1.75rem" });
const loadingIcon = css({ margin: "2", width: "1.75rem", animation: "spin 1.5s ease-in-out infinite" });

const plateControlBase = css({
  position: "absolute",
  zIndex: 1,
  transition: "opacity 0.1s ease-in-out",
});
const removeControl = css({ top: 0, right: 0 });
const editControl = css({ top: 0, left: 0 });
const moveLeftControl = css({ bottom: 0, left: 0 });
const moveRightControl = css({ bottom: 0, right: 0 });

const pinBadge = css({
  position: "absolute",
  bottom: 0,
  right: 0,
  zIndex: 1,
  display: "flex",
  padding: "1",
  borderRadius: "md",
  color: "accent",
  bg: "frosted",
  pointerEvents: "none",
});
const siteTitle = cva({
  base: {
    lineHeight: "1.25rem",
    textOverflow: "ellipsis",
    overflow: "hidden",
    alignSelf: "stretch",
    fontSize: "sm",
    textAlign: "center",
  },
  variants: { vertical: { true: { height: "1.25rem", whiteSpace: "nowrap" }, false: { height: "2.5rem" } } },
});

const modalForm = css({ display: "flex", flexDirection: "column", gap: "4", minWidth: "18rem" });

const REQUIRED_PERMISSIONS: CorrectPermission[] = X_BROWSER === "firefox" ? ["topSites"] : ["topSites", "favicon"];

const getFaviconUrl = (url: string, firefoxFavicon?: string): string => {
  if (X_BROWSER === "firefox") {
    return firefoxFavicon || browser.runtime.getURL("/assets/images/icon48.png");
  }
  const resUrl = new URL(browser.runtime.getURL("/_favicon/"));
  resUrl.searchParams.set("pageUrl", url);
  resUrl.searchParams.set("size", "32");
  return resUrl.toString();
};

const getDisplayTitle = (rawTitle: string | undefined, url: string): string => {
  if (rawTitle && rawTitle.trim().length > 0) return rawTitle;
  return parseHost(url);
};

type DisplaySite = {
  key: string;
  pinnedId?: string;
  href: string;
  favicon: string;
  title: string;
  pinned: boolean;
};

const stopAnd = (handler: () => void) => (e: { preventDefault: () => void; stopPropagation: () => void }) => {
  e.preventDefault();
  e.stopPropagation();
  handler();
};

const LinkPlate = ({
  site,
  vertical,
  isEditing,
  canMoveLeft,
  canMoveRight,
  onRemove,
  onEdit,
  onMoveLeft,
  onMoveRight,
}: {
  site: DisplaySite;
  vertical: boolean;
  isEditing: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRemove: () => void;
  onEdit: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) => {
  const { onLinkClick, isNavigating } = useLinkNavigationState();
  const { t } = useTranslation();

  return (
    <Link
      className={cx(linkPlateBase, isEditing && linkPlateEditing)}
      href={site.href}
      onClick={(e) => {
        onLinkClick(e);
      }}
    >
      {isNavigating && <Icon className={loadingIcon} icon={builtinIcons.spinner} width={32} height={32} />}
      {!isNavigating && <img className={plateIcon} src={site.favicon} alt="" aria-hidden />}
      <div className={siteTitle({ vertical })}>{site.title}</div>
      {site.pinned && !isEditing && (
        <span className={pinBadge} aria-hidden>
          <Icon icon={builtinIcons.bookmark} width={10} height={10} />
        </span>
      )}
      {isEditing && (
        <>
          {site.pinned && (
            <IconButton
              variant="secondary"
              size="compact"
              className={cx(plateControlBase, editControl, "plate-control")}
              icon={builtinIcons.pencil}
              label={t("top-sites-plugin.editSite")}
              onClick={stopAnd(onEdit)}
            />
          )}
          <IconButton
            variant="secondary"
            size="compact"
            className={cx(plateControlBase, removeControl, "plate-control")}
            icon={builtinIcons.close}
            label={site.pinned ? t("top-sites-plugin.removePinnedSite") : t("top-sites-plugin.removeSite")}
            onClick={stopAnd(onRemove)}
          />
          {site.pinned && canMoveLeft && (
            <IconButton
              variant="secondary"
              size="compact"
              className={cx(plateControlBase, moveLeftControl, "plate-control")}
              icon={vertical ? builtinIcons.chevronUp : builtinIcons.chevronBack}
              label={vertical ? t("top-sites-plugin.moveUp") : t("top-sites-plugin.moveLeft")}
              onClick={stopAnd(onMoveLeft)}
            />
          )}
          {site.pinned && canMoveRight && (
            <IconButton
              variant="secondary"
              size="compact"
              className={cx(plateControlBase, moveRightControl, "plate-control")}
              icon={vertical ? builtinIcons.chevronDown : builtinIcons.chevronForward}
              label={vertical ? t("top-sites-plugin.moveDown") : t("top-sites-plugin.moveRight")}
              onClick={stopAnd(onMoveRight)}
            />
          )}
        </>
      )}
    </Link>
  );
};

type SiteEditorState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; site: PinnedSite };

const SiteEditorModal = ({
  state,
  onClose,
  onSave,
}: {
  state: SiteEditorState;
  onClose: () => void;
  onSave: (url: string, title: string | undefined, iconUrl: string | undefined) => void;
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [iconUrl, setIconUrl] = useState("");

  useEffect(() => {
    if (state.mode === "add") {
      setUrl("");
      setTitle("");
      setIconUrl("");
    } else if (state.mode === "edit") {
      setUrl(state.site.url);
      setTitle(state.site.title ?? "");
      setIconUrl(state.site.iconUrl ?? "");
    }
  }, [state]);

  if (state.mode === "closed") return null;

  const trimmedUrl = url.trim();
  let normalizedUrl = "";
  try {
    normalizedUrl = normalizeUrl(trimmedUrl);
    new URL(normalizedUrl);
  } catch {
    normalizedUrl = "";
  }
  const canSave = normalizedUrl.length > 0;

  const handleSave = () => {
    if (!normalizedUrl) return;
    const finalTitle = title.trim().length > 0 ? title.trim() : undefined;
    const finalIconUrl = iconUrl.trim().length > 0 ? iconUrl.trim() : undefined;
    onSave(normalizedUrl, finalTitle, finalIconUrl);
    onClose();
  };

  const isEdit = state.mode === "edit";

  return (
    <Modal
      title={t(isEdit ? "top-sites-plugin.editSiteTitle" : "top-sites-plugin.addSiteTitle")}
      closable
      closeOnClickOutside
      onClose={onClose}
    >
      <div className={modalForm}>
        <Field label={t("top-sites-plugin.addSiteUrlLabel")}>
          <Input
            autoFocus
            value={url}
            onValueChange={setUrl}
            placeholder="example.com"
            inputMode="url"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />
        </Field>
        <Field label={t("top-sites-plugin.addSiteTitleLabel")}>
          <Input
            value={title}
            onValueChange={setTitle}
            placeholder={t("top-sites-plugin.addSiteTitlePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />
        </Field>
        <Field label={t("top-sites-plugin.addSiteIconUrlLabel")}>
          <Input
            value={iconUrl}
            onValueChange={setIconUrl}
            placeholder={t("top-sites-plugin.addSiteIconUrlPlaceholder")}
            inputMode="url"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />
        </Field>
        <Button onClick={handleSave} disabled={!canSave}>
          {t(isEdit ? "top-sites-plugin.editSiteConfirm" : "top-sites-plugin.addSiteConfirm")}
        </Button>
      </div>
    </Modal>
  );
};

export const TopSitesWidget = memo(function TopSitesWidget({
  type,
}: WidgetRenderProps<EmptyObject> & { type: "horizontal" | "vertical" }) {
  const store = useTopSitesStore();
  const [blacklist, setBlacklist] = store.useValue("blacklist", []);
  const [pinned, setPinned] = store.useValue("pinned", []);
  const { t } = useTranslation();

  const [sites, setSites] = useState<browser.TopSites.MostVisitedURL[]>([]);
  const [editor, setEditor] = useState<SiteEditorState>({ mode: "closed" });
  const { isEditing } = useParentFolder();
  const {
    size: { height, width },
  } = useWidgetMetadata();
  const resizableDimension = type === "horizontal" ? height : width;
  const slots = resizableDimension === 1 ? 6 : 12;

  useEffect(() => {
    const load = async () => {
      let data: browser.TopSites.MostVisitedURL[] = [];
      if (X_BROWSER === "firefox") {
        data = await browser.topSites.get({ includeFavicon: true, limit: 100 });
      } else {
        data = await browser.topSites.get();
      }

      setSites(data.filter((s) => !blacklist.includes(s.url)));
    };

    load();
    const tid = setInterval(() => load(), 1000 * 60 * 5);
    return () => clearInterval(tid);
  }, [blacklist]);

  const displaySites = useMemo<DisplaySite[]>(() => {
    const pinnedItems: DisplaySite[] = pinned.map((p) => ({
      key: `pinned-${p.id}`,
      pinnedId: p.id,
      href: p.url,
      favicon: p.iconUrl && p.iconUrl.length > 0 ? p.iconUrl : getFaviconUrl(p.url),
      title: getDisplayTitle(p.title, p.url),
      pinned: true,
    }));

    const pinnedUrls = new Set(pinned.map((p) => p.url));
    const remaining = Math.max(0, slots - 1 - pinnedItems.length);
    const autoItems: DisplaySite[] = sites
      .filter((s) => !blacklist.includes(s.url) && !pinnedUrls.has(s.url))
      .slice(0, remaining)
      .map((s) => ({
        key: s.url,
        href: s.url,
        favicon: getFaviconUrl(s.url, s.favicon),
        title: !s.title || s.title.includes("://") ? parseHost(s.url) : s.title,
        pinned: false,
      }));

    return [...pinnedItems, ...autoItems];
  }, [pinned, sites, blacklist, slots]);

  const hideBrowserSite = (url: string) => {
    setBlacklist((b) => (b.includes(url) ? b : [...b, url]));
  };

  const removePinnedSite = (id: string) => {
    setPinned((p) => p.filter((s) => s.id !== id));
  };

  const addPinnedSite = (url: string, title: string | undefined, iconUrl: string | undefined) => {
    setPinned((p) => {
      if (p.some((s) => s.url === url)) return p;
      const newSite: PinnedSite = { id: guid(), url, title, iconUrl };
      return [...p, newSite];
    });
  };

  const updatePinnedSite = (id: string, url: string, title: string | undefined, iconUrl: string | undefined) => {
    setPinned((p) => p.map((s) => (s.id === id ? { ...s, url, title, iconUrl } : s)));
  };

  const handleEditorSave = (url: string, title: string | undefined, iconUrl: string | undefined) => {
    if (editor.mode === "add") {
      addPinnedSite(url, title, iconUrl);
    } else if (editor.mode === "edit") {
      updatePinnedSite(editor.site.id, url, title, iconUrl);
    }
  };

  const movePinned = (id: string, direction: -1 | 1) => {
    setPinned((p) => {
      const idx = p.findIndex((s) => s.id === id);
      if (idx === -1) return p;
      const target = idx + direction;
      if (target < 0 || target >= p.length) return p;
      const next = [...p];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const pinnedCount = pinned.length;

  const vertical = type === "vertical";

  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, alignSelf: "stretch" }}>
      <div className={widget({ type })}>
        {displaySites.map((site, index) => (
          <LinkPlate
            key={site.key}
            site={site}
            vertical={vertical}
            isEditing={isEditing}
            canMoveLeft={site.pinned && index > 0}
            canMoveRight={site.pinned && index < pinnedCount - 1}
            onRemove={() =>
              site.pinned && site.pinnedId ? removePinnedSite(site.pinnedId) : hideBrowserSite(site.href)
            }
            onEdit={() => {
              if (!site.pinnedId) return;
              const match = pinned.find((p) => p.id === site.pinnedId);
              if (match) setEditor({ mode: "edit", site: match });
            }}
            onMoveLeft={() => site.pinnedId && movePinned(site.pinnedId, -1)}
            onMoveRight={() => site.pinnedId && movePinned(site.pinnedId, 1)}
          />
        ))}
        <button
          type="button"
          className={addPlate}
          onClick={() => setEditor({ mode: "add" })}
          title={t("top-sites-plugin.addSite")}
          aria-label={t("top-sites-plugin.addSite")}
        >
          <Icon icon={builtinIcons.add} width={20} height={20} />
        </button>
      </div>
      <SiteEditorModal state={editor} onClose={() => setEditor({ mode: "closed" })} onSave={handleEditorSave} />
    </div>
  );
});

export const TopSitesWidgetMock = ({ type }: { type: "horizontal" | "vertical" }) => {
  const { rem } = useSizeSettings();
  return (
    <div className={widget({ type })}>
      <a className={linkPlateBase} href="http://example.com">
        <Icon icon={builtinIcons.logos.facebook} height={rem(2)} width={rem(2)} />
        <div className={siteTitle({ vertical: type === "vertical" })}>Facebook</div>
      </a>
      <a className={linkPlateBase} href="http://example.com">
        <Icon icon={builtinIcons.logos.twitter} height={rem(2)} width={rem(2)} />
        <div className={siteTitle({ vertical: type === "vertical" })}>Twitter</div>
      </a>
      <a className={linkPlateBase} href="http://example.com">
        <Icon icon={builtinIcons.logos.jira} height={rem(2)} width={rem(2)} />
        <div className={siteTitle({ vertical: type === "vertical" })}>Jira</div>
      </a>
      <a className={linkPlateBase} href="http://example.com">
        <Icon icon={builtinIcons.logos.github} height={rem(2)} width={rem(2)} />
        <div className={siteTitle({ vertical: type === "vertical" })}>GitHub</div>
      </a>
      <a className={linkPlateBase} href="http://example.com">
        <Icon icon={builtinIcons.logos.whatsapp} height={rem(2)} width={rem(2)} />
        <div className={siteTitle({ vertical: type === "vertical" })}>Whatsapp</div>
      </a>
      <a className={linkPlateBase} href="http://example.com">
        <Icon icon={builtinIcons.logos.notion} height={rem(2)} width={rem(2)} />
        <div className={siteTitle({ vertical: type === "vertical" })}>Notion</div>
      </a>
    </div>
  );
};

export { REQUIRED_PERMISSIONS };
