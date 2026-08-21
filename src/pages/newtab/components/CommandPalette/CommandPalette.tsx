import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Icon } from "@anori/design-system/components/Icon/Icon";
import type { Command, CommandContext } from "@anori/utils/commands/types";
import { useHotkeys } from "@anori/utils/hooks";
import { useRegisterOverlayLayer } from "@anori/utils/overlay-layers";
import { AnimatePresence, m } from "motion/react";
import { type KeyboardEventHandler, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { css, cva } from "styled-system/css";

type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  onCommand: (command: Command) => Promise<void> | void;
  context?: CommandContext;
  onAskAI?: (prompt: string) => void;
};

const backdrop = css({
  position: "fixed",
  inset: 0,
  zIndex: "modal",
  display: "flex",
  justifyContent: "center",
  paddingTop: "15vh",
});

const panel = css({
  width: "min(640px, 90dvw)",
  display: "flex",
  flexDirection: "column",
  background: "glass.floating",
  backdropFilter: "blur(24px) saturate(180%)",
  border: "1px solid",
  borderColor: "glass-border-strong",
  borderRadius: "xl",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.2)",
  overflow: "hidden",
  maxHeight: "min(480px, 60dvh)",
});

const inputWrapper = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  padding: "4",
  borderBottom: "1px solid",
  borderColor: "glass-border",
});

const input = css({
  flex: 1,
  border: "none",
  background: "transparent",
  color: "text.primary",
  fontSize: "base",
  fontFamily: "inherit",
  outline: "none",
  letterSpacing: "tight",
  _placeholder: {
    color: "text.placeholder",
  },
});

const resultsList = css({
  flex: 1,
  overflowY: "auto",
  padding: "2",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const resultItem = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "3",
    padding: "2.5",
    borderRadius: "md",
    cursor: "pointer",
    userSelect: "none",
    scrollMarginBlock: "1",
    transition: "background 0.1s ease-in-out",
    _hover: {
      background: "surface-hover",
    },
    _active: {
      background: "surface-active",
    },
  },
  variants: {
    selected: {
      true: {
        background: "selected",
        _hover: {
          background: "selected",
        },
        _active: {
          background: "selected",
        },
      },
    },
    executing: {
      true: {
        opacity: 0.6,
        pointerEvents: "none",
      },
    },
  },
});

const resultIcon = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "8",
  height: "8",
  borderRadius: "md",
  flexShrink: 0,
  color: "text.subtle",
  _nestedSvgIcon: { width: "18px", height: "18px" },
});

const resultText = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  minWidth: 0,
});

const resultTitle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "text.primary",
  letterSpacing: "tight",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const resultDescription = css({
  fontSize: "2xs",
  color: "text.subtle",
  letterSpacing: "tight",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const categoryBadge = css({
  fontSize: "2xs",
  fontWeight: "medium",
  color: "text.placeholder",
  padding: "0.5",
  borderRadius: "sm",
  border: "1px solid",
  borderColor: "glass-border",
  flexShrink: 0,
  textTransform: "capitalize",
  letterSpacing: "tight",
});

const footer = css({
  display: "flex",
  alignItems: "center",
  gap: "4",
  padding: "2.5",
  borderTop: "1px solid",
  borderColor: "glass-border",
  fontSize: "2xs",
  color: "text.placeholder",
});

const footerHint = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const footerKbd = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "4",
  height: "4",
  padding: "0.5",
  borderRadius: "xs",
  fontSize: "2xs",
  fontWeight: "medium",
  color: "text.subtle",
  fontFamily: "inherit",
  letterSpacing: "tight",
});

const emptyState = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "8",
  gap: "2",
  color: "text.placeholder",
  fontSize: "sm",
});

const errorState = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "2.5",
  margin: "2",
  borderRadius: "md",
  fontSize: "xs",
  color: "text.primary",
  background: "surface-active",
  border: "1px solid",
  borderColor: "glass-border",
});

