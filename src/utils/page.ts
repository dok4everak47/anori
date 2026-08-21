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

export const setPageBackground = (bg: string, revokePrevious?: string | null) => {
  pendingBackground = bg;
  const img = new Image();
  img.onload = () => {
    if (pendingBackground !== bg) return;
    document.documentElement.style.setProperty("--background-image", `url('${bg}')`);
    if (revokePrevious) URL.revokeObjectURL(revokePrevious);
  };
  img.src = bg;
};
