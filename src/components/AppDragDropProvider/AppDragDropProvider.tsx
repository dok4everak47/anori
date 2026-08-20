import type { WidgetDragData } from "@anori/utils/dnd";
import { Feedback, KeyboardSensor, PointerSensor } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";

const interactiveSelector = [
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

const findInteractiveAncestor = (event: Event, stopAt: Element | undefined) => {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (node.matches?.(interactiveSelector)) return node;
    if (stopAt && node === stopAt) return undefined;
  }
  return undefined;
};

const targetIsWithin = (event: Event, ancestor: Element | undefined) => {
  if (!ancestor) return false;
  return event.composedPath().includes(ancestor);
};

export const AppDragDropProvider = ({ children }: { children: ReactNode }) => {
  return (
    <DragDropProvider
      sensors={[
        PointerSensor.configure({
          preventActivation: (event, source) => {
            if (targetIsWithin(event, source.handle ?? undefined)) return false;
            const interactive = findInteractiveAncestor(event, source.element);
            if (!interactive) return false;
            return interactive !== source.element;
          },
        }),
        KeyboardSensor,
      ]}
      plugins={(defaults) => [
        ...defaults,
        Feedback.configure({ dropAnimation: { duration: 150, easing: "ease-out" } }),
      ]}
      onDragEnd={(event) => {
        const { source, target } = event.operation;
        if (!source || source.type !== "widget" || event.canceled) return;
        if (target?.type !== "folder") return;
        const data = source.data as WidgetDragData | undefined;
        if (!data) return;
        // Commit synchronously so the widget unmounts before the Feedback plugin measures the source
        // element for its drop animation — otherwise the card visibly flies back to its old grid slot
        // and then pops out of existence once React's batched commit lands (which includes
        // actual move state update).
        flushSync(() => {
          data.onDropToFolder(String(target.id));
        });
      }}
    >
      {children}
    </DragDropProvider>
  );
};
