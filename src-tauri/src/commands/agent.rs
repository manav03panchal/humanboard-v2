use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

/// Tracks a running agent instance connected to a browser webview via CDP.
pub struct AgentInstance {
    pub browser_label: String,
    pub cdp_port: u16,
}

pub struct AgentManagerState {
    agents: HashMap<String, AgentInstance>,
}

pub fn init_agent_state() -> Mutex<AgentManagerState> {
    Mutex::new(AgentManagerState {
        agents: HashMap::new(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAgentResult {
    pub agent_id: String,
    pub cdp_port: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// Start an agent connected to a webview via CDP.
///
/// The `cdp_port` is the Chrome DevTools Protocol port the webview exposes.
/// The command verifies connectivity by running `agent-browser --cdp <port> snapshot`.
#[tauri::command]
pub async fn start_agent(
    app: AppHandle,
    browser_label: String,
    cdp_port: u16,
) -> Result<StartAgentResult, String> {
    let state = app.state::<Mutex<AgentManagerState>>();

    // Check if agent already exists for this label
    {
        let guard = state.lock().map_err(|e| format!("Lock error: {e}"))?;
        for (id, agent) in &guard.agents {
            if agent.browser_label == browser_label {
                return Ok(StartAgentResult {
                    agent_id: id.clone(),
                    cdp_port: agent.cdp_port,
                });
            }
        }
    }

    // Verify CDP connectivity by running a snapshot command
    let output = app
        .shell()
        .sidecar("binaries/agent-browser")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?
        .args(["--cdp", &cdp_port.to_string(), "snapshot", "--compact"])
        .output()
        .await
        .map_err(|e| format!("Failed to run agent-browser: {e}"))?;

    if output.status.code() != Some(0) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Failed to connect to webview CDP on port {cdp_port}: {stderr}"
        ));
    }

    let agent_id = uuid::Uuid::new_v4().to_string();

    let mut guard = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    guard.agents.insert(
        agent_id.clone(),
        AgentInstance {
            browser_label,
            cdp_port,
        },
    );

    Ok(StartAgentResult { agent_id, cdp_port })
}

/// Run a browser automation task on an active agent.
///
/// The `command` is passed directly to agent-browser (e.g. "snapshot", "click @e1",
/// "eval document.title"). Arguments are split by whitespace.
#[tauri::command]
pub async fn run_agent_task(
    app: AppHandle,
    agent_id: String,
    command: String,
) -> Result<AgentTaskResult, String> {
    let cdp_port = {
        let state = app.state::<Mutex<AgentManagerState>>();
        let guard = state.lock().map_err(|e| format!("Lock error: {e}"))?;
        let agent = guard
            .agents
            .get(&agent_id)
            .ok_or_else(|| format!("Agent not found: {agent_id}"))?;
        agent.cdp_port
    };

    // Parse command string into args, respecting quoted strings
    let task_args = parse_command_args(&command);
    if task_args.is_empty() {
        return Err("Empty command".into());
    }

    let mut all_args = vec!["--cdp".to_string(), cdp_port.to_string()];
    all_args.extend(task_args);

    let args_refs: Vec<&str> = all_args.iter().map(|s| s.as_str()).collect();

    let output = app
        .shell()
        .sidecar("binaries/agent-browser")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?
        .args(&args_refs)
        .output()
        .await
        .map_err(|e| format!("Failed to run agent-browser: {e}"))?;

    let success = output.status.code() == Some(0);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(AgentTaskResult {
        stdout,
        stderr,
        success,
    })
}

/// Stop an agent and clean up its state.
#[tauri::command]
pub async fn stop_agent(
    app: AppHandle,
    agent_id: String,
) -> Result<(), String> {
    let cdp_port = {
        let state = app.state::<Mutex<AgentManagerState>>();
        let mut guard = state.lock().map_err(|e| format!("Lock error: {e}"))?;
        let agent = guard
            .agents
            .remove(&agent_id)
            .ok_or_else(|| format!("Agent not found: {agent_id}"))?;
        agent.cdp_port
    };

    // Attempt to close the browser session via agent-browser
    let _ = app
        .shell()
        .sidecar("binaries/agent-browser")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?
        .args(["--cdp", &cdp_port.to_string(), "close"])
        .output()
        .await;

    Ok(())
}

/// Parse a command string into arguments, respecting double-quoted strings.
fn parse_command_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ' ' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_command_args_simple() {
        assert_eq!(
            parse_command_args("snapshot --compact"),
            vec!["snapshot", "--compact"]
        );
    }

    #[test]
    fn test_parse_command_args_quoted() {
        assert_eq!(
            parse_command_args(r#"fill @e1 "hello world""#),
            vec!["fill", "@e1", "hello world"]
        );
    }

    #[test]
    fn test_parse_command_args_eval() {
        assert_eq!(
            parse_command_args("eval document.title"),
            vec!["eval", "document.title"]
        );
    }

    #[test]
    fn test_parse_command_args_empty() {
        assert!(parse_command_args("").is_empty());
    }

    #[test]
    fn test_init_agent_state() {
        let state = init_agent_state();
        let guard = state.lock().unwrap();
        assert!(guard.agents.is_empty());
    }
}
