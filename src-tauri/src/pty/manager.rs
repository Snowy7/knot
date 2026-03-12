use super::session::{PtyError, PtySession};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

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
    ) -> Result<(), PtyError> {
        let shell = shell.unwrap_or_else(|| {
            // Borrow from the lock, but we need to return a &str
            // So we'll just use the default
            ""
        });

        let effective_shell = if shell.is_empty() {
            self.default_shell.lock().clone()
        } else {
            shell.to_string()
        };

        let (session, rx) = PtySession::spawn(
            id.clone(),
            &effective_shell,
            cwd,
            cols,
            rows,
            env_vars,
        )?;

        let session = Arc::new(Mutex::new(session));
        self.sessions.lock().insert(id.clone(), session);

        // Spawn async task to forward PTY output to frontend
        let terminal_id = id.clone();
        tokio::spawn(async move {
            forward_output(rx, terminal_id, app_handle).await;
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

/// Forward PTY output bytes to the frontend via Tauri events.
async fn forward_output(
    mut rx: mpsc::UnboundedReceiver<Vec<u8>>,
    terminal_id: String,
    app_handle: AppHandle,
) {
    // Batch output to reduce IPC overhead — collect for up to 8ms or 16KB
    let mut batch = Vec::with_capacity(16384);

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Some(data) => {
                        batch.extend_from_slice(&data);

                        // Drain any immediately available data
                        while let Ok(more) = rx.try_recv() {
                            batch.extend_from_slice(&more);
                            if batch.len() > 16384 {
                                break;
                            }
                        }

                        // Emit batched data
                        let payload = TerminalOutput {
                            terminal_id: terminal_id.clone(),
                            data: batch.clone(),
                        };
                        let _ = app_handle.emit("terminal-output", &payload);
                        batch.clear();
                    }
                    None => {
                        // Channel closed — PTY died
                        let _ = app_handle.emit("terminal-exit", &terminal_id);
                        break;
                    }
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(8)) => {
                if !batch.is_empty() {
                    let payload = TerminalOutput {
                        terminal_id: terminal_id.clone(),
                        data: batch.clone(),
                    };
                    let _ = app_handle.emit("terminal-output", &payload);
                    batch.clear();
                }
            }
        }
    }
}

#[derive(serde::Serialize, Clone)]
struct TerminalOutput {
    terminal_id: String,
    data: Vec<u8>,
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
