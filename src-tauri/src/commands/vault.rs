use std::fs;
use std::path::Path;

#[tauri::command]
pub fn get_git_branch(vault_path: String) -> Option<String> {
    let head_path = Path::new(&vault_path).join(".git/HEAD");
    let content = fs::read_to_string(head_path).ok()?;
    let trimmed = content.trim();
    if let Some(ref_path) = trimmed.strip_prefix("ref: refs/heads/") {
        Some(ref_path.to_string())
    } else {
        // Detached HEAD — return short hash
        Some(trimmed.chars().take(7).collect())
    }
}

#[tauri::command]
pub fn init_vault(path: String, vault_root: tauri::State<'_, crate::VaultRoot>) -> Result<(), String> {
    let vault_dir = Path::new(&path).join(".humanboard");
    if !vault_dir.exists() {
        fs::create_dir_all(&vault_dir).map_err(|e| format!("Cannot create .humanboard: {e}"))?;
    }
    let config_path = vault_dir.join("config.json");
    if !config_path.exists() {
        fs::write(&config_path, "{}").map_err(|e| format!("Cannot write config: {e}"))?;
    }
    let git_dir = Path::new(&path).join(".git");
    if git_dir.exists() {
        let gitignore_path = Path::new(&path).join(".gitignore");
        let content = if gitignore_path.exists() {
            fs::read_to_string(&gitignore_path).unwrap_or_default()
        } else {
            String::new()
        };
        if !content
            .lines()
            .any(|l| l.trim() == ".humanboard/" || l.trim() == ".humanboard")
        {
            let mut new_content = content;
            if !new_content.is_empty() && !new_content.ends_with('\n') {
                new_content.push('\n');
            }
            new_content.push_str(".humanboard/\n");
            fs::write(&gitignore_path, new_content)
                .map_err(|e| format!("Cannot update .gitignore: {e}"))?;
        }
    }
    *vault_root.0.lock().unwrap() = Some(path.clone());
    Ok(())
}

#[tauri::command]
pub fn save_canvas(vault_path: String, snapshot: String, vault_root: tauri::State<'_, crate::VaultRoot>) -> Result<(), String> {
    let stored = vault_root.0.lock().unwrap();
    if let Some(ref root) = *stored {
        if vault_path != *root {
            return Err("Vault path does not match the stored vault root".into());
        }
    }
    drop(stored);
    let canvas_path = Path::new(&vault_path).join(".humanboard/canvas.json");
    fs::write(&canvas_path, snapshot).map_err(|e| format!("Cannot save canvas: {e}"))
}

#[tauri::command]
pub fn load_canvas(vault_path: String, vault_root: tauri::State<'_, crate::VaultRoot>) -> Result<Option<String>, String> {
    let stored = vault_root.0.lock().unwrap();
    if let Some(ref root) = *stored {
        if vault_path != *root {
            return Err("Vault path does not match the stored vault root".into());
        }
    }
    drop(stored);
    let canvas_path = Path::new(&vault_path).join(".humanboard/canvas.json");
    if !canvas_path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&canvas_path).map_err(|e| format!("Cannot load canvas: {e}"))?;
    Ok(Some(content))
}
