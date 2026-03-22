mod commands;

use std::sync::Mutex;
use tauri::Emitter;
pub struct VaultRoot(pub Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            // macOS: intercept Cmd+W (close) — let JS decide whether to close tab or window
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // Main window: always intercept, let JS handle
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                } else {
                    // Secondary windows: intercept so JS can handle, but JS will destroy
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
            }
            // Linux/Windows: let close happen normally
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (window, event);
            }
        })
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
            commands::vault::get_git_branch,
            commands::watcher::watch_vault,
            commands::watcher::unwatch_vault,
            commands::lsp::lsp_start,
            commands::lsp::lsp_send,
            commands::lsp::lsp_stop,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: clicking dock icon when no windows visible — re-show main window
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
            }
        });
}
