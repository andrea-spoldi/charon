# Work Log

## Entries

### 2026-02-19 - v0.2.0: Initial release
- **Status**: Completed
- **Description**: Initial Charon implementation with native OIDC device auth, SSO cache, account listing, console federation, CLI credentials config, profile management, settings page

### 2026-02-19 - v0.3.0: Validation, status bar, and defaults
- **Status**: Completed
- **Description**: Session name/URL validation, status bar component, bookmark region fix, ProfileForm default region, session deletion fix

### 2026-02-19 - v0.3.1: Fix status bar expiry date
- **Status**: Completed
- **Description**: Normalize UTC suffix in expires_at for JS Date parsing

### 2026-02-19 - v0.3.2: Fix default profile sync
- **Status**: Completed
- **Description**: Sync [default] section when updating or deleting the default profile

### 2026-02-19 - v0.3.3: Toast notification system for errors
- **Status**: Completed
- **Description**: Global toast notifications for all errors (logout, account list, session/profile operations) with auto-dismiss and slide-in animation

### 2026-02-19 - v0.3.4: Isolate CLI commands from broken [default] config
- **Status**: Completed
- **Description**: AWS CLI commands for listing accounts/roles now set AWS_CONFIG_FILE=/dev/null to prevent broken [default] profile from interfering

### 2026-03-12 - v0.5.0: SSM Port-Forwarding Tunnels
- **Status**: Completed
- **Description**: New "Tunnels" page for SSM port-forwarding. Users list SSM-managed EC2 instances, pick one as bridge, enter remote host:port, and start local port-forwarding tunnels. Supports saving named tunnel configs for quick re-use. Introduces long-lived child process management (tokio::process) with Tauri managed state. 8 new Tauri commands (check_session_manager_plugin, list_ssm_instances, start_tunnel, stop_tunnel, list_active_tunnels, list_tunnel_configs, save_tunnel_config, delete_tunnel_config), 4 new frontend files (TunnelsPage, TunnelForm, ActiveTunnelCard, useTunnels hook).
