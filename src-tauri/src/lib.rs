mod config;
mod event;
mod ipc;
mod keybind;
mod pty;
mod workspace;

use ipc::commands;
use parking_lot::RwLock;
use std::sync::Arc;
use workspace::manager::WorkspaceManager;

pub struct AppState {
    pub workspace_manager: Arc<RwLock<WorkspaceManager>>,
    pub pty_manager: Arc<pty::manager::PtyManager>,
    pub config: Arc<RwLock<config::KnotConfig>>,
    pub keybind_engine: Arc<RwLock<keybind::engine::KeybindEngine>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = config::KnotConfig::load();
    let keybind_engine = keybind::engine::KeybindEngine::new(&config.keybindings);

    let state = AppState {
        workspace_manager: Arc::new(RwLock::new(WorkspaceManager::new())),
        pty_manager: Arc::new(pty::manager::PtyManager::new()),
        config: Arc::new(RwLock::new(config)),
        keybind_engine: Arc::new(RwLock::new(keybind_engine)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::create_workspace,
            commands::list_workspaces,
            commands::switch_workspace,
            commands::delete_workspace,
            commands::create_terminal,
            commands::close_terminal,
            commands::write_to_terminal,
            commands::resize_terminal,
            commands::get_terminal_state,
            commands::list_terminals,
            commands::set_terminal_title,
            commands::get_config,
            commands::update_config,
            commands::reload_config,
            commands::get_keybindings,
            commands::update_keybinding,
            commands::save_workspace_state,
            commands::restore_workspace_state,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Watch config file for hot reload
            let config_state = app.state::<AppState>().config.clone();
            let keybind_state = app.state::<AppState>().keybind_engine.clone();
            config::watch_config(handle.clone(), config_state, keybind_state);

            log::info!("knot started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running knot");
}
