use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
}

pub struct WatcherState {
    watcher: Option<RecommendedWatcher>,
}

#[tauri::command]
pub fn watch_vault(app: AppHandle, vault_path: String) -> Result<(), String> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;

    // Stop any existing watcher
    state.watcher = None;

    let vault_root =
        std::fs::canonicalize(&vault_path).map_err(|e| format!("Invalid vault path: {e}"))?;
    let vault_root_clone = vault_root.clone();
    let app_handle = app.clone();

    let skip_dirs: Vec<&str> = vec!["node_modules", ".git", "target", "dist", ".humanboard"];

    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let kind = match event.kind {
                EventKind::Create(_) => "create",
                EventKind::Modify(_) => "modify",
                EventKind::Remove(_) => "remove",
                _ => return,
            };

            for path in &event.paths {
                let path_str = path.to_string_lossy();

                let is_theme_file = path_str.ends_with(".humanboard/theme.json")
                    || path_str.ends_with(".humanboard\\theme.json");
                let should_skip = !is_theme_file
                    && skip_dirs.iter().any(|dir| {
                        path_str.contains(&format!("/{dir}/"))
                            || path_str.contains(&format!("\\{dir}\\"))
                    });
                if should_skip {
                    continue;
                }

                if is_theme_file && kind == "modify" {
                    let _ = app_handle.emit("theme:changed", ());
                }

                if let Ok(relative) = path.strip_prefix(&vault_root_clone) {
                    let _ = app_handle.emit(
                        "vault:file-changed",
                        FileChangeEvent {
                            path: relative.to_string_lossy().to_string(),
                            kind: kind.to_string(),
                        },
                    );
                }
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {e}"))?;

    let mut watcher = watcher;
    watcher
        .watch(Path::new(&vault_path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {e}"))?;

    state.watcher = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_vault(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    state.watcher = None;
    Ok(())
}

pub fn init_watcher_state() -> Mutex<WatcherState> {
    Mutex::new(WatcherState { watcher: None })
}
