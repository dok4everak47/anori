import { describe, expect, it, vi } from "vitest";
import { defineExtension } from "../define-extension";

describe("defineExtension / manifest validation", () => {
  it("accepts a valid manifest and returns the same extension shape", () => {
    const activate = vi.fn();
    const ext = defineExtension({
      manifest: {
        id: "my-ext",
        name: "My Extension",
        version: "1.2.3",
        permissions: ["commands.register", "bookmarks.read"],
      },
      activate,
    });
    expect(ext.manifest.id).toBe("my-ext");
    expect(ext.manifest.permissions).toContain("bookmarks.read");
    expect(ext.activate).toBe(activate);
  });

  it("rejects an empty or non-kebab-case id", () => {
    expect(() => defineExtension({ manifest: { id: "", name: "X", version: "1.0.0" }, activate: () => {} })).toThrow(
      /id/,
    );
    expect(() =>
      defineExtension({ manifest: { id: "HasCaps", name: "X", version: "1.0.0" }, activate: () => {} }),
    ).toThrow(/id/);
    expect(() =>
      defineExtension({ manifest: { id: "has spaces", name: "X", version: "1.0.0" }, activate: () => {} }),
    ).toThrow(/id/);
  });

  it("rejects an empty name", () => {
    expect(() => defineExtension({ manifest: { id: "x", name: "  ", version: "1.0.0" }, activate: () => {} })).toThrow(
      /name/,
    );
  });

  it("rejects an invalid semver version", () => {
    expect(() => defineExtension({ manifest: { id: "x", name: "X", version: "v1" }, activate: () => {} })).toThrow(
      /version/,
    );
    expect(() => defineExtension({ manifest: { id: "x", name: "X", version: "1.0" }, activate: () => {} })).toThrow(
      /version/,
    );
  });

  it("rejects an unknown permission fast (fail-fast)", () => {
    expect(() =>
      defineExtension({
        manifest: { id: "x", name: "X", version: "1.0.0", permissions: ["filesystem.write" as never] },
        activate: () => {},
      }),
    ).toThrow(/permission/);
  });

  it("de-duplicates declared permissions", () => {
    const ext = defineExtension({
      manifest: {
        id: "x",
        name: "X",
        version: "1.0.0",
        permissions: ["bookmarks.read", "bookmarks.read", "commands.register"],
      },
      activate: () => {},
    });
    expect(ext.manifest.permissions).toEqual(["bookmarks.read", "commands.register"]);
  });
});
