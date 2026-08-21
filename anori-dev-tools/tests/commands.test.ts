import { beforeEach, describe, expect, it } from "vitest";
import { anoriDevTools } from "../src/index";
import { makeMockContext } from "./mock-context";

function activateWith(bookmarks: { instanceId: string; title: string; url: string; folderId: string }[]) {
  const harness = makeMockContext({ bookmarks });
  anoriDevTools.activate(harness.ctx);
  const cmd = (id: string) => {
    const found = harness.registeredCommands.find((c) => c.id === id);
    if (!found) throw new Error(`command ${id} not registered`);
    return found;
  };
  return { ...harness, cmd };
}

describe("commands", () => {
  beforeEach(() => {});

  it("dev.open-github logs the navigation request and reports the SDK gap", async () => {
    const { cmd, logs } = activateWith([]);
    const result = await cmd("dev.open-github").execute({});
    expect(result?.success).toBe(false);
    expect(result && "error" in result ? result.error : "").toMatch(/navigation/i);
    expect(logs.some((l) => /github/i.test(l.message))).toBe(true);
  });

  it("dev.search-github finds GitHub bookmarks via the Bookmark API", async () => {
    const { cmd, logs } = activateWith([
      { instanceId: "1", title: "Anori", url: "https://github.com/dok4everak47/anori", folderId: "home" },
      { instanceId: "2", title: "Recipes", url: "https://example.com/recipes", folderId: "home" },
    ]);
    const result = await cmd("dev.search-github").execute({});
    expect(result?.success).toBe(true);
    expect(logs.some((l) => /1 GitHub bookmark/.test(l.message))).toBe(true);
  });

  it("dev.current-workspace reads and logs the active workspace name", async () => {
    const { cmd, logs } = activateWith([]);
    const result = await cmd("dev.current-workspace").execute({});
    expect(result?.success).toBe(true);
    expect(logs.some((l) => /Current workspace: Home/.test(l.message))).toBe(true);
  });
});
