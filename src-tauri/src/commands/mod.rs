pub mod accounts;
pub mod profiles;
pub mod settings;
pub mod sso;

use std::path::PathBuf;

/// Resolve the full path to the AWS CLI binary.
/// Checks settings first, then probes common install locations.
pub fn resolve_aws_cli() -> String {
    let settings = settings::get_settings();

    // If user configured an explicit path (not just "aws"), use it
    if settings.aws_cli_path != "aws" && !settings.aws_cli_path.is_empty() {
        return settings.aws_cli_path;
    }

    // Probe common locations (bundled .app on macOS has minimal PATH)
    let candidates = [
        "/usr/local/bin/aws",
        "/opt/homebrew/bin/aws",
        "/opt/homebrew/sbin/aws",
        "/usr/bin/aws",
        "/home/linuxbrew/.linuxbrew/bin/aws",
    ];

    // Also check ~/.local/bin/aws
    if let Some(home) = dirs::home_dir() {
        let local_bin = home.join(".local").join("bin").join("aws");
        if local_bin.exists() {
            return local_bin.to_string_lossy().to_string();
        }
    }

    for candidate in &candidates {
        if PathBuf::from(candidate).exists() {
            return candidate.to_string();
        }
    }

    // Fallback — hope it's on PATH
    "aws".to_string()
}
