use serde::{Deserialize, Serialize};

/// A workspace is a collection of terminal sessions tied to a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub terminals: Vec<TerminalInfo>,
    pub layout: Layout,
    pub created_at: String,
    pub last_active: String,
}

/// Metadata about a terminal within a workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: String,
    pub title: String,
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub env: Vec<(String, String)>,
    pub pane_id: String,
}

/// Layout tree — recursive splits or single panes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Layout {
    #[serde(rename = "pane")]
    Pane { pane_id: String },
    #[serde(rename = "split")]
    Split {
        direction: SplitDirection,
        ratio: f64,
        children: Vec<Layout>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SplitDirection {
    #[serde(rename = "horizontal")]
    Horizontal,
    #[serde(rename = "vertical")]
    Vertical,
}

/// Serializable workspace snapshot for persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSnapshot {
    pub workspace: Workspace,
    pub version: u32,
}

impl Workspace {
    pub fn new(name: String, cwd: String) -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            name,
            cwd,
            terminals: vec![],
            layout: Layout::Pane {
                pane_id: "default".to_string(),
            },
            created_at: now.clone(),
            last_active: now,
        }
    }

    pub fn add_terminal(&mut self, info: TerminalInfo) {
        self.terminals.push(info);
    }

    pub fn remove_terminal(&mut self, terminal_id: &str) {
        self.terminals.retain(|t| t.id != terminal_id);
    }

    pub fn touch(&mut self) {
        self.last_active = chrono::Utc::now().to_rfc3339();
    }
}

impl Layout {
    /// Split an existing pane into two.
    pub fn split_pane(
        &mut self,
        target_pane_id: &str,
        direction: SplitDirection,
        new_pane_id: &str,
    ) -> bool {
        match self {
            Layout::Pane { pane_id } if pane_id == target_pane_id => {
                *self = Layout::Split {
                    direction,
                    ratio: 0.5,
                    children: vec![
                        Layout::Pane {
                            pane_id: pane_id.clone(),
                        },
                        Layout::Pane {
                            pane_id: new_pane_id.to_string(),
                        },
                    ],
                };
                true
            }
            Layout::Split { children, .. } => {
                children.iter_mut().any(|c| c.split_pane(target_pane_id, direction.clone(), new_pane_id))
            }
            _ => false,
        }
    }

    /// Remove a pane from the layout tree, collapsing parent splits.
    pub fn remove_pane(&mut self, target_pane_id: &str) -> bool {
        match self {
            Layout::Split { children, .. } => {
                // Check if any child is the target pane
                if let Some(idx) = children.iter().position(|c| matches!(c, Layout::Pane { pane_id } if pane_id == target_pane_id)) {
                    children.remove(idx);
                    if children.len() == 1 {
                        *self = children.remove(0);
                    }
                    return true;
                }
                children.iter_mut().any(|c| c.remove_pane(target_pane_id))
            }
            _ => false,
        }
    }

    /// Collect all pane IDs in the layout.
    pub fn pane_ids(&self) -> Vec<String> {
        match self {
            Layout::Pane { pane_id } => vec![pane_id.clone()],
            Layout::Split { children, .. } => {
                children.iter().flat_map(|c| c.pane_ids()).collect()
            }
        }
    }
}
