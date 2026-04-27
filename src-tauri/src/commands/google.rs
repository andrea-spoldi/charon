use crate::aws::config::{self, GoogleWorkspaceSession};
use crate::aws::saml::{self, GoogleSessionStatus};
use log::info;
use std::collections::HashMap;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// Shared state: holds active SAML callback listeners keyed by session name
// ---------------------------------------------------------------------------

pub struct GoogleAuthState {
    pub listeners: Mutex<HashMap<String, TcpListener>>,
}

impl Default for GoogleAuthState {
    fn default() -> Self {
        Self {
            listeners: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Session CRUD commands
// ---------------------------------------------------------------------------

/// List all Google Workspace sessions from ~/.charon/google_sessions.json
#[tauri::command]
pub fn list_google_sessions() -> Vec<GoogleWorkspaceSession> {
    info!("Listing Google Workspace sessions");
    config::list_google_sessions()
}

/// Create or update a Google Workspace session
#[tauri::command]
pub fn create_google_session(session: GoogleWorkspaceSession) -> Result<String, String> {
    info!("Creating Google Workspace session: {}", session.name);
    config::save_google_session(&session)?;
    Ok(format!("Google Workspace session '{}' created", session.name))
}

/// Delete a Google Workspace session (and its cached credentials)
#[tauri::command]
pub fn delete_google_session(name: String) -> Result<String, String> {
    info!("Deleting Google Workspace session: {name}");
    config::delete_google_session(&name)?;
    saml::delete_google_cache(&name);
    Ok(format!("Google Workspace session '{name}' deleted"))
}

// ---------------------------------------------------------------------------
// Authentication commands
// ---------------------------------------------------------------------------

/// Info returned to the frontend after device auth starts
#[derive(Debug, serde::Serialize)]
pub struct GoogleAuthInfo {
    pub session_name: String,
    pub idp_url: String,
    pub callback_port: u16,
}

/// Start the Google SAML authentication flow.
///
/// Binds a local TCP port to receive the SAML POST from the browser,
/// opens the Google IDP-initiated URL in the default browser, and
/// returns the callback port to the frontend.
#[tauri::command]
pub async fn start_google_auth(
    state: tauri::State<'_, GoogleAuthState>,
    session_name: String,
) -> Result<GoogleAuthInfo, String> {
    info!("Starting Google SAML auth for session: {session_name}");

    let session = config::get_google_session(&session_name)
        .ok_or_else(|| format!("Google Workspace session '{session_name}' not found"))?;

    let (listener, port) = saml::bind_listener(session.callback_port).await?;

    // Store the listener so poll_google_auth can retrieve it
    let mut listeners = state.listeners.lock().await;
    listeners.insert(session_name.clone(), listener);
    drop(listeners);

    // Open the IDP-initiated URL in the user's browser
    if let Err(e) = open::that(&session.idp_initiated_url) {
        log::warn!("Failed to open browser for Google auth: {e}");
    }

    info!("Google SAML callback server listening on port {port}");
    Ok(GoogleAuthInfo {
        session_name,
        idp_url: session.idp_initiated_url,
        callback_port: port,
    })
}

/// Poll for the SAML assertion to arrive on the callback port.
///
/// Blocks (up to 5 minutes) until the browser POSTs the SAMLResponse,
/// then calls STS AssumeRoleWithSAML and caches the credentials.
#[tauri::command]
pub async fn poll_google_auth(
    state: tauri::State<'_, GoogleAuthState>,
    session_name: String,
) -> Result<String, String> {
    info!("Polling for Google SAML callback for session: {session_name}");

    let session = config::get_google_session(&session_name)
        .ok_or_else(|| format!("Google Workspace session '{session_name}' not found"))?;

    // Take the listener out of state (so it's dropped when done)
    let listener = {
        let mut listeners = state.listeners.lock().await;
        listeners
            .remove(&session_name)
            .ok_or_else(|| "No pending Google auth for this session — call start_google_auth first".to_string())?
    };

    saml::receive_saml_and_authenticate(
        listener,
        &session_name,
        &session.aws_saml_provider_arn,
        &session.aws_role_arn,
        &session.aws_region,
        session.session_duration_secs,
    )
    .await
}

/// Return the cached credential status for a Google Workspace session.
#[tauri::command]
pub fn get_google_session_status(session_name: String) -> GoogleSessionStatus {
    info!("Checking Google session status for: {session_name}");
    saml::get_google_session_status(&session_name)
}

/// Log out by deleting cached credentials for a Google Workspace session.
#[tauri::command]
pub fn google_logout(session_name: String) -> Result<String, String> {
    info!("Logging out Google Workspace session: {session_name}");
    saml::delete_google_cache(&session_name);
    Ok(format!("Logged out of Google Workspace session '{session_name}'"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_google_auth_state_default() {
        let state = GoogleAuthState::default();
        let listeners = state.listeners.blocking_lock();
        assert!(listeners.is_empty());
    }
}
