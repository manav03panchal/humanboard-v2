use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub(crate) const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".humanboard"];
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
    let resolved = fs::canonicalize(&full).unwrap_or_else(|_| normalize_path(&full));
    if !resolved.starts_with(&root) {
        return Err("Path traversal denied".into());
    }
    Ok(resolved)
}

#[tauri::command]
pub async fn read_file(vault_root: String, file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
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
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_file(vault_root: String, file_path: String, content: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path = validate_path(&vault_root, &file_path)?;
        fs::write(&path, content).map_err(|e| format!("Cannot save {file_path}: {e}"))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_file_into_vault(
    source_path: String,
    vault_root: String,
    dest_relative: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let src = Path::new(&source_path);
        if !src.exists() {
            return Err(format!("Source file not found: {source_path}"));
        }
        let root = fs::canonicalize(&vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
        let dest = normalize_path(&root.join(&dest_relative));
        if !dest.starts_with(&root) {
            return Err("Destination path traversal denied".into());
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Cannot create directory: {e}"))?;
        }
        let final_dest = if dest.exists() {
            let stem = dest.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = dest.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
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
        let relative = final_dest.strip_prefix(&root).unwrap_or(&final_dest).to_string_lossy().to_string();
        Ok(relative)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_dir(vault_root: String, dir_path: String) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let root = fs::canonicalize(&vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
        let target = if dir_path.is_empty() {
            root.clone()
        } else {
            validate_path(&vault_root, &dir_path)?
        };
        read_dir_recursive(&root, &target, 0)
    }).await.map_err(|e| e.to_string())?
}

/// Normalize a path by resolving `.` and `..` components without requiring the path to exist.
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => { components.pop(); }
            std::path::Component::CurDir => {}
            c => components.push(c),
        }
    }
    components.iter().collect()
}

/// Validate that a joined path stays within the vault root (for paths that may not exist yet).
fn validate_new_path(vault_root: &str, requested: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
    let full = normalize_path(&root.join(requested));
    if !full.starts_with(&root) {
        return Err("Path traversal denied".into());
    }
    Ok(full)
}

#[tauri::command]
pub async fn create_file(vault_root: String, file_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let full = validate_new_path(&vault_root, &file_path)?;
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dirs: {e}"))?;
        }
        fs::write(&full, "").map_err(|e| format!("Cannot create file: {e}"))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_dir(vault_root: String, dir_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let full = validate_new_path(&vault_root, &dir_path)?;
        fs::create_dir_all(&full).map_err(|e| format!("Cannot create directory: {e}"))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rename_entry(vault_root: String, old_path: String, new_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let old_full = validate_path(&vault_root, &old_path)?;
        let new_full = validate_new_path(&vault_root, &new_path)?;
        if let Some(parent) = new_full.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dirs: {e}"))?;
        }
        fs::rename(&old_full, &new_full).map_err(|e| format!("Cannot rename: {e}"))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_entry(vault_root: String, entry_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path = validate_path(&vault_root, &entry_path)?;
        let sym_metadata = fs::symlink_metadata(&path).map_err(|e| format!("Cannot access: {e}"))?;
        if sym_metadata.file_type().is_symlink() {
            return fs::remove_file(&path).map_err(|e| format!("Cannot delete symlink: {e}"));
        }
        let metadata = fs::metadata(&path).map_err(|e| format!("Cannot access: {e}"))?;
        if metadata.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| format!("Cannot delete directory: {e}"))
        } else {
            fs::remove_file(&path).map_err(|e| format!("Cannot delete file: {e}"))
        }
    }).await.map_err(|e| e.to_string())?
}

const MAX_RECURSION_DEPTH: u32 = 32;

fn read_dir_recursive(vault_root: &Path, dir: &Path, depth: u32) -> Result<Vec<FileEntry>, String> {
    if depth > MAX_RECURSION_DEPTH {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| format!("Cannot read directory: {e}"))?;
    for entry in read {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let file_type = entry.file_type().map_err(|e| format!("File type error: {e}"))?;
        if file_type.is_symlink() {
            continue;
        }
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
            if let Ok(children) = read_dir_recursive(vault_root, &full_path, depth + 1) {
                entries.extend(children);
            }
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs as stdfs;
    use tempfile::TempDir;

    fn setup() -> TempDir {
        TempDir::new().unwrap()
    }

    #[tokio::test]
    async fn test_create_file() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        create_file(root.clone(), "hello.txt".into()).await.unwrap();
        assert!(dir.path().join("hello.txt").exists());
        assert_eq!(stdfs::read_to_string(dir.path().join("hello.txt")).unwrap(), "");
    }

    #[tokio::test]
    async fn test_create_file_nested() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        create_file(root.clone(), "sub/deep/file.md".into()).await.unwrap();
        assert!(dir.path().join("sub/deep/file.md").exists());
    }

    #[tokio::test]
    async fn test_create_file_path_traversal() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        let result = create_file(root.clone(), "../../evil.txt".into()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path traversal denied"));
    }

    #[tokio::test]
    async fn test_create_dir() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        create_dir(root.clone(), "new_folder".into()).await.unwrap();
        assert!(dir.path().join("new_folder").is_dir());
    }

    #[tokio::test]
    async fn test_create_dir_nested() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        create_dir(root.clone(), "a/b/c".into()).await.unwrap();
        assert!(dir.path().join("a/b/c").is_dir());
    }

    #[tokio::test]
    async fn test_create_dir_path_traversal() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        let result = create_dir(root.clone(), "../../evil_dir".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rename_entry_file() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        stdfs::write(dir.path().join("old.txt"), "content").unwrap();
        rename_entry(root.clone(), "old.txt".into(), "new.txt".into()).await.unwrap();
        assert!(!dir.path().join("old.txt").exists());
        assert!(dir.path().join("new.txt").exists());
        assert_eq!(stdfs::read_to_string(dir.path().join("new.txt")).unwrap(), "content");
    }

    #[tokio::test]
    async fn test_rename_entry_dir() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        stdfs::create_dir(dir.path().join("old_dir")).unwrap();
        rename_entry(root.clone(), "old_dir".into(), "new_dir".into()).await.unwrap();
        assert!(!dir.path().join("old_dir").exists());
        assert!(dir.path().join("new_dir").is_dir());
    }

    #[tokio::test]
    async fn test_rename_entry_path_traversal() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        stdfs::write(dir.path().join("file.txt"), "").unwrap();
        let result = rename_entry(root.clone(), "file.txt".into(), "../../evil.txt".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_delete_entry_file() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        stdfs::write(dir.path().join("to_delete.txt"), "bye").unwrap();
        delete_entry(root.clone(), "to_delete.txt".into()).await.unwrap();
        assert!(!dir.path().join("to_delete.txt").exists());
    }

    #[tokio::test]
    async fn test_delete_entry_dir() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        stdfs::create_dir(dir.path().join("to_delete_dir")).unwrap();
        stdfs::write(dir.path().join("to_delete_dir/child.txt"), "").unwrap();
        delete_entry(root.clone(), "to_delete_dir".into()).await.unwrap();
        assert!(!dir.path().join("to_delete_dir").exists());
    }

    #[tokio::test]
    async fn test_delete_entry_nonexistent() {
        let dir = setup();
        let root = dir.path().to_string_lossy().to_string();
        let result = delete_entry(root.clone(), "nonexistent.txt".into()).await;
        assert!(result.is_err());
    }
}
