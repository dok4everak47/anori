import { spawn } from "node:child_process";
import type { FolderStore, WidgetInFolderShape } from "./shared/bookmark-service.js";

export class NativeBridgeStore implements FolderStore {
  private readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  async getFolders() {
    return this.call<Array<{ id: string; name: string }>>("store.getFolders", {});
  }

  async getWidgets(folderId: string): Promise<WidgetInFolderShape[]> {
    return this.call<WidgetInFolderShape[]>("store.getWidgets", { folderId });
  }

  async setWidgets(folderId: string, widgets: WidgetInFolderShape[]): Promise<void> {
    await this.call<void>("store.setWidgets", { folderId, widgets });
  }

  private call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const child = spawn(this.host, [method], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", () => {
        reject(
          new Error(
            `Anori native bridge "${this.host}" is not installed. ` +
              "The MCP server runs, but it cannot read live extension data without the bridge. " +
              "Set ANORI_MCP_MODE=memory for a local demo, or install the native messaging host (see docs/mcp.md).",
          ),
        );
      });
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Native bridge exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim() || "null") as T);
        } catch {
          reject(new Error("Invalid JSON from native bridge."));
        }
      });
      child.stdin.write(JSON.stringify({ method, params }));
      child.stdin.end();
    });
  }
}
