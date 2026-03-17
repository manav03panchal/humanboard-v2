use tauri::{AppHandle, Manager, Url, WebviewBuilder, WebviewUrl};

/// Create a native child webview on the main window.
#[tauri::command]
pub async fn create_webview(
    app: AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // Close any existing webview with the same label first
    if let Some(existing) = app.get_webview(&label) {
        let _ = existing.close();
    }

    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url));

    main_window
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Close and destroy a child webview by label.
#[tauri::command]
pub async fn close_webview(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Navigate an existing webview to a new URL.
#[tauri::command]
pub async fn navigate_webview(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", label))?;
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;
    wv.navigate(parsed_url).map_err(|e| e.to_string())
}

/// Navigate the webview back in history.
#[tauri::command]
pub async fn webview_go_back(app: AppHandle, label: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", label))?;
    wv.eval("history.back()").map_err(|e| e.to_string())
}

/// Navigate the webview forward in history.
#[tauri::command]
pub async fn webview_go_forward(app: AppHandle, label: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", label))?;
    wv.eval("history.forward()").map_err(|e| e.to_string())
}

/// Reload the webview.
#[tauri::command]
pub async fn webview_reload(app: AppHandle, label: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", label))?;
    wv.reload().map_err(|e| e.to_string())
}
