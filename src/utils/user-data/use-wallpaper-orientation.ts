import { type BackgroundInfo, getBackgroundInfo, onBackgroundLoaded } from "@anori/utils/page";
import { useEffect, useState } from "react";

export const useWallpaperOrientation = (): BackgroundInfo | null => {
  const [info, setInfo] = useState(() => getBackgroundInfo());

  useEffect(() => {
    const unsub = onBackgroundLoaded(setInfo);
    const current = getBackgroundInfo();
    if (current) {
      setInfo(current);
    }
    return unsub;
  }, []);

  return info;
};
