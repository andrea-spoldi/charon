use ini::Ini;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Charon profile store (~/.charon/profiles.json)
// ---------------------------------------------------------------------------

/// A profile stored in Charon's own JSON config.
/// Contains all the data needed to resolve credentials via SSO.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharonProfile {
    pub name: String,
    pub sso_session: String,
    pub sso_account_id: String,
    pub sso_role_name: String,
    pub region: Option<String>,
    pub output: Option<String>,
    /// Whether this profile currently has active CLI credentials written
    #[serde(default)]
    pub session_active: bool,
}

/// The full profile store persisted to disk
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileStore {
    pub profiles: Vec<CharonProfile>,
    pub default_profile: Option<String>,
}

fn profiles_path() -> PathBuf {
    crate::commands::charon_home_dir().join("profiles.json")
}

pub fn load_profile_store() -> ProfileStore {
    let path = profiles_path();
    if !path.exists() {
        return ProfileStore::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(e) => {
            warn!("Failed to read profiles.json: {e}");
            ProfileStore::default()
        }
    }
}

pub fn save_profile_store(store: &ProfileStore) -> Result<(), String> {
    let path = profiles_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .charon directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize profiles: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write profiles.json: {e}"))?;
    Ok(())
}

/// Detect which named profile matches [default] in ~/.aws/config (for migration).
fn detect_default_profile_from_aws_config() -> Option<String> {
    let path = aws_config_path();
    let conf = Ini::load_from_file(&path).ok()?;
    let default_props = conf.section(Some("default"))?;
    let ds = default_props.get("sso_session");
    let da = default_props.get("sso_account_id");
    let dr = default_props.get("sso_role_name");
    if ds.is_none() && da.is_none() && dr.is_none() {
        return None;
    }
    for (section, props) in &conf {
        let name = section?.strip_prefix("profile ")?;
        if props.get("sso_session") == ds
            && props.get("sso_account_id") == da
            && props.get("sso_role_name") == dr
        {
            return Some(name.to_string());
        }
    }
    None
}

/// Import existing SSO-backed profiles from ~/.aws/config into Charon's store.
/// Returns the number of profiles imported.
pub fn import_profiles_from_aws_config() -> Result<usize, String> {
    let mut store = load_profile_store();
    let aws_profiles = parse_profiles();

    let mut imported = 0;
    for ap in &aws_profiles {
        // Skip [default] and profiles without SSO settings
        if ap.name == "default" {
            continue;
        }
        let (Some(ref session), Some(ref account_id), Some(ref role_name)) =
            (&ap.sso_session, &ap.sso_account_id, &ap.sso_role_name)
        else {
            continue;
        };

        // Skip if already exists in store
        if store.profiles.iter().any(|p| p.name == ap.name) {
            continue;
        }

        store.profiles.push(CharonProfile {
            name: ap.name.clone(),
            sso_session: session.clone(),
            sso_account_id: account_id.clone(),
            sso_role_name: role_name.clone(),
            region: ap.region.clone(),
            output: ap.output.clone(),
            session_active: false,
        });
        imported += 1;
    }

    // Try to detect which profile is currently [default] in ~/.aws/config
    if store.default_profile.is_none() {
        if let Some(default_name) = detect_default_profile_from_aws_config() {
            if store.profiles.iter().any(|p| p.name == default_name) {
                store.default_profile = Some(default_name);
            }
        }
    }

    save_profile_store(&store)?;
    if imported > 0 {
        info!("Imported {imported} profiles from ~/.aws/config");
    }
    Ok(imported)
}

/// Remove SSO-backed profile sections from ~/.aws/config after migration.
/// Preserves [sso-session X] sections and [default] (which gets region-only).
pub fn cleanup_aws_config_profiles() -> Result<usize, String> {
    let path = aws_config_path();
    if !path.exists() {
        return Ok(0);
    }

    let conf = Ini::load_from_file(&path).map_err(|e| format!("Failed to read config: {e}"))?;

    // Find profile sections with sso_session (SSO-backed)
    let sso_profiles: Vec<String> = conf
        .iter()
        .filter_map(|(section, props)| {
            let name = section?;
            if name.starts_with("profile ") && props.contains_key("sso_session") {
                Some(name.to_string())
            } else {
                None
            }
        })
        .collect();

    if sso_profiles.is_empty() {
        return Ok(0);
    }

    let mut conf = conf;
    let count = sso_profiles.len();
    for section in &sso_profiles {
        info!("Removing SSO-backed profile [{section}] from ~/.aws/config");
        conf.delete(Some(section.as_str()));
    }

    // Also clean up [default] — remove SSO fields, keep region/output only
    if let Some(default) = conf.section(Some("default")) {
        if default.contains_key("sso_session") {
            let region = default.get("region").map(|s| s.to_string());
            let output = default.get("output").map(|s| s.to_string());
            conf.delete(Some("default"));
            if let Some(r) = region {
                conf.set_to(Some("default"), "region".to_string(), r);
            }
            if let Some(o) = output {
                conf.set_to(Some("default"), "output".to_string(), o);
            }
        }
    }

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write config: {e}"))?;

    info!("Removed {count} SSO-backed profiles from ~/.aws/config");
    Ok(count)
}

