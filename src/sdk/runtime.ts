import { createExtensionHost, type ExtensionHostDeps } from "./extension-host";
import type { AnoriExtension } from "./types";

let host: ReturnType<typeof createExtensionHost> | null = null;

export function initExtensionRuntime(deps: ExtensionHostDeps): ReturnType<typeof createExtensionHost> {
  if (host) return host;
  host = createExtensionHost(deps);
  return host;
}

export function getExtensionRuntime(): ReturnType<typeof createExtensionHost> | null {
  return host;
}

export function requireRuntime(): ReturnType<typeof createExtensionHost> {
  if (!host) {
    throw new Error("Extension runtime is not initialized. Call initExtensionRuntime() during app startup.");
  }
  return host;
}

export async function loadExtension(extension: AnoriExtension): Promise<void> {
  return requireRuntime().load(extension);
}

export async function unloadExtension(id: string): Promise<void> {
  return host?.unload(id);
}

export function listLoadedExtensions(): string[] {
  return host?.listLoaded() ?? [];
}

export async function disposeExtensionRuntime(): Promise<void> {
  if (host) {
    await host.dispose();
    host = null;
  }
}
