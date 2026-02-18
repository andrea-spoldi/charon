use log::info;
use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::aws::config::aws_credentials_path;
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

    let output = Command::new(&resolve_aws_cli())
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

    let output = Command::new(&resolve_aws_cli())
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
        .output()
        .map_err(|e| format!("Failed to run aws cli: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list roles: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: ListAccountRolesResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse response: {e}"))?;

    info!("Found {} roles for account {account_id}", response.role_list.len());
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

    let output = Command::new(&resolve_aws_cli())
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
    region: &str,
    session_duration_secs: Option<u64>,
) -> Result<(), String> {
    info!("Opening AWS Console for {role_name} in {account_id} (region: {region})");

    let creds = get_role_credentials(access_token, account_id, role_name, region)?;

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

    // Step 1: Get a sign-in token from the federation endpoint
    let signin_token_url = format!(
        "https://signin.aws.amazon.com/federation?Action=getSigninToken&SessionDuration={}&Session={}",
        duration, encoded_session
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

    // Step 2: Build the console login URL
    let destination_url = format!(
        "https://{}.console.aws.amazon.com/console/home?region={}",
        region, region
    );
    let destination = urlencoding::encode(&destination_url);
    let console_url = format!(
        "https://signin.aws.amazon.com/federation?Action=login&Issuer=Charon&Destination={}&SigninToken={}",
        destination, signin_token
    );

    // Step 3: Open in default browser
    open::that(&console_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    info!("Opened AWS Console for {role_name} in {account_id}");
    Ok(())
}

/// Write temporary STS credentials to ~/.aws/credentials for CLI use
#[tauri::command]
pub fn configure_cli_credentials(
    access_token: &str,
    account_id: &str,
    role_name: &str,
    region: &str,
    profile_name: &str,
) -> Result<String, String> {
    info!("Configuring CLI credentials for {role_name} in {account_id} as profile [{profile_name}]");

    let creds = get_role_credentials(access_token, account_id, role_name, region)?;

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
        region.to_string(),
    );

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write credentials: {e}"))?;

    info!("Configured CLI credentials for profile [{profile_name}]");
    Ok(format!(
        "Credentials saved to profile [{}]. They expire in ~12 hours.",
        profile_name
    ))
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
