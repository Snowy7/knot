# knot

Terminal workspace manager for parallel development.

Run many terminals per workspace — agents, dev servers, test runners, logs — without splitting your screen into unreadable rectangles.

## Architecture

- **Frontend**: Vanilla JS + xterm.js (WebGL-accelerated terminal rendering)
- **Backend**: Rust + Tauri v2 (lightweight native shell)
- **PTY**: portable-pty (cross-platform process management)
- **Config**: TOML-based, hot-reloadable

## Development

```bash
# Install dependencies
npm install

# Run in development mode (Tauri + Vite)
npm run tauri dev

# Build for production
npm run tauri build
```

## Config

Config lives at `~/.config/knot/config.toml`.

```toml
[shell]
program = "/bin/zsh"

[font]
family = "JetBrains Mono"
size = 14

[terminal]
scrollback = 10000
cursor_style = "block"
cursor_blink = true

[keybindings]
leader = "ctrl+a"

[keybindings.bindings]
"ctrl+shift+t" = "new_terminal"
"ctrl+shift+d" = "split_right"
"ctrl+shift+e" = "split_down"
```

## Keybindings

### Direct shortcuts
| Key | Action |
|-----|--------|
| `Ctrl+Shift+T` | New terminal |
| `Ctrl+Shift+W` | Close terminal |
| `Ctrl+Shift+D` | Split right |
| `Ctrl+Shift+E` | Split down |
| `Ctrl+Shift+]` | Next terminal |
| `Ctrl+Shift+[` | Previous terminal |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+M` | Toggle maximize pane |
| `Ctrl+Shift+F` | Find in terminal |

### Leader key (Ctrl+A by default)
| Sequence | Action |
|----------|--------|
| `Leader, c` | New terminal |
| `Leader, x` | Close terminal |
| `Leader, \|` | Split right |
| `Leader, -` | Split down |
| `Leader, h/j/k/l` | Navigate panes |
| `Leader, z` | Toggle maximize |
| `Leader, 1-9` | Jump to terminal |

## License

MIT
