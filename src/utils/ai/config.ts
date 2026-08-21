import { anoriSchema, getAnoriStorage } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import { z } from "zod";
import type { AIProviderConfig } from "./types";

export const AI_CONFIG_ID = "anori-ai";

export const aiConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export type AIConfig = z.infer<typeof aiConfigSchema>;

const configQuery = anoriSchema.pluginConfig.config.byId(AI_CONFIG_ID);

export function useAIConfig(): readonly [AIConfig | undefined, (value: AIConfig) => Promise<void>] {
  const [raw, setRaw] = useStorageValue(configQuery);

  const parsed = (() => {
    if (!raw || typeof raw !== "object") return undefined;
    const result = aiConfigSchema.safeParse(raw);
    return result.success ? result.data : undefined;
  })();

  const setConfig = async (value: AIConfig): Promise<void> => {
    await setRaw(value as unknown as Record<string, unknown>);
  };

  return [parsed, setConfig] as const;
}

export async function getAIConfig(): Promise<AIProviderConfig | undefined> {
  const storage = await getAnoriStorage();
  const raw = storage.get(configQuery);
  if (!raw || typeof raw !== "object") return undefined;
  const result = aiConfigSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}
