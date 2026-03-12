import { AppState } from "./state/app-state.js";
import { TerminalManager } from "./terminal/terminal-manager.js";
import { UIRenderer } from "./ui/renderer.js";
import { KeybindHandler } from "./ui/keybind-handler.js";
import { CommandPalette } from "./ui/command-palette.js";

class KnotApp {
  constructor() {
    this.state = new AppState();
    this.terminalManager = new TerminalManager(this.state);
    this.ui = new UIRenderer(this.state, this.terminalManager);
    this.keybindHandler = new KeybindHandler(this.state, this);
    this.commandPalette = new CommandPalette(this.state, this);
  }

  async init() {
    // Load config from Rust backend
    await this.state.loadConfig();

    // Restore saved workspaces or create default
    const workspaces = await this.state.loadWorkspaces();
    if (workspaces.length === 0) {
      await this.createDefaultWorkspace();
    }

    // Render initial UI
    this.ui.render();

    // Set up keybinding listener
    this.keybindHandler.attach();

    // Listen for backend events
    this.setupEventListeners();

    // Create initial terminal in active workspace
    const activeWs = this.state.activeWorkspace();
    if (activeWs && activeWs.terminals.length === 0) {
      await this.executeAction("new_terminal");
    }
  }

  async createDefaultWorkspace() {
    const cwd = await this.getCwd();
    await this.state.createWorkspace("default", cwd);
  }

  async getCwd() {
    // In Tauri, we can get the cwd. Fallback to home.
    try {
      const { homeDir } = await import("@tauri-apps/api/path");
      return await homeDir();
    } catch {
      return "~";
    }
  }

  setupEventListeners() {
    // Terminal output from Rust backend
    this.state.onTerminalOutput((terminalId, data) => {
      this.terminalManager.writeToXterm(terminalId, data);
    });

    // Terminal exited
    this.state.onTerminalExit((terminalId) => {
      this.terminalManager.handleExit(terminalId);
      this.ui.render();
    });

    // Config hot-reload
    this.state.onConfigReloaded(() => {
      this.state.loadConfig().then(() => {
        this.terminalManager.applyConfig(this.state.config);
        this.ui.render();
      });
    });
  }

  /// Execute a named action (from keybinding or command palette).
  async executeAction(action) {
    const ws = this.state.activeWorkspace();
    if (!ws) return;

    switch (action) {
      case "new_terminal":
        await this.terminalManager.createTerminal(ws.id);
        this.ui.render();
        break;

      case "close_terminal":
        await this.terminalManager.closeActiveTerminal(ws.id);
        this.ui.render();
        break;

      case "split_right":
        await this.terminalManager.splitTerminal(ws.id, "horizontal");
        this.ui.render();
        break;

      case "split_down":
        await this.terminalManager.splitTerminal(ws.id, "vertical");
        this.ui.render();
        break;

      case "next_terminal":
        this.state.cycleTerminal(1);
        this.ui.render();
        this.terminalManager.focusActive();
        break;

      case "prev_terminal":
        this.state.cycleTerminal(-1);
        this.ui.render();
        this.terminalManager.focusActive();
        break;

      case "focus_left":
      case "focus_right":
      case "focus_up":
      case "focus_down":
        this.state.focusDirection(action.replace("focus_", ""));
        this.ui.render();
        this.terminalManager.focusActive();
        break;

      case "toggle_maximize":
        this.state.toggleMaximize();
        this.ui.render();
        this.terminalManager.fitAll();
        break;

      case "equalize_panes":
        this.state.equalizePanes();
        this.ui.render();
        this.terminalManager.fitAll();
        break;

      case "new_workspace":
        const cwd = await this.getCwd();
        const name = `workspace-${this.state.workspaces.length + 1}`;
        await this.state.createWorkspace(name, cwd);
        await this.terminalManager.createTerminal(this.state.activeWorkspaceId);
        this.ui.render();
        break;

      case "next_workspace":
        this.state.cycleWorkspace(1);
        this.ui.render();
        this.terminalManager.focusActive();
        break;

      case "prev_workspace":
        this.state.cycleWorkspace(-1);
        this.ui.render();
        this.terminalManager.focusActive();
        break;

      case "command_palette":
        this.commandPalette.toggle();
        break;

      case "find":
        this.terminalManager.toggleSearch();
        break;

      case "copy":
        this.terminalManager.copy();
        break;

      case "paste":
        this.terminalManager.paste();
        break;

      case "zoom_in":
        this.state.adjustFontSize(1);
        this.terminalManager.applyConfig(this.state.config);
        break;

      case "zoom_out":
        this.state.adjustFontSize(-1);
        this.terminalManager.applyConfig(this.state.config);
        break;

      case "zoom_reset":
        this.state.resetFontSize();
        this.terminalManager.applyConfig(this.state.config);
        break;

      case "toggle_fullscreen":
        // Handled by Tauri window API
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const isFs = await win.isFullscreen();
          await win.setFullscreen(!isFs);
        } catch {}
        break;

      case "enter_copy_mode":
        this.terminalManager.enterCopyMode();
        break;

      default:
        // Handle goto_terminal_N
        if (action.startsWith("goto_terminal_")) {
          const n = parseInt(action.replace("goto_terminal_", ""), 10) - 1;
          this.state.gotoTerminal(n);
          this.ui.render();
          this.terminalManager.focusActive();
        }
        break;
    }
  }
}

// Boot
const app = new KnotApp();
app.init().catch((err) => {
  console.error("knot failed to initialize:", err);
  document.getElementById("app").textContent = `Failed to start: ${err.message}`;
});

// Expose for debugging
window.__knot = app;
