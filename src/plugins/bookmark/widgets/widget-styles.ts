import { css, cva } from "styled-system/css";

export const widget = css({
  display: "flex",
  alignItems: "stretch",
  textDecoration: "none",
  flexGrow: 1,
  maxHeight: "100%",
  padding: "3",
  position: "relative",
  cursor: "pointer",
  textAlign: "start",
  borderRadius: "lg",
  transition: "background 0.1s ease-in-out",
  _hover: {
    background: "surface-hover",
  },
  "&:hover .open-in-iframe": { display: "flex" },
});

export const bookmarkContent = cva({
  base: {
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
    flexGrow: 1,
    overflow: "hidden",
    gap: "2.5",
    _nestedSvgIcon: { color: "icon.subtle" },
  },
  variants: {
    size: {
      s: { flexDirection: "row" },
      m: { flexDirection: "row" },
    },
  },
});

export const bookmarkText = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  overflow: "hidden",
  minWidth: 0,
  gap: "0.5",
});

export const bookmarkH2 = cva({
  base: {
    fontSize: "sm",
    fontWeight: "medium",
    color: "text.primary",
    lineHeight: "1.3",
    letterSpacing: "tight",
    margin: 0,
  },
  variants: {
    size: {
      s: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      m: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    },
  },
});

export const bookmarkHost = css({
  fontSize: "2xs",
  color: "text.placeholder",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  overflow: "hidden",
  letterSpacing: "tight",
});

export const loadingIcon = css({ animation: "spin 1.5s ease-in-out infinite" });

export const cornerControls = css({
  position: "absolute",
  top: "0.5rem",
  right: "0.5rem",
  left: "0.5rem",
  userSelect: "none",
  display: "flex",
  flexDirection: "row-reverse",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1",
});

export const statusDot = css({
  width: "0.625rem",
  height: "0.625rem",
  borderRadius: "md",
  border: "0.125rem solid var(--ds-surface)",
});

export const expandButton = css({ display: "none" });

export const expandArea = css({
  justifyContent: "center",
  alignItems: "center !important",
  "& iframe": { flexGrow: 1, alignSelf: "stretch", borderRadius: "lg", background: "white" },
});
