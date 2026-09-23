use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::aws::config::{aws_credentials_path, load_profile_store, save_profile_store};
use crate::commands::resolve_aws_cli;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoAccount {
    pub account_id: String,
    pub account_name: String,
    pub email_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRole {
    pub role_name: String,
    pub account_id: String,
}

/// Account with the SSO session context it came from — used for multi-portal aggregation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoAccountWithSession {
    pub account_id: String,
    pub account_name: String,
    pub email_address: String,
    pub session_name: String,
    pub access_token: String,
    pub sso_region: String,
}

/// AWS CLI JSON response for list-accounts
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListAccountsResponse {
    account_list: Vec<SsoAccount>,
}

/// AWS CLI JSON response for list-account-roles
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListAccountRolesResponse {
    role_list: Vec<AccountRole>,
}

/// List all accounts available via SSO
#[tauri::command]
pub fn list_sso_accounts(access_token: &str, region: &str) -> Result<Vec<SsoAccount>, String> {
    info!("Listing SSO accounts");

    let output = Command::new(resolve_aws_cli())
        .args([
            "sso",
            "list-accounts",
            "--access-token",
            access_token,
            "--region",
            region,
            "--output",
            "json",
        ])
        .env("AWS_CONFIG_FILE", "/dev/null")
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list accounts: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: ListAccountsResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse response: {e}"))?;

    info!("Found {} accounts", response.account_list.len());
    Ok(response.account_list)
}

/// List roles for a specific account
#[tauri::command]
pub fn list_account_roles(
    access_token: &str,
    account_id: &str,
    region: &str,
) -> Result<Vec<AccountRole>, String> {
    info!("Listing roles for account {account_id}");

    let output = Command::new(resolve_aws_cli())
        .args([
            "sso",
            "list-account-roles",
            "--access-token",
            access_token,
            "--account-id",
            account_id,
            "--region",
            region,
            "--output",
            "json",
        ])
        .env("AWS_CONFIG_FILE", "/dev/null")
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list roles: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: ListAccountRolesResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse response: {e}"))?;

    info!(
        "Found {} roles for account {account_id}",
        response.role_list.len()
    );
    Ok(response.role_list)
}

/// Temporary credentials from SSO get-role-credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: String,
    pub expiration: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetRoleCredentialsResponse {
    role_credentials: RoleCredentials,
}

/// Get temporary credentials for a role via SSO
#[tauri::command]
pub fn get_role_credentials(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    region: &str,
) -> Result<RoleCredentials, String> {
    info!("Getting role credentials for {role_name} in {account_id}");

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
            region,
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
    let response: GetRoleCredentialsResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(response.role_credentials)
}

const SIGN_IN_BASE: &str = "https://us-east-1.signin.aws.amazon.com";

/// Exchange a set of STS credentials for a one-time federation sign-in token.
fn get_signin_token(creds: &RoleCredentials, duration_secs: u64) -> Result<String, String> {
    let session_json = serde_json::json!({
        "sessionId": creds.access_key_id,
        "sessionKey": creds.secret_access_key,
        "sessionToken": creds.session_token,
    })
    .to_string();
    let encoded_session = urlencoding::encode(&session_json);

    let signin_token_url = format!(
        "{SIGN_IN_BASE}/federation?Action=getSigninToken&SessionDuration={duration_secs}&Session={encoded_session}"
    );

    let output = Command::new("curl")
        .args(["-s", &signin_token_url])
        .output()
        .map_err(|e| format!("Failed to call federation endpoint: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Federation request failed: {stderr}"));
    }

    let token_response: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse federation response: {e}"))?;

    token_response["SigninToken"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No SigninToken in federation response".to_string())
}

/// Build the federation login URL (properly encoded) for a sign-in token.
fn build_login_url(signin_token: &str, console_region: &str) -> Result<String, String> {
    let destination_url = format!(
        "https://{console_region}.console.aws.amazon.com/console/home?region={console_region}"
    );

    let mut login_url = url::Url::parse(&format!("{SIGN_IN_BASE}/federation"))
        .map_err(|e| format!("Failed to parse federation URL: {e}"))?;
    login_url
        .query_pairs_mut()
        .append_pair("Action", "login")
        .append_pair("Issuer", "Charon")
        .append_pair("Destination", &destination_url)
        .append_pair("SigninToken", signin_token);

    Ok(login_url.to_string())
}

