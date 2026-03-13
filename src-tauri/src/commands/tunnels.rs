use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Kill an entire process group (the process and all its children).
/// Falls back to killing just the process if PGID lookup fails.
#[cfg(unix)]
fn kill_process_group(child: &tokio::process::Child) {
    use nix::sys::signal::{killpg, Signal};
    use nix::unistd::Pid;

    if let Some(pid) = child.id() {
        let pgid = Pid::from_raw(pid as i32);
        if let Err(e) = killpg(pgid, Signal::SIGTERM) {
            warn!("killpg({pgid}) failed: {e}, will try SIGKILL on pid");
            // Fallback: kill just the process
            let _ = killpg(pgid, Signal::SIGKILL);
        }
    }
}

use crate::commands::resolve_aws_cli;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// SSM-managed EC2 instance from describe-instance-information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsmInstance {
    pub instance_id: String,
    #[serde(default)]
    pub instance_name: Option<String>,
    #[serde(default)]
    pub computer_name: Option<String>,
    #[serde(default, alias = "IPAddress")]
    pub ip_address: Option<String>,
    #[serde(default)]
    pub platform_type: Option<String>,
    #[serde(default)]
    pub ping_status: String,
}

/// AWS CLI JSON response for describe-instance-information
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DescribeInstancesResponse {
    instance_information_list: Vec<SsmInstanceRaw>,
}

/// EC2 instance from describe-instances --query (Name tag lookup)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Ec2Instance {
    instance_id: String,
    #[serde(default)]
    tags: Vec<Ec2Tag>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Ec2Tag {
    key: String,
    value: String,
}

/// Raw SSM instance from AWS CLI (PascalCase fields)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SsmInstanceRaw {
    instance_id: String,
    #[serde(default)]
    computer_name: Option<String>,
    #[serde(default, alias = "IPAddress")]
    ip_address: Option<String>,
    #[serde(default)]
    platform_type: Option<String>,
    #[serde(default)]
    ping_status: Option<String>,
}

impl From<SsmInstanceRaw> for SsmInstance {
    fn from(raw: SsmInstanceRaw) -> Self {
        Self {
            instance_id: raw.instance_id,
            instance_name: None, // enriched later via ec2 describe-instances
            computer_name: raw.computer_name,
            ip_address: raw.ip_address,
            platform_type: raw.platform_type,
            ping_status: raw.ping_status.unwrap_or_else(|| "Unknown".to_string()),
        }
    }
}

/// Saved tunnel configuration (persisted to disk)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelConfig {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub role_name: String,
    pub instance_id: String,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub region: String,
    pub use_random_port: bool,
}

