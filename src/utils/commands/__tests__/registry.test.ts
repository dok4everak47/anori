import { describe, expect, it } from "vitest";
import { CommandExecutionError } from "../errors";
import { createCommandRegistry } from "../registry";
import type { Command } from "../types";

describe("CommandRegistry", () => {
  const bookmarkCommand: Command = {
    id: "test.open",
    title: "Open Test",
    description: "Opens a test bookmark",
    icon: "globe",
    category: "bookmark",
    source: "builtin",
    keywords: ["test", "open"],
    execute: () => ({ success: true }),
  };

  const navCommand: Command = {
    id: "nav.home",
    title: "Home",
    description: "Go to home",
    icon: "home",
    category: "navigation",
    source: "builtin",
    execute: () => ({ success: true }),
  };

  const systemCommand: Command = {
    id: "sys.settings",
    title: "Settings",
    description: "Open settings",
    icon: "settings",
    category: "system",
    source: "builtin",
    execute: () => ({ success: true }),
  };

  describe("register", () => {
    it("should register a command", () => {
      const registry = createCommandRegistry();
      registry.register(bookmarkCommand);
      expect(registry.commands).toHaveLength(1);
      expect(registry.get("test.open")).toBeDefined();
    });

    it("should return an unregister function", () => {
      const registry = createCommandRegistry();
      const unregister = registry.register(bookmarkCommand);
      expect(registry.commands).toHaveLength(1);
      unregister();
      expect(registry.commands).toHaveLength(0);
    });

    it("should overwrite a command with the same id", () => {
      const registry = createCommandRegistry([bookmarkCommand]);
      const updated: Command = { ...bookmarkCommand, title: "Updated" };
      registry.register(updated);
      expect(registry.get("test.open")?.title).toBe("Updated");
    });
  });

  describe("unregister", () => {
    it("should remove a command", () => {
      const registry = createCommandRegistry([bookmarkCommand]);
      registry.unregister("test.open");
      expect(registry.commands).toHaveLength(0);
    });

    it("should not throw when unregistering a non-existent command", () => {
      const registry = createCommandRegistry();
      expect(() => registry.unregister("does.not.exist")).not.toThrow();
    });
  });

  describe("get", () => {
    it("should get a command by id", () => {
      const registry = createCommandRegistry([bookmarkCommand]);
      expect(registry.get("test.open")).toBe(bookmarkCommand);
    });

    it("should return undefined for non-existent command", () => {
      const registry = createCommandRegistry();
      expect(registry.get("does.not.exist")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should list all commands", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand]);
      expect(registry.list()).toHaveLength(2);
    });

    it("should return empty array for empty registry", () => {
      const registry = createCommandRegistry();
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("execute", () => {
    it("should execute a command and return success", async () => {
      const registry = createCommandRegistry([bookmarkCommand]);
      const result = await registry.execute("test.open", { selection: null });
      expect(result.success).toBe(true);
    });

    it("should return error for non-existent command", async () => {
      const registry = createCommandRegistry();
      const result = await registry.execute("does.not.exist", { selection: null });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("COMMAND_NOT_FOUND");
    });

    it("should return error when when() returns false", async () => {
      const conditionalCommand: Command = {
        ...bookmarkCommand,
        when: (ctx) => ctx.selection?.type === "bookmark",
      };
      const registry = createCommandRegistry([conditionalCommand]);
      const result = await registry.execute("test.open", { selection: null });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("COMMAND_PERMISSION_ERROR");
    });

    it("should succeed when when() returns true", async () => {
      const conditionalCommand: Command = {
        ...bookmarkCommand,
        when: (ctx) => ctx.selection?.type === "bookmark",
      };
      const registry = createCommandRegistry([conditionalCommand]);
      const result = await registry.execute("test.open", {
        selection: { type: "bookmark", instanceId: "test", pluginId: "test", widgetId: "test" },
      });
      expect(result.success).toBe(true);
    });

    it("should handle async command execution", async () => {
      const asyncCommand: Command = {
        ...bookmarkCommand,
        execute: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { success: true };
        },
      };
      const registry = createCommandRegistry([asyncCommand]);
      const result = await registry.execute("test.open", { selection: null });
      expect(result.success).toBe(true);
    });

    it("should handle command execution errors", async () => {
      const failingCommand: Command = {
        ...bookmarkCommand,
        execute: () => {
          throw new Error("Something went wrong");
        },
      };
      const registry = createCommandRegistry([failingCommand]);
      const result = await registry.execute("test.open", { selection: null });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("COMMAND_EXECUTION_ERROR");
    });

    it("should handle CommandExecutionError with custom code", async () => {
      const failingCommand: Command = {
        ...bookmarkCommand,
        execute: () => {
          throw new CommandExecutionError("test.open", "Custom error", true);
        },
      };
      const registry = createCommandRegistry([failingCommand]);
      const result = await registry.execute("test.open", { selection: null });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("COMMAND_EXECUTION_ERROR");
      expect(result.recoverable).toBe(true);
    });
  });

  describe("search", () => {
    it("should return all commands with empty query", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand, systemCommand]);
      expect(registry.search("")).toHaveLength(3);
    });

    it("should filter by title", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand, systemCommand]);
      const results = registry.search("home");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("nav.home");
    });

    it("should filter by description", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand, systemCommand]);
      const results = registry.search("settings");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("sys.settings");
    });

    it("should filter by keywords", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand, systemCommand]);
      const results = registry.search("test");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("test.open");
    });

    it("should prioritize exact match over prefix match", () => {
      const commands: Command[] = [
        { ...bookmarkCommand, id: "test.open", title: "Open" },
        { ...bookmarkCommand, id: "test.open.all", title: "Open All" },
      ];
      const registry = createCommandRegistry(commands);
      const results = registry.search("open");
      expect(results[0].id).toBe("test.open");
    });

    it("should filter by context", () => {
      const conditionalCommand: Command = {
        ...bookmarkCommand,
        when: (ctx) => ctx.selection?.type === "bookmark",
        id: "conditional",
      };
      const registry = createCommandRegistry([bookmarkCommand, conditionalCommand]);
      const results = registry.search("", { selection: null });
      expect(results.find((c) => c.id === "conditional")).toBeUndefined();
    });
  });

  describe("getByCategory", () => {
    it("should filter by category", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand, systemCommand]);
      const navCommands = registry.getByCategory("navigation");
      expect(navCommands).toHaveLength(1);
      expect(navCommands[0].id).toBe("nav.home");
    });

    it("should return empty array for category with no commands", () => {
      const registry = createCommandRegistry();
      expect(registry.getByCategory("extension")).toHaveLength(0);
    });
  });

  describe("initial commands", () => {
    it("should accept initial commands", () => {
      const registry = createCommandRegistry([bookmarkCommand, navCommand]);
      expect(registry.commands).toHaveLength(2);
    });
  });
});