/// Open AWS Console in the browser for a specific role via federation
#[tauri::command]
pub fn open_aws_console(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    sso_region: &str,
    console_region: &str,
    session_duration_secs: Option<u64>,
) -> Result<(), String> {
    info!("Opening AWS Console for {role_name} in {account_id} (sso_region: {sso_region}, console_region: {console_region})");

    let creds = get_role_credentials(access_token, account_id, role_name, sso_region)?;

    // Session duration: default 8h (28800s), max 12h (43200s)
    let duration = session_duration_secs.unwrap_or(28800).min(43200);

    let signin_token = get_signin_token(&creds, duration)?;
    let login_url = build_login_url(&signin_token, console_region)?;

    // Wrap in OAuth logout redirect for seamless session replacement.
    // This clears any existing console session before logging into the new one,
    // avoiding the "sign out first" interstitial page.
    let mut console_url = url::Url::parse(&format!("{SIGN_IN_BASE}/oauth"))
        .map_err(|e| format!("Failed to parse OAuth URL: {e}"))?;
    console_url
        .query_pairs_mut()
        .append_pair("Action", "logout")
        .append_pair("redirect_uri", login_url.as_str());

    open::that(console_url.as_str()).map_err(|e| format!("Failed to open browser: {e}"))?;

    info!("Opened AWS Console for {role_name} in {account_id}");
    Ok(())
}

/// Open AWS Console for a specific role in a browser window isolated to this
/// account, so it can stay signed in alongside other accounts' console sessions.
/// Unlike `open_aws_console`, this does not clear any existing console session —
/// it relies on a dedicated Chrome profile directory for cookie isolation instead,
/// and therefore requires Chrome (see `candidate_chrome_paths`).
#[tauri::command]
pub fn open_aws_console_isolated(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    sso_region: &str,
    console_region: &str,
    session_duration_secs: Option<u64>,
) -> Result<(), String> {
    info!("Opening isolated AWS Console session for {role_name} in {account_id} (sso_region: {sso_region}, console_region: {console_region})");

    let chrome_path = resolve_chrome_path().ok_or(
        "Isolated console sessions require Google Chrome. Set its location in Settings -> Google Chrome Location.",
    )?;

    let creds = get_role_credentials(access_token, account_id, role_name, sso_region)?;
    let duration = session_duration_secs.unwrap_or(28800).min(43200);
    let signin_token = get_signin_token(&creds, duration)?;
    let login_url = build_login_url(&signin_token, console_region)?;

    let profile_dir = browser_profile_dir(&charon_data_dir(), account_id);
    fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Failed to create browser profile directory: {e}"))?;

    build_isolated_launch_command(&chrome_path, &profile_dir, &login_url)
        .spawn()
        .map_err(|e| format!("Failed to launch isolated browser session: {e}"))?;

    info!("Opened isolated AWS Console session for {role_name} in {account_id}");
    Ok(())
}

/// Directory dedicated to one account's isolated browser profile, so its
/// console session cookies don't collide with any other account's session.
fn browser_profile_dir(base_dir: &Path, account_id: &str) -> PathBuf {
    base_dir.join("browser-profiles").join(account_id)
}

/// Charon's own app-data directory (e.g. ~/Library/Application Support/charon on macOS),
/// distinct from ~/.aws which holds standard AWS CLI config.
fn charon_data_dir() -> PathBuf {
    dirs::data_dir()
        .expect("Could not determine app data directory")
        .join("charon")
}

/// Known install locations for a Chromium-based browser, in preference order.
/// Only Chrome is covered today — --user-data-dir isolation depends on the
/// browser supporting it, which Safari (macOS's other bundled browser) does not.
fn candidate_chrome_paths() -> Vec<PathBuf> {
    vec![PathBuf::from(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )]
}

