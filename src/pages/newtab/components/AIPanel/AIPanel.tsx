import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Icon } from "@anori/design-system/components/Icon/Icon";
import { applyActionPlan, runAgent } from "@anori/utils/ai/agent-runtime";
import { getAIConfig } from "@anori/utils/ai/config";
import { httpAIProvider } from "@anori/utils/ai/provider";
import { toolRegistry } from "@anori/utils/ai/tool-registry";
import { registerBookmarkTools } from "@anori/utils/ai/tools/bookmark-tools";
import type {
  ActionPlan,
  AgentStreamEvent,
  AIResult,
  ProposedAction,
  ToolExecutionContext,
} from "@anori/utils/ai/types";
import { useHotkeys } from "@anori/utils/hooks";
import { useRegisterOverlayLayer } from "@anori/utils/overlay-layers";
import { AnimatePresence, m } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { css, cva } from "styled-system/css";

type AIPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  context: ToolExecutionContext;
  onApplied?: () => void;
};

type StatusKind = "thinking" | "reading" | "planning" | "waiting" | "applying" | "done" | "error" | "idle";

type PanelState = {
  status: StatusKind;
  statusLabel: string;
  message: string;
  plan: ActionPlan | null;
  error: string | null;
  finished: boolean;
  appliedSummary: string | null;
};

const INITIAL_STATE: PanelState = {
  status: "idle",
  statusLabel: "",
  message: "",
  plan: null,
  error: null,
  finished: false,
  appliedSummary: null,
};

const backdrop = css({
  position: "fixed",
  inset: 0,
  zIndex: "modal",
  display: "flex",
  justifyContent: "center",
  paddingTop: "12vh",
  paddingInline: "4",
});

const panel = css({
  width: "min(640px, 100dvw)",
  display: "flex",
  flexDirection: "column",
  background: "glass.floating",
  backdropFilter: "blur(24px) saturate(180%)",
  border: "1px solid",
  borderColor: "glass-border-strong",
  borderRadius: "xl",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.2)",
  overflow: "hidden",
  maxHeight: "min(560px, 70dvh)",
});

const header = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  padding: "4",
  borderBottom: "1px solid",
  borderColor: "glass-border",
  color: "accent",
});

const headerTitle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.primary",
  letterSpacing: "tight",
});

const promptText = css({
  fontSize: "sm",
  color: "text.secondary",
  letterSpacing: "tight",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const body = css({
  flex: 1,
  overflowY: "auto",
  padding: "4",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const statusRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "text.subtle",
  letterSpacing: "tight",
});

const spinner = css({
  width: "14px",
  height: "14px",
  animation: "spin 0.8s linear infinite",
});

const messageBubble = css({
  fontSize: "sm",
  color: "text.primary",
  letterSpacing: "tight",
  lineHeight: "relaxed",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const planCard = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderRadius: "lg",
  background: "surface",
  border: "1px solid",
  borderColor: "glass-border",
});

const planSummary = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "text.primary",
  letterSpacing: "tight",
});

const actionList = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const actionItem = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    fontSize: "xs",
    color: "text.secondary",
    letterSpacing: "tight",
    padding: "2",
    borderRadius: "md",
    border: "1px solid",
    borderColor: "transparent",
  },
  variants: {
    destructive: {
      true: {
        color: "text.primary",
        borderColor: "glass-border",
      },
    },
  },
});

const actionDot = cva({
  base: {
    width: "6px",
    height: "6px",
    borderRadius: "full",
    flexShrink: 0,
    background: "accent",
  },
  variants: {
    destructive: {
      true: { background: "text.primary", opacity: 0.7 },
    },
    write: {
      true: { background: "accent" },
    },
  },
});

const errorBox = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
  padding: "3",
  borderRadius: "md",
  fontSize: "xs",
  color: "text.primary",
  background: "surface-active",
  border: "1px solid",
  borderColor: "glass-border",
  letterSpacing: "tight",
});

const footer = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  padding: "3",
  borderTop: "1px solid",
  borderColor: "glass-border",
});

const buttonRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const button = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1.5",
    padding: "2",
    paddingInline: "3",
    borderRadius: "md",
    fontSize: "xs",
    fontWeight: "medium",
    fontFamily: "inherit",
    letterSpacing: "tight",
    cursor: "pointer",
    border: "1px solid",
    transition: "background 0.1s ease-in-out, border-color 0.1s ease-in-out",
  },
  variants: {
    variant: {
      primary: {
        background: "accent",
        color: "white",
        borderColor: "transparent",
        _hover: { filter: "brightness(1.08)" },
        _active: { filter: "brightness(0.95)" },
      },
      ghost: {
        background: "transparent",
        color: "text.secondary",
        borderColor: "glass-border",
        _hover: { background: "surface-hover", color: "text.primary" },
        _active: { background: "surface-active" },
      },
      danger: {
        background: "transparent",
        color: "text.primary",
        borderColor: "glass-border",
        _hover: { background: "surface-hover" },
      },
    },
    disabled: {
      true: { opacity: 0.5, pointerEvents: "none" },
    },
  },
});

const hint = css({
  fontSize: "2xs",
  color: "text.placeholder",
  letterSpacing: "tight",
});

function statusKindOf(status: string): StatusKind {
  if (status === "thinking") return "thinking";
  if (status === "reading") return "reading";
  if (status === "planning") return "planning";
  if (status === "waiting-confirmation") return "waiting";
  if (status === "applying") return "applying";
  if (status === "done") return "done";
  if (status === "error") return "error";
  return "idle";
}

