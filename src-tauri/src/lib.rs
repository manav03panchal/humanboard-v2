mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .manage(commands::watcher::init_watcher_state())
        .manage(commands::lsp::init_lsp_state())
        .manage(commands::agent::init_agent_state())
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
            commands::webview::create_webview,
            commands::webview::close_webview,
            commands::webview::navigate_webview,
            commands::webview::webview_go_back,
            commands::webview::webview_go_forward,
            commands::webview::webview_reload,
            commands::agent::start_agent,
            commands::agent::run_agent_task,
            commands::agent::stop_agent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