// ---------------------------------------------------------------------------
// Google Workspace sessions (~/.charon/google_sessions.json)
// ---------------------------------------------------------------------------

/// A Google Workspace federation session stored in Charon's own JSON config.
/// The user authenticates via a Google SAML app that is configured with
/// this application's localhost ACS URL as its destination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleWorkspaceSession {
    pub name: String,
    /// IDP-initiated SSO URL from the Google Workspace SAML app
    pub idp_initiated_url: String,
    /// IAM SAML provider ARN (arn:aws:iam::ACCOUNT:saml-provider/NAME)
    pub aws_saml_provider_arn: String,
    /// IAM role ARN to assume via the SAML assertion
    pub aws_role_arn: String,
    /// AWS region to use for STS AssumeRoleWithSAML calls
    pub aws_region: String,
    /// Local TCP port Charon listens on to receive the SAML POST (default 14173)
    pub callback_port: u16,
    /// Requested session duration in seconds (max 43200 = 12 h, default 3600)
    #[serde(default = "default_session_duration")]
    pub session_duration_secs: u32,
}

fn default_session_duration() -> u32 {
    3600
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct GoogleSessionStore {
    sessions: Vec<GoogleWorkspaceSession>,
}

fn google_sessions_path() -> PathBuf {
    crate::commands::charon_home_dir().join("google_sessions.json")
}

fn load_google_session_store() -> GoogleSessionStore {
    let path = google_sessions_path();
    if !path.exists() {
        return GoogleSessionStore::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(e) => {
            warn!("Failed to read google_sessions.json: {e}");
            GoogleSessionStore::default()
        }
    }
}

fn save_google_session_store(store: &GoogleSessionStore) -> Result<(), String> {
    let path = google_sessions_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .charon directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize google sessions: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write google_sessions.json: {e}"))?;
    Ok(())
}

pub fn list_google_sessions() -> Vec<GoogleWorkspaceSession> {
    load_google_session_store().sessions
}

pub fn save_google_session(session: &GoogleWorkspaceSession) -> Result<(), String> {
    let mut store = load_google_session_store();
    if let Some(existing) = store.sessions.iter_mut().find(|s| s.name == session.name) {
        *existing = session.clone();
    } else {
        store.sessions.push(session.clone());
    }
    save_google_session_store(&store)?;
    info!("Saved Google Workspace session: {}", session.name);
    Ok(())
}

pub fn delete_google_session(name: &str) -> Result<(), String> {
    let mut store = load_google_session_store();
    store.sessions.retain(|s| s.name != name);
    save_google_session_store(&store)?;
    info!("Deleted Google Workspace session: {name}");
    Ok(())
}

pub fn get_google_session(name: &str) -> Option<GoogleWorkspaceSession> {
    load_google_session_store()
        .sessions
        .into_iter()
        .find(|s| s.name == name)
}

// ---------------------------------------------------------------------------
// Legacy: AwsProfile / ~/.aws/config (kept for reading/migration)
// ---------------------------------------------------------------------------

/// Represents an SSO session block in ~/.aws/config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoSession {
    pub name: String,
    pub sso_start_url: String,
    pub sso_region: String,
    pub sso_registration_scopes: Option<String>,
}

/// Represents a named profile with SSO configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwsProfile {
    pub name: String,
    pub sso_session: Option<String>,
    pub sso_account_id: Option<String>,
    pub sso_role_name: Option<String>,
    pub region: Option<String>,
    pub output: Option<String>,
}

/// Get the path to ~/.aws/config
pub fn aws_config_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".aws")
        .join("config")
}

/// Get the path to ~/.aws/credentials
pub fn aws_credentials_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".aws")
        .join("credentials")
}

/// Parse all SSO sessions from ~/.aws/config
pub fn parse_sso_sessions() -> Vec<SsoSession> {
    let path = aws_config_path();
    if !path.exists() {
        warn!("AWS config not found at {}", path.display());
        return vec![];
    }

    let conf = match Ini::load_from_file(&path) {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to parse AWS config: {e}");
            return vec![];
        }
    };

    let mut sessions = Vec::new();
    for (section, props) in &conf {
        let section_name = match section {
            Some(s) => s,
            None => continue,
        };

        if let Some(name) = section_name.strip_prefix("sso-session ") {
            let start_url = props.get("sso_start_url").unwrap_or_default().to_string();
            let region = props.get("sso_region").unwrap_or_default().to_string();
            let scopes = props.get("sso_registration_scopes").map(|s| s.to_string());

            sessions.push(SsoSession {
                name: name.to_string(),
                sso_start_url: start_url,
                sso_region: region,
                sso_registration_scopes: scopes,
            });
        }
    }

    info!("Found {} SSO sessions", sessions.len());
    sessions
}

