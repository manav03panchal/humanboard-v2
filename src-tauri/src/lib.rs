mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_file,
            commands::files::write_file,
            commands::files::read_dir,
            commands::files::read_file_base64,
            commands::vault::init_vault,
            commands::vault::save_canvas,
            commands::vault::load_canvas,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
