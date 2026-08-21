import { memo, useMemo } from "react";
import { css } from "styled-system/css";

type DashboardHeaderProps = {
  folderName: string;
  isHome: boolean;
};

const header = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  paddingBlock: "4",
  paddingInline: "0",
  flexShrink: 0,
  userSelect: "none",
});

const greeting = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "text.primary",
  letterSpacing: "tight",
  lineHeight: "1.2",
});

const subtitle = css({
  fontSize: "sm",
  color: "text.subtle",
  letterSpacing: "tight",
  lineHeight: "1.4",
});

const greetings = ["Good morning", "Good afternoon", "Good evening"] as const;

export const DashboardHeader = memo(function DashboardHeader({ folderName, isHome }: DashboardHeaderProps) {
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return greetings[0];
    if (hour < 18) return greetings[1];
    return greetings[2];
  }, []);

  return (
    <div className={header}>
      <h2 className={greeting}>{isHome ? greetingText : folderName}</h2>
      <p className={subtitle}>{isHome ? "Your workspace" : "Bookmarks"}</p>
    </div>
  );
});