/// Parse all profiles from ~/.aws/config
pub fn parse_profiles() -> Vec<AwsProfile> {
    let path = aws_config_path();
    if !path.exists() {
        warn!("AWS config not found at {}", path.display());
        return vec![];
    }

    let conf = match Ini::load_from_file(&path) {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to parse AWS config: {e}");
            return vec![];
        }
    };

    let mut profiles = Vec::new();
    for (section, props) in &conf {
        let section_name = match section {
            Some(s) => s,
            None => continue,
        };

        // Profiles are either [profile foo] or [default]
        let name = if section_name == "default" {
            "default".to_string()
        } else if let Some(n) = section_name.strip_prefix("profile ") {
            n.to_string()
        } else {
            continue;
        };

        profiles.push(AwsProfile {
            name,
            sso_session: props.get("sso_session").map(|s| s.to_string()),
            sso_account_id: props.get("sso_account_id").map(|s| s.to_string()),
            sso_role_name: props.get("sso_role_name").map(|s| s.to_string()),
            region: props.get("region").map(|s| s.to_string()),
            output: props.get("output").map(|s| s.to_string()),
        });
    }

    info!("Found {} profiles", profiles.len());
    profiles
}

/// Save/update an SSO session in ~/.aws/config
pub fn save_sso_session(session: &SsoSession) -> Result<(), String> {
    let path = aws_config_path();

    // Ensure ~/.aws directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .aws directory: {e}"))?;
    }

    let mut conf = if path.exists() {
        Ini::load_from_file(&path).map_err(|e| format!("Failed to read config: {e}"))?
    } else {
        Ini::new()
    };

    let section_name = format!("sso-session {}", session.name);

    conf.set_to(
        Some(&section_name),
        "sso_start_url".to_string(),
        session.sso_start_url.clone(),
    );
    conf.set_to(
        Some(&section_name),
        "sso_region".to_string(),
        session.sso_region.clone(),
    );
    if let Some(ref scopes) = session.sso_registration_scopes {
        conf.set_to(
            Some(&section_name),
            "sso_registration_scopes".to_string(),
            scopes.clone(),
        );
    }

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write config: {e}"))?;

    info!("Saved SSO session: {}", session.name);
    Ok(())
}

/// Delete an SSO session from ~/.aws/config
pub fn delete_sso_session(name: &str) -> Result<(), String> {
    let path = aws_config_path();
    if !path.exists() {
        return Err("AWS config file not found".to_string());
    }

    let mut conf = Ini::load_from_file(&path).map_err(|e| format!("Failed to read config: {e}"))?;

    let section_name = format!("sso-session {name}");
    conf.delete(Some(&section_name));

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write config: {e}"))?;

    info!("Deleted SSO session: {name}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn sample_config() -> &'static str {
        "[default]\nregion = us-east-1\n\n\
         [profile dev]\nsso_session = my-sso\nsso_account_id = 111111111111\nsso_role_name = ReadOnly\nregion = eu-west-1\n\n\
         [sso-session my-sso]\nsso_start_url = https://my-org.awsapps.com/start\nsso_region = us-east-1\n"
    }

    #[test]
    fn test_parse_config_sections() {
        let mut f = NamedTempFile::new().unwrap();
        write!(f, "{}", sample_config()).unwrap();

        let conf = Ini::load_from_file(f.path()).unwrap();

        let mut profile_count = 0;
        let mut session_count = 0;
        for (section, _) in &conf {
            if let Some(s) = section {
                if s == "default" || s.starts_with("profile ") {
                    profile_count += 1;
                }
                if s.starts_with("sso-session ") {
                    session_count += 1;
                }
            }
        }

        assert_eq!(profile_count, 2);
        assert_eq!(session_count, 1);
    }

    #[test]
    fn test_save_sso_session_creates_section() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("config");

        // Write a minimal config first
        std::fs::write(&config_path, "[default]\nregion = us-east-1\n").unwrap();

        let session = SsoSession {
            name: "test-sso".to_string(),
            sso_start_url: "https://example.awsapps.com/start".to_string(),
            sso_region: "eu-west-1".to_string(),
            sso_registration_scopes: Some("sso:account:access".to_string()),
        };

        // We can't use save_sso_session directly because it uses aws_config_path(),
        // so we test the INI logic inline
        let mut conf = Ini::load_from_file(&config_path).unwrap();
        let section_name = format!("sso-session {}", session.name);
        conf.set_to(
            Some(&section_name),
            "sso_start_url".to_string(),
            session.sso_start_url.clone(),
        );
        conf.set_to(
            Some(&section_name),
            "sso_region".to_string(),
            session.sso_region.clone(),
        );
        if let Some(ref scopes) = session.sso_registration_scopes {
            conf.set_to(
                Some(&section_name),
                "sso_registration_scopes".to_string(),
                scopes.clone(),
            );
        }
        conf.write_to_file(&config_path).unwrap();

        // Verify the session was written
        let conf2 = Ini::load_from_file(&config_path).unwrap();
        let section = conf2.section(Some("sso-session test-sso")).unwrap();
        assert_eq!(
            section.get("sso_start_url").unwrap(),
            "https://example.awsapps.com/start"
        );
        assert_eq!(section.get("sso_region").unwrap(), "eu-west-1");
        assert_eq!(
            section.get("sso_registration_scopes").unwrap(),
            "sso:account:access"
        );
    }
}
