use log::info;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const AUTH_TIMEOUT_SECS: u64 = 300;

/// Cached Google SAML credentials stored in ~/.charon/google_cache/<name>.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCredentialCache {
    pub session_name: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: String,
    /// RFC 3339 UTC timestamp
    pub expiration: String,
    pub region: String,
}

/// Status of a cached Google session credential
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleSessionStatus {
    /// "active" | "expired" | "none"
    pub status: String,
    pub expiration: Option<String>,
    pub region: Option<String>,
}

fn google_cache_path(session_name: &str) -> PathBuf {
    crate::commands::charon_home_dir()
        .join("google_cache")
        .join(format!("{session_name}.json"))
}

pub fn read_google_cache(session_name: &str) -> Option<GoogleCredentialCache> {
    let path = google_cache_path(session_name);
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn delete_google_cache(session_name: &str) {
    let path = google_cache_path(session_name);
    let _ = std::fs::remove_file(path);
}

/// Read cached credentials and check expiry.
pub fn get_google_session_status(session_name: &str) -> GoogleSessionStatus {
    let Some(cache) = read_google_cache(session_name) else {
        return GoogleSessionStatus {
            status: "none".to_string(),
            expiration: None,
            region: None,
        };
    };

    let is_active = parse_expiry_is_future(&cache.expiration);
    GoogleSessionStatus {
        status: if is_active { "active" } else { "expired" }.to_string(),
        expiration: Some(cache.expiration),
        region: Some(cache.region),
    }
}

fn parse_expiry_is_future(expiry: &str) -> bool {
    // Parse "2024-01-01T12:00:00Z" manually to avoid chrono dependency.
    // We only need to compare against current epoch time.
    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Ok(dt) = expiry.parse::<iso8601_epoch::Timestamp>() {
        dt.epoch_secs() > epoch
    } else {
        false
    }
}

/// Bind a TCP listener on the given port and return it.
pub async fn bind_listener(port: u16) -> Result<(TcpListener, u16), String> {
    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("Failed to bind SAML callback port {port}: {e}"))?;
    let bound_port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    Ok((listener, bound_port))
}

/// Wait for one HTTP POST on the listener, extract the SAMLResponse form field,
/// call STS AssumeRoleWithSAML, and cache the resulting credentials.
/// Returns "Login successful" on success.
pub async fn receive_saml_and_authenticate(
    listener: TcpListener,
    session_name: &str,
    saml_provider_arn: &str,
    role_arn: &str,
    region: &str,
    session_duration_secs: u32,
) -> Result<String, String> {
    // Wait for the browser to POST the SAML assertion
    let (stream, peer) = tokio::time::timeout(
        Duration::from_secs(AUTH_TIMEOUT_SECS),
        listener.accept(),
    )
    .await
    .map_err(|_| {
        "Authentication timed out — no response received within 5 minutes".to_string()
    })?
    .map_err(|e| format!("SAML callback connection error: {e}"))?;

    info!("Received SAML callback connection from {peer}");

    let saml_b64 = read_saml_response(stream).await?;

    // Write the SAML assertion to a temp file (avoids CLI argument-length limits)
    let tmp_path = std::env::temp_dir().join(format!("charon_saml_{session_name}.b64"));
    std::fs::write(&tmp_path, &saml_b64)
        .map_err(|e| format!("Failed to write SAML temp file: {e}"))?;

    let result = call_sts_assume_role_with_saml(
        session_name,
        saml_provider_arn,
        role_arn,
        region,
        session_duration_secs,
        &tmp_path,
    );

    // Clean up temp file regardless of outcome
    let _ = std::fs::remove_file(&tmp_path);

    result
}

/// Read the raw TCP stream, parse HTTP headers + body, extract SAMLResponse.
/// Also sends a minimal HTTP response so the browser doesn't hang.
async fn read_saml_response(
    mut stream: tokio::net::TcpStream,
) -> Result<String, String> {
    let (reader, mut writer) = stream.split();
    let mut buf_reader = BufReader::new(reader);

    // --- Read request headers ---
    let mut content_length: Option<usize> = None;
    let mut line = String::new();

    // Skip the request line (e.g. "POST /saml/callback HTTP/1.1")
    buf_reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("Failed to read request line: {e}"))?;
    line.clear();

    // Parse header lines until the blank line
    loop {
        line.clear();
        let n = buf_reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Failed to read header: {e}"))?;
        if n == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let lower = line.to_lowercase();
        if let Some(rest) = lower.strip_prefix("content-length:") {
            content_length = rest.trim().parse().ok();
        }
    }

    let body_len = content_length.ok_or("No Content-Length in SAML POST")?;

    // Guard against unreasonably large payloads (1 MB should be plenty)
    if body_len > 1_048_576 {
        return Err(format!("SAML POST body too large: {body_len} bytes"));
    }

    // --- Read body ---
    let mut body = vec![0u8; body_len];
    buf_reader
        .read_exact(&mut body)
        .await
        .map_err(|e| format!("Failed to read SAML POST body: {e}"))?;

    // --- Send an HTTP response so the browser tab shows a success page ---
    let html = "<html><body><h2>Authentication complete</h2>\
                <p>You can close this tab and return to Charon.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    // Best-effort write; ignore errors (we already have what we need)
    let _ = writer.write_all(response.as_bytes()).await;

    // --- Extract SAMLResponse from URL-encoded form body ---
    let body_str = String::from_utf8_lossy(&body);
    extract_saml_response(&body_str)
}

