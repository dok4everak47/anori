import { memo, type ReactNode } from "react";
import { css } from "styled-system/css";

type AppShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

const appShellLayout = css({
  display: "flex",
  flex: 1,
  overflow: "hidden",
  position: "relative",
});

const mainArea = css({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  position: "relative",
  zIndex: 0,
  overflow: "hidden",
  background:
    "radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in srgb, var(--ds-accent) 2%, transparent) 0%, transparent 60%)",
});

export const AppShell = memo(function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className={appShellLayout}>
      {sidebar}
      <div className={mainArea}>{children}</div>
    </div>
  );
});
