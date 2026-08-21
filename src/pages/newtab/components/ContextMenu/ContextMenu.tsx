import { type KeyboardEventHandler, memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { css, cva } from "styled-system/css";

export type ContextMenuAction = {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  hidden?: boolean;
  action: () => void;
};

type ContextMenuProps = {
  actions: ContextMenuAction[];
  position: { x: number; y: number };
  onClose: () => void;
};

const menu = css({
  position: "fixed",
  zIndex: "modal",
  minWidth: "180px",
  padding: "1.5",
  background: "glass.floating",
  backdropFilter: "blur(24px) saturate(180%)",
  border: "1px solid var(--ds-glass-border)",
  borderRadius: "lg",
  boxShadow: "0 8px 24px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)",
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
});

const menuItem = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2.5",
    padding: "2",
    borderRadius: "md",
    cursor: "pointer",
    userSelect: "none",
    fontSize: "sm",
    color: "text.primary",
    letterSpacing: "tight",
    border: "none",
    background: "none",
    fontFamily: "inherit",
    textAlign: "left",
    width: "100%",
    transition: "background 0.1s ease-in-out",
    _hover: {
      background: "surface-hover",
    },
    _focusVisible: {
      outline: "2px solid var(--ds-focus-ring)",
      outlineOffset: "-2px",
    },
  },
  variants: {
    disabled: {
      true: {
        color: "text.disabled",
        cursor: "default",
        _hover: { background: "none" },
      },
    },
    selected: {
      true: {
        background: "selected",
        _hover: { background: "selected" },
      },
    },
  },
});

const menuDivider = css({
  height: "1px",
  background: "divider",
  marginInline: "0.5",
  marginBlock: "0.5",
});

const menuShortcut = css({
  marginLeft: "auto",
  fontSize: "2xs",
  color: "text.placeholder",
  letterSpacing: "tight",
});

export const ContextMenu = memo(function ContextMenu({ actions, position, onClose }: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const visibleActions = actions.filter((a) => !a.hidden);
  const adjustedPosition = useAdjustedPosition(position, menuRef);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (e) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, visibleActions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const action = visibleActions[selectedIndex];
          if (action && !action.disabled) {
            action.action();
            onClose();
          }
          break;
        }
      }
    },
    [visibleActions, selectedIndex, onClose],
  );

  return createPortal(
    <div
      ref={menuRef}
      className={menu}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onKeyDown={handleKeyDown}
      role="menu"
      aria-label={t("contextMenu")}
      tabIndex={-1}
    >
      {visibleActions.map((action, index) => {
        if (action.divider) {
          return <div key={action.id} className={menuDivider} />;
        }
        return (
          <button
            type="button"
            key={action.id}
            className={menuItem({ disabled: action.disabled, selected: index === selectedIndex })}
            onClick={() => {
              if (!action.disabled) {
                action.action();
                onClose();
              }
            }}
            onMouseEnter={() => setSelectedIndex(index)}
            disabled={action.disabled}
            role="menuitem"
            data-selected={index === selectedIndex}
          >
            <span>{action.label}</span>
            {action.shortcut && <span className={menuShortcut}>{action.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
});

function useAdjustedPosition(
  position: { x: number; y: number },
  ref: React.RefObject<HTMLDivElement | null>,
): { x: number; y: number } {
  const [adjusted, setAdjusted] = useState(position);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setAdjusted(position);
      return;
    }
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = position.x;
    let y = position.y;

    if (x + rect.width > vw) {
      x = vw - rect.width - 8;
    }
    if (y + rect.height > vh) {
      y = vh - rect.height - 8;
    }

    setAdjusted({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [position, ref]);

  return adjusted;
}
