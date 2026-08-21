import type { ToolDefinition } from "./types";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): () => void {
    this.tools.set(tool.name, tool);
    return () => {
      this.tools.delete(tool.name);
    };
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();

export function summarizeArguments(args: Record<string, unknown>): string {
  try {
    const keys = Object.keys(args);
    if (keys.length === 0) return "{}";
    const parts = keys.map((k) => {
      const v = args[k];
      if (typeof v === "string") {
        return `${k}: "${v.length > 40 ? `${v.slice(0, 40)}…` : v}"`;
      }
      if (Array.isArray(v)) {
        return `${k}: [${v.length} item${v.length === 1 ? "" : "s"}]`;
      }
      if (v && typeof v === "object") {
        return `${k}: {${Object.keys(v as object).join(", ")}}`;
      }
      return `${k}: ${String(v)}`;
    });
    return `{ ${parts.join(", ")} }`;
  } catch {
    return "<unserializable arguments>";
  }
}
