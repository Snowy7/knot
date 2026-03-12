use portable_pty::{Child, MasterPty, PtySize};
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

/// A single PTY session — one real shell process with I/O channels.
pub struct PtySession {
    pub id: String,
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send + Sync>,
    pub writer: Box<dyn Write + Send>,
    alive: Arc<AtomicBool>,
}

impl PtySession {
    pub fn spawn(
        id: String,
        shell: &str,
        cwd: Option<&str>,
        cols: u16,
        rows: u16,
        env_vars: Vec<(String, String)>,
    ) -> Result<(Self, mpsc::UnboundedReceiver<Vec<u8>>), PtyError> {
        let pty_system = portable_pty::native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let mut cmd = portable_pty::CommandBuilder::new(shell);

        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        for (key, val) in &env_vars {
            cmd.env(key, val);
        }

        // Set TERM
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        // Drop slave — we only need the master side
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let alive = Arc::new(AtomicBool::new(true));

        // Spawn reader thread — streams PTY output to a channel
        let (tx, rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let alive_clone = alive.clone();

        std::thread::spawn(move || {
            let mut reader = BufReader::with_capacity(8192, reader);
            let mut buf = [0u8; 4096];

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        alive_clone.store(false, Ordering::Relaxed);
                        break;
                    }
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        alive_clone.store(false, Ordering::Relaxed);
                        break;
                    }
                }
            }
        });

        Ok((
            Self {
                id,
                master: pair.master,
                child,
                writer,
                alive,
            },
            rx,
        ))
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), PtyError> {
        self.writer
            .write_all(data)
            .map_err(|e| PtyError::WriteFailed(e.to_string()))?;
        self.writer
            .flush()
            .map_err(|e| PtyError::WriteFailed(e.to_string()))?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::ResizeFailed(e.to_string()))?;
        Ok(())
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        self.alive.store(false, Ordering::Relaxed);
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PtyError {
    #[error("failed to spawn PTY: {0}")]
    SpawnFailed(String),
    #[error("write failed: {0}")]
    WriteFailed(String),
    #[error("resize failed: {0}")]
    ResizeFailed(String),
    #[error("session not found: {0}")]
    NotFound(String),
}

impl serde::Serialize for PtyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
