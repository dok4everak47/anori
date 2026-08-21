export const injectStyles = (styles: string[], into?: HTMLElement) => {
  if (!into) into = document.head;
  const combined = styles.join("\n");
  const styleTag = document.createElement("style");
  styleTag.append(document.createTextNode(combined));
  into.append(styleTag);
};

export const setPageTitle = (title: string) => {
  document.title = title;
};

let pendingBackground: string | null = null;

const BACKGROUND_LOADED_EVENT = "anori:background-loaded";

export type BackgroundInfo = { width: number; height: number };

export const getBackgroundInfo = (): BackgroundInfo | null => window.__anoriBackgroundInfo ?? null;

export const onBackgroundLoaded = (listener: (info: BackgroundInfo) => void): VoidFunction => {
  const handler = (event: Event) => listener((event as CustomEvent<BackgroundInfo>).detail);
  window.addEventListener(BACKGROUND_LOADED_EVENT, handler);
  return () => window.removeEventListener(BACKGROUND_LOADED_EVENT, handler);
};

export const setPageBackground = (bg: string, revokePrevious?: string | null) => {
  pendingBackground = bg;
  const img = new Image();
  img.onload = () => {
    if (pendingBackground !== bg) return;
    document.documentElement.style.setProperty("--background-image", `url('${bg}')`);
    const info: BackgroundInfo = { width: img.naturalWidth, height: img.naturalHeight };
    window.__anoriBackgroundInfo = info;
    window.dispatchEvent(new CustomEvent(BACKGROUND_LOADED_EVENT, { detail: info }));
    if (revokePrevious) URL.revokeObjectURL(revokePrevious);
  };
  img.src = bg;
};