/// First candidate for which `exists` returns true, checked in order.
fn find_chrome_executable_with<F: Fn(&Path) -> bool>(
    candidates: &[PathBuf],
    exists: F,
) -> Option<PathBuf> {
    candidates.iter().find(|p| exists(p)).cloned()
}

/// A configured Settings override, or None (meaning: auto-detect instead).
fn resolve_chrome_path_override(configured: &str) -> Option<PathBuf> {
    if configured.is_empty() {
        None
    } else {
        Some(PathBuf::from(configured))
    }
}

/// Resolve the Chrome executable for isolated console sessions: an explicit
/// Settings override (Settings -> Google Chrome Location) if configured,
/// otherwise the first auto-detected install.
fn resolve_chrome_path() -> Option<PathBuf> {
    let settings = crate::commands::settings::get_settings();
    resolve_chrome_path_override(&settings.chrome_path)
        .or_else(|| find_chrome_executable_with(&candidate_chrome_paths(), |p| p.exists()))
}

/// Command to launch `url` in a fresh Chrome window scoped to `profile_dir`,
/// so its cookies stay isolated from any other account's console session.
fn build_isolated_launch_command(chrome_path: &Path, profile_dir: &Path, url: &str) -> Command {
    let mut cmd = Command::new(chrome_path);
    cmd.arg(format!("--user-data-dir={}", profile_dir.display()))
        .arg("--no-first-run")
        .arg("--new-window")
        .arg(url);
    cmd
}

/// Write a set of STS credentials into a named section of an INI file
fn write_credentials_section(
    conf: &mut ini::Ini,
    section: &str,
    creds: &RoleCredentials,
    region: &str,
) {
    conf.set_to(
        Some(section),
        "aws_access_key_id".to_string(),
        creds.access_key_id.clone(),
    );
    conf.set_to(
        Some(section),
        "aws_secret_access_key".to_string(),
        creds.secret_access_key.clone(),
    );
    conf.set_to(
        Some(section),
        "aws_session_token".to_string(),
        creds.session_token.clone(),
    );
    conf.set_to(Some(section), "region".to_string(), region.to_string());
}

/// Result of configuring CLI credentials, including when they expire
/// (epoch milliseconds, as returned by SSO get-role-credentials) so callers
/// can schedule a refresh before that point.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureCliCredentialsResult {
    pub message: String,
    pub expires_at: i64,
}

/// Write temporary STS credentials to ~/.aws/credentials for CLI use
#[tauri::command]
pub fn configure_cli_credentials(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    sso_region: &str,
    cli_region: &str,
    profile_name: &str,
) -> Result<ConfigureCliCredentialsResult, String> {
    info!("Configuring CLI credentials for {role_name} in {account_id} as profile [{profile_name}] (sso_region: {sso_region}, cli_region: {cli_region})");

    let creds = get_role_credentials(access_token, account_id, role_name, sso_region)?;

    let path = aws_credentials_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .aws directory: {e}"))?;
    }

    let mut conf = if path.exists() {
        ini::Ini::load_from_file(&path)
            .map_err(|e| format!("Failed to read credentials file: {e}"))?
    } else {
        ini::Ini::new()
    };

    // Write credentials under the named profile
    write_credentials_section(&mut conf, profile_name, &creds, cli_region);

    // If this profile is the default, also write to [default] so bare `aws` commands work
    let store = load_profile_store();
    let is_default = store.default_profile.as_deref() == Some(profile_name);
    if is_default {
        write_credentials_section(&mut conf, "default", &creds, cli_region);
        info!("Also wrote credentials to [default] section");
    }

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write credentials: {e}"))?;

    info!("Configured CLI credentials for profile [{profile_name}]");

    // Mark the profile as active in Charon's store
    let mut store = load_profile_store();
    if let Some(p) = store.profiles.iter_mut().find(|p| p.name == profile_name) {
        p.session_active = true;
        let _ = save_profile_store(&store);
    }

    Ok(ConfigureCliCredentialsResult {
        message: format!("Credentials saved to profile [{profile_name}]."),
        expires_at: creds.expiration,
    })
}

