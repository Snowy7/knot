use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Keybinding configuration — maps key combos to named actions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeybindConfig {
    /// Optional leader key (e.g., "ctrl+a")
    #[serde(default)]
    pub leader: Option<String>,

    /// Direct keybindings: "ctrl+shift+t" -> "new_terminal"
    #[serde(default = "default_keybindings")]
    pub bindings: HashMap<String, String>,

    /// Leader-prefixed bindings: after leader key, "h" -> "split_left"
    #[serde(default = "default_leader_bindings")]
    pub leader_bindings: HashMap<String, String>,
}

impl Default for KeybindConfig {
    fn default() -> Self {
        Self {
            leader: Some("ctrl+a".to_string()),
            bindings: default_keybindings(),
            leader_bindings: default_leader_bindings(),
        }
    }
}

fn default_keybindings() -> HashMap<String, String> {
    let mut m = HashMap::new();

    // Terminal management
    m.insert("ctrl+shift+t".into(), "new_terminal".into());
    m.insert("ctrl+shift+w".into(), "close_terminal".into());
    m.insert("ctrl+shift+n".into(), "new_window".into());

    // Navigation
    m.insert("ctrl+shift+]".into(), "next_terminal".into());
    m.insert("ctrl+shift+[".into(), "prev_terminal".into());
    m.insert("ctrl+shift+1".into(), "goto_terminal_1".into());
    m.insert("ctrl+shift+2".into(), "goto_terminal_2".into());
    m.insert("ctrl+shift+3".into(), "goto_terminal_3".into());
    m.insert("ctrl+shift+4".into(), "goto_terminal_4".into());
    m.insert("ctrl+shift+5".into(), "goto_terminal_5".into());
    m.insert("ctrl+shift+6".into(), "goto_terminal_6".into());
    m.insert("ctrl+shift+7".into(), "goto_terminal_7".into());
    m.insert("ctrl+shift+8".into(), "goto_terminal_8".into());
    m.insert("ctrl+shift+9".into(), "goto_terminal_9".into());

    // Splits
    m.insert("ctrl+shift+d".into(), "split_right".into());
    m.insert("ctrl+shift+e".into(), "split_down".into());

    // Pane navigation
    m.insert("ctrl+shift+h".into(), "focus_left".into());
    m.insert("ctrl+shift+l".into(), "focus_right".into());
    m.insert("ctrl+shift+k".into(), "focus_up".into());
    m.insert("ctrl+shift+j".into(), "focus_down".into());

    // Pane sizing
    m.insert("ctrl+shift+left".into(), "resize_left".into());
    m.insert("ctrl+shift+right".into(), "resize_right".into());
    m.insert("ctrl+shift+up".into(), "resize_up".into());
    m.insert("ctrl+shift+down".into(), "resize_down".into());
    m.insert("ctrl+shift+m".into(), "toggle_maximize".into());
    m.insert("ctrl+shift+=".into(), "equalize_panes".into());

    // Workspace
    m.insert("ctrl+shift+alt+t".into(), "new_workspace".into());
    m.insert("ctrl+shift+alt+]".into(), "next_workspace".into());
    m.insert("ctrl+shift+alt+[".into(), "prev_workspace".into());

    // Clipboard
    m.insert("ctrl+shift+c".into(), "copy".into());
    m.insert("ctrl+shift+v".into(), "paste".into());

    // Search
    m.insert("ctrl+shift+f".into(), "find".into());

    // Zoom
    m.insert("ctrl+=".into(), "zoom_in".into());
    m.insert("ctrl+-".into(), "zoom_out".into());
    m.insert("ctrl+0".into(), "zoom_reset".into());

    // Views
    m.insert("ctrl+shift+p".into(), "command_palette".into());
    m.insert("ctrl+shift+,".into(), "open_settings".into());
    m.insert("ctrl+shift+enter".into(), "toggle_fullscreen".into());

    // Copy mode
    m.insert("ctrl+shift+x".into(), "enter_copy_mode".into());

    m
}

fn default_leader_bindings() -> HashMap<String, String> {
    let mut m = HashMap::new();

    // Leader + key (tmux-style)
    m.insert("c".into(), "new_terminal".into());
    m.insert("x".into(), "close_terminal".into());
    m.insert("|".into(), "split_right".into());
    m.insert("-".into(), "split_down".into());
    m.insert("h".into(), "focus_left".into());
    m.insert("l".into(), "focus_right".into());
    m.insert("k".into(), "focus_up".into());
    m.insert("j".into(), "focus_down".into());
    m.insert("z".into(), "toggle_maximize".into());
    m.insert("n".into(), "next_terminal".into());
    m.insert("p".into(), "prev_terminal".into());
    m.insert("1".into(), "goto_terminal_1".into());
    m.insert("2".into(), "goto_terminal_2".into());
    m.insert("3".into(), "goto_terminal_3".into());
    m.insert("4".into(), "goto_terminal_4".into());
    m.insert("5".into(), "goto_terminal_5".into());
    m.insert("6".into(), "goto_terminal_6".into());
    m.insert("7".into(), "goto_terminal_7".into());
    m.insert("8".into(), "goto_terminal_8".into());
    m.insert("9".into(), "goto_terminal_9".into());
    m.insert(",".into(), "rename_terminal".into());
    m.insert("w".into(), "list_terminals".into());
    m.insert("d".into(), "detach".into());
    m.insert("[".into(), "enter_copy_mode".into());

    m
}
