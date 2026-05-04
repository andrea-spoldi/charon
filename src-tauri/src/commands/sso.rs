use crate::aws::config;
use crate::aws::oidc::{self, OidcClient, OidcError};
use crate::aws::sso_cache::{self, SsoTokenInfo};
use crate::commands::resolve_aws_cli;
use log::{info, warn};
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Info returned to frontend when device authorization starts
#[derive(Debug, Clone, Serialize)]
pub struct DeviceAuthInfo {
    pub user_code: String,
    pub verification_uri_complete: String,
    pub device_code: String,
    pub client_id: String,
    pub client_secret: String,
    pub interval: u64,
    pub expires_in: u64,
    pub region: String,
    pub start_url: String,
}

/// Get current SSO session status by reading the token cache
#[tauri::command]
pub fn get_sso_status() -> SsoTokenInfo {
    info!("Checking SSO status");
    sso_cache::get_sso_status()
}

/// Get the SSO token for a specific named session (used to resolve per-profile tokens)
#[tauri::command]
pub fn get_session_sso_token(session_name: String) -> Result<SsoTokenInfo, String> {
    info!("Fetching SSO token for session '{session_name}'");
    sso_cache::get_session_token(&session_name)
        .ok_or_else(|| format!("No token found for session '{session_name}'"))
}

