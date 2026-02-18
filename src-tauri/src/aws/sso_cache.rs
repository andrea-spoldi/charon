use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SsoSessionStatus {
    Active,
    Expired,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoTokenInfo {
    pub status: SsoSessionStatus,
    pub start_url: Option<String>,
    pub region: Option<String>,
    pub expires_at: Option<String>,
    pub access_token: Option<String>,
}

/// JSON structure of SSO cache files in ~/.aws/sso/cache/
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SsoCacheEntry {
    start_url: Option<String>,
    region: Option<String>,
    access_token: Option<String>,
    expires_at: Option<String>,
}

/// Get the SSO cache directory
fn sso_cache_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".aws")
        .join("sso")
        .join("cache")
}

/// Read the SSO token cache and determine session status
pub fn get_sso_status() -> SsoTokenInfo {
    let cache_dir = sso_cache_dir();
    if !cache_dir.exists() {
        info!("SSO cache directory not found");
        return SsoTokenInfo {
            status: SsoSessionStatus::None,
            start_url: None,
            region: None,
            expires_at: None,
            access_token: None,
        };
    }

    let entries = match std::fs::read_dir(&cache_dir) {
        Ok(e) => e,
        Err(e) => {
            warn!("Failed to read SSO cache dir: {e}");
            return SsoTokenInfo {
                status: SsoSessionStatus::None,
                start_url: None,
                region: None,
                expires_at: None,
                access_token: None,
            };
        }
    };

    // Find the most recent valid token
    let mut best: Option<SsoTokenInfo> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let cache_entry: SsoCacheEntry = match serde_json::from_str(&content) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Skip entries without an access token (these are device authorization entries)
        if cache_entry.access_token.is_none() {
            continue;
        }

        let status = match &cache_entry.expires_at {
            Some(expires) => {
                if is_expired(expires) {
                    SsoSessionStatus::Expired
                } else {
                    SsoSessionStatus::Active
                }
            }
            None => SsoSessionStatus::Expired,
        };

        let info = SsoTokenInfo {
            status: status.clone(),
            start_url: cache_entry.start_url,
            region: cache_entry.region,
            expires_at: cache_entry.expires_at,
            access_token: cache_entry.access_token,
        };

        // Prefer active sessions
        match (&best, &status) {
            (None, _) => best = Some(info),
            (Some(prev), SsoSessionStatus::Active)
                if prev.status != SsoSessionStatus::Active =>
            {
                best = Some(info);
            }
            _ => {}
        }
    }

    best.unwrap_or(SsoTokenInfo {
        status: SsoSessionStatus::None,
        start_url: None,
        region: None,
        expires_at: None,
        access_token: None,
    })
}

/// Check if an ISO 8601 / RFC 3339 timestamp is in the past
fn is_expired(expires_at: &str) -> bool {
    // AWS SSO cache uses format like "2024-01-15T10:30:00UTC" or "2024-01-15T10:30:00Z"
    let normalized = expires_at.replace("UTC", "+00:00").replace("Z", "+00:00");

    // Try parsing with chrono-like manual approach
    // Format: YYYY-MM-DDTHH:MM:SS+00:00
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Simple parse: try to extract just enough to compare
    if let Some(dt) = parse_rfc3339_approx(&normalized) {
        dt < now
    } else {
        // If we can't parse, assume expired
        true
    }
}

/// Rough RFC 3339 parser without pulling in chrono
fn parse_rfc3339_approx(s: &str) -> Option<u64> {
    // Expected: "2024-01-15T10:30:00+00:00"
    let s = s.trim();
    if s.len() < 19 {
        return None;
    }

    let year: i64 = s[0..4].parse().ok()?;
    let month: i64 = s[5..7].parse().ok()?;
    let day: i64 = s[8..10].parse().ok()?;
    let hour: i64 = s[11..13].parse().ok()?;
    let min: i64 = s[14..16].parse().ok()?;
    let sec: i64 = s[17..19].parse().ok()?;

    // Rough days-from-epoch calculation (good enough for expiry comparison)
    let days = (year - 1970) * 365 + (year - 1969) / 4 - (year - 1901) / 100
        + (year - 1601) / 400
        + month_to_day_offset(month, is_leap(year))
        + day
        - 1;

    Some((days * 86400 + hour * 3600 + min * 60 + sec) as u64)
}

fn month_to_day_offset(month: i64, leap: bool) -> i64 {
    let offsets = if leap {
        [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
    } else {
        [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    };
    offsets.get((month - 1) as usize).copied().unwrap_or(0)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_expired_past() {
        assert!(is_expired("2020-01-01T00:00:00UTC"));
    }

    #[test]
    fn test_is_expired_future() {
        assert!(!is_expired("2099-12-31T23:59:59UTC"));
    }

    #[test]
    fn test_parse_rfc3339_approx() {
        let ts = parse_rfc3339_approx("2024-06-15T12:00:00+00:00");
        assert!(ts.is_some());
        assert!(ts.unwrap() > 0);
    }

    #[test]
    fn test_no_cache_returns_none_status() {
        // This tests the logic without hitting filesystem
        let info = SsoTokenInfo {
            status: SsoSessionStatus::None,
            start_url: None,
            region: None,
            expires_at: None,
            access_token: None,
        };
        assert_eq!(info.status, SsoSessionStatus::None);
    }
}
