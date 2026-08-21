import { describe, expect, it } from "vitest";
import { anoriDevTools } from "../src/index";
import { makeMockContext } from "./mock-context";

function activateWith(bookmarks: { instanceId: string; title: string; url: string; folderId: string }[]) {
  const harness = makeMockContext({ bookmarks });
  anoriDevTools.activate(harness.ctx);
  const tool = (name: string) => {
    const found = harness.registeredTools.find((t) => t.name === name);
    if (!found) throw new Error(`tool ${name} not registered`);
    return found;
  };
  return { ...harness, tool };
}

describe("tools", () => {
  it("dev_search_bookmarks is a read tool and returns development bookmarks", async () => {
    const { tool } = activateWith([
      { instanceId: "1", title: "Anori", url: "https://github.com/dok4everak47/anori", folderId: "home" },
      { instanceId: "2", title: "Linear", url: "https://linear.app/team", folderId: "home" },
      { instanceId: "3", title: "Cooking", url: "https://example.com/food", folderId: "home" },
    ]);
    const search = tool("dev_search_bookmarks");
    expect(search.permission).toBe("read");

    const result = await search.execute({ query: "github" }, { folderId: "home", selection: null });
    expect(result.ok).toBe(true);
    const content = result.content as { counts: { bookmarks: number }; bookmarks: Array<{ title: string }> };
    expect(content.counts.bookmarks).toBe(1);
    expect(content.bookmarks[0]?.title).toBe("Anori");
  });

  it("dev_search_bookmarks surfaces development bookmarks even without a query", async () => {
    const { tool } = activateWith([
      { instanceId: "1", title: "GitHub", url: "https://github.com", folderId: "home" },
      { instanceId: "2", title: "News", url: "https://news.example.com", folderId: "home" },
      { instanceId: "3", title: "Docker Hub", url: "https://hub.docker.com", folderId: "home" },
    ]);
    const result = await tool("dev_search_bookmarks").execute({}, { folderId: "home", selection: null });
    const content = result.content as { counts: { bookmarks: number } };
    expect(content.counts.bookmarks).toBeGreaterThanOrEqual(2);
  });

  it("dev_create_bookmark is a write tool and calls the Bookmark API (not storage directly)", async () => {
    const { tool, created } = activateWith([]);
    const create = tool("dev_create_bookmark");
    expect(create.permission).toBe("write");

    const result = await create.execute(
      { title: "GitHub Docs", url: "https://docs.github.com" },
      { folderId: "home", selection: null },
    );
    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({ title: "GitHub Docs", url: "https://docs.github.com" });
  });

  it("dev_create_bookmark input schema rejects invalid input", () => {
    const { tool } = activateWith([]);
    const schema = tool("dev_create_bookmark").inputSchema;
    expect(schema.safeParse({ title: "", url: "https://x.com" }).success).toBe(false);
    expect(schema.safeParse({ title: "x" }).success).toBe(false);
    expect(schema.safeParse({ title: "x", url: "https://x.com" }).success).toBe(true);
  });

  it("exposes no destructive tool", () => {
    const { registeredTools } = activateWith([]);
    expect(registeredTools.some((t) => t.permission === "destructive")).toBe(false);
  });
});
