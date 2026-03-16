use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".humanboard"];
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5MB

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified_at: u64,
}

fn validate_path(vault_root: &str, requested: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
    let full = root.join(requested);
    let resolved = fs::canonicalize(&full).unwrap_or(full.clone());
    if !resolved.starts_with(&root) {
        return Err("Path traversal denied".into());
    }
    Ok(resolved)
}

#[tauri::command]
pub fn read_file(vault_root: String, file_path: String) -> Result<String, String> {
    let path = validate_path(&vault_root, &file_path)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read {file_path}: {e}"))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err("File too large to open as editor (max 5MB)".into());
    }
    let content = fs::read(&path).map_err(|e| format!("Cannot read {file_path}: {e}"))?;
    if content.contains(&0u8) {
        return Err("Binary files are not supported".into());
    }
    String::from_utf8(content).map_err(|_| "File is not valid UTF-8".into())
}

#[tauri::command]
pub fn write_file(vault_root: String, file_path: String, content: String) -> Result<(), String> {
    let path = validate_path(&vault_root, &file_path)?;
    fs::write(&path, content).map_err(|e| format!("Cannot save {file_path}: {e}"))
}

#[tauri::command]
pub fn read_dir(vault_root: String, dir_path: String) -> Result<Vec<FileEntry>, String> {
    let root = fs::canonicalize(&vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
    let target = if dir_path.is_empty() {
        root.clone()
    } else {
        validate_path(&vault_root, &dir_path)?
    };
    read_dir_recursive(&root, &target)
}

fn read_dir_recursive(vault_root: &Path, dir: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| format!("Cannot read directory: {e}"))?;
    for entry in read {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".gitignore" {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| format!("Metadata error: {e}"))?;
        let is_dir = metadata.is_dir();
        if is_dir && SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let full_path = entry.path();
        let relative = full_path.strip_prefix(vault_root).unwrap_or(&full_path);
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push(FileEntry {
            name,
            path: relative.to_string_lossy().to_string(),
            is_dir,
            modified_at,
        });
        if is_dir {
            if let Ok(children) = read_dir_recursive(vault_root, &full_path) {
                entries.extend(children);
            }
        }
    }
    Ok(entries)
}
