import type { ExtensionLogger } from "./types";

export function createExtensionLogger(extensionId: string): ExtensionLogger {
  const prefix = `[extension:${extensionId}]`;
  return {
    info: (message, ...args) => console.info(prefix, message, ...args),
    warn: (message, ...args) => console.warn(prefix, message, ...args),
    error: (message, ...args) => console.error(prefix, message, ...args),
  };
}
