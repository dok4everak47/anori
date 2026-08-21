import { availablePlugins } from "@anori/plugins/all";
import { anoriSchema, getAnoriStorage } from "@anori/utils/storage";
import { runOrphanGc } from "@anori/utils/storage/orphan-gc";
import browser, { type Runtime } from "webextension-polyfill";

type BackgroundMessage =
  | { type: "plugin-command"; pluginId: string; command: string; args: unknown }
  | { type: "open-url"; url: string; inNewTab?: boolean; active?: boolean };

console.log("Background init");

// Updating to any of these versions adds a notification dot on "Whats new" button in the sidebar
const VERSIONS_WITH_CHANGES = [
  "1.1.0",
  "1.2.0",
  "1.5.0",
  "1.6.0",
  "1.8.0",
  "1.9.0",
  "1.10.0",
  "1.11.0",
  "1.12.0",
  "1.13.0",
  "1.14.0",
  "1.15.0",
  "1.16.0",
  "1.17.0",
  "1.18.0",
  "1.19.0",
  "1.21.0",
  "1.22.0",
  "1.24.0",
  "1.26.0",
  "1.27.0",
  "2.0.0",
  "2.0.2",
  "2.1.0",
  "2.2.0",
  "2.3.0",
];

const compareVersions = (v1: string, v2: string): -1 | 0 | 1 => {
  // v1 is newer than v2 => -1
  // v1 and v2 are same => 0
  // v1 is older than v2 => 1
  const v1Tokens = v1.split(".").map((d) => Number.parseInt(d, 10));
  const v2Tokens = v2.split(".").map((d) => Number.parseInt(d, 10));
  for (let ind = 0; ind < Math.min(v1Tokens.length, v2Tokens.length); ind++) {
    if (v1Tokens[ind] > v2Tokens[ind]) return -1;
    if (v1Tokens[ind] < v2Tokens[ind]) return 1;
  }

  return 0;
};

browser.runtime.onInstalled.addListener(async (details) => {
  const storage = await getAnoriStorage();

  if (details.reason === "update" && details.previousVersion) {
    const { previousVersion } = details;
    const currentVersion = browser.runtime.getManifest().version;

    console.log("Extension updated, prev version:", previousVersion, "current version:", currentVersion);
    // If at least one of VERSIONS_WITH_CHANGES is newer than previous version
    const hasImportantUpdates = VERSIONS_WITH_CHANGES.some((v) => {
      return compareVersions(v, previousVersion) === -1 && compareVersions(v, currentVersion) >= 0;
    });
    console.log("Has important updates:", hasImportantUpdates);
    if (hasImportantUpdates) {
      storage.set(anoriSchema.hasUnreadReleaseNotes, true);
    }
  }

  if (details.reason === "install") {
    browser.tabs.create({
      url: "https://anori.app/welcome",
      active: true,
    });
  }
});

const NEWTAB_URL = browser.runtime.getURL("/pages/newtab/start.html");
const RELOAD_WATCH_KEY = "anori:reload-watch";
const HEARTBEAT_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 15000;

type WatchEntry = { tabId: number; lastSeen: number };

const isDefaultNewtabUrl = (url: string) =>
  url === "" ||
  url === "about:newtab" ||
  url === "about:home" ||
  url === "about:blank" ||
  url === "chrome://newtab/" ||
  /newtab|home\.brave|search\.brave/i.test(url);

const bringTabBack = (tabId: number) => {
  browser.tabs.update(tabId, { url: NEWTAB_URL, active: false }).catch(() => {
    browser.tabs.create({ url: NEWTAB_URL, active: false }).catch(() => {});
  });
};

const recoverNewtabsAfterReload = async () => {
  const stored = (await browser.storage.local.get(RELOAD_WATCH_KEY))[RELOAD_WATCH_KEY] as WatchEntry[] | undefined;
  await browser.storage.local.remove(RELOAD_WATCH_KEY);
  if (!stored || stored.length === 0) return;
  const now = Date.now();
  const fresh = stored.filter((entry) => now - (entry.lastSeen ?? 0) <= STALE_THRESHOLD_MS);

  for (const entry of fresh) {
    try {
      const tab = await browser.tabs.get(entry.tabId);
      const url = tab.url ?? "";
      if (url.startsWith(browser.runtime.getURL("/pages/newtab/"))) continue;
      if (isDefaultNewtabUrl(url)) setTimeout(() => bringTabBack(entry.tabId), 300);
    } catch {
      setTimeout(() => bringTabBack(entry.tabId), 300);
    }
  }
};

