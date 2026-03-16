mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .manage(commands::watcher::init_watcher_state())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_file,
            commands::files::write_file,
            commands::files::read_dir,
            commands::files::copy_file_into_vault,
            commands::vault::init_vault,
            commands::vault::save_canvas,
            commands::vault::load_canvas,
            commands::watcher::watch_vault,
            commands::watcher::unwatch_vault,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
