/**
 * UI Renderer — builds the DOM for the Mission Control-style interface.
 * Dense, monospaced, operational. Zero decoration.
 */
export class UIRenderer {
  constructor(appState, terminalManager) {
    this.state = appState;
    this.tm = terminalManager;
    this.root = document.getElementById("app");
    this._resizeObserver = null;
  }

  render() {
    const ws = this.state.activeWorkspace();
    const terminals = ws ? ws.terminals : [];
    const activeId = this.state.activeTerminalId;

    this.root.innerHTML = "";
    this.root.className = "knot-shell";

    // ── Top bar ────────────────────────────────────────
    const topbar = el("header", "topbar");

    const brand = el("div", "topbar-brand");
    brand.innerHTML = `<span class="brand-name">KNOT</span><span class="brand-version">v0.1.0</span>`;
    topbar.appendChild(brand);

    // Workspace tabs
    const wsTabs = el("nav", "workspace-tabs");
    this.state.workspaces.forEach((w, i) => {
      const tab = el("button", `ws-tab${w.id === this.state.activeWorkspaceId ? " active" : ""}`);
      tab.textContent = w.name;
      tab.addEventListener("click", () => {
        this.state.activeWorkspaceId = w.id;
        if (w.terminals.length > 0) {
          this.state.activeTerminalId = w.terminals[0].id;
        }
        this.render();
        this.tm.focusActive();
      });
      wsTabs.appendChild(tab);
    });

    // New workspace button
    const newWs = el("button", "ws-tab ws-tab-new");
    newWs.textContent = "+";
    newWs.title = "New workspace";
    newWs.addEventListener("click", async () => {
      const name = `ws-${this.state.workspaces.length + 1}`;
      await this.state.createWorkspace(name, "~");
      this.render();
    });
    wsTabs.appendChild(newWs);
    topbar.appendChild(wsTabs);

    // Status indicators
    const status = el("div", "topbar-status");
    status.innerHTML = `
      <span class="status-led running">${terminals.length}</span>
      <span class="topbar-clock" id="clock"></span>
    `;
    topbar.appendChild(status);
    this.root.appendChild(topbar);

    // ── Terminal tab bar ────────────────────────────────
    const tabbar = el("div", "terminal-tabbar");
    terminals.forEach((t, i) => {
      const tab = el("button", `term-tab${t.id === activeId ? " active" : ""}`);
      const alive = this.tm.instances.has(t.id);
      tab.innerHTML = `<span class="tab-index">${i + 1}</span><span class="tab-title">${t.title || "shell"}</span>${!alive ? '<span class="tab-dead">exited</span>' : ""}`;
      tab.addEventListener("click", () => {
        this.state.activeTerminalId = t.id;
        this.render();
        this.tm.focusActive();
      });
      // Middle-click to close
      tab.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          this.tm.closeActiveTerminal(ws.id);
          this.render();
        }
      });
      tabbar.appendChild(tab);
    });

    // New terminal button
    const newTerm = el("button", "term-tab term-tab-new");
    newTerm.textContent = "+";
    newTerm.title = "New terminal (Ctrl+Shift+T)";
    newTerm.addEventListener("click", async () => {
      await this.tm.createTerminal(ws.id);
      this.render();
    });
    tabbar.appendChild(newTerm);
    this.root.appendChild(tabbar);

    // ── Terminal viewport ───────────────────────────────
    const viewport = el("div", "terminal-viewport");

    if (this.state.maximizedPane) {
      // Maximized: show only the active terminal
      this._mountTerminal(viewport, this.state.maximizedPane);
    } else {
      // Render layout tree
      this._renderLayout(viewport, ws?.layout, terminals);
    }

    this.root.appendChild(viewport);

    // ── Bottom status bar ──────────────────────────────
    const bottombar = el("div", "bottombar");
    const activeTerminal = terminals.find((t) => t.id === activeId);
    bottombar.innerHTML = `
      <span class="bb-section">${ws?.name || "no workspace"}</span>
      <span class="bb-sep">|</span>
      <span class="bb-section">${terminals.length} terminal${terminals.length !== 1 ? "s" : ""}</span>
      <span class="bb-sep">|</span>
      <span class="bb-section">${activeTerminal?.title || "none"}</span>
      <span class="bb-spacer"></span>
      <span class="bb-section bb-hint">ctrl+shift+p: palette</span>
    `;
    this.root.appendChild(bottombar);

    // Mount terminals and fit
    requestAnimationFrame(() => {
      this._mountAllTerminals(terminals);
      this.tm.focusActive();
      this._startClock();
    });

    // Resize observer
    this._setupResizeObserver(viewport);
  }

  _renderLayout(parent, layout, terminals) {
    if (!layout) {
      // No layout — just show active terminal
      const activeId = this.state.activeTerminalId;
      if (activeId) {
        this._mountTerminal(parent, activeId);
      }
      return;
    }

    if (layout.type === "pane") {
      // Find terminal for this pane
      const terminal = terminals.find((t) => t.pane_id === layout.pane_id);
      if (terminal) {
        this._mountTerminal(parent, terminal.id);
      } else if (terminals.length > 0) {
        // Fallback: mount first terminal
        this._mountTerminal(parent, terminals[0].id);
      }
    } else if (layout.type === "split") {
      const splitContainer = el("div", `split split-${layout.direction}`);
      splitContainer.style.cssText = layout.direction === "horizontal"
        ? `grid-template-columns: ${layout.ratio}fr ${1 - layout.ratio}fr;`
        : `grid-template-rows: ${layout.ratio}fr ${1 - layout.ratio}fr;`;

      for (const child of layout.children) {
        const childContainer = el("div", "split-child");
        this._renderLayout(childContainer, child, terminals);
        splitContainer.appendChild(childContainer);
      }

      // Add resize handle
      const handle = el("div", `split-handle split-handle-${layout.direction}`);
      handle.addEventListener("mousedown", (e) => {
        this._startResize(e, splitContainer, layout);
      });
      splitContainer.appendChild(handle);
      parent.appendChild(splitContainer);
    }
  }

  _mountTerminal(parent, terminalId) {
    const pane = el("div", `terminal-pane${terminalId === this.state.activeTerminalId ? " active" : ""}`);
    pane.dataset.terminalId = terminalId;
    pane.addEventListener("mousedown", () => {
      if (this.state.activeTerminalId !== terminalId) {
        this.state.activeTerminalId = terminalId;
        this.render();
      }
    });
    parent.appendChild(pane);
  }

  _mountAllTerminals(terminals) {
    for (const t of terminals) {
      const pane = this.root.querySelector(`.terminal-pane[data-terminal-id="${t.id}"]`);
      if (pane) {
        this.tm.mount(t.id, pane);
      }
    }
  }

  _startResize(e, container, layout) {
    e.preventDefault();
    const isHorizontal = layout.direction === "horizontal";
    const rect = container.getBoundingClientRect();
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const totalSize = isHorizontal ? rect.width : rect.height;

    const onMove = (e) => {
      const currentPos = isHorizontal ? e.clientX : e.clientY;
      const delta = currentPos - rect[isHorizontal ? "left" : "top"];
      layout.ratio = Math.max(0.15, Math.min(0.85, delta / totalSize));

      container.style.cssText = isHorizontal
        ? `grid-template-columns: ${layout.ratio}fr ${1 - layout.ratio}fr;`
        : `grid-template-rows: ${layout.ratio}fr ${1 - layout.ratio}fr;`;

      this.tm.fitAll();
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  _setupResizeObserver(viewport) {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    this._resizeObserver = new ResizeObserver(() => {
      this.tm.fitAll();
    });
    this._resizeObserver.observe(viewport);
  }

  _startClock() {
    const clockEl = document.getElementById("clock");
    if (!clockEl) return;
    const update = () => {
      clockEl.textContent = new Date().toLocaleTimeString([], { hour12: false });
    };
    update();
    setInterval(update, 1000);
  }
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
