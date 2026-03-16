use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

static NEXT_ID: AtomicU32 = AtomicU32::new(1);

pub struct LspServer {
    child: Child,
    stdin: ChildStdin,
    language: String,
    vault_path: String,
}

pub struct LspManagerState {
    servers: HashMap<u32, LspServer>,
}

pub fn init_lsp_state() -> Mutex<LspManagerState> {
    Mutex::new(LspManagerState {
        servers: HashMap::new(),
    })
}

fn get_lsp_binary(language: &str) -> Result<(String, Vec<String>), String> {
    match language {
        "typescript" | "javascript" => Ok((
            "typescript-language-server".into(),
            vec!["--stdio".into()],
        )),
        "rust" => Ok(("rust-analyzer".into(), vec![])),
        "python" => {
            // Try pyright-langserver first, fall back to pylsp
            if which_exists("pyright-langserver") {
                Ok(("pyright-langserver".into(), vec!["--stdio".into()]))
            } else if which_exists("pylsp") {
                Ok(("pylsp".into(), vec![]))
            } else {
                Err("No Python language server found. Install pyright-langserver or pylsp.".into())
            }
        }
        "css" => Ok((
            "vscode-css-language-server".into(),
            vec!["--stdio".into()],
        )),
        "html" => Ok((
            "vscode-html-language-server".into(),
            vec!["--stdio".into()],
        )),
        "json" => Ok((
            "vscode-json-language-server".into(),
            vec!["--stdio".into()],
        )),
        _ => Err(format!("No language server configured for '{language}'")),
    }
}

/// Check if a binary exists on PATH.
fn which_exists(binary: &str) -> bool {
    Command::new("which")
        .arg(binary)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn lsp_start(app: AppHandle, language: String, vault_path: String) -> Result<u32, String> {
    let state = app.state::<Mutex<LspManagerState>>();
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;

    // Check if server already running for this language+vault
    for (id, server) in &state.servers {
        if server.language == language && server.vault_path == vault_path {
            return Ok(*id);
        }
    }

    let (binary, args) = get_lsp_binary(&language)?;
    let mut child = Command::new(&binary)
        .args(&args)
        .current_dir(&vault_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start {binary}: {e}. Is it installed?"))?;

    let server_id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;

    // Spawn stdout reader thread
    let app_handle = app.clone();
    let event_name = format!("lsp_response_{server_id}");
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            // Read Content-Length header
            let mut header = String::new();
            match reader.read_line(&mut header) {
                Ok(0) | Err(_) => break,
                _ => {}
            }
            if !header.starts_with("Content-Length:") {
                continue;
            }
            let len: usize = header
                .trim()
                .strip_prefix("Content-Length:")
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);
            if len == 0 {
                continue;
            }

            // Read blank line separator
            let mut blank = String::new();
            let _ = reader.read_line(&mut blank);

            // Read JSON body
            let mut body = vec![0u8; len];
            if std::io::Read::read_exact(&mut reader, &mut body).is_err() {
                break;
            }

            if let Ok(msg) = String::from_utf8(body) {
                let _ = app_handle.emit(&event_name, msg);
            }
        }
    });

    state.servers.insert(
        server_id,
        LspServer {
            child,
            stdin,
            language,
            vault_path,
        },
    );

    Ok(server_id)
}

#[tauri::command]
pub fn lsp_send(app: AppHandle, server_id: u32, message: String) -> Result<(), String> {
    let state = app.state::<Mutex<LspManagerState>>();
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    let server = state
        .servers
        .get_mut(&server_id)
        .ok_or("LSP server not found")?;

    let header = format!("Content-Length: {}\r\n\r\n", message.len());
    server
        .stdin
        .write_all(header.as_bytes())
        .map_err(|e| format!("Failed to write to LSP: {e}"))?;
    server
        .stdin
        .write_all(message.as_bytes())
        .map_err(|e| format!("Failed to write to LSP: {e}"))?;
    server
        .stdin
        .flush()
        .map_err(|e| format!("Failed to flush LSP: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn lsp_stop(app: AppHandle, server_id: u32) -> Result<(), String> {
    let state = app.state::<Mutex<LspManagerState>>();
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    if let Some(mut server) = state.servers.remove(&server_id) {
        let _ = server.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_lsp_binary_typescript() {
        let (bin, args) = get_lsp_binary("typescript").unwrap();
        assert_eq!(bin, "typescript-language-server");
        assert_eq!(args, vec!["--stdio"]);
    }

    #[test]
    fn test_get_lsp_binary_javascript() {
        let (bin, args) = get_lsp_binary("javascript").unwrap();
        assert_eq!(bin, "typescript-language-server");
        assert_eq!(args, vec!["--stdio"]);
    }

    #[test]
    fn test_get_lsp_binary_rust() {
        let (bin, args) = get_lsp_binary("rust").unwrap();
        assert_eq!(bin, "rust-analyzer");
        assert!(args.is_empty());
    }

    #[test]
    fn test_get_lsp_binary_python() {
        // Should succeed with either pyright-langserver or pylsp
        let result = get_lsp_binary("python");
        // On CI neither may be installed, so we just check no panic
        // If one is installed, verify the binary name
        if let Ok((bin, _)) = &result {
            assert!(bin == "pyright-langserver" || bin == "pylsp");
        }
    }

    #[test]
    fn test_get_lsp_binary_css() {
        let (bin, args) = get_lsp_binary("css").unwrap();
        assert_eq!(bin, "vscode-css-language-server");
        assert_eq!(args, vec!["--stdio"]);
    }

    #[test]
    fn test_get_lsp_binary_html() {
        let (bin, args) = get_lsp_binary("html").unwrap();
        assert_eq!(bin, "vscode-html-language-server");
        assert_eq!(args, vec!["--stdio"]);
    }

    #[test]
    fn test_get_lsp_binary_json() {
        let (bin, args) = get_lsp_binary("json").unwrap();
        assert_eq!(bin, "vscode-json-language-server");
        assert_eq!(args, vec!["--stdio"]);
    }

    #[test]
    fn test_get_lsp_binary_unknown() {
        let result = get_lsp_binary("brainfuck");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("No language server configured"));
    }

    #[test]
    fn test_init_lsp_state() {
        let state = init_lsp_state();
        let guard = state.lock().unwrap();
        assert!(guard.servers.is_empty());
    }
}
