use log::{info, warn};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use tauri::Emitter;

use crate::commands::resolve_aws_cli;
use crate::commands::tunnels::{
    build_enriched_path, fetch_role_credentials, resolve_session_manager_plugin,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSession {
    pub id: String,
    pub instance_id: String,
    pub instance_name: Option<String>,
    pub region: String,
    pub started_at: String,
    pub status: ShellSessionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ShellSessionStatus {
    Connected,
    Disconnected,
}

/// Handle to a running PTY session
struct PtyHandle {
    /// Writer to send input to the PTY
    writer: Box<dyn Write + Send>,
    /// Pair kept alive so the master fd stays open
    _pair: portable_pty::PtyPair,
    /// Session metadata
    info: ShellSession,
    /// Reader thread handle
    _reader_handle: std::thread::JoinHandle<()>,
    /// Child process
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Shared state for all shell sessions
#[derive(Default)]
pub struct ShellState {
    handles: Arc<Mutex<HashMap<String, PtyHandle>>>,
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartShellParams {
    pub access_token: String,
    pub account_id: String,
    pub role_name: String,
    pub sso_region: String,
    pub instance_id: String,
    pub instance_name: Option<String>,
    pub region: String,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Start an interactive SSM shell session
#[tauri::command]
pub async fn start_shell_session(
    state: tauri::State<'_, ShellState>,
    app: tauri::AppHandle,
    params: StartShellParams,
) -> Result<ShellSession, String> {
    let StartShellParams {
        access_token,
        account_id,
        role_name,
        sso_region,
        instance_id,
        instance_name,
        region,
    } = params;

    info!("Starting shell session to {instance_id} in {region}");

    // Check plugin
    if resolve_session_manager_plugin().is_none() {
        return Err(
            "session-manager-plugin is not installed. Install it from https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
                .to_string(),
        );
    }

    // Get STS credentials
    let (ak, sk, st) = fetch_role_credentials(&access_token, &account_id, &role_name, &sso_region)?;

    // Create PTY
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // Build command
    let enriched_path = build_enriched_path();
    let aws_cli = resolve_aws_cli();

    let mut cmd = CommandBuilder::new(&aws_cli);
    cmd.args([
        "ssm",
        "start-session",
        "--target",
        &instance_id,
        "--region",
        &region,
    ]);
    cmd.env("PATH", enriched_path);
    cmd.env("AWS_CONFIG_FILE", "/dev/null");
    cmd.env("AWS_ACCESS_KEY_ID", ak);
    cmd.env("AWS_SECRET_ACCESS_KEY", sk);
    cmd.env("AWS_SESSION_TOKEN", st);
    // Set TERM so the remote shell behaves correctly
    cmd.env("TERM", "xterm-256color");

    // Spawn inside the PTY
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn SSM session: {e}"))?;

    // Get reader from the master side
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    // Get writer for input
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    let session_id = Uuid::new_v4().to_string();

    let session_info = ShellSession {
        id: session_id.clone(),
        instance_id,
        instance_name,
        region,
        started_at: chrono_now(),
        status: ShellSessionStatus::Connected,
    };

    // Spawn a thread to read PTY output and emit Tauri events
    let event_session_id = session_id.clone();
    let app_handle = app.clone();
    let reader_handle = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let data = &buf[..n];
                    // Emit as base64 to safely pass binary data through JSON
                    use base64::Engine;
                    let encoded = base64::engine::general_purpose::STANDARD.encode(data);
                    let event_name = format!("shell-output-{event_session_id}");
                    let _ = app_handle.emit(&event_name, encoded);
                }
                Err(e) => {
                    warn!("PTY read error for session {event_session_id}: {e}");
                    break;
                }
            }
        }
        info!("PTY reader thread exiting for session {event_session_id}");
    });

    // Store handle
    let handle = PtyHandle {
        writer,
        _pair: pair,
        info: session_info.clone(),
        _reader_handle: reader_handle,
        child,
    };

    let mut handles = state.handles.lock().await;
    handles.insert(session_id, handle);

    info!("Shell session started for {}", session_info.instance_id);
    Ok(session_info)
}

/// Write input data to a shell session
#[tauri::command]
pub async fn write_shell_input(
    state: tauri::State<'_, ShellState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut handles = state.handles.lock().await;
    if let Some(handle) = handles.get_mut(&session_id) {
        // Data comes as base64
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&data)
            .map_err(|e| format!("Invalid base64: {e}"))?;
        handle
            .writer
            .write_all(&bytes)
            .map_err(|e| format!("Failed to write to PTY: {e}"))?;
        handle
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {e}"))?;
        Ok(())
    } else {
        Err(format!("Session {session_id} not found"))
    }
}

/// Resize a shell session's PTY
#[tauri::command]
pub async fn resize_shell(
    state: tauri::State<'_, ShellState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let handles = state.handles.lock().await;
    if let Some(handle) = handles.get(&session_id) {
        handle
            ._pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {e}"))?;
        Ok(())
    } else {
        Err(format!("Session {session_id} not found"))
    }
}

/// Stop a shell session
#[tauri::command]
pub async fn stop_shell_session(
    state: tauri::State<'_, ShellState>,
    session_id: String,
) -> Result<(), String> {
    info!("Stopping shell session {session_id}");

    let mut handles = state.handles.lock().await;
    if let Some(mut handle) = handles.remove(&session_id) {
        // Kill the child process
        let _ = handle.child.kill();
        let _ = handle.child.wait();
        info!("Shell session {session_id} stopped");
        Ok(())
    } else {
        Err(format!("Session {session_id} not found"))
    }
}

/// List active shell sessions
#[tauri::command]
pub async fn list_shell_sessions(
    state: tauri::State<'_, ShellState>,
) -> Result<Vec<ShellSession>, String> {
    let mut handles = state.handles.lock().await;
    let mut dead_ids = Vec::new();

    // Check which sessions are still alive
    for (id, handle) in handles.iter_mut() {
        if let Ok(Some(_status)) = handle.child.try_wait() {
            dead_ids.push(id.clone());
        }
    }

    // Remove dead sessions
    for id in &dead_ids {
        if let Some(mut h) = handles.remove(id) {
            h.info.status = ShellSessionStatus::Disconnected;
            info!("Shell session {id} has exited");
        }
    }

    let sessions: Vec<ShellSession> = handles.values().map(|h| h.info.clone()).collect();
    Ok(sessions)
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    // Simple ISO-ish timestamp without pulling in chrono
    format!("{secs}")
}
