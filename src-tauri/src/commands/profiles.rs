use crate::aws::config::{self, AwsProfile, SsoSession};
use log::info;

/// List all SSO sessions from ~/.aws/config
#[tauri::command]
pub fn list_sso_sessions() -> Vec<SsoSession> {
    info!("Listing SSO sessions");
    config::parse_sso_sessions()
}

/// List all profiles from ~/.aws/config
#[tauri::command]
pub fn list_profiles() -> Vec<AwsProfile> {
    info!("Listing profiles");
    config::parse_profiles()
}

/// Create or update an SSO session in ~/.aws/config
#[tauri::command]
pub fn create_sso_session(session: SsoSession) -> Result<String, String> {
    info!("Creating SSO session: {}", session.name);
    config::save_sso_session(&session)?;
    Ok(format!("SSO session '{}' created", session.name))
}

/// Delete an SSO session from ~/.aws/config
#[tauri::command]
pub fn delete_sso_session(name: &str) -> Result<String, String> {
    info!("Deleting SSO session: {name}");
    config::delete_sso_session(name)?;
    Ok(format!("SSO session '{name}' deleted"))
}

/// Save or update a profile in ~/.aws/config
#[tauri::command]
pub fn save_profile(profile: AwsProfile) -> Result<String, String> {
    info!("Saving profile: {}", profile.name);
    config::save_profile(&profile)?;
    Ok(format!("Profile '{}' saved", profile.name))
}

/// Delete a profile from ~/.aws/config
#[tauri::command]
pub fn delete_profile(name: &str) -> Result<String, String> {
    info!("Deleting profile: {name}");
    config::delete_profile(name)?;
    Ok(format!("Profile '{name}' deleted"))
}

/// Set a profile as the [default] in ~/.aws/config
#[tauri::command]
pub fn set_default_profile(name: &str) -> Result<String, String> {
    info!("Setting default profile: {name}");
    config::set_default_profile(name)?;
    Ok(format!("Profile '{name}' set as default"))
}

/// Get the name of the profile currently set as [default]
#[tauri::command]
pub fn get_default_profile() -> Option<String> {
    config::get_default_profile_name()
}
