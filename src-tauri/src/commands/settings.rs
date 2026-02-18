use log::info;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub default_region: String,
    pub aws_cli_path: String,
    pub refresh_interval_secs: u64,
    pub session_timeout_hours: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_region: "us-east-1".to_string(),
            aws_cli_path: "aws".to_string(),
            refresh_interval_secs: 30,
            session_timeout_hours: 8,
        }
    }
}

fn settings_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("No home dir").join(".config"))
        .join("charon");

    fs::create_dir_all(&dir).ok();
    dir.join("settings.json")
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    info!("Loading settings");
    let path = settings_path();

    if !path.exists() {
        return AppSettings::default();
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<String, String> {
    info!("Saving settings");
    let path = settings_path();
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Serialize error: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write error: {e}"))?;
    Ok("Settings saved".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let s = AppSettings::default();
        assert_eq!(s.default_region, "us-east-1");
        assert_eq!(s.aws_cli_path, "aws");
        assert_eq!(s.refresh_interval_secs, 30);
        assert_eq!(s.session_timeout_hours, 8);
    }

    #[test]
    fn test_settings_roundtrip() {
        let s = AppSettings {
            default_region: "eu-west-1".to_string(),
            aws_cli_path: "/usr/local/bin/aws".to_string(),
            refresh_interval_secs: 60,
            session_timeout_hours: 4,
        };
        let json = serde_json::to_string(&s).unwrap();
        let parsed: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.default_region, "eu-west-1");
        assert_eq!(parsed.refresh_interval_secs, 60);
        assert_eq!(parsed.session_timeout_hours, 4);
    }
}
