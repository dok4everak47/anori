import { guid } from "@anori/utils/misc";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./prompt";
import type {
  ActionPlan,
  AgentStreamEvent,
  AIProvider,
  AIProviderConfig,
  ChatMessage,
  ProposedAction,
  ToolDefinition,
  ToolExecutionContext,
} from "./types";

export const AGENT_MAX_ITERATIONS = 8;

export class AgentPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPermissionError";
  }
}

export class AgentIterationLimitError extends Error {
  constructor(limit: number) {
    super(`AI reached the maximum of ${limit} tool-call iterations.`);
    this.name = "AgentIterationLimitError";
  }
}

type Emit = (event: AgentStreamEvent) => void;

const PROPOSE_ACTIONS_SCHEMA = z.object({
  summary: z.string().describe("One-sentence summary of the proposed changes."),
  actions: z
    .array(
      z.object({
        tool: z.string().describe("The exact name of the write/destructive tool to run."),
        arguments: z.record(z.string(), z.unknown()).describe("The arguments to pass to that tool."),
      }),
    )
    .describe("The ordered list of changes to apply."),
});

const PROPOSE_TOOL: ToolDefinition = {
  name: "propose_actions",
  description:
    "Present a proposed set of changes to the user for confirmation. Use this to finalize ANY write or destructive changes. Provide a one-sentence summary and the full list of actions. Do not call write tools directly.",
  permission: "write",
  inputSchema: PROPOSE_ACTIONS_SCHEMA,
  execute: () => ({ ok: true, content: null }),
};

function toolParameters(tool: ToolDefinition): Record<string, unknown> {
  return zodToJsonSchema(tool.inputSchema);
}

function unwrapZod(schema: unknown): { def: unknown; typeName: string | undefined } {
  const s = schema as { _def?: { typeName?: string; innerType?: unknown } };
  return { def: s?._def, typeName: s?._def?.typeName };
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) return { type: "object", properties: {}, additionalProperties: false };
  const { typeName } = unwrapZod(schema);

  if (typeName === "ZodObject") {
    const def = (schema as { _def: { shape: () => Record<string, unknown> } })._def;
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const meta = value as { description?: string; isOptional?: () => boolean };
      properties[key] = zodToJsonSchema(value);
      const inner = unwrapZod(value);
      const isOptional =
        inner.typeName === "ZodOptional" ||
        inner.typeName === "ZodDefault" ||
        (typeof meta.isOptional === "function" && meta.isOptional());
      if (!isOptional) required.push(key);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }

  if (typeName === "ZodString") return withDescription(schema, { type: "string" });
  if (typeName === "ZodNumber") return withDescription(schema, { type: "number" });
  if (typeName === "ZodBoolean") return withDescription(schema, { type: "boolean" });
  if (typeName === "ZodEnum") {
    const values = (schema as { _def: { values: string[] } })._def.values;
    return withDescription(schema, { type: "string", enum: values });
  }
  if (typeName === "ZodArray") {
    const element = (schema as { _def: { type: unknown } })._def.type;
    return withDescription(schema, { type: "array", items: zodToJsonSchema(element) });
  }
  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    const inner = (schema as { _def: { innerType: unknown } })._def.innerType;
    return zodToJsonSchema(inner);
  }
  if (typeName === "ZodRecord") return { type: "object" };

  return { type: "string" };
}

function withDescription(schema: unknown, base: Record<string, unknown>): Record<string, unknown> {
  const desc = (schema as { description?: string }).description;
  return desc ? { ...base, description: desc } : base;
}

function titleForAction(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "create_bookmark":
      return `Add bookmark "${String(args.title ?? args.url ?? "")}"`;
    case "update_bookmark":
      return `Update bookmark ${String(args.instanceId ?? "")}`;
    case "delete_bookmark":
      return `Delete bookmark ${String(args.instanceId ?? "")}`;
    case "create_group":
      return `Create group "${String(args.title ?? "")}"`;
    case "add_to_group":
      return `Add ${Array.isArray(args.urls) ? args.urls.length : 0} URL(s) to group`;
    case "delete_group":
      return `Delete group ${String(args.groupInstanceId ?? "")}`;
    default:
      return tool;
  }
}

