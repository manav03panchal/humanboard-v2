use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    modified_at: u64,
}

#[tauri::command]
fn read_file(vault_root: &str, file_path: &str) -> Result<String, String> {
    let full = PathBuf::from(vault_root).join(file_path);
    fs::read_to_string(&full).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(vault_root: &str, file_path: &str, content: &str) -> Result<(), String> {
    let full = PathBuf::from(vault_root).join(file_path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_dir(vault_root: &str, dir_path: &str) -> Result<Vec<TreeNode>, String> {
    let full = PathBuf::from(vault_root).join(dir_path);
    let mut entries = Vec::new();
    let read = fs::read_dir(&full).map_err(|e| e.to_string())?;
    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }
        let rel_path = if dir_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", dir_path, name)
        };
        let modified_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push(TreeNode {
            name,
            path: rel_path,
            is_dir: meta.is_dir(),
            modified_at,
        });
    }
    // Sort: dirs first, then alphabetically
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file, read_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
