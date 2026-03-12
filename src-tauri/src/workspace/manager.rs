use super::model::{SplitDirection, TerminalInfo, Workspace, WorkspaceSnapshot};
use std::collections::HashMap;
use std::path::PathBuf;

/// Manages all workspaces and their persistence.
pub struct WorkspaceManager {
    workspaces: HashMap<String, Workspace>,
    active_workspace_id: Option<String>,
    state_dir: PathBuf,
}

impl WorkspaceManager {
    pub fn new() -> Self {
        let state_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("knot")
            .join("workspaces");

        std::fs::create_dir_all(&state_dir).ok();

        Self {
            workspaces: HashMap::new(),
            active_workspace_id: None,
            state_dir,
        }
    }

    pub fn create(&mut self, name: String, cwd: String) -> Workspace {
        let ws = Workspace::new(name, cwd);
        let id = ws.id.clone();
        self.workspaces.insert(id.clone(), ws.clone());
        if self.active_workspace_id.is_none() {
            self.active_workspace_id = Some(id);
        }
        ws
    }

    pub fn get(&self, id: &str) -> Option<&Workspace> {
        self.workspaces.get(id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Workspace> {
        self.workspaces.get_mut(id)
    }

    pub fn active(&self) -> Option<&Workspace> {
        self.active_workspace_id
            .as_ref()
            .and_then(|id| self.workspaces.get(id))
    }

    pub fn active_id(&self) -> Option<String> {
        self.active_workspace_id.clone()
    }

    pub fn switch(&mut self, id: &str) -> bool {
        if self.workspaces.contains_key(id) {
            self.active_workspace_id = Some(id.to_string());
            if let Some(ws) = self.workspaces.get_mut(id) {
                ws.touch();
            }
            true
        } else {
            false
        }
    }

    pub fn delete(&mut self, id: &str) -> bool {
        if self.workspaces.remove(id).is_some() {
            if self.active_workspace_id.as_deref() == Some(id) {
                self.active_workspace_id = self.workspaces.keys().next().cloned();
            }
            // Remove persisted state
            let path = self.state_dir.join(format!("{}.json", id));
            std::fs::remove_file(path).ok();
            true
        } else {
            false
        }
    }

    pub fn list(&self) -> Vec<Workspace> {
        self.workspaces.values().cloned().collect()
    }

    pub fn add_terminal(
        &mut self,
        workspace_id: &str,
        terminal_id: String,
        title: String,
        pane_id: String,
    ) -> bool {
        if let Some(ws) = self.workspaces.get_mut(workspace_id) {
            ws.add_terminal(TerminalInfo {
                id: terminal_id,
                title,
                shell: None,
                cwd: None,
                env: vec![],
                pane_id,
            });
            ws.touch();
            true
        } else {
            false
        }
    }

    pub fn remove_terminal(&mut self, workspace_id: &str, terminal_id: &str) -> bool {
        if let Some(ws) = self.workspaces.get_mut(workspace_id) {
            // Find the pane_id for this terminal
            let pane_id = ws
                .terminals
                .iter()
                .find(|t| t.id == terminal_id)
                .map(|t| t.pane_id.clone());

            ws.remove_terminal(terminal_id);

            // Remove pane from layout
            if let Some(pane_id) = pane_id {
                ws.layout.remove_pane(&pane_id);
            }

            ws.touch();
            true
        } else {
            false
        }
    }

    pub fn split_pane(
        &mut self,
        workspace_id: &str,
        target_pane_id: &str,
        direction: SplitDirection,
        new_pane_id: &str,
    ) -> bool {
        if let Some(ws) = self.workspaces.get_mut(workspace_id) {
            ws.layout.split_pane(target_pane_id, direction, new_pane_id);
            ws.touch();
            true
        } else {
            false
        }
    }

    /// Save workspace state to disk.
    pub fn save(&self, workspace_id: &str) -> Result<(), String> {
        let ws = self
            .workspaces
            .get(workspace_id)
            .ok_or_else(|| "workspace not found".to_string())?;

        let snapshot = WorkspaceSnapshot {
            workspace: ws.clone(),
            version: 1,
        };

        let json = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| e.to_string())?;

        let path = self.state_dir.join(format!("{}.json", workspace_id));
        std::fs::write(path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Restore workspace state from disk.
    pub fn restore(&mut self, workspace_id: &str) -> Result<Workspace, String> {
        let path = self.state_dir.join(format!("{}.json", workspace_id));
        let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let snapshot: WorkspaceSnapshot =
            serde_json::from_str(&json).map_err(|e| e.to_string())?;

        let ws = snapshot.workspace;
        self.workspaces.insert(ws.id.clone(), ws.clone());
        Ok(ws)
    }

    /// Load all saved workspaces from disk.
    pub fn restore_all(&mut self) -> Vec<Workspace> {
        let mut restored = vec![];
        if let Ok(entries) = std::fs::read_dir(&self.state_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().is_some_and(|e| e == "json") {
                    if let Ok(json) = std::fs::read_to_string(entry.path()) {
                        if let Ok(snapshot) = serde_json::from_str::<WorkspaceSnapshot>(&json) {
                            let ws = snapshot.workspace;
                            self.workspaces.insert(ws.id.clone(), ws.clone());
                            restored.push(ws);
                        }
                    }
                }
            }
        }
        restored
    }
}
