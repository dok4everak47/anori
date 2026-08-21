import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as sdk from "@anori/sdk";
import { defineExtension, PermissionError } from "@anori/sdk";
import { describe, expect, it } from "vitest";

const sdkDir = fileURLToPath(new URL("../../src/sdk", import.meta.url));

describe("@anori/sdk public surface", () => {
  it("exports defineExtension and PermissionError as runtime values", () => {
    expect(typeof defineExtension).toBe("function");
    expect(typeof PermissionError).toBe("function");
  });

  it("does not leak internal host/runtime modules through the public entry", () => {
    expect(sdk).not.toHaveProperty("createExtensionHost");
    expect(sdk).not.toHaveProperty("initExtensionRuntime");
    expect(sdk).not.toHaveProperty("loadExtension");
    expect(sdk).not.toHaveProperty("appCommandRegistry");
    expect(sdk).not.toHaveProperty("getAppBookmarkService");
  });

  it("public entry graph (index → define/permissions/types) never imports Anori internal aliases", () => {
    const publicFiles = [
      "index.ts",
      "define-extension.ts",
      "types.ts",
      "permissions.ts",
      "logger.ts",
      "events.ts",
      "confirmation.ts",
    ];
    const forbidden = /@anori\/(utils|components|plugins|assets|design-system|cloud-integration|translations)/;
    const violations: string[] = [];
    for (const file of publicFiles) {
      const src = readFileSync(`${sdkDir}/${file}`, "utf8");
      for (const line of src.split("\n")) {
        if (forbidden.test(line)) violations.push(`${file}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("internal SDK host modules are allowed to bridge to core (documented boundary)", () => {
    const internal = `${sdkDir}/bookmarks-api.ts`;
    const src = readFileSync(internal, "utf8");
    expect(src).toContain("@anori/utils/bookmark-service");
  });

  it("the extension itself only imports from @anori/sdk and relative files", () => {
    const extDir = fileURLToPath(new URL("../src", import.meta.url));
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const p = `${dir}/${entry}`;
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (p.endsWith(".ts")) out.push(p);
      }
      return out;
    };
    const bad: string[] = [];
    for (const file of walk(extDir)) {
      const src = readFileSync(file, "utf8");
      for (const line of src.split("\n")) {
        const m = line.match(/from\s+"([^"]+)"/);
        if (!m || m[1] === undefined) continue;
        const spec = m[1];
        if (spec === "@anori/sdk" || spec === "zod" || spec.startsWith(".")) continue;
        bad.push(`${file}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
