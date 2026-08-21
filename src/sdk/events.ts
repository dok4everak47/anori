import type { AnoriEventMap, AnoriEventName, Disposable, EventListener, ExtensionLogger } from "./types";

export type EventBus = {
  on: <K extends AnoriEventName>(name: K, listener: EventListener<K>) => Disposable;
  emit: <K extends AnoriEventName>(name: K, payload: AnoriEventMap[K]) => void;
  listenerCount: (name: AnoriEventName) => number;
};

export function createEventBus(logger?: Pick<ExtensionLogger, "warn" | "error">): EventBus {
  const listeners = new Map<AnoriEventName, Set<EventListener<AnoriEventName>>>();

  const on = <K extends AnoriEventName>(name: K, listener: EventListener<K>): Disposable => {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    set.add(listener as EventListener<AnoriEventName>);
    return {
      dispose() {
        const current = listeners.get(name);
        if (!current) return;
        current.delete(listener as EventListener<AnoriEventName>);
        if (current.size === 0) listeners.delete(name);
      },
    };
  };

  const emit = <K extends AnoriEventName>(name: K, payload: AnoriEventMap[K]): void => {
    const set = listeners.get(name);
    if (!set || set.size === 0) return;
    for (const listener of Array.from(set)) {
      try {
        const result = (listener as EventListener<K>)(payload) as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          void (result as Promise<unknown>).catch((e) => {
            logger?.warn(`Listener for "${name}" rejected: ${e instanceof Error ? e.message : String(e)}`);
          });
        }
      } catch (e) {
        logger?.warn(`Listener for "${name}" threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  return {
    on,
    emit,
    listenerCount: (name) => listeners.get(name)?.size ?? 0,
  };
}