/// Runtime state of an active tunnel
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTunnel {
    pub id: String,
    pub config_name: Option<String>,
    pub instance_id: String,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub region: String,
    pub status: TunnelStatus,
    pub started_at: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TunnelStatus {
    Connecting,
    Connected,
    Disconnected,
    Error,
}

// ---------------------------------------------------------------------------
// Managed state
// ---------------------------------------------------------------------------

struct TunnelHandle {
    child: tokio::process::Child,
    info: ActiveTunnel,
}

pub struct TunnelState {
    handles: Arc<Mutex<HashMap<String, TunnelHandle>>>,
}

impl Default for TunnelState {
    fn default() -> Self {
        Self {
            handles: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl TunnelState {
    /// Kill all running tunnel processes (called on app exit)
    #[allow(dead_code)]
    pub async fn kill_all(&self) {
        let mut handles = self.handles.lock().await;
        for (id, handle) in handles.iter_mut() {
            info!("Killing tunnel {id} on app exit");
            #[cfg(unix)]
            kill_process_group(&handle.child);
            let _ = handle.child.kill().await;
        }
        handles.clear();
    }
}

// ---------------------------------------------------------------------------
// Session manager plugin detection
// ---------------------------------------------------------------------------

fn resolve_session_manager_plugin() -> Option<String> {
    let candidates = [
        "/usr/local/sessionmanagerplugin/bin/session-manager-plugin",
        "/usr/local/bin/session-manager-plugin",
        "/opt/homebrew/bin/session-manager-plugin",
    ];

    // Check ~/.local/bin
    if let Some(home) = dirs::home_dir() {
        let local = home
            .join(".local")
            .join("bin")
            .join("session-manager-plugin");
        if local.exists() {
            return Some(local.to_string_lossy().to_string());
        }
    }

    for candidate in &candidates {
        if PathBuf::from(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    // Try PATH via `which`
    if let Ok(output) = Command::new("which").arg("session-manager-plugin").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

/// Build a PATH that includes common locations for `session-manager-plugin`
/// and `aws`. Inside a macOS `.app` bundle the inherited PATH is typically
/// just `/usr/bin:/bin:/usr/sbin:/sbin`, which is not enough.
fn build_enriched_path() -> String {
    let mut dirs: Vec<String> = Vec::new();

    // Directory of the resolved session-manager-plugin binary
    if let Some(plugin_path) = resolve_session_manager_plugin() {
        if let Some(parent) = std::path::Path::new(&plugin_path).parent() {
            dirs.push(parent.to_string_lossy().to_string());
        }
    }

    // Directory of the resolved aws CLI binary
    let aws_path = resolve_aws_cli();
    if let Some(parent) = std::path::Path::new(&aws_path).parent() {
        let p = parent.to_string_lossy().to_string();
        if !dirs.contains(&p) {
            dirs.push(p);
        }
    }

    // Well-known locations that may not be on the default .app PATH
    let extra = [
        "/usr/local/sessionmanagerplugin/bin",
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    for d in &extra {
        let s = d.to_string();
        if !dirs.contains(&s) {
            dirs.push(s);
        }
    }

    // ~/.local/bin
    if let Some(home) = dirs::home_dir() {
        let local_bin = home
            .join(".local")
            .join("bin")
            .to_string_lossy()
            .to_string();
        if !dirs.contains(&local_bin) {
            dirs.push(local_bin);
        }
    }

    // Append the current PATH (if any) to preserve anything else
    if let Ok(current) = std::env::var("PATH") {
        for segment in current.split(':') {
            let s = segment.to_string();
            if !s.is_empty() && !dirs.contains(&s) {
                dirs.push(s);
            }
        }
    }

    dirs.join(":")
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

fn tunnels_config_path() -> PathBuf {
    super::charon_home_dir().join("tunnels.json")
}

fn load_tunnel_configs() -> Vec<TunnelConfig> {
    let path = tunnels_config_path();
    if !path.exists() {
        return Vec::new();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_tunnel_configs(configs: &[TunnelConfig]) -> Result<(), String> {
    let path = tunnels_config_path();
    let json =
        serde_json::to_string_pretty(configs).map_err(|e| format!("Serialize error: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write error: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helper: get STS credentials via AWS CLI
// ---------------------------------------------------------------------------

fn fetch_role_credentials(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    sso_region: &str,
) -> Result<(String, String, String), String> {
    let output = Command::new(resolve_aws_cli())
        .args([
            "sso",
            "get-role-credentials",
            "--access-token",
            access_token,
            "--account-id",
            account_id,
            "--role-name",
            role_name,
            "--region",
            sso_region,
            "--output",
            "json",
        ])
        .env("AWS_CONFIG_FILE", "/dev/null")
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get credentials: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse credentials: {e}"))?;

    let rc = &v["roleCredentials"];
    let ak = rc["accessKeyId"]
        .as_str()
        .ok_or("Missing accessKeyId")?
        .to_string();
    let sk = rc["secretAccessKey"]
        .as_str()
        .ok_or("Missing secretAccessKey")?
        .to_string();
    let st = rc["sessionToken"]
        .as_str()
        .ok_or("Missing sessionToken")?
        .to_string();

    Ok((ak, sk, st))
}

// ---------------------------------------------------------------------------
// Helper: fetch EC2 Name tags for a list of instance IDs
// ---------------------------------------------------------------------------

fn fetch_instance_names(
    ak: &str,
    sk: &str,
    st: &str,
    region: &str,
    instance_ids: &[&str],
) -> Result<HashMap<String, String>, String> {
    let count = instance_ids.len();
    let output = Command::new(resolve_aws_cli())
        .args([
            "ec2",
            "describe-instances",
            "--region",
            region,
            "--instance-ids",
        ])
        .args(instance_ids)
        .args([
            "--query",
            "Reservations[].Instances[].{InstanceId:InstanceId,Tags:Tags}",
            "--output",
            "json",
        ])
        .env("AWS_CONFIG_FILE", "/dev/null")
        .env("AWS_ACCESS_KEY_ID", ak)
        .env("AWS_SECRET_ACCESS_KEY", sk)
        .env("AWS_SESSION_TOKEN", st)
        .output()
        .map_err(|e| format!("Failed to run ec2 describe-instances: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ec2 describe-instances failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let items: Vec<Ec2Instance> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse EC2 response: {e}"))?;

    let mut name_map = HashMap::new();
    for item in items {
        if let Some(name_tag) = item.tags.iter().find(|t| t.key == "Name") {
            if !name_tag.value.is_empty() {
                name_map.insert(item.instance_id.clone(), name_tag.value.clone());
            }
        }
    }

    info!(
        "Resolved Name tags for {}/{} instances",
        name_map.len(),
        count
    );
    Ok(name_map)
}

// ---------------------------------------------------------------------------
// Helper: current ISO8601 timestamp
// ---------------------------------------------------------------------------

fn now_iso8601() -> String {
    // Simple epoch-based UTC timestamp without chrono dependency
    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Format as ISO 8601 (simplified)
    let secs_per_day = 86400u64;
    let secs_per_hour = 3600u64;
    let secs_per_min = 60u64;

    let days = epoch / secs_per_day;
    let rem = epoch % secs_per_day;
    let hour = rem / secs_per_hour;
    let min = (rem % secs_per_hour) / secs_per_min;
    let sec = rem % secs_per_min;

    // Days since 1970-01-01
    let (year, month, day) = days_to_ymd(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let month_lengths: [u64; 12] = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for &ml in &month_lengths {
        if days < ml {
            break;
        }
        days -= ml;
        month += 1;
    }
    (year, month, days + 1)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Check if session-manager-plugin is installed
#[tauri::command]
pub fn check_session_manager_plugin() -> bool {
    let found = resolve_session_manager_plugin().is_some();
    info!("Session manager plugin found: {found}");
    found
}

/// List EC2 instances with SSM agent running
#[tauri::command]
pub fn list_ssm_instances(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    sso_region: &str,
    target_region: &str,
) -> Result<Vec<SsmInstance>, String> {
    info!("Listing SSM instances for {role_name} in {account_id} (region: {target_region})");

    let (ak, sk, st) = fetch_role_credentials(access_token, account_id, role_name, sso_region)?;

    let output = Command::new(resolve_aws_cli())
        .args([
            "ssm",
            "describe-instance-information",
            "--region",
            target_region,
            "--output",
            "json",
        ])
        .env("AWS_CONFIG_FILE", "/dev/null")
        .env("AWS_ACCESS_KEY_ID", &ak)
        .env("AWS_SECRET_ACCESS_KEY", &sk)
        .env("AWS_SESSION_TOKEN", &st)
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list SSM instances: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: DescribeInstancesResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse response: {e}"))?;

    let mut instances: Vec<SsmInstance> = response
        .instance_information_list
        .into_iter()
        .map(SsmInstance::from)
        .collect();

    // Enrich with EC2 Name tags
    if !instances.is_empty() {
        let instance_ids: Vec<&str> = instances.iter().map(|i| i.instance_id.as_str()).collect();
        match fetch_instance_names(&ak, &sk, &st, target_region, &instance_ids) {
            Ok(name_map) => {
                for inst in &mut instances {
                    if let Some(name) = name_map.get(&inst.instance_id) {
                        inst.instance_name = Some(name.clone());
                    }
                }
            }
            Err(e) => {
                warn!("Could not fetch EC2 Name tags (non-fatal): {e}");
            }
        }
    }

    info!("Found {} SSM instances", instances.len());
    Ok(instances)
}

/// Parameters for starting a tunnel (avoids clippy::too_many_arguments)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTunnelParams {
    pub access_token: String,
    pub account_id: String,
    pub role_name: String,
    pub sso_region: String,
    pub instance_id: String,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub region: String,
    pub config_name: Option<String>,
}

/// Start an SSM port-forwarding tunnel
#[tauri::command]
pub async fn start_tunnel(
    state: tauri::State<'_, TunnelState>,
    params: StartTunnelParams,
) -> Result<ActiveTunnel, String> {
    let StartTunnelParams {
        access_token,
        account_id,
        role_name,
        sso_region,
        instance_id,
        remote_host,
        remote_port,
        local_port,
        region,
        config_name,
    } = params;
    info!(
        "Starting tunnel to {remote_host}:{remote_port} via {instance_id} (local port: {local_port})"
    );

    // Check plugin is available
    if resolve_session_manager_plugin().is_none() {
        return Err(
            "session-manager-plugin is not installed. Install it from https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
                .to_string(),
        );
    }

    // Get STS credentials
    let (ak, sk, st) = fetch_role_credentials(&access_token, &account_id, &role_name, &sso_region)?;

    // Build SSM parameters JSON
    let params = serde_json::json!({
        "host": [remote_host],
        "portNumber": [remote_port.to_string()],
        "localPortNumber": [local_port.to_string()],
    })
    .to_string();

    // Build a rich PATH so the spawned aws CLI can find session-manager-plugin
    // even inside a macOS .app bundle (which has a minimal default PATH).
    let enriched_path = build_enriched_path();

    // Spawn the SSM session in its own process group so we can kill the
    // entire tree (aws cli + session-manager-plugin) on disconnect.
    let mut cmd = tokio::process::Command::new(resolve_aws_cli());
    cmd.args([
        "ssm",
        "start-session",
        "--target",
        &instance_id,
        "--document-name",
        "AWS-StartPortForwardingSessionToRemoteHost",
        "--parameters",
        &params,
        "--region",
        &region,
    ])
    .env("PATH", &enriched_path)
    .env("AWS_CONFIG_FILE", "/dev/null")
    .env("AWS_ACCESS_KEY_ID", &ak)
    .env("AWS_SECRET_ACCESS_KEY", &sk)
    .env("AWS_SESSION_TOKEN", &st)
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());

    // Create a new process group so killpg() reaches all children
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start SSM session: {e}"))?;

    let tunnel_id = Uuid::new_v4().to_string();

    let tunnel_info = ActiveTunnel {
        id: tunnel_id.clone(),
        config_name,
        instance_id,
        remote_host,
        remote_port,
        local_port,
        region,
        status: TunnelStatus::Connected,
        started_at: now_iso8601(),
        error_message: None,
    };

    let handle = TunnelHandle {
        child,
        info: tunnel_info.clone(),
    };

    let mut handles = state.handles.lock().await;
    handles.insert(tunnel_id, handle);

    info!("Tunnel started, listening on localhost:{local_port}");
    Ok(tunnel_info)
}

/// Stop an active tunnel
#[tauri::command]
pub async fn stop_tunnel(
    state: tauri::State<'_, TunnelState>,
    tunnel_id: String,
) -> Result<(), String> {
    info!("Stopping tunnel {tunnel_id}");

    let mut handles = state.handles.lock().await;
    if let Some(mut handle) = handles.remove(&tunnel_id) {
        // Kill the entire process group (aws cli + session-manager-plugin)
        #[cfg(unix)]
        kill_process_group(&handle.child);

        // Also call kill() to ensure the tokio child handle is cleaned up
        let _ = handle.child.kill().await;

        info!("Tunnel {tunnel_id} stopped");
        Ok(())
    } else {
        Err(format!("Tunnel {tunnel_id} not found"))
    }
}

/// List all active tunnels with updated status
#[tauri::command]
pub async fn list_active_tunnels(
    state: tauri::State<'_, TunnelState>,
) -> Result<Vec<ActiveTunnel>, String> {
    let mut handles = state.handles.lock().await;
    let mut dead_ids = Vec::new();

    // Check status of each tunnel
    for (id, handle) in handles.iter_mut() {
        match handle.child.try_wait() {
            Ok(Some(exit_status)) => {
                // Process has exited — try to read stderr for details
                let mut stderr_msg = String::new();
                if let Some(mut stderr) = handle.child.stderr.take() {
                    use tokio::io::AsyncReadExt;
                    let mut buf = Vec::new();
                    let _ = stderr.read_to_end(&mut buf).await;
                    stderr_msg = String::from_utf8_lossy(&buf).trim().to_string();
                }

                if exit_status.success() {
                    handle.info.status = TunnelStatus::Disconnected;
                } else {
                    let code = exit_status.code().unwrap_or(-1);
                    warn!(
                        "Tunnel {} exited with code {code}: {stderr_msg}",
                        handle.info.id
                    );
                    handle.info.status = TunnelStatus::Error;
                    let detail = if stderr_msg.is_empty() {
                        format!("Process exited with code {code}")
                    } else {
                        format!("Exit code {code}: {stderr_msg}")
                    };
                    handle.info.error_message = Some(detail);
                }
                dead_ids.push(id.clone());
            }
            Ok(None) => {
                // Still running
                handle.info.status = TunnelStatus::Connected;
            }
            Err(e) => {
                warn!("Error checking tunnel {id}: {e}");
                handle.info.status = TunnelStatus::Error;
                handle.info.error_message = Some(format!("Status check failed: {e}"));
                dead_ids.push(id.clone());
            }
        }
    }

    // Collect all tunnel info before removing dead ones
    let tunnels: Vec<ActiveTunnel> = handles.values().map(|h| h.info.clone()).collect();

    // Remove dead tunnels
    for id in dead_ids {
        handles.remove(&id);
    }

    Ok(tunnels)
}

/// List saved tunnel configurations
#[tauri::command]
pub fn list_tunnel_configs() -> Result<Vec<TunnelConfig>, String> {
    info!("Loading saved tunnel configs");
    Ok(load_tunnel_configs())
}

/// Save a tunnel configuration
#[tauri::command]
pub fn save_tunnel_config(config: TunnelConfig) -> Result<(), String> {
    info!("Saving tunnel config: {}", config.name);

    let mut configs = load_tunnel_configs();

    // Generate ID if empty (new config)
    let config = if config.id.is_empty() {
        TunnelConfig {
            id: Uuid::new_v4().to_string(),
            ..config
        }
    } else {
        config
    };

    // Update existing or append
    if let Some(existing) = configs.iter_mut().find(|c| c.id == config.id) {
        *existing = config;
    } else {
        configs.push(config);
    }

    save_tunnel_configs(&configs)
}

/// Delete a saved tunnel configuration
#[tauri::command]
pub fn delete_tunnel_config(id: String) -> Result<(), String> {
    info!("Deleting tunnel config: {id}");

    let mut configs = load_tunnel_configs();
    let len_before = configs.len();
    configs.retain(|c| c.id != id);

    if configs.len() == len_before {
        return Err(format!("Tunnel config {id} not found"));
    }

    save_tunnel_configs(&configs)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ssm_instance_deserialize() {
        let json = r#"{
            "InstanceId": "i-0abc123def456",
            "ComputerName": "bastion-01",
            "IPAddress": "10.0.1.50",
            "PlatformType": "Linux",
            "PingStatus": "Online"
        }"#;
        let raw: SsmInstanceRaw = serde_json::from_str(json).unwrap();
        let instance = SsmInstance::from(raw);
        assert_eq!(instance.instance_id, "i-0abc123def456");
        assert!(instance.instance_name.is_none()); // enriched separately
        assert_eq!(instance.computer_name.as_deref(), Some("bastion-01"));
        assert_eq!(instance.ip_address.as_deref(), Some("10.0.1.50"));
        assert_eq!(instance.platform_type.as_deref(), Some("Linux"));
        assert_eq!(instance.ping_status, "Online");
    }

    #[test]
    fn test_ec2_name_tag_parsing() {
        let json = r#"[
            {
                "InstanceId": "i-001",
                "Tags": [
                    {"Key": "Name", "Value": "bastion-prod"},
                    {"Key": "Env", "Value": "production"}
                ]
            },
            {
                "InstanceId": "i-002",
                "Tags": [
                    {"Key": "Env", "Value": "staging"}
                ]
            },
            {
                "InstanceId": "i-003",
                "Tags": []
            }
        ]"#;
        let items: Vec<Ec2Instance> = serde_json::from_str(json).unwrap();
        assert_eq!(items.len(), 3);

        let mut name_map = HashMap::new();
        for item in &items {
            if let Some(name_tag) = item.tags.iter().find(|t| t.key == "Name") {
                if !name_tag.value.is_empty() {
                    name_map.insert(item.instance_id.clone(), name_tag.value.clone());
                }
            }
        }
        assert_eq!(name_map.len(), 1);
        assert_eq!(name_map.get("i-001").unwrap(), "bastion-prod");
        assert!(!name_map.contains_key("i-002"));
        assert!(!name_map.contains_key("i-003"));
    }

    #[test]
    fn test_describe_instances_response() {
        let json = r#"{
            "InstanceInformationList": [
                {
                    "InstanceId": "i-001",
                    "PingStatus": "Online"
                },
                {
                    "InstanceId": "i-002",
                    "PingStatus": "Offline"
                }
            ]
        }"#;
        let resp: DescribeInstancesResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.instance_information_list.len(), 2);
        assert_eq!(resp.instance_information_list[0].instance_id, "i-001");
    }

    #[test]
    fn test_tunnel_config_roundtrip() {
        let config = TunnelConfig {
            id: "test-id".to_string(),
            name: "Production DB".to_string(),
            account_id: "123456789012".to_string(),
            role_name: "AdminAccess".to_string(),
            instance_id: "i-0abc123def456".to_string(),
            remote_host: "mydb.cluster-abc.us-east-1.rds.amazonaws.com".to_string(),
            remote_port: 5432,
            local_port: 5432,
            region: "us-east-1".to_string(),
            use_random_port: false,
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: TunnelConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "Production DB");
        assert_eq!(parsed.remote_port, 5432);
        assert_eq!(parsed.use_random_port, false);
    }

    #[test]
    fn test_active_tunnel_serialization() {
        let tunnel = ActiveTunnel {
            id: "t-1".to_string(),
            config_name: Some("My Tunnel".to_string()),
            instance_id: "i-001".to_string(),
            remote_host: "db.example.com".to_string(),
            remote_port: 3306,
            local_port: 3306,
            region: "eu-west-1".to_string(),
            status: TunnelStatus::Connected,
            started_at: "2026-03-12T10:00:00Z".to_string(),
            error_message: None,
        };
        let json = serde_json::to_string(&tunnel).unwrap();
        assert!(json.contains("\"status\":\"connected\""));
        assert!(json.contains("\"remotePort\":3306"));
    }

    #[test]
    fn test_tunnel_status_variants() {
        let statuses = vec![
            (TunnelStatus::Connecting, "\"connecting\""),
            (TunnelStatus::Connected, "\"connected\""),
            (TunnelStatus::Disconnected, "\"disconnected\""),
            (TunnelStatus::Error, "\"error\""),
        ];
        for (status, expected) in statuses {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, expected);
        }
    }

    #[test]
    fn test_config_persistence() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tunnels.json");

        let configs = vec![TunnelConfig {
            id: "id-1".to_string(),
            name: "Test".to_string(),
            account_id: "111".to_string(),
            role_name: "Admin".to_string(),
            instance_id: "i-001".to_string(),
            remote_host: "host.example.com".to_string(),
            remote_port: 5432,
            local_port: 5432,
            region: "us-east-1".to_string(),
            use_random_port: false,
        }];

        let json = serde_json::to_string_pretty(&configs).unwrap();
        fs::write(&path, &json).unwrap();

        let loaded: Vec<TunnelConfig> =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "Test");
    }

    #[test]
    fn test_now_iso8601_format() {
        let ts = now_iso8601();
        // Should match YYYY-MM-DDTHH:MM:SSZ
        assert!(ts.ends_with('Z'));
        assert_eq!(ts.len(), 20);
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
    }

    #[test]
    fn test_days_to_ymd() {
        // 2026-01-01 is day 20454 since epoch
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
        // 2000-03-01 — leap year boundary
        assert_eq!(days_to_ymd(11017), (2000, 3, 1));
    }
}
