use ini::Ini;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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

/// Helper: write profile fields into a given section
fn write_profile_to_section(conf: &mut Ini, section: &str, profile: &AwsProfile) {
    if let Some(ref session) = profile.sso_session {
        conf.set_to(Some(section), "sso_session".to_string(), session.clone());
    }
    if let Some(ref account_id) = profile.sso_account_id {
        conf.set_to(
            Some(section),
            "sso_account_id".to_string(),
            account_id.clone(),
        );
    }
    if let Some(ref role_name) = profile.sso_role_name {
        conf.set_to(
            Some(section),
            "sso_role_name".to_string(),
            role_name.clone(),
        );
    }
    if let Some(ref region) = profile.region {
        conf.set_to(Some(section), "region".to_string(), region.clone());
    }
    if let Some(ref output) = profile.output {
        conf.set_to(Some(section), "output".to_string(), output.clone());
    }
}

/// Check if a named profile is currently the [default] by comparing SSO fields
fn is_current_default(conf: &Ini, profile_section: &str) -> bool {
    let default_props = match conf.section(Some("default")) {
        Some(p) => p,
        None => return false,
    };
    let profile_props = match conf.section(Some(profile_section)) {
        Some(p) => p,
        None => return false,
    };

    default_props.get("sso_session") == profile_props.get("sso_session")
        && default_props.get("sso_account_id") == profile_props.get("sso_account_id")
        && default_props.get("sso_role_name") == profile_props.get("sso_role_name")
}

/// Save/update a profile in ~/.aws/config
pub fn save_profile(profile: &AwsProfile) -> Result<(), String> {
    let path = aws_config_path();
    let mut conf = if path.exists() {
        Ini::load_from_file(&path).map_err(|e| format!("Failed to read config: {e}"))?
    } else {
        Ini::new()
    };

    let section_name = if profile.name == "default" {
        "default".to_string()
    } else {
        format!("profile {}", profile.name)
    };

    // Check if this profile is currently the default BEFORE updating it
    let was_default = profile.name != "default" && is_current_default(&conf, &section_name);

    // Update the profile section
    write_profile_to_section(&mut conf, &section_name, profile);

    // If this profile was the default, also sync the [default] section
    if was_default {
        conf.delete(Some("default"));
        write_profile_to_section(&mut conf, "default", profile);
        info!(
            "Also updated [default] section (synced with profile '{}')",
            profile.name
        );
    }

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write config: {e}"))?;

    info!("Saved profile: {}", profile.name);
    Ok(())
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

/// Delete a profile from ~/.aws/config
pub fn delete_profile(name: &str) -> Result<(), String> {
    let path = aws_config_path();
    if !path.exists() {
        return Err("AWS config file not found".to_string());
    }

    let mut conf = Ini::load_from_file(&path).map_err(|e| format!("Failed to read config: {e}"))?;

    let section_name = if name == "default" {
        "default".to_string()
    } else {
        format!("profile {name}")
    };

    // Check if this profile is currently the default BEFORE deleting it
    let was_default = name != "default" && is_current_default(&conf, &section_name);

    conf.delete(Some(&section_name));

    // If this profile was the default, also remove the [default] section
    if was_default {
        conf.delete(Some("default"));
        info!("Also removed [default] section (was synced with profile '{name}')");
    }

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write config: {e}"))?;

    info!("Deleted profile: {name}");
    Ok(())
}

/// Set a profile as the default by copying its SSO settings into [default]
pub fn set_default_profile(name: &str) -> Result<(), String> {
    let path = aws_config_path();
    if !path.exists() {
        return Err("AWS config file not found".to_string());
    }

    let mut conf = Ini::load_from_file(&path).map_err(|e| format!("Failed to read config: {e}"))?;

    let source_section = format!("profile {name}");
    let props: Vec<(String, String)> = conf
        .section(Some(&source_section))
        .ok_or_else(|| format!("Profile '{name}' not found"))?
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

    // Clear existing [default] section and write new values
    conf.delete(Some("default"));
    for (k, v) in &props {
        conf.set_to(Some("default"), k.clone(), v.clone());
    }

    conf.write_to_file(&path)
        .map_err(|e| format!("Failed to write config: {e}"))?;

    info!("Set default profile to: {name}");
    Ok(())
}

/// Get the name of the profile whose settings match [default], if any
pub fn get_default_profile_name() -> Option<String> {
    let path = aws_config_path();
    if !path.exists() {
        return None;
    }

    let conf = Ini::load_from_file(&path).ok()?;
    let default_props = conf.section(Some("default"))?;

    let default_session = default_props.get("sso_session");
    let default_account = default_props.get("sso_account_id");
    let default_role = default_props.get("sso_role_name");

    // No SSO settings in default — not pointing to any profile
    if default_session.is_none() && default_account.is_none() && default_role.is_none() {
        return None;
    }

    for (section, props) in &conf {
        let section_name = match section {
            Some(s) => s,
            None => continue,
        };

        let name = match section_name.strip_prefix("profile ") {
            Some(n) => n,
            None => continue,
        };

        if props.get("sso_session") == default_session
            && props.get("sso_account_id") == default_account
            && props.get("sso_role_name") == default_role
        {
            return Some(name.to_string());
        }
    }

    None
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
