import { describe, expect, it } from "vitest";
import { anoriDevTools } from "../src/index";
import { makeMockContext } from "./mock-context";

describe("anori-dev-tools activation", () => {
  it("has a valid manifest", () => {
    expect(anoriDevTools.manifest.id).toBe("anori-dev-tools");
    expect(anoriDevTools.manifest.name).toBeTruthy();
    expect(anoriDevTools.manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("registers exactly three commands and two tools on activate", () => {
    const { ctx, registeredCommands, registeredTools } = makeMockContext();
    anoriDevTools.activate(ctx);
    expect(registeredCommands.map((c) => c.id)).toEqual([
      "dev.open-github",
      "dev.search-github",
      "dev.current-workspace",
    ]);
    expect(registeredTools.map((t) => t.name)).toEqual(["dev_search_bookmarks", "dev_create_bookmark"]);
  });

  it("declares only the permissions it needs", () => {
    expect(anoriDevTools.manifest.permissions).toEqual(
      expect.arrayContaining([
        "commands.register",
        "tools.register",
        "workspace.read",
        "bookmarks.read",
        "bookmarks.write",
      ]),
    );
    expect(anoriDevTools.manifest.permissions).not.toContain("bookmarks.delete");
  });
});
