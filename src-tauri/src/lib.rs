use log::info;

mod aws;
mod commands;

pub fn run() {
    env_logger::init();
    info!("Starting Charon");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // SSO
            commands::sso::get_sso_status,
            commands::sso::sso_login,
            commands::sso::sso_logout,
            commands::sso::start_device_auth,
            commands::sso::poll_device_auth,
            // Accounts
            commands::accounts::list_sso_accounts,
            commands::accounts::list_account_roles,
            commands::accounts::get_role_credentials,
            commands::accounts::open_aws_console,
            commands::accounts::configure_cli_credentials,
            // Profiles
            commands::profiles::list_sso_sessions,
            commands::profiles::list_profiles,
            commands::profiles::save_profile,
            commands::profiles::delete_profile,
            commands::profiles::create_sso_session,
            commands::profiles::delete_sso_session,
            commands::profiles::set_default_profile,
            commands::profiles::get_default_profile,
            // Settings
            commands::settings::get_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
