import { memo } from "react";
import { css } from "styled-system/css";

type TopBarProps = {
  title: string;
  onSearchClick?: () => void;
};

const topBar = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: "12",
  paddingInline: "6",
  paddingBlock: "3",
  flexShrink: 0,
  userSelect: "none",
  position: "relative",
  zIndex: 1,
  background: "glass.base",
  backdropFilter: "blur(12px)",
  borderBottom: "1px solid var(--ds-glass-border)",
});

const title = css({
  fontSize: "base",
  fontWeight: "semibold",
  color: "text.primary",
  letterSpacing: "tight",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const searchTrigger = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "1.5",
  borderRadius: "md",
  color: "text.subtle",
  fontSize: "xs",
  cursor: "pointer",
  border: "none",
  background: "none",
  fontFamily: "inherit",
  transition: "background 0.1s ease-in-out, color 0.1s ease-in-out",
  _hover: {
    color: "text.primary",
    background: "surface-hover",
  },
  _active: {
    background: "surface-active",
  },
  _focusVisible: {
    outline: "2px solid var(--ds-focus-ring)",
    outlineOffset: "2px",
  },
});

const kbd = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "5",
  height: "5",
  padding: "0.5",
  borderRadius: "sm",
  fontSize: "2xs",
  fontWeight: "medium",
  color: "text.subtle",
  fontFamily: "inherit",
  letterSpacing: "tight",
});

export const TopBar = memo(function TopBar({ title: pageTitle, onSearchClick }: TopBarProps) {
  return (
    <div className={topBar}>
      <h1 className={title}>{pageTitle}</h1>
      <button type="button" className={searchTrigger} aria-label="Search" onClick={onSearchClick}>
        <span className={kbd}>⌘K</span>
        Search
      </button>
    </div>
  );
});
