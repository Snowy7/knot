use crate::workspace::model::{Layout, SplitDirection, Workspace};
use crate::AppState;
use tauri::{AppHandle, Emitter, State};

// ── Workspace commands ──────────────────────────────────────

#[tauri::command]
pub fn create_workspace(
    state: State<'_, AppState>,
    name: String,
    cwd: String,
) -> Result<Workspace, String> {
    let ws = state.workspace_manager.write().create(name, cwd);
    Ok(ws)
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Vec<Workspace> {
    state.workspace_manager.read().list()
}

#[tauri::command]
pub fn switch_workspace(state: State<'_, AppState>, workspace_id: String) -> Result<bool, String> {
    Ok(state.workspace_manager.write().switch(&workspace_id))
}

#[tauri::command]
pub fn delete_workspace(state: State<'_, AppState>, workspace_id: String) -> Result<bool, String> {
    Ok(state.workspace_manager.write().delete(&workspace_id))
}

#[tauri::command]
pub fn save_workspace_state(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    state.workspace_manager.read().save(&workspace_id)
}

#[tauri::command]
pub fn restore_workspace_state(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Workspace, String> {
    state.workspace_manager.write().restore(&workspace_id)
}

// ── Terminal commands ────────────────────────────────────────

#[tauri::command]
pub fn create_terminal(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    workspace_id: String,
    title: Option<String>,
    shell: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    split_from: Option<String>,
    split_direction: Option<String>,
) -> Result<TerminalCreated, String> {
    let terminal_id = uuid::Uuid::new_v4().to_string();
    let pane_id = uuid::Uuid::new_v4().to_string();
    let title = title.unwrap_or_else(|| "shell".to_string());
    let cols = cols.unwrap_or(120);
    let rows = rows.unwrap_or(30);

    // Determine working directory
    let effective_cwd = cwd.or_else(|| {
        state
            .workspace_manager
            .read()
            .get(&workspace_id)
            .map(|ws| ws.cwd.clone())
    });

    // Spawn PTY
    let config = state.config.read();
    state
        .pty_manager
        .create_session(
            terminal_id.clone(),
            shell.as_deref().or(Some(&config.shell.program)),
            effective_cwd.as_deref(),
            cols,
            rows,
            vec![],
            app_handle,
        )
        .map_err(|e| e.to_string())?;

    // Handle layout splitting
    let mut wm = state.workspace_manager.write();
    if let Some(split_from_pane) = split_from {
        let dir = match split_direction.as_deref() {
            Some("vertical") => SplitDirection::Vertical,
            _ => SplitDirection::Horizontal,
        };
        wm.split_pane(&workspace_id, &split_from_pane, dir, &pane_id);
    }

    // Register terminal in workspace
    wm.add_terminal(&workspace_id, terminal_id.clone(), title.clone(), pane_id.clone());

    Ok(TerminalCreated {
        terminal_id,
        pane_id,
        title,
    })
}

#[derive(serde::Serialize)]
pub struct TerminalCreated {
    pub terminal_id: String,
    pub pane_id: String,
    pub title: String,
}

#[tauri::command]
pub fn close_terminal(
    state: State<'_, AppState>,
    workspace_id: String,
    terminal_id: String,
) -> Result<bool, String> {
    state
        .pty_manager
        .close(&terminal_id)
        .map_err(|e| e.to_string())?;
    Ok(state
        .workspace_manager
        .write()
        .remove_terminal(&workspace_id, &terminal_id))
}

#[tauri::command]
pub fn write_to_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state
        .pty_manager
        .write(&terminal_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .pty_manager
        .resize(&terminal_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_terminal_state(
    state: State<'_, AppState>,
    terminal_id: String,
) -> Result<TerminalState, String> {
    Ok(TerminalState {
        id: terminal_id.clone(),
        alive: state.pty_manager.is_alive(&terminal_id),
    })
}

#[derive(serde::Serialize)]
pub struct TerminalState {
    pub id: String,
    pub alive: bool,
}

#[tauri::command]
pub fn list_terminals(state: State<'_, AppState>, workspace_id: String) -> Vec<String> {
    state
        .workspace_manager
        .read()
        .get(&workspace_id)
        .map(|ws| ws.terminals.iter().map(|t| t.id.clone()).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_terminal_title(
    state: State<'_, AppState>,
    workspace_id: String,
    terminal_id: String,
    title: String,
) -> Result<(), String> {
    let mut wm = state.workspace_manager.write();
    if let Some(ws) = wm.get_mut(&workspace_id) {
        if let Some(t) = ws.terminals.iter_mut().find(|t| t.id == terminal_id) {
            t.title = title;
            return Ok(());
        }
    }
    Err("terminal not found".to_string())
}

// ── Config commands ─────────────────────────────────────────

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> crate::config::KnotConfig {
    state.config.read().clone()
}

#[tauri::command]
pub fn update_config(
    state: State<'_, AppState>,
    config: crate::config::KnotConfig,
) -> Result<(), String> {
    config.save()?;
    *state.config.write() = config;
    Ok(())
}

#[tauri::command]
pub fn reload_config(state: State<'_, AppState>) -> Result<(), String> {
    let new_config = crate::config::KnotConfig::load();
    *state.keybind_engine.write() =
        crate::keybind::engine::KeybindEngine::new(&new_config.keybindings);
    *state.config.write() = new_config;
    Ok(())
}

#[tauri::command]
pub fn get_keybindings(
    state: State<'_, AppState>,
) -> Vec<crate::keybind::engine::KeybindEntry> {
    state.keybind_engine.read().all_bindings()
}

#[tauri::command]
pub fn update_keybinding(
    state: State<'_, AppState>,
    key: String,
    action: String,
    is_leader: bool,
) -> Result<(), String> {
    let mut config = state.config.write();
    if is_leader {
        config.keybindings.leader_bindings.insert(key, action);
    } else {
        config.keybindings.bindings.insert(key, action);
    }
    config.save()?;
    *state.keybind_engine.write() =
        crate::keybind::engine::KeybindEngine::new(&config.keybindings);
    Ok(())
}
