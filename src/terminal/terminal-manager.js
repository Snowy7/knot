import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";

/**
 * Manages xterm.js instances and their connection to Rust PTY sessions.
 */
export class TerminalManager {
  constructor(appState) {
    this.state = appState;
    /** @type {Map<string, {term: Terminal, fit: FitAddon, search: SearchAddon, container: HTMLElement}>} */
    this.instances = new Map();
  }

  /**
   * Create a new terminal in the given workspace.
   */
  async createTerminal(workspaceId, splitFrom = null, splitDirection = null) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      const result = await invoke("create_terminal", {
        workspaceId,
        title: null,
        shell: null,
        cwd: null,
        cols: 120,
        rows: 30,
        splitFrom,
        splitDirection,
      });

      const terminalId = result.terminal_id;
      const paneId = result.pane_id;

      // Create xterm instance
      const instance = this._createXtermInstance(terminalId);

      // Wire input to Rust PTY
      instance.term.onData(async (data) => {
        try {
          await invoke("write_to_terminal", {
            terminalId,
            data: Array.from(new TextEncoder().encode(data)),
          });
        } catch (e) {
          console.error("write failed:", e);
        }
      });

      // Wire resize to Rust PTY
      instance.term.onResize(async ({ cols, rows }) => {
        try {
          await invoke("resize_terminal", { terminalId, cols, rows });
        } catch (e) {
          console.error("resize failed:", e);
        }
      });

      // Update state
      this.state.activeTerminalId = terminalId;
      await this.state.loadWorkspaces();

      return terminalId;
    } catch (e) {
      console.error("Failed to create terminal:", e);
      // Dev mode fallback — create a local-only xterm
      return this._createDevTerminal(workspaceId);
    }
  }

  /**
   * Create an xterm.js instance with all addons.
   */
  _createXtermInstance(terminalId) {
    const config = this.state.config || {};
    const fontConfig = config.font || {};
    const termConfig = config.terminal || {};

    const term = new Terminal({
      fontFamily: fontConfig.family || "JetBrains Mono, monospace",
      fontSize: fontConfig.size || 14,
      lineHeight: fontConfig.line_height || 1.2,
      fontWeight: String(fontConfig.weight || 400),
      cursorStyle: termConfig.cursor_style || "block",
      cursorBlink: termConfig.cursor_blink !== false,
      scrollback: termConfig.scrollback || 10000,
      allowProposedApi: true,
      theme: this._getTheme(),
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
    });

    const fit = new FitAddon();
    const search = new SearchAddon();

    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());

    // Create container element
    const container = document.createElement("div");
    container.className = "terminal-container";
    container.dataset.terminalId = terminalId;

    this.instances.set(terminalId, { term, fit, search, container });
    return { term, fit, search, container };
  }

  /**
   * Dev mode fallback — no Tauri backend.
   */
  _createDevTerminal(workspaceId) {
    const terminalId = crypto.randomUUID();
    const instance = this._createXtermInstance(terminalId);

    // Fake a workspace terminal entry
    const ws = this.state.activeWorkspace();
    if (ws) {
      ws.terminals.push({
        id: terminalId,
        title: "shell",
        pane_id: crypto.randomUUID(),
      });
    }

    this.state.activeTerminalId = terminalId;
    instance.term.write("knot terminal (dev mode)\r\n$ ");
    instance.term.onData((data) => {
      instance.term.write(data);
    });

    return terminalId;
  }

  /**
   * Mount an xterm instance into a DOM element.
   */
  mount(terminalId, parentElement) {
    const instance = this.instances.get(terminalId);
    if (!instance) return;

    if (!instance.term.element) {
      instance.term.open(parentElement);

      // Try WebGL renderer for performance
      try {
        instance.term.loadAddon(new WebglAddon());
      } catch (e) {
        console.warn("WebGL addon failed, using canvas renderer:", e);
      }
    } else {
      parentElement.appendChild(instance.term.element);
    }

    // Fit after mount
    requestAnimationFrame(() => {
      instance.fit.fit();
    });
  }

  /**
   * Write data from Rust PTY to xterm.
   */
  writeToXterm(terminalId, data) {
    const instance = this.instances.get(terminalId);
    if (instance) {
      instance.term.write(data);
    }
  }

  /**
   * Handle terminal process exit.
   */
  handleExit(terminalId) {
    const instance = this.instances.get(terminalId);
    if (instance) {
      instance.term.write("\r\n[Process exited]\r\n");
    }
  }

  /**
   * Close the currently active terminal.
   */
  async closeActiveTerminal(workspaceId) {
    const terminalId = this.state.activeTerminalId;
    if (!terminalId) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_terminal", { workspaceId, terminalId });
    } catch {}

    const instance = this.instances.get(terminalId);
    if (instance) {
      instance.term.dispose();
      this.instances.delete(terminalId);
    }

    await this.state.loadWorkspaces();
    this.state.cycleTerminal(-1);
  }

  /**
   * Split from the active terminal.
   */
  async splitTerminal(workspaceId, direction) {
    const ws = this.state.activeWorkspace();
    if (!ws) return;

    const activeTerminal = ws.terminals.find((t) => t.id === this.state.activeTerminalId);
    const splitFrom = activeTerminal ? activeTerminal.pane_id : null;

    await this.createTerminal(workspaceId, splitFrom, direction);
  }

  /**
   * Focus the active terminal's xterm instance.
   */
  focusActive() {
    const instance = this.instances.get(this.state.activeTerminalId);
    if (instance) {
      instance.term.focus();
    }
  }

  /**
   * Fit all terminal instances to their containers.
   */
  fitAll() {
    for (const [, instance] of this.instances) {
      try {
        instance.fit.fit();
      } catch {}
    }
  }

  /**
   * Apply config changes to all terminals.
   */
  applyConfig(config) {
    const fontConfig = config?.font || {};
    const theme = this._getTheme();

    for (const [, instance] of this.instances) {
      instance.term.options.fontFamily = fontConfig.family || "JetBrains Mono, monospace";
      instance.term.options.fontSize = fontConfig.size || 14;
      instance.term.options.lineHeight = fontConfig.line_height || 1.2;
      instance.term.options.theme = theme;
      instance.fit.fit();
    }
  }

  toggleSearch() {
    const instance = this.instances.get(this.state.activeTerminalId);
    if (instance) {
      // TODO: Show search UI
    }
  }

  copy() {
    const instance = this.instances.get(this.state.activeTerminalId);
    if (instance && instance.term.hasSelection()) {
      navigator.clipboard.writeText(instance.term.getSelection());
    }
  }

  async paste() {
    const instance = this.instances.get(this.state.activeTerminalId);
    if (instance) {
      const text = await navigator.clipboard.readText();
      instance.term.paste(text);
    }
  }

  enterCopyMode() {
    // TODO: Implement vi-style copy mode
  }

  _getTheme() {
    return {
      background: "#0a0a0c",
      foreground: "#d4d4d8",
      cursor: "#d4d4d8",
      cursorAccent: "#0a0a0c",
      selectionBackground: "rgba(255,255,255,0.15)",
      selectionForeground: "#ffffff",
      black: "#27272a",
      red: "#ff2d55",
      green: "#00ff88",
      yellow: "#ffd166",
      blue: "#5b8aff",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#d4d4d8",
      brightBlack: "#52525b",
      brightRed: "#ff6b8a",
      brightGreen: "#4ade80",
      brightYellow: "#ffe08a",
      brightBlue: "#818cf8",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    };
  }
}
