import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

/**
 * Lightweight UI-only selection state for widgets.
 * Does NOT persist to storage — this is purely a UI concern.
 */

export type WidgetSelection = {
  instanceId: string;
  widgetId: string;
  pluginId: string;
} | null;

type WidgetSelectionContextValue = {
  selected: WidgetSelection;
  focused: WidgetSelection;
  select: (widget: WidgetSelection) => void;
  focus: (widget: WidgetSelection) => void;
  clear: () => void;
  selectNext: (total: number) => void;
  selectPrev: (total: number) => void;
  focusIndex: number;
  setFocusIndex: (index: number) => void;
};

const WidgetSelectionContext = createContext<WidgetSelectionContextValue | null>(null);

export const useWidgetSelection = () => {
  const ctx = useContext(WidgetSelectionContext);
  if (!ctx) {
    // Safe fallback outside provider
    return {
      selected: null as WidgetSelection,
      focused: null as WidgetSelection,
      select: () => {},
      focus: () => {},
      clear: () => {},
      selectNext: () => {},
      selectPrev: () => {},
      focusIndex: -1,
      setFocusIndex: () => {},
    };
  }
  return ctx;
};

export const WidgetSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selected, setSelected] = useState<WidgetSelection>(null);
  const [focused, setFocused] = useState<WidgetSelection>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const select = useCallback((widget: WidgetSelection) => {
    setSelected(widget);
  }, []);

  const focus = useCallback((widget: WidgetSelection) => {
    setFocused(widget);
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    setFocused(null);
    setFocusIndex(-1);
  }, []);

  const selectNext = useCallback((total: number) => {
    setFocusIndex((prev) => {
      const next = prev >= total - 1 ? 0 : prev + 1;
      return next;
    });
  }, []);

  const selectPrev = useCallback((total: number) => {
    setFocusIndex((prev) => {
      const next = prev <= 0 ? total - 1 : prev - 1;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ selected, focused, select, focus, clear, selectNext, selectPrev, focusIndex, setFocusIndex }),
    [selected, focused, select, focus, clear, selectNext, selectPrev, focusIndex],
  );

  return <WidgetSelectionContext.Provider value={value}>{children}</WidgetSelectionContext.Provider>;
};