/// Initiate SSO login by running `aws sso login` (legacy / fallback)
#[tauri::command]
pub fn sso_login(session_name: &str) -> Result<String, String> {
    info!("Starting SSO login for session: {session_name}");

    let output = Command::new(resolve_aws_cli())
        .args(["sso", "login", "--sso-session", session_name])
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if output.status.success() {
        Ok("Login successful".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Login failed: {stderr}"))
    }
}

/// Start the OIDC device authorization flow natively
#[tauri::command]
pub async fn start_device_auth(session_name: String) -> Result<DeviceAuthInfo, String> {
    info!("Starting native device authorization for session: {session_name}");

    // 1. Look up session config
    let sessions = config::parse_sso_sessions();
    let session = sessions
        .iter()
        .find(|s| s.name == session_name)
        .ok_or_else(|| format!("SSO session '{session_name}' not found"))?;

    let region = &session.sso_region;
    let start_url = &session.sso_start_url;
    let scopes = session.sso_registration_scopes.as_deref();

    // 2. Register OIDC client
    let client = oidc::register_client(region, "Charon", scopes).await?;

    // 3. Start device authorization
    let device_auth = oidc::start_device_authorization(region, &client, start_url).await?;

    // 4. Open browser to verification URL
    if let Err(e) = open::that(&device_auth.verification_uri_complete) {
        warn!("Failed to open browser: {e}");
    }

    // 5. Return info to frontend
    Ok(DeviceAuthInfo {
        user_code: device_auth.user_code,
        verification_uri_complete: device_auth.verification_uri_complete,
        device_code: device_auth.device_code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        interval: device_auth.interval,
        expires_in: device_auth.expires_in,
        region: region.clone(),
        start_url: start_url.clone(),
    })
}

/// Poll for token exchange completion (blocks until success, expiry, or error)
#[tauri::command]
pub async fn poll_device_auth(
    session_name: String,
    device_code: String,
    client_id: String,
    client_secret: String,
    region: String,
    start_url: String,
    interval: u64,
) -> Result<String, String> {
    info!("Polling for device authorization completion");

    let client = OidcClient {
        client_id,
        client_secret,
        client_id_issued_at: 0,
        client_secret_expires_at: 0,
    };

    let mut poll_interval = std::cmp::max(interval, 1);

    loop {
        info!("Polling token endpoint (interval: {poll_interval}s)...");
        tokio::time::sleep(std::time::Duration::from_secs(poll_interval)).await;

        match oidc::create_token(&region, &client, &device_code).await {
            Ok(token) => {
                info!("Device authorization successful, caching token to session '{session_name}'");
                write_sso_cache(&session_name, &start_url, &region, &token, &client)?;
                return Ok("Login successful".to_string());
            }
            Err(OidcError::AuthorizationPending) => {
                // Keep polling
                continue;
            }
            Err(OidcError::SlowDown) => {
                poll_interval += 5;
                warn!("Slow down requested, increasing interval to {poll_interval}s");
                continue;
            }
            Err(OidcError::ExpiredToken) => {
                return Err("Device code expired. Please try again.".to_string());
            }
            Err(OidcError::AccessDenied(msg)) => {
                return Err(format!("Access denied: {msg}"));
            }
            Err(OidcError::Other(msg)) => {
                return Err(format!("Authentication failed: {msg}"));
            }
        }
    }
}

/// Write token to ~/.aws/sso/cache/ in AWS CLI-compatible format
fn write_sso_cache(
    session_name: &str,
    start_url: &str,
    region: &str,
    token: &oidc::OidcTokenResponse,
    client: &OidcClient,
) -> Result<(), String> {
    let cache_dir = dirs::home_dir()
        .ok_or("Could not determine home directory")?
        .join(".aws")
        .join("sso")
        .join("cache");

    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create SSO cache directory: {e}"))?;

    // AWS CLI v2 uses SHA1 of the session name as the cache filename
    // when using sso-session based configs
    let mut hasher = Sha1::new();
    hasher.update(session_name.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let cache_file = cache_dir.join(format!("{hash}.json"));

    // Compute expiration timestamp
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let expires_at_epoch = now + token.expires_in;
    let expires_at = epoch_to_utc_string(expires_at_epoch);

    // Write cache in AWS CLI-compatible format
    let cache_entry = serde_json::json!({
        "startUrl": start_url,
        "region": region,
        "accessToken": token.access_token,
        "expiresAt": expires_at,
        "clientId": client.client_id,
        "clientSecret": client.client_secret,
    });

    let content = serde_json::to_string_pretty(&cache_entry)
        .map_err(|e| format!("Failed to serialize cache entry: {e}"))?;

    std::fs::write(&cache_file, content)
        .map_err(|e| format!("Failed to write SSO cache file: {e}"))?;

    info!("Token cached to: {}", cache_file.display());
    Ok(())
}

/// Convert epoch seconds to RFC 3339 UTC timestamp (e.g. "2024-06-15T12:00:00Z").
/// Uses "Z" for UTC so Terraform/OpenTofu and AWS SDK can parse the cache file.
fn epoch_to_utc_string(epoch: u64) -> String {
    // Manual conversion to avoid pulling in chrono
    let secs_per_day: u64 = 86400;
    let secs_per_hour: u64 = 3600;
    let secs_per_min: u64 = 60;

    let mut remaining = epoch;

    // Calculate year/month/day
    let mut year: u64 = 1970;
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        let secs_in_year = days_in_year * secs_per_day;
        if remaining < secs_in_year {
            break;
        }
        remaining -= secs_in_year;
        year += 1;
    }

    let leap = is_leap_year(year);
    let days_in_months: [u64; 12] = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month: u64 = 1;
    for &days in &days_in_months {
        let secs_in_month = days * secs_per_day;
        if remaining < secs_in_month {
            break;
        }
        remaining -= secs_in_month;
        month += 1;
    }

    let day = remaining / secs_per_day + 1;
    remaining %= secs_per_day;
    let hour = remaining / secs_per_hour;
    remaining %= secs_per_hour;
    let min = remaining / secs_per_min;
    let sec = remaining % secs_per_min;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}Z")
}

fn is_leap_year(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// Logout from SSO
#[tauri::command]
pub fn sso_logout() -> Result<String, String> {
    info!("Logging out of SSO");

    let output = Command::new(resolve_aws_cli())
        .args(["sso", "logout"])
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if output.status.success() {
        Ok("Logout successful".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Logout failed: {stderr}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_epoch_to_utc_string() {
        // 2024-01-01T00:00:00Z = epoch 1704067200 (RFC 3339)
        let s = epoch_to_utc_string(1704067200);
        assert_eq!(s, "2024-01-01T00:00:00Z");
    }

    #[test]
    fn test_epoch_to_utc_string_with_time() {
        // 2024-06-15T13:30:45Z (RFC 3339)
        let s = epoch_to_utc_string(1718458245);
        assert_eq!(s, "2024-06-15T13:30:45Z");
    }

    #[test]
    fn test_is_leap_year() {
        assert!(is_leap_year(2024));
        assert!(!is_leap_year(2023));
        assert!(is_leap_year(2000));
        assert!(!is_leap_year(1900));
    }
}
