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
    /// Whether this profile was imported from manually added credentials in
    /// ~/.aws/credentials (static keys, not SSO-backed). Manual profiles are
    /// never started/stopped by Charon so their keys are never removed.
    #[serde(default)]
    pub manual: bool,
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
            manual: false,
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

/// Sections in a credentials file that hold static keys and are not yet in
/// Charon's store (i.e. profiles the user added to ~/.aws/credentials by hand).
fn unmanaged_credential_profiles(conf: &Ini, store: &ProfileStore) -> Vec<String> {
    let mut names = Vec::new();
    for (section, props) in conf {
        let Some(name) = section else { continue };
        if name == "default" {
            continue;
        }
        // Only static long-lived keys count as manual: sections with a session
        // token are temporary STS credentials (written by Charon or the CLI)
        if !props.contains_key("aws_access_key_id") || props.contains_key("aws_session_token") {
            continue;
        }
        if store.profiles.iter().any(|p| p.name == name) {
            continue;
        }
        names.push(name.to_string());
    }
    names
}

/// List profiles manually added to ~/.aws/credentials that Charon doesn't manage yet.
pub fn list_unmanaged_credential_profiles() -> Vec<String> {
    let path = aws_credentials_path();
    if !path.exists() {
        return vec![];
    }
    let conf = match Ini::load_from_file(&path) {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to parse AWS credentials: {e}");
            return vec![];
        }
    };
    unmanaged_credential_profiles(&conf, &load_profile_store())
}

/// Add the requested unmanaged credential profiles to the store (as manual
/// profiles). Returns how many were imported.
fn import_credential_profiles_into(
    store: &mut ProfileStore,
    conf: &Ini,
    names: &[String],
) -> usize {
    let unmanaged = unmanaged_credential_profiles(conf, store);
    let mut imported = 0;
    for name in names {
        if !unmanaged.contains(name) {
            continue;
        }
        let region = conf
            .section(Some(name.as_str()))
            .and_then(|props| props.get("region"))
            .map(|s| s.to_string());
        store.profiles.push(CharonProfile {
            name: name.clone(),
            sso_session: String::new(),
            sso_account_id: String::new(),
            sso_role_name: String::new(),
            region,
            output: None,
            session_active: false,
            manual: true,
        });
        imported += 1;
    }
    imported
}

/// Import manually added ~/.aws/credentials profiles into Charon's store.
/// The credentials file itself is left untouched.
pub fn import_credential_profiles(names: &[String]) -> Result<usize, String> {
    let path = aws_credentials_path();
    if !path.exists() {
        return Err("AWS credentials file not found".to_string());
    }
    let conf =
        Ini::load_from_file(&path).map_err(|e| format!("Failed to read credentials: {e}"))?;

    let mut store = load_profile_store();
    let imported = import_credential_profiles_into(&mut store, &conf, names);
    if imported > 0 {
        save_profile_store(&store)?;
        info!("Imported {imported} manual profiles from ~/.aws/credentials");
    }
    Ok(imported)
}

fn validate_profile_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }
    if name == "default" {
        return Err("'default' is a reserved profile name".to_string());
    }
    if name
        .chars()
        .any(|c| c.is_whitespace() || c == '[' || c == ']')
    {
        return Err("Profile name cannot contain spaces or brackets".to_string());
    }
    Ok(())
}

fn rename_profile_in_store(store: &mut ProfileStore, old: &str, new: &str) -> Result<(), String> {
    validate_profile_name(new)?;
    if store.profiles.iter().any(|p| p.name == new) {
        return Err(format!("Profile '{new}' already exists"));
    }
    let Some(profile) = store.profiles.iter_mut().find(|p| p.name == old) else {
        return Err(format!("Profile '{old}' not found"));
    };
    profile.name = new.to_string();
    if store.default_profile.as_deref() == Some(old) {
        store.default_profile = Some(new.to_string());
    }
    Ok(())
}

/// Move a section of the credentials file to a new name, keeping its keys.
/// Returns whether the old section existed.
fn rename_credentials_section(conf: &mut Ini, old: &str, new: &str) -> bool {
    let fields: Vec<(String, String)> = match conf.section(Some(old)) {
        Some(props) => props
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        None => return false,
    };
    for (k, v) in fields {
        conf.set_to(Some(new), k, v);
    }
    conf.delete(Some(old));
    true
}

