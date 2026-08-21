import type { CommandContext } from "@anori/utils/commands/types";
import type { z } from "zod";

export type ToolPermission = "read" | "write" | "destructive";

export type ToolResult = {
  ok: boolean;
  content: unknown;
  error?: string;
};

export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  permission: ToolPermission;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolResult> | ToolResult;
};

export type ToolExecutionContext = {
  folderId: string;
  selection: CommandContext["selection"];
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ProposedAction = {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  permission: ToolPermission;
  title: string;
  detail?: string;
};

export type ActionPlan = {
  summary: string;
  actions: ProposedAction[];
};

export type AIResult =
  | { kind: "message"; text: string }
  | { kind: "action-plan"; plan: ActionPlan }
  | { kind: "confirmation"; plan: ActionPlan }
  | { kind: "error"; message: string; recoverable: boolean };

export type AgentStatus =
  | "idle"
  | "thinking"
  | "reading"
  | "planning"
  | "waiting-confirmation"
  | "applying"
  | "done"
  | "error";

export type AgentStreamEvent =
  | { type: "status"; status: AgentStatus; label: string }
  | { type: "message-delta"; text: string }
  | { type: "tool-call"; call: ToolCall; permission: ToolPermission }
  | { type: "tool-result"; name: string; result: ToolResult }
  | { type: "plan"; plan: ActionPlan }
  | { type: "result"; result: AIResult }
  | { type: "error"; message: string; recoverable: boolean };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolName: string; content: string; isError?: boolean };

export type AIProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AIProviderChatRequest = {
  messages: ChatMessage[];
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
};

export type AIProviderChatResponse = {
  content: string;
  toolCalls?: ToolCall[];
};

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(config: AIProviderConfig): boolean;
  chat(request: AIProviderChatRequest, config: AIProviderConfig): Promise<AIProviderChatResponse>;
}

export type AuditEntry = {
  timestamp: number;
  request: string;
  actions: Array<{ tool: string; permission: ToolPermission; argumentsSummary: string; ok: boolean; error?: string }>;
};
