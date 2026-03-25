use crate::aws::config::{self, load_profile_store, save_profile_store, CharonProfile};
use log::info;

/// List all SSO sessions from ~/.aws/config (these stay in AWS config)
#[tauri::command]
pub fn list_sso_sessions() -> Vec<config::SsoSession> {
    info!("Listing SSO sessions");
    config::parse_sso_sessions()
}

/// List all profiles from Charon's profile store
#[tauri::command]
pub fn list_profiles() -> Vec<CharonProfile> {
    info!("Listing profiles");
    let store = load_profile_store();
    store.profiles
}

/// Create or update an SSO session in ~/.aws/config
#[tauri::command]
pub fn create_sso_session(session: config::SsoSession) -> Result<String, String> {
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

/// Save or update a profile in Charon's store
#[tauri::command]
pub fn save_profile(profile: CharonProfile) -> Result<String, String> {
    info!("Saving profile: {}", profile.name);
    let mut store = load_profile_store();

    if let Some(existing) = store.profiles.iter_mut().find(|p| p.name == profile.name) {
        *existing = profile.clone();
    } else {
        store.profiles.push(profile.clone());
    }

    save_profile_store(&store)?;
    Ok(format!("Profile '{}' saved", profile.name))
}

/// Delete a profile from Charon's store
#[tauri::command]
pub fn delete_profile(name: &str) -> Result<String, String> {
    info!("Deleting profile: {name}");
    let mut store = load_profile_store();

    store.profiles.retain(|p| p.name != name);

    // If this was the default, clear it
    if store.default_profile.as_deref() == Some(name) {
        store.default_profile = None;
    }

    save_profile_store(&store)?;
    Ok(format!("Profile '{name}' deleted"))
}

/// Set a profile as the default
#[tauri::command]
pub fn set_default_profile(name: &str) -> Result<String, String> {
    info!("Setting default profile: {name}");
    let mut store = load_profile_store();

    if !store.profiles.iter().any(|p| p.name == name) {
        return Err(format!("Profile '{name}' not found"));
    }

    store.default_profile = Some(name.to_string());
    save_profile_store(&store)?;

    // Also write region/output to [default] in ~/.aws/config (no SSO fields)
    if let Some(profile) = store.profiles.iter().find(|p| p.name == name) {
        write_default_region_to_aws_config(profile.region.as_deref());
    }

    Ok(format!("Profile '{name}' set as default"))
}

/// Get the name of the default profile
#[tauri::command]
pub fn get_default_profile() -> Option<String> {
    let store = load_profile_store();
    store.default_profile
}

/// Import profiles from ~/.aws/config and clean up SSO-backed sections
#[tauri::command]
pub fn migrate_profiles() -> Result<String, String> {
    let imported = config::import_profiles_from_aws_config()?;
    let cleaned = config::cleanup_aws_config_profiles()?;
    Ok(format!(
        "Imported {imported} profile(s), cleaned {cleaned} from ~/.aws/config"
    ))
}

/// Write only region to [default] section of ~/.aws/config (no SSO fields)
fn write_default_region_to_aws_config(region: Option<&str>) {
    let path = config::aws_config_path();
    let mut conf = if path.exists() {
        ini::Ini::load_from_file(&path).unwrap_or_default()
    } else {
        ini::Ini::new()
    };

    // Clear SSO fields from [default] if present
    if let Some(default) = conf.section(Some("default")) {
        if default.contains_key("sso_session") {
            let output = default.get("output").map(|s| s.to_string());
            conf.delete(Some("default"));
            if let Some(o) = output {
                conf.set_to(Some("default"), "output".to_string(), o);
            }
        }
    }

    if let Some(r) = region {
        conf.set_to(Some("default"), "region".to_string(), r.to_string());
    }

    let _ = conf.write_to_file(&path);
}
