use serde::{Deserialize, Serialize};

/// Events emitted from backend to frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum KnotEvent {
    #[serde(rename = "terminal_created")]
    TerminalCreated {
        terminal_id: String,
        workspace_id: String,
        pane_id: String,
    },
    #[serde(rename = "terminal_closed")]
    TerminalClosed {
        terminal_id: String,
        workspace_id: String,
    },
    #[serde(rename = "terminal_exited")]
    TerminalExited {
        terminal_id: String,
        exit_code: Option<i32>,
    },
    #[serde(rename = "terminal_title_changed")]
    TerminalTitleChanged {
        terminal_id: String,
        title: String,
    },
    #[serde(rename = "workspace_created")]
    WorkspaceCreated {
        workspace_id: String,
        name: String,
    },
    #[serde(rename = "workspace_switched")]
    WorkspaceSwitched {
        workspace_id: String,
    },
    #[serde(rename = "workspace_deleted")]
    WorkspaceDeleted {
        workspace_id: String,
    },
    #[serde(rename = "layout_changed")]
    LayoutChanged {
        workspace_id: String,
    },
    #[serde(rename = "config_reloaded")]
    ConfigReloaded,
    #[serde(rename = "keybind_action")]
    KeybindAction {
        action: String,
    },
    #[serde(rename = "leader_activated")]
    LeaderActivated,
    #[serde(rename = "bell")]
    Bell {
        terminal_id: String,
    },
}
