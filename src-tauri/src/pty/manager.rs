use super::session::{PtyError, PtySession};
use crate::ipc::commands::TerminalOutput;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};

/// Manages all PTY sessions across all workspaces.
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Arc<Mutex<PtySession>>>>,
    default_shell: Mutex<String>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            default_shell: Mutex::new(detect_shell()),
        }
    }

    pub fn set_default_shell(&self, shell: String) {
        *self.default_shell.lock() = shell;
    }

    pub fn create_session(
        &self,
        id: String,
        shell: Option<&str>,
        cwd: Option<&str>,
        cols: u16,
        rows: u16,
        env_vars: Vec<(String, String)>,
        app_handle: AppHandle,
        on_output: Channel<TerminalOutput>,
    ) -> Result<(), PtyError> {
        let effective_shell = match shell {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => self.default_shell.lock().clone(),
        };

        log::info!("PTY: spawning shell='{}' cwd={:?} cols={} rows={}", effective_shell, cwd, cols, rows);

        let (session, rx) = PtySession::spawn(
            id.clone(),
            &effective_shell,
            cwd,
            cols,
            rows,
            env_vars,
        )?;

        log::info!("PTY: session '{}' spawned successfully", id);

        let session = Arc::new(Mutex::new(session));
        self.sessions.lock().insert(id.clone(), session);

        // Spawn a plain thread to forward PTY output to frontend via channel
        let terminal_id = id.clone();
        std::thread::spawn(move || {
            forward_output(rx, terminal_id, app_handle, on_output);
        });

        Ok(())
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), PtyError> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(id)
            .ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        session.lock().write(data)
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), PtyError> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(id)
            .ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        session.lock().resize(cols, rows)
    }

    pub fn close(&self, id: &str) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock();
        if let Some(session) = sessions.remove(id) {
            session.lock().kill();
            Ok(())
        } else {
            Err(PtyError::NotFound(id.to_string()))
        }
    }

    pub fn is_alive(&self, id: &str) -> bool {
        let sessions = self.sessions.lock();
        sessions
            .get(id)
            .map(|s| s.lock().is_alive())
            .unwrap_or(false)
    }

    pub fn session_count(&self) -> usize {
        self.sessions.lock().len()
    }

    pub fn active_ids(&self) -> Vec<String> {
        self.sessions.lock().keys().cloned().collect()
    }
}

/// Forward PTY output bytes to the frontend via Tauri channel.
/// Runs on a dedicated thread — batches output to reduce IPC overhead.
fn forward_output(
    rx: mpsc::Receiver<Vec<u8>>,
    terminal_id: String,
    app_handle: AppHandle,
    on_output: Channel<TerminalOutput>,
) {
    let mut batch = Vec::with_capacity(16384);

    log::info!("PTY forward: starting for '{}'", terminal_id);
    let mut total_bytes: usize = 0;

    loop {
        // Block until first chunk arrives
        match rx.recv() {
            Ok(data) => {
                batch.extend_from_slice(&data);

                // Drain any immediately available data (non-blocking)
                while let Ok(more) = rx.try_recv() {
                    batch.extend_from_slice(&more);
                    if batch.len() > 16384 {
                        break;
                    }
                }

                total_bytes += batch.len();
                if total_bytes <= 8192 {
                    log::info!("PTY forward '{}': sending {} bytes via channel (total: {})", terminal_id, batch.len(), total_bytes);
                }

                // Send via channel (direct to JS callback, no event system)
                let payload = TerminalOutput {
                    terminal_id: terminal_id.clone(),
                    data: batch.clone(),
                };
                if let Err(e) = on_output.send(payload) {
                    log::error!("PTY forward '{}': channel send failed: {}", terminal_id, e);
                }
                batch.clear();
            }
            Err(_) => {
                // mpsc channel closed — PTY process exited
                log::info!("PTY forward '{}': PTY exited (total bytes: {})", terminal_id, total_bytes);
                let _ = app_handle.emit("terminal-exit", &terminal_id);
                break;
            }
        }
    }
}

fn detect_shell() -> String {
    #[cfg(unix)]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    }
}