export const AIPanel = memo(function AIPanel({ isOpen, onClose, initialPrompt, context, onApplied }: AIPanelProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PanelState>(INITIAL_STATE);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useRegisterOverlayLayer(isOpen);
  useHotkeys("esc", onClose, { enabled: isOpen, preventDefault: true });

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  const tools = useMemo(() => {
    const registry = toolRegistry;
    if (registry.list().length === 0) {
      registerBookmarkTools(registry);
    }
    return registry.list();
  }, []);

  const handleResult = useCallback((result: AIResult) => {
    if (result.kind === "confirmation") {
      setState((s) => ({ ...s, plan: result.plan, status: "waiting", finished: true, statusLabel: "" }));
    } else if (result.kind === "message") {
      setState((s) => ({ ...s, message: result.text, status: "done", finished: true, statusLabel: "" }));
    } else if (result.kind === "action-plan") {
      setState((s) => ({ ...s, plan: result.plan, status: "waiting", finished: true }));
    } else if (result.kind === "error") {
      setState((s) => ({ ...s, error: result.message, status: "error", finished: true }));
    }
  }, []);

  const handleEvent = useCallback(
    (event: AgentStreamEvent) => {
      switch (event.type) {
        case "status":
          setState((s) => ({ ...s, status: statusKindOf(event.status), statusLabel: event.label }));
          break;
        case "message-delta":
          setState((s) => ({ ...s, message: (s.message + event.text).trim() }));
          break;
        case "plan":
          setState((s) => ({ ...s, plan: event.plan, status: "waiting", statusLabel: "Waiting for confirmation…" }));
          break;
        case "result":
          handleResult(event.result);
          break;
        case "error":
          setState((s) => ({ ...s, error: event.message, status: "error", finished: true }));
          break;
        default:
          break;
      }
    },
    [handleResult],
  );

  const run = useCallback(
    async (userPrompt: string) => {
      setState({ ...INITIAL_STATE, status: "thinking", statusLabel: "Thinking…" });
      const config = await getAIConfig();
      const controller = new AbortController();
      abortRef.current = controller;

      await runAgent({
        request: userPrompt,
        provider: httpAIProvider,
        config: config ?? { baseUrl: "", apiKey: "", model: "" },
        tools,
        context,
        emit: handleEvent,
        signal: controller.signal,
      });
    },
    [tools, context, handleEvent],
  );

  const submitPrompt = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    void run(trimmed);
  }, [prompt, run]);

  useEffect(() => {
    if (isOpen) {
      setPrompt(initialPrompt ?? "");
      setState(INITIAL_STATE);
      if (initialPrompt?.trim()) {
        void run(initialPrompt.trim());
      }
    } else {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPrompt, run]);

  const applyPlan = useCallback(async () => {
    if (!state.plan) return;
    setState((s) => ({ ...s, status: "applying", statusLabel: "Applying changes…", error: null }));
    const { applied, failed } = await applyActionPlan(state.plan, tools, context, handleEvent);
    const summary =
      failed > 0
        ? `Applied ${applied} change${applied === 1 ? "" : "s"}, ${failed} failed.`
        : `Applied ${applied} change${applied === 1 ? "" : "s"}.`;
    setState((s) => ({ ...s, status: "done", appliedSummary: summary, plan: null, finished: true }));
    onApplied?.();
  }, [state.plan, tools, context, handleEvent, onApplied]);

  const cancelPlan = useCallback(() => {
    setState((s) => ({ ...s, plan: null, status: "idle", finished: false, statusLabel: "" }));
  }, []);

  const isWorking = state.status === "thinking" || state.status === "reading" || state.status === "applying";
  const showInput = !state.finished && state.status !== "waiting";

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
            if (e.target === e.currentTarget && !isWorking) onClose();
          }}
          role="dialog"
          aria-label="Anori AI"
        >
          <m.div
            className={panel}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className={header}>
              <Icon icon={builtinIcons.compass} width={18} height={18} />
              <span className={headerTitle}>{t("ai.title")}</span>
            </div>

            <div className={body} ref={bodyRef}>
              {prompt && <div className={promptText}>{prompt}</div>}

              {isWorking && state.statusLabel && (
                <div className={statusRow}>
                  <Icon className={spinner} icon={builtinIcons.refresh} width={14} height={14} />
                  <span>{state.statusLabel}</span>
                </div>
              )}

              {state.message && !state.error && <div className={messageBubble}>{state.message}</div>}

              {state.plan && <PlanView plan={state.plan} />}

              {state.appliedSummary && (
                <div className={statusRow}>
                  <Icon icon={builtinIcons.check} width={14} height={14} />
                  <span>{state.appliedSummary}</span>
                </div>
              )}

              {state.error && (
                <div className={errorBox}>
                  <Icon icon={builtinIcons.warning} width={14} height={14} />
                  <span>{state.error}</span>
                </div>
              )}
            </div>

            <div className={footer}>
              {showInput ? (
                <>
                  <input
                    className={css({
                      flex: 1,
                      border: "none",
                      background: "transparent",
                      color: "text.primary",
                      fontSize: "sm",
                      fontFamily: "inherit",
                      outline: "none",
                      letterSpacing: "tight",
                      _placeholder: { color: "text.placeholder" },
                    })}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitPrompt();
                      }
                    }}
                    placeholder={t("ai.placeholder")}
                  />
                  <button
                    type="button"
                    className={button({ variant: "primary", disabled: !prompt.trim() || isWorking })}
                    onClick={submitPrompt}
                    disabled={!prompt.trim() || isWorking}
                  >
                    {t("ai.send")}
                  </button>
                </>
              ) : state.status === "waiting" && state.plan ? (
                <>
                  <span className={hint}>{t("ai.confirmHint")}</span>
                  <div className={buttonRow}>
                    <button type="button" className={button({ variant: "ghost" })} onClick={cancelPlan}>
                      {t("ai.cancel")}
                    </button>
                    <button type="button" className={button({ variant: "primary" })} onClick={applyPlan}>
                      {t("ai.apply")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className={hint}>{t("ai.closeHint")}</span>
                  <button type="button" className={button({ variant: "ghost" })} onClick={onClose}>
                    {t("ai.close")}
                  </button>
                </>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
});

function PlanView({ plan }: { plan: ActionPlan }) {
  const { t } = useTranslation();
  const destructiveCount = plan.actions.filter((a) => a.permission === "destructive").length;
  return (
    <div className={planCard}>
      <div className={planSummary}>{plan.summary}</div>
      <div className={actionList}>
        {plan.actions.map((action: ProposedAction) => (
          <div key={action.id} className={actionItem({ destructive: action.permission === "destructive" })}>
            <span
              className={actionDot({
                destructive: action.permission === "destructive",
                write: action.permission === "write",
              })}
            />
            <span style={{ flex: 1 }}>{action.title}</span>
            {action.detail && <span style={{ color: "var(--ds-text-placeholder)" }}>{action.detail}</span>}
          </div>
        ))}
      </div>
      {destructiveCount > 0 && <div className={hint}>{t("ai.destructiveWarning", { count: destructiveCount })}</div>}
    </div>
  );
}
