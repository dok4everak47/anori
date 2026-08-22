import { installExtensionReloadWatcher } from "@anori/utils/handle-extension-reload";
import { setPageTitle } from "@anori/utils/page";
import { mountPage } from "@anori/utils/react";
import "../../panda.css";
import "./globals.css";
import { AppDragDropProvider } from "@anori/components/AppDragDropProvider/AppDragDropProvider";
import { BookmarksBar } from "@anori/components/BookmarksBar/BookmarksBar";
import { TooltipProvider } from "@anori/design-system/components/Tooltip/Tooltip";
import { languageDirections } from "@anori/translations/metadata";
import { initTranslation } from "@anori/translations/utils";
import { CompactModeProvider } from "@anori/utils/compact";
import { IS_ANDROID, IS_TOUCH_DEVICE } from "@anori/utils/device";
import { useHotkeys, usePrevious } from "@anori/utils/hooks";
import { OverlayLayersProvider } from "@anori/utils/overlay-layers";
import { watchForPermissionChanges } from "@anori/utils/permissions";
import { anoriSchema, getAnoriStorage } from "@anori/utils/storage";
import { StorageContext, useStorageValue } from "@anori/utils/storage-lib";
import { useFolders } from "@anori/utils/user-data/hooks";
import { watchForThemeUpdates } from "@anori/utils/user-data/theme";
import type { Folder } from "@anori/utils/user-data/types";
import { DirectionProvider } from "@radix-ui/react-direction";
import { AnimatePresence, domMax, LazyMotion, MotionConfig, m } from "motion/react";
import { useCallback, useEffect, useMemo } from "react";
import { css } from "styled-system/css";
import { Workspace } from "./components/Workspace/Workspace";
import { scheduleLazyComponentsPreload } from "./lazy-components";

const startPage = css({ height: "100dvh", width: "100vw", display: "flex", flexDirection: "column" });

const Start = () => {
  const switchToFolderByIndex = (ind: number) => {
    if (ind >= folders.length) return;
    setActiveFolder(folders[ind]);
  };

  const swithFolderUp = () => {
    setActiveFolder(folders[activeFolderIndex === 0 ? folders.length - 1 : activeFolderIndex - 1]);
  };

  const swithFolderDown = () => {
    setActiveFolder(folders[activeFolderIndex === folders.length - 1 ? 0 : activeFolderIndex + 1]);
  };

  const [rememberLastFolder] = useStorageValue(anoriSchema.rememberLastFolder);
  const [lastFolder, setLastFolder] = useStorageValue(anoriSchema.lastFolder);
  const [language] = useStorageValue(anoriSchema.language);
  const dir = useMemo(() => languageDirections[language], [language]);
  const { folders, activeFolder, setActiveFolder } = useFolders({
    includeHome: true,
    defaultFolderId: rememberLastFolder ? lastFolder : undefined,
  });
  const onFolderClick = useCallback(
    (f: Folder) => {
      setActiveFolder(f);
      if (rememberLastFolder) setLastFolder(f.id);
    },
    [setActiveFolder, rememberLastFolder, setLastFolder],
  );
  const activeFolderIndex = folders.findIndex((f) => f.id === activeFolder.id) ?? 0;
  const previousActiveFolderIndex = usePrevious(activeFolderIndex);
  const animationDirection =
    previousActiveFolderIndex === undefined || previousActiveFolderIndex === activeFolderIndex
      ? null
      : activeFolderIndex > previousActiveFolderIndex
        ? "right"
        : "left";

  const [showBookmarksBar] = useStorageValue(anoriSchema.showBookmarksBar);

  useHotkeys("meta+up, alt+up", () => swithFolderUp());
  useHotkeys("meta+left, alt+left", () => swithFolderUp());
  useHotkeys("meta+down, alt+down", () => swithFolderDown());
  useHotkeys("meta+right, alt+right", () => swithFolderDown());

  useHotkeys("alt+1", () => switchToFolderByIndex(0));
  useHotkeys("alt+2", () => switchToFolderByIndex(1));
  useHotkeys("alt+3", () => switchToFolderByIndex(2));
  useHotkeys("alt+4", () => switchToFolderByIndex(3));
  useHotkeys("alt+5", () => switchToFolderByIndex(4));
  useHotkeys("alt+6", () => switchToFolderByIndex(5));
  useHotkeys("alt+7", () => switchToFolderByIndex(6));
  useHotkeys("alt+8", () => switchToFolderByIndex(7));
  useHotkeys("alt+9", () => switchToFolderByIndex(8));

  const [crtEffect] = useStorageValue(anoriSchema.crtEffect);
  useEffect(() => {
    document.documentElement.classList.toggle("crt-effect", crtEffect);
  }, [crtEffect]);

  return (
    <DirectionProvider dir={dir}>
      <MotionConfig transition={{ duration: 0.2, ease: "easeInOut" }}>
        <TooltipProvider delay={200} closeDelay={100} timeout={0}>
          <AppDragDropProvider>
            <AnimatePresence>
              <m.div className={startPage} key="start-page">
                {showBookmarksBar && <BookmarksBar />}
                <Workspace
                  folders={folders}
                  activeFolder={activeFolder}
                  bookmarksBarVisible={showBookmarksBar}
                  animationDirection={animationDirection}
                  onFolderClick={onFolderClick}
                />
              </m.div>
            </AnimatePresence>
          </AppDragDropProvider>
        </TooltipProvider>
      </MotionConfig>
    </DirectionProvider>
  );
};