/// Parse application/x-www-form-urlencoded body and return the SAMLResponse value.
fn extract_saml_response(body: &str) -> Result<String, String> {
    for pair in body.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            let decoded_key = urlencoding::decode(key)
                .map_err(|e| format!("Failed to decode form key: {e}"))?;
            if decoded_key == "SAMLResponse" {
                // The value is URL-encoded base64; decode URL-encoding to get base64
                let decoded_value = urlencoding::decode(value)
                    .map_err(|e| format!("Failed to decode SAMLResponse: {e}"))?;
                return Ok(decoded_value.into_owned());
            }
        }
    }
    Err("SAMLResponse field not found in POST body".to_string())
}

#[derive(Debug, Deserialize)]
struct StsResponse {
    #[serde(rename = "Credentials")]
    credentials: StsCredentials,
}

#[derive(Debug, Deserialize)]
struct StsCredentials {
    #[serde(rename = "AccessKeyId")]
    access_key_id: String,
    #[serde(rename = "SecretAccessKey")]
    secret_access_key: String,
    #[serde(rename = "SessionToken")]
    session_token: String,
    #[serde(rename = "Expiration")]
    expiration: String,
}

/// Call `aws sts assume-role-with-saml` and cache the resulting credentials.
fn call_sts_assume_role_with_saml(
    session_name: &str,
    saml_provider_arn: &str,
    role_arn: &str,
    region: &str,
    session_duration_secs: u32,
    saml_file: &std::path::Path,
) -> Result<String, String> {
    info!(
        "Calling STS AssumeRoleWithSAML for session '{session_name}', role '{role_arn}'"
    );

    let saml_assertion_arg = format!("file://{}", saml_file.display());
    let duration_str = session_duration_secs.to_string();

    let output = std::process::Command::new(crate::commands::resolve_aws_cli())
        .args([
            "sts",
            "assume-role-with-saml",
            "--role-arn",
            role_arn,
            "--principal-arn",
            saml_provider_arn,
            "--saml-assertion",
            &saml_assertion_arg,
            "--duration-seconds",
            &duration_str,
            "--region",
            region,
            "--output",
            "json",
        ])
        .output()
        .map_err(|e| format!("Failed to invoke AWS CLI: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("STS AssumeRoleWithSAML failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sts: StsResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse STS response: {e}"))?;

    let cache = GoogleCredentialCache {
        session_name: session_name.to_string(),
        access_key_id: sts.credentials.access_key_id,
        secret_access_key: sts.credentials.secret_access_key,
        session_token: sts.credentials.session_token,
        expiration: sts.credentials.expiration,
        region: region.to_string(),
    };

    write_google_cache(&cache)?;
    info!("Cached Google SAML credentials for session '{session_name}'");
    Ok("Login successful".to_string())
}

fn write_google_cache(cache: &GoogleCredentialCache) -> Result<(), String> {
    let path = google_cache_path(&cache.session_name);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create google_cache directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize credential cache: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write google cache file: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Minimal ISO 8601 epoch parser (avoids pulling in chrono)
// ---------------------------------------------------------------------------

mod iso8601_epoch {
    pub struct Timestamp {
        epoch: u64,
    }

    impl Timestamp {
        pub fn epoch_secs(&self) -> u64 {
            self.epoch
        }
    }

    impl std::str::FromStr for Timestamp {
        type Err = ();

        fn from_str(s: &str) -> Result<Self, Self::Err> {
            // Accepts "YYYY-MM-DDTHH:MM:SSZ" or "YYYY-MM-DDTHH:MM:SS+00:00"
            let s = s.trim_end_matches(|c| c == 'Z' || c == '+' || c == '0' || c == ':');
            let parts: Vec<&str> = s.splitn(6, |c: char| !c.is_ascii_digit()).collect();
            if parts.len() < 6 {
                return Err(());
            }
            let year: u64 = parts[0].parse().map_err(|_| ())?;
            let month: u64 = parts[1].parse().map_err(|_| ())?;
            let day: u64 = parts[2].parse().map_err(|_| ())?;
            let hour: u64 = parts[3].parse().map_err(|_| ())?;
            let min: u64 = parts[4].parse().map_err(|_| ())?;
            let sec: u64 = parts[5].parse().map_err(|_| ())?;

            // Days since epoch via year/month/day
            let epoch = days_to_epoch(year, month, day) * 86400
                + hour * 3600
                + min * 60
                + sec;
            Ok(Timestamp { epoch })
        }
    }

    fn is_leap(y: u64) -> bool {
        (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
    }

    fn days_to_epoch(year: u64, month: u64, day: u64) -> u64 {
        let months = [31u64, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let mut days: u64 = 0;
        for y in 1970..year {
            days += if is_leap(y) { 366 } else { 365 };
        }
        for m in 1..month {
            days += months[(m - 1) as usize];
            if m == 2 && is_leap(year) {
                days += 1;
            }
        }
        days + day - 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_saml_response_simple() {
        let body = "SAMLResponse=BASE64DATA&RelayState=foo";
        assert_eq!(extract_saml_response(body).unwrap(), "BASE64DATA");
    }

    #[test]
    fn test_extract_saml_response_url_encoded() {
        let body = "SAMLResponse=BASE64%2BDATA%3D%3D&RelayState=foo";
        assert_eq!(extract_saml_response(body).unwrap(), "BASE64+DATA==");
    }

    #[test]
    fn test_extract_saml_response_missing() {
        let body = "foo=bar&baz=qux";
        assert!(extract_saml_response(body).is_err());
    }

    #[test]
    fn test_expiry_parser_future() {
        // This date is far in the future
        assert!(parse_expiry_is_future("2099-01-01T00:00:00Z"));
    }

    #[test]
    fn test_expiry_parser_past() {
        assert!(!parse_expiry_is_future("2000-01-01T00:00:00Z"));
    }
}
