import { AppState } from "./state/app-state";
import { TerminalManager } from "./terminal/terminal-manager";
import { UIRenderer } from "./ui/renderer";
import { KeybindHandler } from "./ui/keybind-handler";
import { CommandPalette } from "./ui/command-palette";

class KnotApp {
  state: AppState;
  terminalManager: TerminalManager;
  ui: UIRenderer;
  keybindHandler: KeybindHandler;
  commandPalette: CommandPalette;

  constructor() {
    this.state = new AppState();
    this.terminalManager = new TerminalManager(this.state);
    this.ui = new UIRenderer(this.state, this.terminalManager);
    this.keybindHandler = new KeybindHandler(this.state, this);
    this.commandPalette = new CommandPalette(this.state, this);
  }

  async init(): Promise<void> {
    console.log("[knot] init: loading config...");
    await this.state.loadConfig();
    console.log("[knot] init: config loaded", this.state.config?.shell);

    const workspaces = await this.state.loadWorkspaces();
    console.log("[knot] init: workspaces loaded:", workspaces.length);
    if (workspaces.length === 0) {
      await this.createDefaultWorkspace();
      console.log("[knot] init: default workspace created");
    }

    this.ui.render();
    this.keybindHandler.attach();

    // MUST await listeners before creating any terminal,
    // otherwise PTY output events are lost.
    console.log("[knot] init: setting up event listeners...");
    await this.setupEventListeners();
    console.log("[knot] init: listeners ready");

    const activeWs = this.state.activeWorkspace();
    if (activeWs && activeWs.terminals.length === 0) {
      console.log("[knot] init: creating first terminal...");
      await this.executeAction("new_terminal");
      console.log("[knot] init: first terminal created, activeTerminalId =", this.state.activeTerminalId);
    }
  }

  private async createDefaultWorkspace(): Promise<void> {
    const cwd = await this.getCwd();
    await this.state.createWorkspace("default", cwd);
  }

  private async getCwd(): Promise<string> {
    try {
      const { resolveResource, homeDir } = await import("@tauri-apps/api/path");
      const home = await homeDir();
      console.log("[knot] getCwd: homeDir =", home);
      return home;
    } catch (e) {
      console.warn("[knot] getCwd failed, using /home fallback:", e);
      // Fallback: resolve home from environment
      return "/home";
    }
  }

  private async setupEventListeners(): Promise<void> {
    await this.state.onTerminalOutput((terminalId: string, data: Uint8Array) => {
      this.terminalManager.writeToXterm(terminalId, data);
    });

    await this.state.onTerminalExit((terminalId: string) => {
      this.terminalManager.handleExit(terminalId);
      this.ui.render();
    });

    await this.state.onConfigReloaded(() => {
      this.state.loadConfig().then(() => {
        this.terminalManager.applyConfig(this.state.config);
        this.ui.render();
      });
    });
  }

  async executeAction(action: string): Promise<void> {
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
      case "new_workspace": {
        const cwd = await this.getCwd();
        const name = `workspace-${this.state.workspaces.length + 1}`;
        await this.state.createWorkspace(name, cwd);
        await this.terminalManager.createTerminal(this.state.activeWorkspaceId!);
        this.ui.render();
        break;
      }
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

const app = new KnotApp();
app.init().catch((err) => {
  console.error("knot failed to initialize:", err);
  document.getElementById("app")!.textContent = `Failed to start: ${err.message}`;
});

(window as any).__knot = app;
