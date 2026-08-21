import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AGENT_MAX_ITERATIONS, applyActionPlan, runAgent } from "../agent-runtime";
import type { AgentStreamEvent, AIProvider, ToolDefinition } from "../types";

const context = { folderId: "home", selection: null };

function makeReadTool(spy: () => unknown): ToolDefinition {
  return {
    name: "list_things",
    description: "List things",
    permission: "read",
    inputSchema: z.object({}).strict(),
    execute: () => ({ ok: true, content: spy() }),
  };
}

function makeWriteTool(): ToolDefinition {
  return {
    name: "create_thing",
    description: "Create a thing",
    permission: "write",
    inputSchema: z.object({ name: z.string() }).strict(),
    execute: () => ({ ok: true, content: { created: true } }),
  };
}

function makeDestructiveTool(): ToolDefinition {
  return {
    name: "delete_thing",
    description: "Delete a thing",
    permission: "destructive",
    inputSchema: z.object({ id: z.string() }).strict(),
    execute: () => ({ ok: true, content: { deleted: true } }),
  };
}

function makeProvider(
  responses: Array<{ content: string; toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }> }>,
): AIProvider {
  let i = 0;
  return {
    id: "fake",
    label: "Fake",
    isConfigured: () => true,
    chat: vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return { content: r.content, toolCalls: r.toolCalls };
    }),
  };
}

async function collect(provider: AIProvider, tools: ToolDefinition[], request = "do it") {
  const events: AgentStreamEvent[] = [];
  await runAgent({
    request,
    provider,
    config: { baseUrl: "http://x", apiKey: "k", model: "m" },
    tools,
    context,
    emit: (e) => events.push(e),
  });
  return events;
}

describe("runAgent read tools", () => {
  it("runs read tools automatically and feeds results back", async () => {
    const tools = [makeReadTool(() => ({ items: ["a", "b"] }))];
    const provider = makeProvider([
      { content: "", toolCalls: [{ name: "list_things", arguments: {} }] },
      { content: "Found 2 things." },
    ]);
    const events = await collect(provider, tools);
    const result = events.find((e) => e.type === "result");
    expect(result?.type === "result" && result.result.kind).toBe("message");
    expect(events.some((e) => e.type === "tool-result" && e.name === "list_things")).toBe(true);
  });
});

describe("runAgent write confirmation", () => {
  it("routes write tools through propose_actions and emits a confirmation plan", async () => {
    const tools = [makeReadTool(() => ({ items: [] })), makeWriteTool()];
    const provider = makeProvider([
      {
        content: "",
        toolCalls: [
          {
            name: "propose_actions",
            arguments: {
              summary: "Create a thing",
              actions: [{ tool: "create_thing", arguments: { name: "AI" } }],
            },
          },
        ],
      },
    ]);
    const events = await collect(provider, tools);
    const plan = events.find((e) => e.type === "plan");
    expect(plan?.type === "plan").toBe(true);
    if (plan?.type === "plan") {
      expect(plan.plan.actions).toHaveLength(1);
      expect(plan.plan.actions[0].permission).toBe("write");
    }
    const result = events.find((e) => e.type === "result");
    expect(result?.type === "result" && result.result.kind).toBe("confirmation");
  });

  it("marks destructive actions", async () => {
    const tools = [makeDestructiveTool()];
    const provider = makeProvider([
      {
        content: "",
        toolCalls: [
          {
            name: "propose_actions",
            arguments: {
              summary: "Delete it",
              actions: [{ tool: "delete_thing", arguments: { id: "x" } }],
            },
          },
        ],
      },
    ]);
    const events = await collect(provider, tools);
    const plan = events.find((e) => e.type === "plan");
    if (plan?.type === "plan") {
      expect(plan.plan.actions[0].permission).toBe("destructive");
    } else {
      throw new Error("Expected plan event");
    }
  });
});

