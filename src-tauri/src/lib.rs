use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn save_canvas(vault_path: String, snapshot: String) -> Result<(), String> {
    let dir = PathBuf::from(&vault_path).join(".humanboard");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("canvas.json");
    fs::write(file, snapshot).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_canvas(vault_path: String) -> Result<Option<String>, String> {
    let file = PathBuf::from(&vault_path).join(".humanboard").join("canvas.json");
    if !file.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(file).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_canvas, load_canvas])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