void recoverNewtabsAfterReload();

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "anori-reload-watcher") return;
  const tabId = port.sender?.tab?.id;
  if (tabId === undefined) return;

  const writeEntry = () => {
    void browser.storage.local.get(RELOAD_WATCH_KEY).then((res) => {
      const entries = (res[RELOAD_WATCH_KEY] as WatchEntry[] | undefined) ?? [];
      const next = entries.filter((entry) => entry.tabId !== tabId);
      next.push({ tabId, lastSeen: Date.now() });
      void browser.storage.local.set({ [RELOAD_WATCH_KEY]: next });
    });
  };
  writeEntry();
  const heartbeat = setInterval(writeEntry, HEARTBEAT_INTERVAL_MS);

  port.onDisconnect.addListener(() => {
    clearInterval(heartbeat);
    void browser.storage.local.get(RELOAD_WATCH_KEY).then((res) => {
      const entries = (res[RELOAD_WATCH_KEY] as WatchEntry[] | undefined) ?? [];
      const next = entries.filter((entry) => entry.tabId !== tabId);
      void browser.storage.local.set({ [RELOAD_WATCH_KEY]: next });
    });
  });
});

browser.runtime.onMessage.addListener(async (rawMessage: unknown, sender: Runtime.MessageSender) => {
  const message = rawMessage as BackgroundMessage;
  if (message.type === "plugin-command") {
    const plugin = availablePlugins.find((p) => p.id === message.pluginId);
    if (!plugin) {
      console.warn("Got message for unknown plugin", message.pluginId);
      return;
    }
    if (!plugin.onMessage?.[message.command]) {
      console.warn("Plugin", plugin.id, `can't handle command`, message.command);
      return;
    }

    try {
      return await plugin.onMessage[message.command](message.args, sender?.tab?.id);
    } catch (err) {
      console.error("Error while handling message", err);
    }
  } else if (message.type === "open-url") {
    if (!sender.tab) return;
    if (message.inNewTab) {
      return browser.tabs.create({
        url: message.url,
        active: message.active ?? false,
        index: sender.tab.index + 1,
      });
    }
    return browser.tabs.update(sender.tab.id, {
      url: message.url,
    });
  }

  return true;
});

const runScheduledCallbacks = async () => {
  // This code uses browser storage directly (rather than go through storage-lib) because
  // it uses session storage when our abstraction works with persisted storage.
  const { scheduledCallbacksInfo } = (await browser.storage.session.get({
    scheduledCallbacksInfo: {},
  })) as { scheduledCallbacksInfo: Record<string, number> };

  const now = Date.now();
  availablePlugins.forEach((plugin) => {
    if (!plugin.scheduledCallback) return;
    const lastInvoked = scheduledCallbacksInfo[plugin.id] || 0;
    if (lastInvoked + plugin.scheduledCallback.intervalInMinutes * 1000 * 60 < now) {
      try {
        plugin.scheduledCallback.callback();
      } catch (err) {
        console.error(`Error while executing plugin (id ${plugin.id}) sheduled callback`, err);
      }
      scheduledCallbacksInfo[plugin.id] = now;
    }
  });
  await browser.storage.session.set({ scheduledCallbacksInfo });
};

availablePlugins.forEach((plugin) => {
  if (plugin.onStart) {
    try {
      plugin.onStart();
    } catch (err) {
      console.error(`Error while executing plugin (id ${plugin.id}) onStart callback`, err);
    }
  }
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scheduledCallbacks") {
    runScheduledCallbacks();
  }
  if (alarm.name === "orphanGc") {
    getAnoriStorage().then((storage) => {
      runOrphanGc(storage).then((result) => {
        if (result.removedKvRecords > 0 || result.removedOpfsFiles > 0) {
          console.log(
            `[OrphanGC] Removed ${result.removedKvRecords} orphaned records and ${result.removedOpfsFiles} orphaned OPFS files`,
          );
        }
      });
    });
  }
  if (alarm.name === "tombstoneCompaction") {
    getAnoriStorage().then((storage) => {
      storage.sync
        .compactTombstones()
        .then((removed) => {
          if (removed > 0) {
            console.log(`[TombstoneCompaction] Removed ${removed} expired tombstone(s)`);
          }
        })
        .catch((error) => console.error("Tombstone compaction failed:", error));
    });
  }
});

browser.alarms.create("scheduledCallbacks", {
  periodInMinutes: 5,
  delayInMinutes: 5,
});

browser.alarms.create("orphanGc", {
  periodInMinutes: 24 * 60, // Once per day
  delayInMinutes: 10, // First run 10 minutes after startup
});

browser.alarms.create("tombstoneCompaction", {
  periodInMinutes: 24 * 60, // Once per day
  delayInMinutes: 15, // Offset from orphanGc to avoid bursting at the same time
});

browser.runtime.setUninstallURL(`https://anori.app/goodbye`);

// @ts-expect-error unknwon onRuleMatchedDebug event
if (X_BROWSER === "chrome" && X_MODE === "development" && browser.declarativeNetRequest?.onRuleMatchedDebug) {
  // @ts-expect-error unknwon onRuleMatchedDebug event
  browser.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => console.log("Matched DNR rule", info));
}

console.log("Background installed all handlers");
