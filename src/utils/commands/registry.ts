import { CommandExecutionError, CommandNotFoundError, CommandPermissionError } from "./errors";
import type { Command, CommandContext, CommandRegistry, CommandResult } from "./types";

export const createCommandRegistry = (initialCommands: Command[] = []): CommandRegistry => {
  const commandsMap = new Map<string, Command>();

  for (const cmd of initialCommands) {
    commandsMap.set(cmd.id, cmd);
  }

  const register = (command: Command): (() => void) => {
    commandsMap.set(command.id, command);
    return () => {
      commandsMap.delete(command.id);
    };
  };

  const unregister = (id: string) => {
    commandsMap.delete(id);
  };

  const get = (id: string): Command | undefined => {
    return commandsMap.get(id);
  };

  const list = (): Command[] => {
    return Array.from(commandsMap.values());
  };

  const execute = async (id: string, context: CommandContext): Promise<CommandResult> => {
    const command = commandsMap.get(id);
    if (!command) {
      return { success: false, error: `Command "${id}" not found`, errorCode: "COMMAND_NOT_FOUND", recoverable: true };
    }

    if (command.when) {
      try {
        const available = command.when(context);
        if (!available) {
          return {
            success: false,
            error: `Command "${id}" is not available in this context`,
            errorCode: "COMMAND_PERMISSION_ERROR",
            recoverable: true,
          };
        }
      } catch (e) {
        return {
          success: false,
          error: `Command "${id}" when() check failed: ${e instanceof Error ? e.message : String(e)}`,
          errorCode: "COMMAND_WHEN_ERROR",
          recoverable: true,
        };
      }
    }

    try {
      const result = await command.execute(context);
      return result;
    } catch (e) {
      if (
        e instanceof CommandExecutionError ||
        e instanceof CommandNotFoundError ||
        e instanceof CommandPermissionError
      ) {
        return {
          success: false,
          error: e.message,
          errorCode: e.code,
          recoverable: e.recoverable,
        };
      }
      return {
        success: false,
        error: `Command "${id}" execution failed: ${e instanceof Error ? e.message : String(e)}`,
        errorCode: "COMMAND_EXECUTION_ERROR",
        recoverable: false,
      };
    }
  };

  const search = (query: string, context?: CommandContext): Command[] => {
    const allCommands = Array.from(commandsMap.values()).filter((cmd) => {
      if (cmd.when && context) {
        try {
          return cmd.when(context);
        } catch {
          return false;
        }
      }
      return true;
    });

    if (!query.trim()) {
      return allCommands;
    }

    const q = query.toLowerCase().trim();
    const scored: { command: Command; score: number }[] = [];

    for (const cmd of allCommands) {
      const titleLower = cmd.title.toLowerCase();
      const descLower = cmd.description?.toLowerCase() ?? "";

      let score = 0;

      if (titleLower === q) {
        score = 120;
      } else if (titleLower.startsWith(q)) {
        score = 100;
      } else if (titleLower.includes(q)) {
        score = 60;
      } else if (descLower.startsWith(q)) {
        score = 40;
      } else if (descLower.includes(q)) {
        score = 20;
      }

      if (score === 0 && cmd.keywords) {
        const keywordMatch = cmd.keywords.find((kw) => kw.toLowerCase().includes(q));
        if (keywordMatch) {
          score = 30;
        }
      }

      if (score > 0) {
        scored.push({ command: cmd, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.command);
  };

  const getByCategory = (category: string): Command[] => {
    return Array.from(commandsMap.values()).filter((cmd) => cmd.category === category);
  };

  return {
    get commands() {
      return Array.from(commandsMap.values());
    },
    register,
    unregister,
    get,
    list,
    execute,
    search,
    getByCategory,
  };
};
