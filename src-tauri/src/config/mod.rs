use keybind_model::KeybindConfig;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

pub mod keybind_model;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnotConfig {
    #[serde(default)]
    pub shell: ShellConfig,
    #[serde(default)]
    pub font: FontConfig,
    #[serde(default)]
    pub theme: ThemeConfig,
    #[serde(default)]
    pub window: WindowConfig,
    #[serde(default)]
    pub terminal: TerminalConfig,
    #[serde(default)]
    pub keybindings: KeybindConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellConfig {
    #[serde(default = "default_shell")]
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontConfig {
    #[serde(default = "default_font_family")]
    pub family: String,
    #[serde(default = "default_font_size")]
    pub size: f64,
    #[serde(default = "default_line_height")]
    pub line_height: f64,
    #[serde(default)]
    pub ligatures: bool,
    #[serde(default = "default_font_weight")]
    pub weight: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    #[serde(default = "default_theme")]
    pub name: String,
    #[serde(default)]
    pub custom: Option<ColorScheme>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorScheme {
    pub foreground: String,
    pub background: String,
    pub cursor: String,
    pub selection_bg: String,
    pub selection_fg: String,
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    pub bright_black: String,
    pub bright_red: String,
    pub bright_green: String,
    pub bright_yellow: String,
    pub bright_blue: String,
    pub bright_magenta: String,
    pub bright_cyan: String,
    pub bright_white: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default)]
    pub blur: bool,
    #[serde(default = "default_padding")]
    pub padding: u32,
    #[serde(default = "default_true")]
    pub decorations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    #[serde(default = "default_scrollback")]
    pub scrollback: u32,
    #[serde(default = "default_cursor_style")]
    pub cursor_style: String,
    #[serde(default = "default_true")]
    pub cursor_blink: bool,
    #[serde(default = "default_true")]
    pub copy_on_select: bool,
    #[serde(default = "default_true")]
    pub clickable_urls: bool,
    #[serde(default = "default_bell")]
    pub bell: String,
}

// Defaults
fn default_shell() -> String {
    #[cfg(unix)]
    { std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()) }
    #[cfg(windows)]
    { "powershell.exe".to_string() }
}
fn default_font_family() -> String { "JetBrains Mono".to_string() }
fn default_font_size() -> f64 { 14.0 }
fn default_line_height() -> f64 { 1.2 }
fn default_font_weight() -> u16 { 400 }
fn default_theme() -> String { "knot-dark".to_string() }
fn default_opacity() -> f64 { 1.0 }
fn default_padding() -> u32 { 8 }
fn default_scrollback() -> u32 { 10000 }
fn default_cursor_style() -> String { "block".to_string() }
fn default_bell() -> String { "visual".to_string() }
fn default_true() -> bool { true }

impl Default for ShellConfig {
    fn default() -> Self {
        Self { program: default_shell(), args: vec![] }
    }
}

impl Default for FontConfig {
    fn default() -> Self {
        Self {
            family: default_font_family(),
            size: default_font_size(),
            line_height: default_line_height(),
            ligatures: false,
            weight: default_font_weight(),
        }
    }
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self { name: default_theme(), custom: None }
    }
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            opacity: default_opacity(),
            blur: false,
            padding: default_padding(),
            decorations: true,
        }
    }
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            scrollback: default_scrollback(),
            cursor_style: default_cursor_style(),
            cursor_blink: true,
            copy_on_select: true,
            clickable_urls: true,
            bell: default_bell(),
        }
    }
}

impl Default for KnotConfig {
    fn default() -> Self {
        Self {
            shell: ShellConfig::default(),
            font: FontConfig::default(),
            theme: ThemeConfig::default(),
            window: WindowConfig::default(),
            terminal: TerminalConfig::default(),
            keybindings: KeybindConfig::default(),
        }
    }
}

impl KnotConfig {
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("knot")
            .join("config.toml")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => match toml::from_str(&content) {
                    Ok(config) => return config,
                    Err(e) => log::warn!("failed to parse config: {}", e),
                },
                Err(e) => log::warn!("failed to read config: {}", e),
            }
        }
        Self::default()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let toml = toml::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, toml).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Watch config file for changes and hot-reload.
pub fn watch_config(
    app_handle: tauri::AppHandle,
    config: Arc<RwLock<KnotConfig>>,
    keybind_engine: Arc<RwLock<crate::keybind::engine::KeybindEngine>>,
) {
    use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

    let config_path = KnotConfig::config_path();
    if !config_path.exists() {
        return;
    }

    let watch_path = config_path.clone();
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher: RecommendedWatcher =
            notify::Watcher::new(tx, notify::Config::default().with_poll_interval(std::time::Duration::from_secs(2)))
                .expect("failed to create watcher");

        if let Some(parent) = watch_path.parent() {
            watcher.watch(parent, RecursiveMode::NonRecursive).ok();
        }

        for event in rx {
            if let Ok(Event { kind: EventKind::Modify(_), .. }) = event {
                log::info!("config file changed, reloading");
                let new_config = KnotConfig::load();
                *keybind_engine.write() =
                    crate::keybind::engine::KeybindEngine::new(&new_config.keybindings);
                *config.write() = new_config;

                use tauri::Emitter;
                let _ = app_handle.emit("config-reloaded", ());
            }
        }
    });
}