watchForPermissionChanges();

const waitForBackgroundImage = (timeoutMs = 1000) => {
  const started = performance.now();
  const findBg = () => {
    const bg = document.documentElement.style.getPropertyValue("--background-image");
    const match = /url\(['"]?(.+?)['"]?\)/.exec(bg);
    return match?.[1];
  };
  const preloadReady = window.__anoriThemeReady;
  const waitForUrl = () =>
    new Promise<void>((resolve) => {
      const src = findBg();
      if (!src) {
        const remaining = timeoutMs - (performance.now() - started);
        if (remaining <= 0) return resolve();
        return setTimeout(() => waitForUrl().then(resolve), 16);
      }
      const img = new Image();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      img.onload = finish;
      img.onerror = finish;
      setTimeout(finish, Math.max(0, timeoutMs - (performance.now() - started)));
      img.src = src;
    });
  return (preloadReady ?? Promise.resolve()).then(waitForUrl);
};

installExtensionReloadWatcher();

let releaseEntranceAnimation = () => {};
window.__anoriEntranceReady = new Promise<void>((resolve) => {
  releaseEntranceAnimation = resolve;
});
setTimeout(releaseEntranceAnimation, 1200);

getAnoriStorage().then(async (storage) => {
  // Kick off translation loading immediately (the active language may be a lazily-loaded chunk), then
  // await it just before mount so React never renders raw i18n keys.
  const translationReady = initTranslation();
  const title = storage.get(anoriSchema.newTabTitle);
  setPageTitle(title);

  storage.files.get(anoriSchema.customIcons.all()); // This preloads custom icon blobs into cache

  const showLoadAnimation = storage.get(anoriSchema.showLoadAnimation);
  const crtEffect = storage.get(anoriSchema.crtEffect);
  document.documentElement.classList.toggle("crt-effect", crtEffect);
  const div = document.querySelector(".loading-cover");

  watchForThemeUpdates(storage);

  const removeCover = () => {
    if (!div) return;
    if (!showLoadAnimation) {
      div.remove();
    } else if (!div.classList.contains("active")) {
      div.addEventListener("animationend", () => div.remove());
      div.classList.add("active");
    }
    releaseEntranceAnimation?.();
  };

  waitForBackgroundImage().then(removeCover).catch(releaseEntranceAnimation);

  scheduleLazyComponentsPreload();
  await translationReady;
  mountPage(
    <StorageContext.Provider value={storage}>
      <CompactModeProvider>
        <OverlayLayersProvider>
          {/* strict mode temporary disabled due to https://github.com/framer/motion/issues/2094 */}
          <LazyMotion features={domMax}>
            <Start />
          </LazyMotion>
        </OverlayLayersProvider>
      </CompactModeProvider>
    </StorageContext.Provider>,
  );
});

if (IS_TOUCH_DEVICE) document.body.classList.add("is-touch-device");
if (IS_ANDROID) document.body.classList.add("is-android");

if (X_MODE === "development" && !window.location.pathname.endsWith("start-debug.html")) {
  const debugUrl = window.location.href.replace("start.html", "start-debug.html");
  console.log("Profiler-enabled version of page is available at", debugUrl);
}
