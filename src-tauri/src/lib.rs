mod commands;

use std::sync::Mutex;
pub struct VaultRoot(pub Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .manage(VaultRoot(Mutex::new(None)))
        .manage(commands::watcher::init_watcher_state())
        .manage(commands::lsp::init_lsp_state())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_file,
            commands::files::write_file,
            commands::files::read_dir,
            commands::files::copy_file_into_vault,
            commands::files::create_file,
            commands::files::create_dir,
            commands::files::rename_entry,
            commands::files::delete_entry,
            commands::vault::init_vault,
            commands::vault::save_canvas,
            commands::vault::load_canvas,
            commands::watcher::watch_vault,
            commands::watcher::unwatch_vault,
            commands::lsp::lsp_start,
            commands::lsp::lsp_send,
            commands::lsp::lsp_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
