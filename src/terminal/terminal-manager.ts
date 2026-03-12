import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { AppState } from "../state/app-state";
import type { KnotConfig, TerminalCreated, TerminalInstance } from "../types";

export class TerminalManager {
  private state: AppState;
  instances: Map<string, TerminalInstance> = new Map();

  constructor(appState: AppState) {
    this.state = appState;
  }

  async createTerminal(
    workspaceId: string,
    splitFrom: string | null = null,
    splitDirection: string | null = null,
  ): Promise<string> {
    try {
      const { invoke, Channel } = await import("@tauri-apps/api/core");
      console.log("[knot] invoking create_terminal for workspace:", workspaceId);

      // Create a channel for streaming PTY output — no event system needed
      const onOutput = new Channel<{ terminal_id: string; data: number[] }>();
      onOutput.onmessage = (message) => {
        const inst = this.instances.get(message.terminal_id);
        if (inst) {
          const data = new Uint8Array(message.data);
          if (inst.mounted) {
            inst.term.write(data);
          } else {
            // Buffer until xterm is opened
            inst.pendingData.push(data);
          }
        }
      };

      const result = await invoke<TerminalCreated>("create_terminal", {
        workspaceId,
        title: null,
        shell: null,
        cwd: null,
        cols: 120,
        rows: 30,
        splitFrom,
        splitDirection,
        onOutput,
      });

      console.log("[knot] create_terminal result:", result);
      const terminalId = result.terminal_id;
      const instance = this._createXtermInstance(terminalId);

      instance.term.onData(async (data: string) => {
        try {
          await invoke("write_to_terminal", {
            terminalId,
            data: Array.from(new TextEncoder().encode(data)),
          });
        } catch (e) {
          console.error("write failed:", e);
        }
      });

      instance.term.onResize(async ({ cols, rows }: { cols: number; rows: number }) => {
        try {
          await invoke("resize_terminal", { terminalId, cols, rows });
        } catch (e) {
          console.error("resize failed:", e);
        }
      });

      this.state.activeTerminalId = terminalId;
      await this.state.loadWorkspaces();
      return terminalId;
    } catch (e) {
      console.error("Failed to create terminal:", e);
      return this._createDevTerminal(workspaceId);
    }
  }

  private _createXtermInstance(terminalId: string): TerminalInstance {
    const config = this.state.config;
    const fontConfig = config?.font;
    const termConfig = config?.terminal;

    const defaultFontFamily = "monospace";

    const term = new Terminal({
      fontFamily: fontConfig?.family || defaultFontFamily,
      fontSize: fontConfig?.size || 14,
      lineHeight: fontConfig?.line_height || 1.2,
      fontWeight: String(fontConfig?.weight || 400) as any,
      cursorStyle: (termConfig?.cursor_style as any) || "block",
      cursorBlink: termConfig?.cursor_blink !== false,
      scrollback: termConfig?.scrollback || 10000,
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

    const container = document.createElement("div");
    container.className = "terminal-container";
    container.dataset.terminalId = terminalId;

    const instance: TerminalInstance = { term, fit, search, container, mounted: false, pendingData: [] };
    this.instances.set(terminalId, instance);
    return instance;
  }

  private _createDevTerminal(workspaceId: string): string {
    const terminalId = crypto.randomUUID();
    const instance = this._createXtermInstance(terminalId);

    const ws = this.state.activeWorkspace();
    if (ws) {
      ws.terminals.push({
        id: terminalId,
        title: "shell",
        pane_id: crypto.randomUUID(),
        env: [],
      });
    }

    this.state.activeTerminalId = terminalId;
    instance.term.write("knot terminal (dev mode)\r\n$ ");
    instance.term.onData((data: string) => {
      instance.term.write(data);
    });

    return terminalId;
  }

  mount(terminalId: string, parentElement: HTMLElement): void {
    const instance = this.instances.get(terminalId);
    if (!instance) return;

    if (!instance.term.element) {
      instance.term.open(parentElement);
      try {
        instance.term.loadAddon(new WebglAddon());
      } catch (e) {
        console.warn("WebGL addon failed, using canvas renderer:", e);
      }
    } else {
      parentElement.appendChild(instance.term.element);
    }

    // Mark as mounted and flush any buffered output
    instance.mounted = true;
    if (instance.pendingData.length > 0) {
      for (const chunk of instance.pendingData) {
        instance.term.write(chunk);
      }
      instance.pendingData = [];
    }

    // Fit after DOM settles — double rAF ensures layout is computed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { instance.fit.fit(); } catch {}
      });
    });
  }

  writeToXterm(terminalId: string, data: Uint8Array): void {
    const inst = this.instances.get(terminalId);
    if (!inst) return;
    if (inst.mounted) {
      inst.term.write(data);
    } else {
      inst.pendingData.push(data);
    }
  }

  handleExit(terminalId: string): void {
    this.instances.get(terminalId)?.term.write("\r\n[Process exited]\r\n");
  }

  async closeActiveTerminal(workspaceId: string): Promise<void> {
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

  async splitTerminal(workspaceId: string, direction: string): Promise<void> {
    const ws = this.state.activeWorkspace();
    if (!ws) return;
    const activeTerminal = ws.terminals.find((t) => t.id === this.state.activeTerminalId);
    await this.createTerminal(workspaceId, activeTerminal?.pane_id ?? null, direction);
  }

  focusActive(): void {
    if (!this.state.activeTerminalId) return;
    this.instances.get(this.state.activeTerminalId)?.term.focus();
  }

  fitAll(): void {
    for (const [, instance] of this.instances) {
      try { instance.fit.fit(); } catch {}
    }
  }

  applyConfig(config: KnotConfig | null): void {
    const fontConfig = config?.font;
    const defaultFontFamily = "monospace";
    const theme = this._getTheme();
    for (const [, instance] of this.instances) {
      instance.term.options.fontFamily = fontConfig?.family || defaultFontFamily;
      instance.term.options.fontSize = fontConfig?.size || 14;
      instance.term.options.lineHeight = fontConfig?.line_height || 1.2;
      instance.term.options.theme = theme;
      instance.fit.fit();
    }
  }

  toggleSearch(): void {}
  copy(): void {
    if (!this.state.activeTerminalId) return;
    const inst = this.instances.get(this.state.activeTerminalId);
    if (inst?.term.hasSelection()) navigator.clipboard.writeText(inst.term.getSelection());
  }
  async paste(): Promise<void> {
    if (!this.state.activeTerminalId) return;
    const inst = this.instances.get(this.state.activeTerminalId);
    if (inst) inst.term.paste(await navigator.clipboard.readText());
  }
  enterCopyMode(): void {}

  private _getTheme(): Record<string, string> {
    return {
      background: "#0a0a0c", foreground: "#d4d4d8", cursor: "#d4d4d8", cursorAccent: "#0a0a0c",
      selectionBackground: "rgba(255,255,255,0.15)", selectionForeground: "#ffffff",
      black: "#27272a", red: "#ff2d55", green: "#00ff88", yellow: "#ffd166",
      blue: "#5b8aff", magenta: "#c084fc", cyan: "#22d3ee", white: "#d4d4d8",
      brightBlack: "#52525b", brightRed: "#ff6b8a", brightGreen: "#4ade80", brightYellow: "#ffe08a",
      brightBlue: "#818cf8", brightMagenta: "#d8b4fe", brightCyan: "#67e8f9", brightWhite: "#fafafa",
    };
  }
}
