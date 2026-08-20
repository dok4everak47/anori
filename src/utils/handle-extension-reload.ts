import browser from "webextension-polyfill";

const PORT_NAME = "anori-reload-watcher";

export const installExtensionReloadWatcher = () => {
  if (typeof window === "undefined") return;
  if (window.location.protocol !== "chrome-extension:" && window.location.protocol !== "moz-extension:") return;

  let port: browser.Runtime.Port | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let attempt = 0;

  const connect = () => {
    if (stopped) return;
    try {
      port = browser.runtime.connect({ name: PORT_NAME });
      attempt = 0;
    } catch {
      // Background is not reachable yet (service worker restarting or extension mid-reload).
      // The background recovers this tab itself after restarting; just retry the connection.
    }

    port?.onDisconnect.addListener(() => {
      port = null;
      if (stopped) return;
      const delay = Math.min(200 * 2 ** attempt, 3000);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    });
  };

  window.addEventListener("pagehide", () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    port?.disconnect();
  });

  connect();
};