/// Stop a session: remove credentials for a profile from ~/.aws/credentials
/// and clear the CLI cache.  The SSO session stays alive.
#[tauri::command]
pub fn stop_session(profile_name: &str) -> Result<String, String> {
    info!("Stopping session for profile [{profile_name}]");

    // 1. Remove the profile section from ~/.aws/credentials
    let creds_path = aws_credentials_path();
    if creds_path.exists() {
        let mut conf = ini::Ini::load_from_file(&creds_path)
            .map_err(|e| format!("Failed to read credentials: {e}"))?;

        conf.delete(Some(profile_name));

        // Only remove the [default] mirror when stopping the profile that owns it
        let store = load_profile_store();
        let is_default = store.default_profile.as_deref() == Some(profile_name);
        if is_default {
            conf.delete(Some("default"));
        }

        conf.write_to_file(&creds_path)
            .map_err(|e| format!("Failed to write credentials: {e}"))?;
    }

    // 2. Clear CLI cache
    if let Some(home) = dirs::home_dir() {
        let cli_cache = home.join(".aws").join("cli").join("cache");
        if cli_cache.is_dir() {
            if let Ok(entries) = fs::read_dir(&cli_cache) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().is_some_and(|ext| ext == "json") {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
    }

    // 3. Mark the profile as inactive in Charon's store
    let mut store = load_profile_store();
    if let Some(p) = store.profiles.iter_mut().find(|p| p.name == profile_name) {
        p.session_active = false;
        let _ = save_profile_store(&store);
    }

    info!("Session stopped for profile [{profile_name}]");
    Ok(format!("Session stopped for [{profile_name}]"))
}

/// Stop all active sessions
#[tauri::command]
pub fn stop_all_sessions() -> Result<String, String> {
    info!("Stopping all active sessions");

    let store = load_profile_store();
    let active: Vec<String> = store
        .profiles
        .iter()
        .filter(|p| p.session_active)
        .map(|p| p.name.clone())
        .collect();

    if active.is_empty() {
        return Ok("No active sessions".to_string());
    }

    for name in &active {
        stop_session(name)?;
    }

    Ok(format!("Stopped {} session(s)", active.len()))
}

/// List accounts from every configured AWS Identity Center portal that has an active token.
/// Each account is tagged with the session name, access token, and region it came from
/// so the frontend can route subsequent API calls (role listing, console, CLI) correctly.
#[tauri::command]
pub fn list_all_portal_accounts() -> Result<Vec<SsoAccountWithSession>, String> {
    use crate::aws::config::parse_sso_sessions;
    use crate::aws::sso_cache::{get_session_token, SsoSessionStatus};

    let sessions = parse_sso_sessions();
    let mut result: Vec<SsoAccountWithSession> = Vec::new();

    for session in &sessions {
        let token_info = match get_session_token(&session.name) {
            Some(t) if t.status == SsoSessionStatus::Active => t,
            _ => {
                info!(
                    "Skipping session '{}' — no active token",
                    session.name
                );
                continue;
            }
        };

        let access_token = match token_info.access_token {
            Some(t) => t,
            None => continue,
        };

        match list_sso_accounts(&access_token, &session.sso_region) {
            Ok(accounts) => {
                for account in accounts {
                    result.push(SsoAccountWithSession {
                        account_id: account.account_id,
                        account_name: account.account_name,
                        email_address: account.email_address,
                        session_name: session.name.clone(),
                        access_token: access_token.clone(),
                        sso_region: session.sso_region.clone(),
                    });
                }
            }
            Err(e) => {
                warn!(
                    "Failed to list accounts for session '{}': {e}",
                    session.name
                );
            }
        }
    }

    info!(
        "Found {} accounts across {} portal(s)",
        result.len(),
        sessions.len()
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sso_account_deserialize() {
        let json = r#"{"accountId": "111111111111", "accountName": "Dev", "emailAddress": "dev@example.com"}"#;
        let account: SsoAccount = serde_json::from_str(json).unwrap();
        assert_eq!(account.account_id, "111111111111");
        assert_eq!(account.account_name, "Dev");
    }

    #[test]
    fn test_account_role_deserialize() {
        let json = r#"{"roleName": "ReadOnly", "accountId": "111111111111"}"#;
        let role: AccountRole = serde_json::from_str(json).unwrap();
        assert_eq!(role.role_name, "ReadOnly");
    }

    #[test]
    fn test_list_accounts_response_deserialize() {
        let json = r#"{"accountList": [{"accountId": "111", "accountName": "Dev", "emailAddress": "a@b.com"}]}"#;
        let resp: ListAccountsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.account_list.len(), 1);
    }

    #[test]
    fn test_sso_account_with_session_deserialize() {
        let json = r#"{
            "accountId": "111111111111",
            "accountName": "Dev",
            "emailAddress": "dev@example.com",
            "sessionName": "my-sso",
            "accessToken": "token-abc",
            "ssoRegion": "us-east-1"
        }"#;
        let account: SsoAccountWithSession = serde_json::from_str(json).unwrap();
        assert_eq!(account.account_id, "111111111111");
        assert_eq!(account.session_name, "my-sso");
        assert_eq!(account.sso_region, "us-east-1");
    }

    #[test]
    fn test_browser_profile_dir_scopes_by_account_id() {
        let base = std::path::Path::new("/tmp/charon-test-base");
        let dir = browser_profile_dir(base, "111111111111");
        assert_eq!(dir, base.join("browser-profiles").join("111111111111"));
    }

    #[test]
    fn test_resolve_chrome_path_override_empty_means_auto_detect() {
        assert_eq!(resolve_chrome_path_override(""), None);
    }

    #[test]
    fn test_resolve_chrome_path_override_returns_configured_path() {
        assert_eq!(
            resolve_chrome_path_override("/custom/path/chrome"),
            Some(std::path::PathBuf::from("/custom/path/chrome"))
        );
    }

    #[test]
    fn test_candidate_chrome_paths_includes_macos_default_install() {
        let candidates = candidate_chrome_paths();
        assert!(candidates.contains(&std::path::PathBuf::from(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        )));
    }

    #[test]
    fn test_find_chrome_executable_with_returns_first_existing_candidate() {
        let candidates = vec![
            std::path::PathBuf::from("/does/not/exist/Chrome"),
            std::path::PathBuf::from(
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            ),
        ];
        let found = find_chrome_executable_with(&candidates, |p| {
            p == std::path::Path::new(
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            )
        });
        assert_eq!(
            found,
            Some(std::path::PathBuf::from(
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            ))
        );
    }

    #[test]
    fn test_find_chrome_executable_with_returns_none_when_nothing_exists() {
        let candidates = vec![std::path::PathBuf::from("/does/not/exist/Chrome")];
        let found = find_chrome_executable_with(&candidates, |_| false);
        assert_eq!(found, None);
    }

    #[test]
    fn test_build_login_url_includes_action_login_and_destination() {
        let url = build_login_url("token-abc", "us-west-2").unwrap();
        assert!(url.starts_with("https://us-east-1.signin.aws.amazon.com/federation?"));
        assert!(url.contains("Action=login"));
        assert!(url.contains("Issuer=Charon"));
        assert!(url.contains("SigninToken=token-abc"));
        assert!(url.contains("us-west-2.console.aws.amazon.com"));
    }

    #[test]
    fn test_build_isolated_launch_command_uses_dedicated_profile_dir() {
        let chrome =
            std::path::Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
        let profile_dir =
            std::path::Path::new("/tmp/charon-test-base/browser-profiles/111111111111");
        let url = "https://us-east-1.signin.aws.amazon.com/federation?Action=login";

        let cmd = build_isolated_launch_command(chrome, profile_dir, url);

        assert_eq!(cmd.get_program(), chrome.as_os_str());
        let args: Vec<&str> = cmd.get_args().map(|a| a.to_str().unwrap()).collect();
        assert!(args.contains(&"--new-window"));
        assert!(args
            .iter()
            .any(|a| *a == format!("--user-data-dir={}", profile_dir.display())));
        assert!(args.contains(&url));
    }

    #[test]
    fn test_configure_cli_credentials_result_serializes_camel_case() {
        let result = ConfigureCliCredentialsResult {
            message: "ok".to_string(),
            expires_at: 1_700_000_000_000,
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["expiresAt"], 1_700_000_000_000i64);
        assert_eq!(json["message"], "ok");
    }
}