export async function runAgent(params: {
  request: string;
  provider: AIProvider;
  config: AIProviderConfig;
  tools: ToolDefinition[];
  context: ToolExecutionContext;
  emit: Emit;
  signal?: AbortSignal;
}): Promise<void> {
  const { request, provider, config, tools, context, emit, signal } = params;

  if (!provider.isConfigured(config)) {
    emit({ type: "error", message: "AI provider is not configured. Add an API key in settings.", recoverable: true });
    return;
  }

  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of tools) toolMap.set(tool.name, tool);

  const toolsForModel = [...tools, PROPOSE_TOOL].map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toolParameters(t),
  }));

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `Available tools (permission in parentheses):\n${tools
        .map((t) => `- ${t.name} (${t.permission}): ${t.description}`)
        .join("\n")}\n- ${PROPOSE_TOOL.name} (write): ${PROPOSE_TOOL.description}`,
    },
    { role: "user", content: request },
  ];

  emit({ type: "status", status: "thinking", label: "Thinking…" });

  for (let iteration = 0; iteration < AGENT_MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return;

    let response: Awaited<ReturnType<typeof provider.chat>>;
    try {
      response = await provider.chat({ messages, tools: toolsForModel }, config);
    } catch (e) {
      emit({
        type: "error",
        message: e instanceof Error ? e.message : "AI provider request failed.",
        recoverable: true,
      });
      return;
    }

    if (response.content) {
      emit({ type: "message-delta", text: response.content });
    }

    const toolCalls = response.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      emit({ type: "result", result: { kind: "message", text: response.content.trim() || "Done." } });
      return;
    }

    messages.push({ role: "assistant", content: response.content, toolCalls });

    for (const call of toolCalls) {
      if (call.name === PROPOSE_TOOL.name) {
        const plan = parsePlan(call.arguments, toolMap);
        if (plan.actions.length === 0) {
          emit({
            type: "result",
            result: { kind: "message", text: response.content.trim() || "No changes are needed." },
          });
          return;
        }
        emit({ type: "status", status: "waiting-confirmation", label: "Waiting for confirmation…" });
        emit({ type: "plan", plan });
        emit({ type: "result", result: { kind: "confirmation", plan } });
        return;
      }

      const tool = toolMap.get(call.name);
      if (!tool) {
        const message = `The model tried to use an unknown tool "${call.name}".`;
        messages.push({
          role: "tool",
          toolName: call.name,
          content: JSON.stringify({ error: message }),
          isError: true,
        });
        emit({ type: "error", message, recoverable: true });
        return;
      }

      if (tool.permission !== "read") {
        const message = `Write tools must be routed through ${PROPOSE_TOOL.name}. Use it to propose "${tool.name}".`;
        messages.push({
          role: "tool",
          toolName: tool.name,
          content: JSON.stringify({ error: message }),
          isError: true,
        });
        continue;
      }

      emit({ type: "status", status: "reading", label: `Running ${tool.name}…` });
      emit({ type: "tool-call", call, permission: tool.permission });

      let parsed: unknown = {};
      const parseResult = tool.inputSchema?.safeParse(call.arguments);
      if (parseResult && !parseResult.success) {
        const error = `Invalid arguments for ${tool.name}: ${parseResult.error.issues.map((i) => i.message).join("; ")}`;
        messages.push({ role: "tool", toolName: tool.name, content: JSON.stringify({ error }), isError: true });
        emit({ type: "tool-result", name: tool.name, result: { ok: false, content: null, error } });
        continue;
      }
      if (parseResult) parsed = parseResult.data;

      try {
        const result = await tool.execute(parsed, context);
        messages.push({
          role: "tool",
          toolName: tool.name,
          content: JSON.stringify(result.content).slice(0, 6000),
          isError: !result.ok,
        });
        emit({ type: "tool-result", name: tool.name, result });
      } catch (e) {
        const error = e instanceof Error ? e.message : "Tool execution failed.";
        messages.push({ role: "tool", toolName: tool.name, content: JSON.stringify({ error }), isError: true });
        emit({ type: "tool-result", name: tool.name, result: { ok: false, content: null, error } });
      }
    }
  }

  emit({ type: "error", message: new AgentIterationLimitError(AGENT_MAX_ITERATIONS).message, recoverable: true });
}

function parsePlan(args: Record<string, unknown>, toolMap: Map<string, ToolDefinition>): ActionPlan {
  const rawActions = Array.isArray(args.actions) ? args.actions : [];
  const summary = typeof args.summary === "string" ? args.summary : "Proposed changes";
  const actions: ProposedAction[] = [];

  for (const raw of rawActions) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { tool?: unknown; arguments?: unknown };
    if (typeof candidate.tool !== "string") continue;
    const tool = toolMap.get(candidate.tool);
    if (!tool) continue;
    const toolArgs = (
      candidate.arguments && typeof candidate.arguments === "object" ? candidate.arguments : {}
    ) as Record<string, unknown>;
    actions.push({
      id: guid(),
      tool: candidate.tool,
      arguments: toolArgs,
      permission: tool.permission,
      title: titleForAction(candidate.tool, toolArgs),
      detail: buildDetail(candidate.tool, toolArgs),
    });
  }

  return { summary, actions };
}

function buildDetail(tool: string, args: Record<string, unknown>): string | undefined {
  switch (tool) {
    case "create_bookmark":
      return typeof args.url === "string" ? args.url : undefined;
    case "add_to_group":
      return Array.isArray(args.urls) ? `${args.urls.length} URL(s)` : undefined;
    default:
      return undefined;
  }
}

export async function applyActionPlan(
  plan: ActionPlan,
  tools: ToolDefinition[],
  context: ToolExecutionContext,
  emit: Emit,
): Promise<{ applied: number; failed: number; audit: Array<{ tool: string; ok: boolean; error?: string }> }> {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const audit: Array<{ tool: string; ok: boolean; error?: string }> = [];
  let applied = 0;
  let failed = 0;

  emit({ type: "status", status: "applying", label: "Applying changes…" });

  for (const action of plan.actions) {
    if (action.permission === "read") continue;
    const tool = toolMap.get(action.tool);
    if (!tool) {
      audit.push({ tool: action.tool, ok: false, error: `Unknown tool "${action.tool}"` });
      failed++;
      continue;
    }

    if (tool.inputSchema) {
      const parsed = tool.inputSchema.safeParse(action.arguments);
      if (!parsed.success) {
        audit.push({ tool: action.tool, ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") });
        failed++;
        continue;
      }
      action.arguments = parsed.data as Record<string, unknown>;
    }

    try {
      const result = await tool.execute(action.arguments, context);
      if (result.ok) {
        applied++;
        audit.push({ tool: action.tool, ok: true });
      } else {
        failed++;
        audit.push({ tool: action.tool, ok: false, error: result.error });
      }
    } catch (e) {
      failed++;
      audit.push({ tool: action.tool, ok: false, error: e instanceof Error ? e.message : "Execution failed" });
    }
  }

  return { applied, failed, audit };
}
