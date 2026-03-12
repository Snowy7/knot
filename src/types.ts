// ── Backend types (mirroring Rust structs) ────────────────

export interface Workspace {
  id: string;
  name: string;
  cwd: string;
  terminals: TerminalInfo[];
  layout: Layout;
  created_at: string;
  last_active: string;
}

export interface TerminalInfo {
  id: string;
  title: string;
  shell?: string;
  cwd?: string;
  env: [string, string][];
  pane_id: string;
}

export type Layout =
  | { type: "pane"; pane_id: string }
  | { type: "split"; direction: "horizontal" | "vertical"; ratio: number; children: Layout[] };

export interface TerminalCreated {
  terminal_id: string;
  pane_id: string;
  title: string;
}

export interface TerminalState {
  id: string;
  alive: boolean;
}

export interface KnotConfig {
  shell: ShellConfig;
  font: FontConfig;
  theme: ThemeConfig;
  window: WindowConfig;
  terminal: TerminalConfig;
  keybindings: KeybindingsConfig;
}

export interface ShellConfig {
  program: string;
  args: string[];
}

export interface FontConfig {
  family: string;
  size: number;
  line_height: number;
  ligatures: boolean;
  weight: number;
}

export interface ThemeConfig {
  name: string;
  custom?: ColorScheme;
}

export interface ColorScheme {
  foreground: string;
  background: string;
  cursor: string;
  selection_bg: string;
  selection_fg: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  bright_black: string;
  bright_red: string;
  bright_green: string;
  bright_yellow: string;
  bright_blue: string;
  bright_magenta: string;
  bright_cyan: string;
  bright_white: string;
}

export interface WindowConfig {
  opacity: number;
  blur: boolean;
  padding: number;
  decorations: boolean;
}

export interface TerminalConfig {
  scrollback: number;
  cursor_style: string;
  cursor_blink: boolean;
  copy_on_select: boolean;
  clickable_urls: boolean;
  bell: string;
}

export interface KeybindingsConfig {
  leader?: string;
  bindings: Record<string, string>;
  leader_bindings: Record<string, string>;
}

export interface KeybindEntry {
  key: string;
  action: string;
  is_leader: boolean;
}

// ── Frontend types ────────────────────────────────────────

export interface TerminalInstance {
  term: import("@xterm/xterm").Terminal;
  fit: import("@xterm/addon-fit").FitAddon;
  search: import("@xterm/addon-search").SearchAddon;
  container: HTMLElement;
  mounted: boolean;
  pendingData: Uint8Array[];
}

export interface PaletteAction {
  action: string;
  label: string;
  keybind: string;
}