/// Rename a profile in Charon's store and keep ~/.aws/credentials in sync so
/// active sessions and manual credentials follow the new name.
pub fn rename_profile(old: &str, new: &str) -> Result<(), String> {
    let new = new.trim();
    if new == old {
        return Ok(());
    }

    let mut store = load_profile_store();
    rename_profile_in_store(&mut store, old, new)?;
    save_profile_store(&store)?;

    let path = aws_credentials_path();
    if path.exists() {
        let mut conf =
            Ini::load_from_file(&path).map_err(|e| format!("Failed to read credentials: {e}"))?;
        if rename_credentials_section(&mut conf, old, new) {
            conf.write_to_file(&path)
                .map_err(|e| format!("Failed to write credentials: {e}"))?;
        }
    }

    info!("Renamed profile '{old}' to '{new}'");
    Ok(())
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

    fn sample_credentials() -> Ini {
        let mut f = NamedTempFile::new().unwrap();
        write!(
            f,
            "[default]\naws_access_key_id = AKIADEFAULT\naws_secret_access_key = secret\n\n\
             [manual-one]\naws_access_key_id = AKIAMANUAL1\naws_secret_access_key = secret\nregion = eu-south-1\n\n\
             [manual-two]\naws_access_key_id = AKIAMANUAL2\naws_secret_access_key = secret\n\n\
             [charon-managed]\naws_access_key_id = ASIATEMP\naws_secret_access_key = secret\naws_session_token = sts-token\n\n\
             [known-profile]\naws_access_key_id = AKIAKNOWN\naws_secret_access_key = secret\n"
        )
        .unwrap();
        Ini::load_from_file(f.path()).unwrap()
    }

    fn store_with_known_profile() -> ProfileStore {
        ProfileStore {
            profiles: vec![CharonProfile {
                name: "known-profile".to_string(),
                sso_session: "my-sso".to_string(),
                sso_account_id: "111111111111".to_string(),
                sso_role_name: "ReadOnly".to_string(),
                region: None,
                output: None,
                session_active: true,
                manual: false,
            }],
            default_profile: None,
        }
    }

    #[test]
    fn test_unmanaged_credential_profiles_detects_manual_only() {
        let conf = sample_credentials();
        let store = store_with_known_profile();

        let names = unmanaged_credential_profiles(&conf, &store);

        // [default] is skipped, [charon-managed] has a session token (STS),
        // [known-profile] is already in the store
        assert_eq!(names, vec!["manual-one", "manual-two"]);
    }

    #[test]
    fn test_import_credential_profiles_adds_manual_profiles() {
        let conf = sample_credentials();
        let mut store = store_with_known_profile();

        let imported = import_credential_profiles_into(
            &mut store,
            &conf,
            &["manual-one".to_string(), "known-profile".to_string()],
        );

        // known-profile is already managed and must not be duplicated
        assert_eq!(imported, 1);
        assert_eq!(store.profiles.len(), 2);
        let manual = store
            .profiles
            .iter()
            .find(|p| p.name == "manual-one")
            .unwrap();
        assert!(manual.manual);
        assert!(!manual.session_active);
        assert_eq!(manual.region.as_deref(), Some("eu-south-1"));
        assert!(manual.sso_session.is_empty());
    }

    #[test]
    fn test_rename_profile_updates_store_and_default() {
        let mut store = store_with_known_profile();
        store.default_profile = Some("known-profile".to_string());

        rename_profile_in_store(&mut store, "known-profile", "renamed").unwrap();

        assert_eq!(store.profiles[0].name, "renamed");
        assert_eq!(store.default_profile.as_deref(), Some("renamed"));
    }

    #[test]
    fn test_rename_profile_rejects_invalid_names() {
        let mut store = store_with_known_profile();

        assert!(rename_profile_in_store(&mut store, "known-profile", "").is_err());
        assert!(rename_profile_in_store(&mut store, "known-profile", "default").is_err());
        assert!(rename_profile_in_store(&mut store, "known-profile", "has space").is_err());
        assert!(rename_profile_in_store(&mut store, "known-profile", "known-profile").is_err());
        assert!(rename_profile_in_store(&mut store, "missing", "new-name").is_err());
        // Store untouched after failed renames
        assert_eq!(store.profiles[0].name, "known-profile");
    }

    #[test]
    fn test_rename_credentials_section_moves_keys() {
        let mut conf = sample_credentials();

        assert!(rename_credentials_section(
            &mut conf,
            "manual-one",
            "manual-renamed"
        ));

        assert!(conf.section(Some("manual-one")).is_none());
        let section = conf.section(Some("manual-renamed")).unwrap();
        assert_eq!(section.get("aws_access_key_id").unwrap(), "AKIAMANUAL1");
        assert_eq!(section.get("region").unwrap(), "eu-south-1");

        // Renaming a missing section is a no-op
        assert!(!rename_credentials_section(
            &mut conf,
            "nonexistent",
            "whatever"
        ));
    }

    #[test]
    fn test_import_credential_profiles_ignores_unknown_names() {
        let conf = sample_credentials();
        let mut store = ProfileStore::default();

        let imported =
            import_credential_profiles_into(&mut store, &conf, &["nonexistent".to_string()]);

        assert_eq!(imported, 0);
        assert!(store.profiles.is_empty());
    }
}
