import type { z } from "zod";
import type { BookmarkToolService } from "./bookmark-service.js";
import type { McpToolDefinition, McpToolResult } from "./mcp-tools.js";

export type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  const anySchema = schema as unknown as { toJSONSchema?: () => JsonSchema };
  if (typeof anySchema.toJSONSchema === "function") {
    const converted = anySchema.toJSONSchema();
    delete converted.$schema;
    return converted;
  }
  return { type: "object", additionalProperties: true };
}

export type DiscoveredTool = {
  name: string;
  description: string;
  permission: "read" | "write" | "destructive";
  requiresConfirmation: boolean;
  inputSchema: JsonSchema;
};

export function discoverTools(tools: McpToolDefinition[]): DiscoveredTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    requiresConfirmation: tool.requiresConfirmation,
    inputSchema: zodToJsonSchema(tool.inputSchema),
  }));
}

export type DispatchContext = {
  confirmationToken?: string;
};

export async function dispatchTool(
  tools: McpToolDefinition[],
  name: string,
  rawArgs: unknown,
  service: BookmarkToolService,
  context: DispatchContext = {},
): Promise<McpToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, errorCode: "INVALID_INPUT", message: `Unknown tool "${name}".` };
  }

  const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    return { ok: false, errorCode: "INVALID_INPUT", message };
  }

  try {
    return await tool.run(parsed.data, { service, confirmationToken: context.confirmationToken });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return { ok: false, errorCode: "INTERNAL_ERROR", message };
  }
}
