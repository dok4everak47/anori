import type { AnoriExtension, ExtensionManifest, ExtensionPermission } from "./types";

const KNOWN_PERMISSIONS: ReadonlySet<ExtensionPermission> = new Set<ExtensionPermission>([
  "commands.register",
  "tools.register",
  "bookmarks.read",
  "bookmarks.write",
  "bookmarks.delete",
  "workspace.read",
  "events.read",
]);

export type ExtensionFactory = {
  manifest: ExtensionManifest;
  activate: AnoriExtension["activate"];
  deactivate?: AnoriExtension["deactivate"];
};

export function defineExtension(factory: ExtensionFactory): AnoriExtension {
  return {
    manifest: validateManifest(factory.manifest),
    activate: factory.activate,
    deactivate: factory.deactivate,
  };
}

export function validateManifest(manifest: ExtensionManifest): ExtensionManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Extension manifest must be an object.");
  }
  if (typeof manifest.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) {
    throw new Error(`Invalid extension id "${String(manifest.id)}". Use lowercase letters, numbers and dashes.`);
  }
  if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
    throw new Error(`Extension "${manifest.id}" is missing a name.`);
  }
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    throw new Error(`Extension "${manifest.id}" has an invalid version (expected semver, e.g. 1.0.0).`);
  }
  if (manifest.permissions) {
    if (!Array.isArray(manifest.permissions)) {
      throw new Error(`Extension "${manifest.id}" permissions must be an array.`);
    }
    for (const permission of manifest.permissions) {
      if (!KNOWN_PERMISSIONS.has(permission as ExtensionPermission)) {
        throw new Error(`Extension "${manifest.id}" declares an unknown permission "${String(permission)}".`);
      }
    }
  }
  return { ...manifest, permissions: manifest.permissions ? Array.from(new Set(manifest.permissions)) : [] };
}
