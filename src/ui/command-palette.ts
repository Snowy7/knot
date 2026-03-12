import type { AppState } from "../state/app-state";
import type { PaletteAction } from "../types";

interface KnotApp {
  executeAction(action: string): Promise<void>;
  terminalManager: { focusActive(): void };
}

export class CommandPalette {
  private state: AppState;
  private app: KnotApp;
  private visible = false;
  private element: HTMLElement | null = null;
  private selectedIndex = 0;
  private filteredActions: PaletteAction[] = [];

  constructor(appState: AppState, app: KnotApp) {
    this.state = appState;
    this.app = app;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    this.visible = true;
    this.selectedIndex = 0;

    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "command-palette";
      document.body.appendChild(this.element);
    }

    this.element.innerHTML = `
      <div class="command-palette-backdrop"></div>
      <div class="command-palette-dialog">
        <input class="command-palette-input" type="text" placeholder="Type a command..." autofocus />
        <div class="command-palette-results"></div>
      </div>
    `;
    this.element.style.display = "flex";

    const input = this.element.querySelector<HTMLInputElement>(".command-palette-input")!;
    input.addEventListener("input", () => this._filter(input.value));
    input.addEventListener("keydown", (e) => this._handleKey(e));
    this.element.querySelector(".command-palette-backdrop")!.addEventListener("click", () => this.hide());

    requestAnimationFrame(() => input.focus());
    this._filter("");
  }

  hide(): void {
    this.visible = false;
    if (this.element) this.element.style.display = "none";
    this.app.terminalManager.focusActive();
  }

  private _filter(query: string): void {
    const actions = this._getAllActions();
    const q = query.toLowerCase().trim();
    this.filteredActions = q
      ? actions.filter((a) => a.label.toLowerCase().includes(q) || a.action.includes(q))
      : actions;
    this.selectedIndex = 0;
    this._renderResults();
  }

  private _renderResults(): void {
    const results = this.element!.querySelector(".command-palette-results")!;
    results.innerHTML = "";

    this.filteredActions.slice(0, 20).forEach((item, i) => {
      const row = document.createElement("div");
      row.className = `palette-row${i === this.selectedIndex ? " selected" : ""}`;
      row.innerHTML = `
        <span class="palette-action">${item.label}</span>
        <span class="palette-keybind">${item.keybind || ""}</span>
      `;
      row.addEventListener("click", () => {
        this.hide();
        this.app.executeAction(item.action);
      });
      results.appendChild(row);
    });
  }

  private _handleKey(e: KeyboardEvent): void {
    if (e.key === "Escape") { this.hide(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredActions.length - 1);
      this._renderResults();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this._renderResults();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const selected = this.filteredActions[this.selectedIndex];
      if (selected) { this.hide(); this.app.executeAction(selected.action); }
    }
  }

  private _getAllActions(): PaletteAction[] {
    const bindings = this.state.config?.keybindings?.bindings ?? {};
    const leaderBindings = this.state.config?.keybindings?.leader_bindings ?? {};
    const leader = this.state.config?.keybindings?.leader ?? "";

    const keybindMap: Record<string, string> = {};
    for (const [key, action] of Object.entries(bindings)) keybindMap[action] = key;
    for (const [key, action] of Object.entries(leaderBindings)) {
      if (!keybindMap[action]) keybindMap[action] = `${leader} → ${key}`;
    }

    const actions: { action: string; label: string }[] = [
      { action: "new_terminal", label: "New Terminal" },
      { action: "close_terminal", label: "Close Terminal" },
      { action: "split_right", label: "Split Right" },
      { action: "split_down", label: "Split Down" },
      { action: "next_terminal", label: "Next Terminal" },
      { action: "prev_terminal", label: "Previous Terminal" },
      { action: "focus_left", label: "Focus Left Pane" },
      { action: "focus_right", label: "Focus Right Pane" },
      { action: "focus_up", label: "Focus Up Pane" },
      { action: "focus_down", label: "Focus Down Pane" },
      { action: "toggle_maximize", label: "Toggle Maximize Pane" },
      { action: "equalize_panes", label: "Equalize All Panes" },
      { action: "new_workspace", label: "New Workspace" },
      { action: "next_workspace", label: "Next Workspace" },
      { action: "prev_workspace", label: "Previous Workspace" },
      { action: "find", label: "Find in Terminal" },
      { action: "copy", label: "Copy Selection" },
      { action: "paste", label: "Paste from Clipboard" },
      { action: "zoom_in", label: "Zoom In" },
      { action: "zoom_out", label: "Zoom Out" },
      { action: "zoom_reset", label: "Reset Zoom" },
      { action: "toggle_fullscreen", label: "Toggle Fullscreen" },
      { action: "enter_copy_mode", label: "Enter Copy Mode" },
      { action: "command_palette", label: "Command Palette" },
    ];

    return actions.map((a) => ({ ...a, keybind: keybindMap[a.action] ?? "" }));
  }
}