export const CommandPalette = memo(function CommandPalette({
  isOpen,
  onClose,
  commands,
  onCommand,
  context = {},
  onAskAI,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const filteredCommands = useMemo(() => {
    const applicable = commands.filter((cmd) => {
      if (cmd.when) {
        try {
          return cmd.when(context);
        } catch {
          return false;
        }
      }
      return true;
    });
    if (!query.trim()) return applicable;
    const q = query.toLowerCase().trim();
    return applicable.filter((cmd) => {
      return (
        cmd.title.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.keywords?.some((kw) => kw.toLowerCase().includes(q))
      );
    });
  }, [commands, query, context]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setExecutingId(null);
      setLastError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    const selected = listRef.current?.querySelector("[data-selected=true]");
    selected?.scrollIntoView({ block: "nearest" });
  }, []);

  const executeSelected = useCallback(async () => {
    const cmd = filteredCommands[selectedIndex];
    if (!cmd || executingId) return;

    setExecutingId(cmd.id);
    setLastError(null);

    try {
      await onCommand(cmd);
      onClose();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setExecutingId(null);
    }
  }, [filteredCommands, selectedIndex, onCommand, onClose, executingId]);

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (e) => {
      switch (e.key) {
        case "ArrowDown":
          if (executingId) return;
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case "ArrowUp":
          if (executingId) return;
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands.length === 0 && query.trim() && onAskAI) {
            onAskAI(query.trim());
            onClose();
            return;
          }
          void executeSelected();
          break;
      }
    },
    [filteredCommands.length, executeSelected, executingId, query, onAskAI, onClose],
  );

  useRegisterOverlayLayer(isOpen);

  useHotkeys("esc", onClose, { enabled: isOpen && !executingId, preventDefault: true });

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
          className={backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !executingId) onClose();
          }}
          role="dialog"
          aria-label={t("commandPalette.title")}
        >
          <m.div
            className={panel}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className={inputWrapper}>
              <Icon icon={builtinIcons.compass} width={16} height={16} />
              <input
                ref={inputRef}
                className={input}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("commandPalette.placeholder")}
                aria-label={t("commandPalette.placeholder")}
                disabled={!!executingId}
              />
            </div>

            {lastError && (
              <div className={errorState}>
                <Icon icon={builtinIcons.warning} width={14} height={14} />
                <span>{lastError}</span>
              </div>
            )}

            <div className={resultsList} ref={listRef} role="listbox">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((cmd, index) => (
                  <button
                    key={cmd.id}
                    type="button"
                    className={resultItem({ selected: index === selectedIndex, executing: executingId === cmd.id })}
                    data-selected={index === selectedIndex}
                    onClick={() => {
                      if (executingId) return;
                      onCommand(cmd);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    role="option"
                    aria-selected={index === selectedIndex}
                  >
                    <div className={resultIcon}>
                      <Icon icon={cmd.icon ?? builtinIcons.key} width={16} height={16} />
                    </div>
                    <div className={resultText}>
                      <div className={resultTitle}>{cmd.title}</div>
                      {cmd.description && <div className={resultDescription}>{cmd.description}</div>}
                    </div>
                    <div className={categoryBadge}>{cmd.category}</div>
                  </button>
                ))
              ) : (
                <div className={emptyState}>
                  <Icon icon={builtinIcons.compass} width={20} height={20} />
                  <span>{t("commandPalette.noResults")}</span>
                  {query.trim() && onAskAI && (
                    <button
                      type="button"
                      className={css({
                        marginTop: "2",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2",
                        padding: "2",
                        paddingInline: "3",
                        borderRadius: "md",
                        border: "1px solid",
                        borderColor: "glass-border",
                        background: "surface",
                        color: "text.primary",
                        fontSize: "xs",
                        fontFamily: "inherit",
                        cursor: "pointer",
                        _hover: { background: "surface-hover" },
                      })}
                      onClick={() => {
                        onAskAI(query.trim());
                        onClose();
                      }}
                    >
                      <Icon icon={builtinIcons.compass} width={14} height={14} />
                      {t("commandPalette.askAi")}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={footer}>
              <div className={footerHint}>
                <span className={footerKbd}>↑↓</span>
                <span>{t("commandPalette.navigate")}</span>
              </div>
              <div className={footerHint}>
                <span className={footerKbd}>↵</span>
                <span>{t("commandPalette.open")}</span>
              </div>
              <div className={footerHint}>
                <span className={footerKbd}>Esc</span>
                <span>{t("commandPalette.close")}</span>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
});