describe("runAgent invalid tool calls", () => {
  it("rejects unknown tools with a recoverable error", async () => {
    const tools = [makeReadTool(() => ({}))];
    const provider = makeProvider([{ content: "", toolCalls: [{ name: "totally_made_up", arguments: {} }] }]);
    const events = await collect(provider, tools);
    const error = events.find((e) => e.type === "error");
    expect(error?.type === "error").toBe(true);
    if (error?.type === "error") expect(error.recoverable).toBe(true);
  });

  it("validates read tool arguments and reports the error", async () => {
    const tool: ToolDefinition = {
      name: "needs_query",
      description: "needs query",
      permission: "read",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: () => ({ ok: true, content: null }),
    };
    const provider = makeProvider([
      { content: "", toolCalls: [{ name: "needs_query", arguments: {} }] },
      { content: "done" },
    ]);
    const events = await collect(provider, [tool]);
    const result = events.find((e) => e.type === "tool-result" && e.name === "needs_query");
    expect(result?.type === "tool-result" && result.result.ok).toBe(false);
  });

  it("refuses direct write tool calls (must go through propose_actions)", async () => {
    const tools = [makeWriteTool()];
    const provider = makeProvider([
      { content: "", toolCalls: [{ name: "create_thing", arguments: { name: "x" } }] },
      { content: "ok" },
    ]);
    const events = await collect(provider, tools);
    const toolResult = events.find((e) => e.type === "tool-result" && e.name === "create_thing");
    expect(toolResult?.type === "tool-result" && toolResult.result.ok).toBe(false);
  });
});

describe("runAgent provider failure", () => {
  it("returns a recoverable error when the provider throws", async () => {
    const failingProvider: AIProvider = {
      id: "fail",
      label: "Fail",
      isConfigured: () => true,
      chat: async () => {
        throw new Error("network down");
      },
    };
    const events: AgentStreamEvent[] = [];
    await runAgent({
      request: "hi",
      provider: failingProvider,
      config: { baseUrl: "http://x", apiKey: "k", model: "m" },
      tools: [],
      context,
      emit: (e) => events.push(e),
    });
    const error = events.find((e) => e.type === "error");
    expect(error?.type === "error").toBe(true);
    if (error?.type === "error") {
      expect(error.message).toContain("network down");
      expect(error.recoverable).toBe(true);
    }
  });

  it("returns a recoverable error when provider is not configured", async () => {
    const provider = makeProvider([]);
    const events: AgentStreamEvent[] = [];
    await runAgent({
      request: "hi",
      provider,
      config: { baseUrl: "", apiKey: "", model: "" },
      tools: [],
      context,
      emit: (e) => events.push(e),
    });
    const error = events.find((e) => e.type === "error");
    expect(error?.type === "error").toBe(true);
  });
});

describe("runAgent iteration limit", () => {
  it(`stops after ${AGENT_MAX_ITERATIONS} iterations of only read calls`, async () => {
    const tools = [makeReadTool(() => ({}))];
    const responses = Array.from({ length: AGENT_MAX_ITERATIONS + 2 }, () => ({
      content: "",
      toolCalls: [{ name: "list_things", arguments: {} }],
    }));
    const provider = makeProvider(responses);
    const events = await collect(provider, tools);
    const error = events.find((e) => e.type === "error");
    expect(error?.type === "error").toBe(true);
    if (error?.type === "error") expect(error.message).toContain("maximum");
  });
});

describe("applyActionPlan", () => {
  it("executes write actions and reports counts", async () => {
    let created = 0;
    const write: ToolDefinition = {
      name: "create_thing",
      description: "create",
      permission: "write",
      inputSchema: z.object({ name: z.string() }),
      execute: () => {
        created++;
        return { ok: true, content: null };
      },
    };
    const plan = {
      summary: "create two",
      actions: [
        { id: "1", tool: "create_thing", arguments: { name: "a" }, permission: "write" as const, title: "a" },
        { id: "2", tool: "create_thing", arguments: { name: "b" }, permission: "write" as const, title: "b" },
      ],
    };
    const { applied, failed, audit } = await applyActionPlan(plan, [write], context, () => {});
    expect(applied).toBe(2);
    expect(failed).toBe(0);
    expect(created).toBe(2);
    expect(audit.every((a) => a.ok)).toBe(true);
  });

  it("counts failures without throwing", async () => {
    const bad: ToolDefinition = {
      name: "create_thing",
      description: "create",
      permission: "write",
      inputSchema: z.object({ name: z.string() }),
      execute: () => ({ ok: false, content: null, error: "nope" }),
    };
    const plan = {
      summary: "fail",
      actions: [{ id: "1", tool: "create_thing", arguments: { name: "a" }, permission: "write" as const, title: "a" }],
    };
    const { applied, failed } = await applyActionPlan(plan, [bad], context, () => {});
    expect(applied).toBe(0);
    expect(failed).toBe(1);
  });
});
