import type { Workspace, KnotConfig } from "../types";

/**
 * Central app state — manages workspaces, terminals, and config.
 * Communicates with Rust backend via Tauri IPC.
 */
export class AppState {
  workspaces: Workspace[] = [];
  activeWorkspaceId: string | null = null;
  activeTerminalId: string | null = null;
  maximizedPane: string | null = null;
  config: KnotConfig | null = null;

  // ── Config ──────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      this.config = await invoke<KnotConfig>("get_config");
    } catch {
      this.config = {
        shell: { program: "/bin/bash", args: [] },
        font: { family: "JetBrains Mono", size: 14, line_height: 1.2, ligatures: false, weight: 400 },
        theme: { name: "knot-dark" },
        window: { opacity: 1.0, blur: false, padding: 8, decorations: true },
        terminal: { scrollback: 10000, cursor_style: "block", cursor_blink: true, copy_on_select: true, clickable_urls: true, bell: "visual" },
        keybindings: { leader: "ctrl+a", bindings: {}, leader_bindings: {} },
      };
    }
  }

  adjustFontSize(delta: number): void {
    if (this.config) {
      this.config.font.size = Math.max(8, Math.min(32, this.config.font.size + delta));
    }
  }

  resetFontSize(): void {
    if (this.config) {
      this.config.font.size = 14;
    }
  }

  // ── Workspaces ──────────────────────────────────────────

  async loadWorkspaces(): Promise<Workspace[]> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      this.workspaces = await invoke<Workspace[]>("list_workspaces");
      if (this.workspaces.length > 0 && !this.activeWorkspaceId) {
        this.activeWorkspaceId = this.workspaces[0].id;
      }
    } catch {
      this.workspaces = [];
    }
    return this.workspaces;
  }

  async createWorkspace(name: string, cwd: string): Promise<Workspace> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const ws = await invoke<Workspace>("create_workspace", { name, cwd });
      this.workspaces.push(ws);
      this.activeWorkspaceId = ws.id;
      return ws;
    } catch (e) {
      console.error("Failed to create workspace:", e);
      const ws: Workspace = {
        id: crypto.randomUUID(),
        name,
        cwd,
        terminals: [],
        layout: { type: "pane", pane_id: "default" },
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
      };
      this.workspaces.push(ws);
      this.activeWorkspaceId = ws.id;
      return ws;
    }
  }

  activeWorkspace(): Workspace | null {
    return this.workspaces.find((ws) => ws.id === this.activeWorkspaceId) ?? null;
  }

  cycleWorkspace(direction: number): void {
    if (this.workspaces.length === 0) return;
    const idx = this.workspaces.findIndex((ws) => ws.id === this.activeWorkspaceId);
    const next = (idx + direction + this.workspaces.length) % this.workspaces.length;
    this.activeWorkspaceId = this.workspaces[next].id;
    const ws = this.activeWorkspace();
    if (ws && ws.terminals.length > 0) {
      this.activeTerminalId = ws.terminals[0].id;
    }
  }

  // ── Terminals ───────────────────────────────────────────

  cycleTerminal(direction: number): void {
    const ws = this.activeWorkspace();
    if (!ws || ws.terminals.length === 0) return;
    const idx = ws.terminals.findIndex((t) => t.id === this.activeTerminalId);
    const next = (idx + direction + ws.terminals.length) % ws.terminals.length;
    this.activeTerminalId = ws.terminals[next].id;
  }

  gotoTerminal(index: number): void {
    const ws = this.activeWorkspace();
    if (!ws || index >= ws.terminals.length || index < 0) return;
    this.activeTerminalId = ws.terminals[index].id;
  }

  focusDirection(direction: string): void {
    if (direction === "right" || direction === "down") {
      this.cycleTerminal(1);
    } else {
      this.cycleTerminal(-1);
    }
  }

  toggleMaximize(): void {
    if (this.maximizedPane) {
      this.maximizedPane = null;
    } else {
      this.maximizedPane = this.activeTerminalId;
    }
  }

  equalizePanes(): void {
    this.maximizedPane = null;
  }

  // ── Events from Rust ────────────────────────────────────

  onTerminalOutput(callback: (terminalId: string, data: Uint8Array) => void): void {
    this._setupTauriListener("terminal-output", (event: any) => {
      callback(event.payload.terminal_id, new Uint8Array(event.payload.data));
    });
  }

  onTerminalExit(callback: (terminalId: string) => void): void {
    this._setupTauriListener("terminal-exit", (event: any) => {
      callback(event.payload);
    });
  }

  onConfigReloaded(callback: () => void): void {
    this._setupTauriListener("config-reloaded", () => {
      callback();
    });
  }

  private async _setupTauriListener(eventName: string, handler: (event: any) => void): Promise<void> {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      listen(eventName, handler);
    } catch {
      // Not in Tauri environment
    }
  }
}
