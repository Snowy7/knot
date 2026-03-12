/**
 * Central app state — manages workspaces, terminals, and config.
 * Communicates with Rust backend via Tauri IPC.
 */
export class AppState {
  constructor() {
    this.workspaces = [];
    this.activeWorkspaceId = null;
    this.activeTerminalId = null;
    this.maximizedPane = null;
    this.config = null;

    // Event listeners
    this._listeners = {
      terminalOutput: [],
      terminalExit: [],
      configReloaded: [],
    };
  }

  // ── Config ──────────────────────────────────────────────

  async loadConfig() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      this.config = await invoke("get_config");
    } catch {
      // Fallback defaults when running outside Tauri (dev mode)
      this.config = {
        shell: { program: "/bin/bash", args: [] },
        font: { family: "JetBrains Mono", size: 14, line_height: 1.2, ligatures: false, weight: 400 },
        theme: { name: "knot-dark", custom: null },
        window: { opacity: 1.0, blur: false, padding: 8, decorations: true },
        terminal: { scrollback: 10000, cursor_style: "block", cursor_blink: true, copy_on_select: true, clickable_urls: true, bell: "visual" },
        keybindings: { leader: "ctrl+a", bindings: {}, leader_bindings: {} },
      };
    }
  }

  adjustFontSize(delta) {
    if (this.config) {
      this.config.font.size = Math.max(8, Math.min(32, this.config.font.size + delta));
    }
  }

  resetFontSize() {
    if (this.config) {
      this.config.font.size = 14;
    }
  }

  // ── Workspaces ──────────────────────────────────────────

  async loadWorkspaces() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      this.workspaces = await invoke("list_workspaces");
      if (this.workspaces.length > 0 && !this.activeWorkspaceId) {
        this.activeWorkspaceId = this.workspaces[0].id;
      }
    } catch {
      this.workspaces = [];
    }
    return this.workspaces;
  }

  async createWorkspace(name, cwd) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const ws = await invoke("create_workspace", { name, cwd });
      this.workspaces.push(ws);
      this.activeWorkspaceId = ws.id;
      return ws;
    } catch (e) {
      console.error("Failed to create workspace:", e);
      // Fallback for dev mode
      const ws = {
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

  activeWorkspace() {
    return this.workspaces.find((ws) => ws.id === this.activeWorkspaceId) || null;
  }

  cycleWorkspace(direction) {
    if (this.workspaces.length === 0) return;
    const idx = this.workspaces.findIndex((ws) => ws.id === this.activeWorkspaceId);
    const next = (idx + direction + this.workspaces.length) % this.workspaces.length;
    this.activeWorkspaceId = this.workspaces[next].id;
    // Set active terminal to first in new workspace
    const ws = this.activeWorkspace();
    if (ws && ws.terminals.length > 0) {
      this.activeTerminalId = ws.terminals[0].id;
    }
  }

  // ── Terminals ───────────────────────────────────────────

  cycleTerminal(direction) {
    const ws = this.activeWorkspace();
    if (!ws || ws.terminals.length === 0) return;
    const idx = ws.terminals.findIndex((t) => t.id === this.activeTerminalId);
    const next = (idx + direction + ws.terminals.length) % ws.terminals.length;
    this.activeTerminalId = ws.terminals[next].id;
  }

  gotoTerminal(index) {
    const ws = this.activeWorkspace();
    if (!ws || index >= ws.terminals.length || index < 0) return;
    this.activeTerminalId = ws.terminals[index].id;
  }

  focusDirection(direction) {
    // TODO: Implement layout-aware directional focus
    // For now, just cycle
    if (direction === "right" || direction === "down") {
      this.cycleTerminal(1);
    } else {
      this.cycleTerminal(-1);
    }
  }

  toggleMaximize() {
    if (this.maximizedPane) {
      this.maximizedPane = null;
    } else {
      this.maximizedPane = this.activeTerminalId;
    }
  }

  equalizePanes() {
    this.maximizedPane = null;
    // TODO: Reset all split ratios to 0.5
  }

  // ── Events from Rust ────────────────────────────────────

  onTerminalOutput(callback) {
    this._setupTauriListener("terminal-output", (event) => {
      callback(event.payload.terminal_id, new Uint8Array(event.payload.data));
    });
  }

  onTerminalExit(callback) {
    this._setupTauriListener("terminal-exit", (event) => {
      callback(event.payload);
    });
  }

  onConfigReloaded(callback) {
    this._setupTauriListener("config-reloaded", () => {
      callback();
    });
  }

  async _setupTauriListener(eventName, handler) {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      listen(eventName, handler);
    } catch {
      // Not in Tauri environment
    }
  }
}
