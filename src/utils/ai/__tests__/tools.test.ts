import { describe, expect, it } from "vitest";
import { z } from "zod";
import { summarizeArguments, ToolRegistry } from "../tool-registry";
import type { ToolDefinition } from "../types";

const echoTool: ToolDefinition = {
  name: "echo",
  description: "Echoes input",
  permission: "read",
  inputSchema: z.object({ text: z.string() }),
  execute: (input) => ({ ok: true, content: input }),
};

const writeTool: ToolDefinition = {
  name: "write_thing",
  description: "Writes a thing",
  permission: "write",
  inputSchema: z.object({ id: z.string() }),
  execute: () => ({ ok: true, content: { written: true } }),
};

const destructiveTool: ToolDefinition = {
  name: "destroy_thing",
  description: "Destroys a thing",
  permission: "destructive",
  inputSchema: z.object({ id: z.string() }),
  execute: () => ({ ok: true, content: null }),
};

describe("ToolRegistry", () => {
  it("registers and lists tools", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(writeTool);
    expect(registry.list()).toHaveLength(2);
    expect(registry.has("echo")).toBe(true);
  });

  it("unregisters via returned function", () => {
    const registry = new ToolRegistry();
    const unregister = registry.register(echoTool);
    expect(registry.has("echo")).toBe(true);
    unregister();
    expect(registry.has("echo")).toBe(false);
  });

  it("unregisters by name", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.unregister("echo");
    expect(registry.has("echo")).toBe(false);
  });

  it("gets a tool by name", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    expect(registry.get("echo")?.name).toBe("echo");
    expect(registry.get("missing")).toBeUndefined();
  });
});

describe("tool schema validation", () => {
  it("accepts valid input and rejects invalid input", () => {
    const valid = echoTool.inputSchema.safeParse({ text: "hello" });
    expect(valid.success).toBe(true);
    const invalid = echoTool.inputSchema.safeParse({ text: 123 });
    expect(invalid.success).toBe(false);
  });

  it("rejects unknown keys with strict", () => {
    const strictTool: ToolDefinition = {
      name: "strict",
      description: "strict",
      permission: "read",
      inputSchema: z.object({ a: z.string() }).strict(),
      execute: () => ({ ok: true, content: null }),
    };
    const result = strictTool.inputSchema.safeParse({ a: "x", b: "y" });
    expect(result.success).toBe(false);
  });
});

describe("tool permissions", () => {
  it("classifies read, write, and destructive tools", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(writeTool);
    registry.register(destructiveTool);
    const read = registry.list().filter((t) => t.permission === "read");
    const write = registry.list().filter((t) => t.permission === "write");
    const destructive = registry.list().filter((t) => t.permission === "destructive");
    expect(read).toHaveLength(1);
    expect(write).toHaveLength(1);
    expect(destructive).toHaveLength(1);
  });
});

describe("summarizeArguments", () => {
  it("summarizes strings, arrays, and objects without leaking long values", () => {
    const summary = summarizeArguments({ url: `https://example.com/${"a".repeat(60)}`, count: 3, tags: ["a", "b"] });
    expect(summary).toContain("url:");
    expect(summary).toContain("…");
    expect(summary).toContain("[2 items]");
  });

  it("handles empty arguments", () => {
    expect(summarizeArguments({})).toBe("{}");
  });
});
