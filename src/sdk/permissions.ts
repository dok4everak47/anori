import type { ExtensionManifest, ExtensionPermission, ToolPermission } from "./types";

export function hasPermission(manifest: ExtensionManifest, permission: ExtensionPermission): boolean {
  return manifest.permissions?.includes(permission) ?? false;
}

export function requirePermission(manifest: ExtensionManifest, permission: ExtensionPermission): void {
  if (!hasPermission(manifest, permission)) {
    throw new PermissionError(
      `Extension "${manifest.id}" does not have the "${permission}" permission. Declare it in the manifest.`,
      permission,
    );
  }
}

export function toolPermissionToManifest(permission: ToolPermission): ExtensionPermission | null {
  switch (permission) {
    case "read":
      return "tools.register";
    case "write":
      return "tools.register";
    case "destructive":
      return "tools.register";
    default:
      return null;
  }
}

export class PermissionError extends Error {
  readonly permission: ExtensionPermission;

  constructor(message: string, permission: ExtensionPermission) {
    super(message);
    this.name = "PermissionError";
    this.permission = permission;
  }
}

export function canRegisterTool(manifest: ExtensionManifest, toolPermission: ToolPermission): boolean {
  if (!hasPermission(manifest, "tools.register")) return false;
  if (toolPermission === "destructive") return hasPermission(manifest, "bookmarks.delete");
  if (toolPermission === "write") return hasPermission(manifest, "bookmarks.write");
  return hasPermission(manifest, "bookmarks.read");
}

export function assertCanRegisterTool(manifest: ExtensionManifest, toolPermission: ToolPermission): void {
  requirePermission(manifest, "tools.register");
  if (toolPermission === "destructive") {
    requirePermission(manifest, "bookmarks.delete");
  } else if (toolPermission === "write") {
    requirePermission(manifest, "bookmarks.write");
  } else {
    requirePermission(manifest, "bookmarks.read");
  }
}
