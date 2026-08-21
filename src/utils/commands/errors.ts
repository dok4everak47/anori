export class CommandError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable = false,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export class CommandNotFoundError extends CommandError {
  constructor(id: string) {
    super(`Command "${id}" not found`, "COMMAND_NOT_FOUND", true);
    this.name = "CommandNotFoundError";
  }
}

export class CommandExecutionError extends CommandError {
  constructor(id: string, message: string, recoverable = false) {
    super(`Command "${id}" failed: ${message}`, "COMMAND_EXECUTION_ERROR", recoverable);
    this.name = "CommandExecutionError";
  }
}

export class CommandPermissionError extends CommandError {
  constructor(id: string) {
    super(`Command "${id}" is not available in this context`, "COMMAND_PERMISSION_ERROR", true);
    this.name = "CommandPermissionError";
  }
}
