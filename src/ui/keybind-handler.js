/**
 * Keybind handler — intercepts keyboard events and resolves them to actions.
 */
export class KeybindHandler {
  constructor(appState, app) {
    this.state = appState;
    this.app = app;
    this.leaderActive = false;
    this.leaderTimeout = null;
  }

  attach() {
    document.addEventListener("keydown", (e) => this._handleKeyDown(e));
  }

  _handleKeyDown(e) {
    // Don't intercept when command palette input is focused
    if (e.target.closest(".command-palette-input")) return;

    const combo = this._eventToCombo(e);
    if (!combo) return;

    const config = this.state.config?.keybindings;
    if (!config) return;

    // Leader mode
    if (this.leaderActive) {
      this.leaderActive = false;
      clearTimeout(this.leaderTimeout);

      const action = config.leader_bindings?.[combo];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        this.app.executeAction(action);
        return;
      }
      // Leader + unrecognized key — pass through
      return;
    }

    // Check if this is the leader key
    if (config.leader && combo === config.leader) {
      e.preventDefault();
      e.stopPropagation();
      this.leaderActive = true;
      // Timeout leader after 1.5s
      this.leaderTimeout = setTimeout(() => {
        this.leaderActive = false;
      }, 1500);
      return;
    }

    // Check direct bindings
    const action = config.bindings?.[combo];
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      this.app.executeAction(action);
    }
  }

  /**
   * Convert a KeyboardEvent to a combo string like "ctrl+shift+t".
   */
  _eventToCombo(e) {
    const parts = [];

    if (e.ctrlKey || e.metaKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");

    let key = e.key.toLowerCase();

    // Normalize special keys
    const keyMap = {
      control: null,
      alt: null,
      shift: null,
      meta: null,
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
      escape: "escape",
      enter: "enter",
      backspace: "backspace",
      tab: "tab",
      " ": "space",
      delete: "delete",
    };

    if (key in keyMap) {
      key = keyMap[key];
      if (key === null) return null; // Modifier-only press
    }

    parts.push(key);
    return parts.join("+");
  }
}
