import type { AppState } from "../state/app-state";

interface KnotApp {
  executeAction(action: string): Promise<void>;
}

export class KeybindHandler {
  private state: AppState;
  private app: KnotApp;
  private leaderActive = false;
  private leaderTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(appState: AppState, app: KnotApp) {
    this.state = appState;
    this.app = app;
  }

  attach(): void {
    document.addEventListener("keydown", (e) => this._handleKeyDown(e));
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.closest(".command-palette-input")) return;

    const combo = this._eventToCombo(e);
    if (!combo) return;

    const config = this.state.config?.keybindings;
    if (!config) return;

    if (this.leaderActive) {
      this.leaderActive = false;
      if (this.leaderTimeout) clearTimeout(this.leaderTimeout);

      const action = config.leader_bindings?.[combo];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        this.app.executeAction(action);
        return;
      }
      return;
    }

    if (config.leader && combo === config.leader) {
      e.preventDefault();
      e.stopPropagation();
      this.leaderActive = true;
      this.leaderTimeout = setTimeout(() => {
        this.leaderActive = false;
      }, 1500);
      return;
    }

    const action = config.bindings?.[combo];
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      this.app.executeAction(action);
    }
  }

  private _eventToCombo(e: KeyboardEvent): string | null {
    const parts: string[] = [];

    if (e.ctrlKey || e.metaKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");

    let key = e.key.toLowerCase();

    const keyMap: Record<string, string | null> = {
      control: null, alt: null, shift: null, meta: null,
      arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
      escape: "escape", enter: "enter", backspace: "backspace",
      tab: "tab", " ": "space", delete: "delete",
    };

    if (key in keyMap) {
      const mapped = keyMap[key];
      if (mapped === null) return null;
      key = mapped;
    }

    parts.push(key);
    return parts.join("+");
  }
}
