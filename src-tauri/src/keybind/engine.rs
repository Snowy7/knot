use crate::config::keybind_model::KeybindConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Keybinding engine — resolves key sequences to action names.
pub struct KeybindEngine {
    /// Direct bindings: key combo string -> action name
    direct: HashMap<String, String>,
    /// Leader-prefixed bindings: after leader, key -> action
    leader: HashMap<String, String>,
    /// The leader key combo string
    leader_key: Option<String>,
    /// Whether we're currently in "leader mode" (waiting for second key)
    pub leader_active: bool,
}

impl KeybindEngine {
    pub fn new(config: &KeybindConfig) -> Self {
        Self {
            direct: config.bindings.clone(),
            leader: config.leader_bindings.clone(),
            leader_key: config.leader.clone(),
            leader_active: false,
        }
    }

    /// Resolve a key event to an action. Returns the action name if matched.
    pub fn resolve(&mut self, key_combo: &str) -> KeybindResult {
        // If leader mode is active, check leader bindings
        if self.leader_active {
            self.leader_active = false;
            if let Some(action) = self.leader.get(key_combo) {
                return KeybindResult::Action(action.clone());
            }
            // Leader was pressed but follow-up didn't match — pass through
            return KeybindResult::Passthrough;
        }

        // Check if this is the leader key
        if let Some(ref leader) = self.leader_key {
            if key_combo == leader {
                self.leader_active = true;
                return KeybindResult::LeaderActivated;
            }
        }

        // Check direct bindings
        if let Some(action) = self.direct.get(key_combo) {
            return KeybindResult::Action(action.clone());
        }

        KeybindResult::Passthrough
    }

    /// Reset leader state (e.g., on timeout or escape).
    pub fn reset_leader(&mut self) {
        self.leader_active = false;
    }

    /// Get all bindings for display in command palette / help.
    pub fn all_bindings(&self) -> Vec<KeybindEntry> {
        let mut entries: Vec<KeybindEntry> = self
            .direct
            .iter()
            .map(|(key, action)| KeybindEntry {
                key: key.clone(),
                action: action.clone(),
                is_leader: false,
            })
            .collect();

        if let Some(ref leader) = self.leader_key {
            for (key, action) in &self.leader {
                entries.push(KeybindEntry {
                    key: format!("{} → {}", leader, key),
                    action: action.clone(),
                    is_leader: true,
                });
            }
        }

        entries.sort_by(|a, b| a.action.cmp(&b.action));
        entries
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum KeybindResult {
    /// A keybinding matched — execute this action
    Action(String),
    /// Leader key was pressed — waiting for follow-up
    LeaderActivated,
    /// No binding matched — pass key to terminal
    Passthrough,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeybindEntry {
    pub key: String,
    pub action: String,
    pub is_leader: bool,
}
