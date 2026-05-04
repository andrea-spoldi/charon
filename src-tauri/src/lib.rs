use log::{info, warn};
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;

mod aws;
mod commands;

/// Initialise logging to both stdout and `~/.charon/charon.log`.
///
/// Log level priority: `CHARON_LOG_LEVEL` > `RUST_LOG` > default `info`.
fn init_logging() {
    let home = commands::charon_home_dir();
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(home.join("charon.log"))
        .expect("Failed to open log file");
    let log_file = Mutex::new(log_file);

    let level = std::env::var("CHARON_LOG_LEVEL")
        .or_else(|_| std::env::var("RUST_LOG"))
        .unwrap_or_else(|_| "info".to_string());

    env_logger::Builder::new()
        .parse_filters(&level)
        .format(move |buf, record| {
            let ts = buf.timestamp_seconds();
            let line = format!(
                "{} [{}] {} - {}\n",
                ts,
                record.level(),
                record.target(),
                record.args()
            );
            // Append to log file
            if let Ok(mut f) = log_file.lock() {
                let _ = f.write_all(line.as_bytes());
            }
            // Also write to stdout
            write!(buf, "{line}")
        })
        .init();
}

/// Migrate config files from the old platform-specific location to `~/.charon/`.
fn migrate_legacy_configs() {
    let new_dir = commands::charon_home_dir();

    // Old location: dirs::config_dir()/charon  (~/Library/Application Support/charon on macOS,
    // ~/.config/charon on Linux)
    let old_dir = match dirs::config_dir() {
        Some(d) => d.join("charon"),
        None => return,
    };

    if !old_dir.exists() {
        return;
    }

    for filename in &["settings.json", "tunnels.json"] {
        let old_file = old_dir.join(filename);
        let new_file = new_dir.join(filename);
        if old_file.exists() && !new_file.exists() {
            match std::fs::copy(&old_file, &new_file) {
                Ok(_) => info!(
                    "Migrated {} from {} to {}",
                    filename,
                    old_file.display(),
                    new_file.display()
                ),
                Err(e) => log::warn!("Failed to migrate {}: {}", old_file.display(), e),
            }
        }
    }
}

/// Auto-migrate profiles from ~/.aws/config to ~/.charon/profiles.json on first run.
/// Also removes SSO-backed profiles from ~/.aws/config so the CLI can't auto-derive credentials.
fn migrate_profiles_if_needed() {
    use crate::aws::config::{
        cleanup_aws_config_profiles, import_profiles_from_aws_config, load_profile_store,
    };

    let store = load_profile_store();
    if !store.profiles.is_empty() {
        // Already have profiles in the new store — skip migration
        return;
    }

    match import_profiles_from_aws_config() {
        Ok(count) if count > 0 => {
            info!("Auto-migrated {count} profiles from ~/.aws/config");
            match cleanup_aws_config_profiles() {
                Ok(cleaned) => {
                    info!("Cleaned {cleaned} SSO-backed profiles from ~/.aws/config")
                }
                Err(e) => warn!("Failed to clean up ~/.aws/config: {e}"),
            }
        }
        Ok(_) => info!("No profiles to migrate from ~/.aws/config"),
        Err(e) => warn!("Profile migration failed: {e}"),
    }
}

pub fn run() {
    init_logging();
    migrate_legacy_configs();
    migrate_profiles_if_needed();
    info!("Starting Charon");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(commands::tunnels::TunnelState::default())
        .manage(commands::sessions::ShellState::default())
        .invoke_handler(tauri::generate_handler![
            // SSO
            commands::sso::get_sso_status,
            commands::sso::get_session_sso_token,
            commands::sso::sso_login,
            commands::sso::sso_logout,
            commands::sso::start_device_auth,
            commands::sso::poll_device_auth,
            // Accounts
            commands::accounts::list_sso_accounts,
            commands::accounts::list_all_portal_accounts,
            commands::accounts::list_account_roles,
            commands::accounts::get_role_credentials,
            commands::accounts::open_aws_console,
            commands::accounts::configure_cli_credentials,
            commands::accounts::stop_session,
            commands::accounts::stop_all_sessions,
            // Profiles
            commands::profiles::list_sso_sessions,
            commands::profiles::list_profiles,
            commands::profiles::save_profile,
            commands::profiles::delete_profile,
            commands::profiles::create_sso_session,
            commands::profiles::delete_sso_session,
            commands::profiles::set_default_profile,
            commands::profiles::get_default_profile,
            commands::profiles::migrate_profiles,
            // Shell Sessions
            commands::sessions::start_shell_session,
            commands::sessions::write_shell_input,
            commands::sessions::resize_shell,
            commands::sessions::stop_shell_session,
            commands::sessions::list_shell_sessions,
            // Settings
            commands::settings::get_settings,
            commands::settings::save_settings,
            // Tunnels
            commands::tunnels::check_session_manager_plugin,
            commands::tunnels::list_ssm_instances,
            commands::tunnels::start_tunnel,
            commands::tunnels::stop_tunnel,
            commands::tunnels::list_active_tunnels,
            commands::tunnels::list_tunnel_configs,
            commands::tunnels::save_tunnel_config,
            commands::tunnels::delete_tunnel_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
