use log::info;
use serde::{Deserialize, Serialize};
use std::fs;
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

    // Build the federation session JSON
    let session_json = serde_json::json!({
        "sessionId": creds.access_key_id,
        "sessionKey": creds.secret_access_key,
        "sessionToken": creds.session_token,
    })
    .to_string();

    let encoded_session = urlencoding::encode(&session_json);

    // Session duration: default 8h (28800s), max 12h (43200s)
    let duration = session_duration_secs.unwrap_or(28800).min(43200);

    let sign_in_base = "https://us-east-1.signin.aws.amazon.com";

    // Step 1: Get a sign-in token from the federation endpoint
    let signin_token_url = format!(
        "{sign_in_base}/federation?Action=getSigninToken&SessionDuration={duration}&Session={encoded_session}"
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

    let signin_token = token_response["SigninToken"]
        .as_str()
        .ok_or("No SigninToken in federation response")?;

    // Step 2: Build the federation login URL with proper encoding
    let destination_url = format!(
        "https://{console_region}.console.aws.amazon.com/console/home?region={console_region}"
    );

    let mut login_url = url::Url::parse(&format!("{sign_in_base}/federation"))
        .map_err(|e| format!("Failed to parse federation URL: {e}"))?;
    login_url
        .query_pairs_mut()
        .append_pair("Action", "login")
        .append_pair("Issuer", "Charon")
        .append_pair("Destination", &destination_url)
        .append_pair("SigninToken", signin_token);

    // Step 3: Wrap in OAuth logout redirect for seamless session replacement
    // This clears any existing console session before logging into the new one,
    // avoiding the "sign out first" interstitial page.
    let mut console_url = url::Url::parse(&format!("{sign_in_base}/oauth"))
        .map_err(|e| format!("Failed to parse OAuth URL: {e}"))?;
    console_url
        .query_pairs_mut()
        .append_pair("Action", "logout")
        .append_pair("redirect_uri", login_url.as_str());

    open::that(console_url.as_str()).map_err(|e| format!("Failed to open browser: {e}"))?;

    info!("Opened AWS Console for {role_name} in {account_id}");
    Ok(())
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
) -> Result<String, String> {
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

    conf.set_to(
        Some(profile_name),
        "aws_access_key_id".to_string(),
        creds.access_key_id.clone(),
    );
    conf.set_to(
        Some(profile_name),
        "aws_secret_access_key".to_string(),
        creds.secret_access_key.clone(),
    );
    conf.set_to(
        Some(profile_name),
        "aws_session_token".to_string(),
        creds.session_token.clone(),
    );
    conf.set_to(
        Some(profile_name),
        "region".to_string(),
        cli_region.to_string(),
    );

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write credentials: {e}"))?;

    info!("Configured CLI credentials for profile [{profile_name}]");

    // Mark the profile as active in Charon's store
    let mut store = load_profile_store();
    if let Some(p) = store.profiles.iter_mut().find(|p| p.name == profile_name) {
        p.session_active = true;
        let _ = save_profile_store(&store);
    }

    Ok(format!(
        "Credentials saved to profile [{profile_name}]. They expire in ~12 hours."
    ))
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

        // Also remove the [default] section if it has a session token
        // (it was written as a mirror of the active profile)
        if let Some(default) = conf.section(Some("default")) {
            if default.contains_key("aws_session_token") {
                conf.delete(Some("default"));
            }
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
}
