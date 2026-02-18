use log::{info, debug};
use serde::{Deserialize, Serialize};

/// OIDC client registration response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OidcClient {
    pub client_id: String,
    pub client_secret: String,
    pub client_id_issued_at: u64,
    pub client_secret_expires_at: u64,
}

/// Device authorization response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthorization {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// Successful token response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OidcTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub refresh_token: Option<String>,
}

/// OIDC error response from AWS
#[derive(Debug, Deserialize)]
pub struct OidcErrorResponse {
    pub error: String,
    pub error_description: Option<String>,
}

/// Typed OIDC errors for polling logic
#[derive(Debug)]
pub enum OidcError {
    AuthorizationPending,
    SlowDown,
    ExpiredToken,
    AccessDenied(String),
    Other(String),
}

impl std::fmt::Display for OidcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OidcError::AuthorizationPending => write!(f, "Authorization pending"),
            OidcError::SlowDown => write!(f, "Slow down"),
            OidcError::ExpiredToken => write!(f, "Device code expired"),
            OidcError::AccessDenied(msg) => write!(f, "Access denied: {msg}"),
            OidcError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

fn oidc_endpoint(region: &str) -> String {
    format!("https://oidc.{region}.amazonaws.com")
}

/// Register a public OIDC client with AWS SSO OIDC
pub async fn register_client(
    region: &str,
    client_name: &str,
    scopes: Option<&str>,
) -> Result<OidcClient, String> {
    let url = format!("{}/client/register", oidc_endpoint(region));

    let mut body = serde_json::json!({
        "clientName": client_name,
        "clientType": "public",
    });

    if let Some(scopes) = scopes {
        let scope_list: Vec<&str> = scopes.split(',').map(|s| s.trim()).collect();
        body["scopes"] = serde_json::json!(scope_list);
    }

    info!("Registering OIDC client: {client_name} in {region}");

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to register OIDC client: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "OIDC client registration failed ({status}): {text}"
        ));
    }

    let result: OidcClient = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse registration response: {e}"))?;

    info!("OIDC client registered: {}", result.client_id);
    Ok(result)
}

/// Start device authorization flow
pub async fn start_device_authorization(
    region: &str,
    client: &OidcClient,
    start_url: &str,
) -> Result<DeviceAuthorization, String> {
    let url = format!("{}/device_authorization", oidc_endpoint(region));

    let body = serde_json::json!({
        "clientId": client.client_id,
        "clientSecret": client.client_secret,
        "startUrl": start_url,
    });

    info!("Starting device authorization for: {start_url}");

    let http = reqwest::Client::new();
    let resp = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to start device authorization: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Device authorization failed ({status}): {text}"
        ));
    }

    let result: DeviceAuthorization = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse device authorization response: {e}"))?;

    info!("Device authorization started, user code: {}", result.user_code);
    Ok(result)
}

/// Exchange device code for access token (single attempt)
pub async fn create_token(
    region: &str,
    client: &OidcClient,
    device_code: &str,
) -> Result<OidcTokenResponse, OidcError> {
    let url = format!("{}/token", oidc_endpoint(region));

    let body = serde_json::json!({
        "clientId": client.client_id,
        "clientSecret": client.client_secret,
        "grantType": "urn:ietf:params:oauth:grant-type:device_code",
        "deviceCode": device_code,
    });

    let http = reqwest::Client::new();
    let resp = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| OidcError::Other(format!("HTTP request failed: {e}")))?;

    let status = resp.status();
    debug!("Token endpoint responded with status: {status}");

    if status.is_success() {
        let text = resp.text().await
            .map_err(|e| OidcError::Other(format!("Failed to read token response: {e}")))?;
        debug!("Token response body length: {} chars", text.len());
        let token: OidcTokenResponse = serde_json::from_str(&text)
            .map_err(|e| OidcError::Other(format!("Failed to parse token response: {e}. Body: {}", &text[..text.len().min(200)])))?;
        return Ok(token);
    }

    // Parse error response
    let text = resp.text().await
        .map_err(|e| OidcError::Other(format!("Failed to read error response: {e}")))?;
    debug!("Token error response: {text}");
    let error_resp: OidcErrorResponse = serde_json::from_str(&text)
        .map_err(|e| OidcError::Other(format!("Failed to parse error response: {e}. Body: {text}")))?;

    match error_resp.error.as_str() {
        "authorization_pending" => Err(OidcError::AuthorizationPending),
        "slow_down" => Err(OidcError::SlowDown),
        "expired_token" => Err(OidcError::ExpiredToken),
        "access_denied" => Err(OidcError::AccessDenied(
            error_resp
                .error_description
                .unwrap_or_else(|| "Access denied".to_string()),
        )),
        other => {
            let desc = error_resp
                .error_description
                .unwrap_or_else(|| other.to_string());
            Err(OidcError::Other(desc))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oidc_endpoint() {
        assert_eq!(
            oidc_endpoint("us-east-1"),
            "https://oidc.us-east-1.amazonaws.com"
        );
        assert_eq!(
            oidc_endpoint("eu-west-1"),
            "https://oidc.eu-west-1.amazonaws.com"
        );
    }

    #[test]
    fn test_oidc_error_display() {
        assert_eq!(
            format!("{}", OidcError::AuthorizationPending),
            "Authorization pending"
        );
        assert_eq!(format!("{}", OidcError::SlowDown), "Slow down");
        assert_eq!(format!("{}", OidcError::ExpiredToken), "Device code expired");
    }

    #[test]
    fn test_parse_device_authorization_json() {
        let json = r#"{
            "deviceCode": "ABC123",
            "userCode": "BQFH-GKRM",
            "verificationUri": "https://device.sso.us-east-1.amazonaws.com",
            "verificationUriComplete": "https://device.sso.us-east-1.amazonaws.com/?user_code=BQFH-GKRM",
            "expiresIn": 600,
            "interval": 5
        }"#;
        let da: DeviceAuthorization = serde_json::from_str(json).unwrap();
        assert_eq!(da.user_code, "BQFH-GKRM");
        assert_eq!(da.interval, 5);
    }

    #[test]
    fn test_parse_oidc_error_response() {
        let json = r#"{
            "error": "authorization_pending",
            "error_description": "User has not yet completed authorization"
        }"#;
        let err: OidcErrorResponse = serde_json::from_str(json).unwrap();
        assert_eq!(err.error, "authorization_pending");
    }
}
