import type { AppState } from "../state/app-state";
import type { TerminalManager } from "../terminal/terminal-manager";
import type { Layout, TerminalInfo } from "../types";

/**
 * UI Renderer — stable DOM approach.
 * Builds the shell once, then updates only what changes.
 * Never destroys xterm elements.
 *
 * Layout:
 * ┌──────────┬──────────────────────────────────┐
 * │ TOPBAR (workspace tabs, brand, clock)       │
 * ├──────────┬──────────────────────────────────┤
 * │ SIDEBAR  │  TERMINAL VIEWPORT               │
 * │ terminal │  (active terminal, full size)     │
 * │ list     │                                   │
 * │          │                                   │
 * ├──────────┴──────────────────────────────────┤
 * │ BOTTOMBAR (status)                          │
 * └─────────────────────────────────────────────┘
 */
export class UIRenderer {
  private state: AppState;
  private tm: TerminalManager;
  private root: HTMLElement;
  private _built = false;
  private _resizeObserver: ResizeObserver | null = null;
  private _clockInterval: ReturnType<typeof setInterval> | null = null;

  // Stable DOM references
  private els!: {
    wsTabs: HTMLElement;
    clock: HTMLElement;
    sidebar: HTMLElement;
    termList: HTMLElement;
    newTermBtn: HTMLElement;
    viewport: HTMLElement;
    bottombar: HTMLElement;
  };

  constructor(appState: AppState, terminalManager: TerminalManager) {
    this.state = appState;
    this.tm = terminalManager;
    this.root = document.getElementById("app")!;
  }

  /** Build the shell once, then call update() for changes. */
  render(): void {
    if (!this._built) {
      this._buildShell();
      this._built = true;
    }
    this._update();
  }

  private _buildShell(): void {
    this.root.className = "knot-shell";
    this.root.innerHTML = `
      <header class="topbar">
        <div class="topbar-brand">
          <span class="brand-name">KNOT</span>
          <span class="brand-version">v0.1.0</span>
        </div>
        <nav class="workspace-tabs" data-ref="wsTabs"></nav>
        <div class="topbar-status">
          <span class="topbar-clock" data-ref="clock"></span>
        </div>
      </header>
      <div class="main-area">
        <aside class="sidebar" data-ref="sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">TERMINALS</span>
            <button class="sidebar-new-btn" data-ref="newTermBtn" title="New terminal (Ctrl+Shift+T)">+</button>
          </div>
          <div class="term-list" data-ref="termList"></div>
        </aside>
        <div class="terminal-viewport" data-ref="viewport"></div>
      </div>
      <div class="bottombar" data-ref="bottombar"></div>
    `;

    // Grab stable refs
    this.els = {
      wsTabs: this.root.querySelector('[data-ref="wsTabs"]')!,
      clock: this.root.querySelector('[data-ref="clock"]')!,
      sidebar: this.root.querySelector('[data-ref="sidebar"]')!,
      termList: this.root.querySelector('[data-ref="termList"]')!,
      newTermBtn: this.root.querySelector('[data-ref="newTermBtn"]')!,
      viewport: this.root.querySelector('[data-ref="viewport"]')!,
      bottombar: this.root.querySelector('[data-ref="bottombar"]')!,
    };

    // New terminal button
    this.els.newTermBtn.addEventListener("click", async () => {
      const ws = this.state.activeWorkspace();
      if (ws) {
        await this.tm.createTerminal(ws.id);
        this.render();
      }
    });

    // Start clock
    this._startClock();

    // Resize observer on viewport
    this._resizeObserver = new ResizeObserver(() => this.tm.fitAll());
    this._resizeObserver.observe(this.els.viewport);
  }

  private _update(): void {
    this._updateWorkspaceTabs();
    this._updateTerminalList();
    this._updateViewport();
    this._updateBottomBar();
  }

  private _updateWorkspaceTabs(): void {
    const container = this.els.wsTabs;
    container.innerHTML = "";

    for (const w of this.state.workspaces) {
      const tab = document.createElement("button");
      tab.className = `ws-tab${w.id === this.state.activeWorkspaceId ? " active" : ""}`;
      tab.textContent = w.name;
      tab.addEventListener("click", () => {
        this.state.activeWorkspaceId = w.id;
        if (w.terminals.length > 0) this.state.activeTerminalId = w.terminals[0].id;
        this._update();
        this.tm.focusActive();
      });
      container.appendChild(tab);
    }

    const newWs = document.createElement("button");
    newWs.className = "ws-tab ws-tab-new";
    newWs.textContent = "+";
    newWs.title = "New workspace";
    newWs.addEventListener("click", async () => {
      await this.state.createWorkspace(`ws-${this.state.workspaces.length + 1}`, "~");
      this._update();
    });
    container.appendChild(newWs);
  }

  private _updateTerminalList(): void {
    const ws = this.state.activeWorkspace();
    const terminals = ws?.terminals ?? [];
    const activeId = this.state.activeTerminalId;
    const container = this.els.termList;
    container.innerHTML = "";

    for (let i = 0; i < terminals.length; i++) {
      const t = terminals[i];
      const alive = this.tm.instances.has(t.id);
      const isActive = t.id === activeId;

      const row = document.createElement("button");
      row.className = `term-row${isActive ? " active" : ""}${!alive ? " dead" : ""}`;
      row.innerHTML = `
        <span class="term-row-index">${i + 1}</span>
        <span class="term-row-title">${t.title || "shell"}</span>
      `;
      row.addEventListener("click", () => {
        this.state.activeTerminalId = t.id;
        this._update();
        this.tm.focusActive();
      });
      container.appendChild(row);
    }
  }

  private _updateViewport(): void {
    const viewport = this.els.viewport;
    const activeId = this.state.activeTerminalId;

    // Hide all terminal panes, show only active
    for (const child of Array.from(viewport.children) as HTMLElement[]) {
      const tid = child.dataset.terminalId;
      if (tid) {
        child.style.display = tid === activeId ? "block" : "none";
      }
    }

    // If active terminal isn't mounted yet, mount it
    if (activeId && !viewport.querySelector(`[data-terminal-id="${activeId}"]`)) {
      const pane = document.createElement("div");
      pane.className = "terminal-pane";
      pane.dataset.terminalId = activeId;
      pane.style.display = "block";
      viewport.appendChild(pane);

      // Mount xterm into this pane
      requestAnimationFrame(() => {
        this.tm.mount(activeId, pane);
        this.tm.focusActive();
      });
    } else if (activeId) {
      // Already mounted — just fit and focus
      requestAnimationFrame(() => {
        this.tm.fitAll();
        this.tm.focusActive();
      });
    }
  }

  private _updateBottomBar(): void {
    const ws = this.state.activeWorkspace();
    const terminals = ws?.terminals ?? [];
    const active = terminals.find((t) => t.id === this.state.activeTerminalId);

    this.els.bottombar.innerHTML = `
      <span class="bb-section">${ws?.name ?? "—"}</span>
      <span class="bb-sep">│</span>
      <span class="bb-section">${terminals.length} terminal${terminals.length !== 1 ? "s" : ""}</span>
      <span class="bb-sep">│</span>
      <span class="bb-section">${active?.title ?? "—"}</span>
      <span class="bb-spacer"></span>
      <span class="bb-section bb-hint">ctrl+shift+p: palette</span>
    `;
  }

  private _startClock(): void {
    const update = () => {
      if (this.els.clock) {
        this.els.clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
      }
    };
    update();
    this._clockInterval = setInterval(update, 1000);
  }
}
