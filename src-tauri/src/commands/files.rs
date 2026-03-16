use base64::{engine::general_purpose::STANDARD, Engine};
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
pub fn copy_file_into_vault(
    source_path: String,
    vault_root: String,
    dest_relative: String,
) -> Result<String, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err(format!("Source file not found: {source_path}"));
    }
    let root = fs::canonicalize(&vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
    let dest = root.join(&dest_relative);
    // Ensure dest is within vault
    if !dest.starts_with(&root) {
        return Err("Destination path traversal denied".into());
    }
    // Create parent dirs if needed
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create directory: {e}"))?;
    }
    // Handle name collision — append (1), (2), etc.
    let final_dest = if dest.exists() {
        let stem = dest
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = dest
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let parent = dest.parent().unwrap_or(&root);
        let mut candidate = dest.clone();
        let mut i = 1;
        while candidate.exists() {
            candidate = parent.join(format!("{stem} ({i}){ext}"));
            i += 1;
        }
        candidate
    } else {
        dest
    };
    fs::copy(src, &final_dest).map_err(|e| format!("Cannot copy file: {e}"))?;
    let relative = final_dest
        .strip_prefix(&root)
        .unwrap_or(&final_dest)
        .to_string_lossy()
        .to_string();
    Ok(relative)
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

#[tauri::command]
pub fn read_file_base64(vault_root: String, file_path: String) -> Result<String, String> {
    let path = validate_path(&vault_root, &file_path)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read {file_path}: {e}"))?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("File too large (max 10MB for images)".into());
    }
    let content = fs::read(&path).map_err(|e| format!("Cannot read {file_path}: {e}"))?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    };
    let b64 = STANDARD.encode(&content);
    Ok(format!("data:{};base64,{}", mime, b64))
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
