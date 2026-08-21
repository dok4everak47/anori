import type { CommandContext } from "./types";

export const createCommandContext = (overrides?: Partial<CommandContext>): CommandContext => {
  return {
    selection: overrides?.selection ?? null,
  };
};

export const updateContext = (base: CommandContext, update: Partial<CommandContext>): CommandContext => {
  return {
    ...base,
    ...update,
  };
};
