import type { AIProvider, AIProviderChatRequest, AIProviderChatResponse, AIProviderConfig, ToolCall } from "./types";

type ChatCompletionToolCall = {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ChatCompletionToolCall[];
  tool_call_id?: string;
  name?: string;
};

function parseToolCalls(raw: ChatCompletionToolCall[] | undefined): ToolCall[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const calls: ToolCall[] = [];
  for (const call of raw) {
    if (call.type !== "function") continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
    calls.push({ name: call.function.name, arguments: args });
  }
  return calls.length ? calls : undefined;
}

export class HttpAIProvider implements AIProvider {
  readonly id = "http";
  readonly label = "OpenAI-compatible";

  isConfigured(config: AIProviderConfig): boolean {
    return Boolean(config.baseUrl && config.apiKey && config.model);
  }

  async chat(request: AIProviderChatRequest, config: AIProviderConfig): Promise<AIProviderChatResponse> {
    const messages: ChatCompletionMessage[] = request.messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.toolName,
          name: m.toolName,
        };
      }
      if (m.role === "assistant" && m.toolCalls) {
        return {
          role: "assistant",
          content: m.content,
          tool_calls: m.toolCalls.map((tc, i) => ({
            id: `call_${i}`,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          tools: request.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          tool_choice: "auto",
          temperature: 0.2,
        }),
      });
    } catch (e) {
      throw new Error(
        `Cannot reach AI provider at ${config.baseUrl}: ${e instanceof Error ? e.message : "network error"}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI provider returned ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatCompletionToolCall[] } }>;
    };
    const message = data.choices?.[0]?.message;
    return {
      content: message?.content ?? "",
      toolCalls: parseToolCalls(message?.tool_calls),
    };
  }
}

export const httpAIProvider = new HttpAIProvider();
