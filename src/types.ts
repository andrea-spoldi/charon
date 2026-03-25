// SSO session status
export type SsoSessionStatus = "active" | "expired" | "none";

export interface SsoTokenInfo {
  status: SsoSessionStatus;
  start_url: string | null;
  region: string | null;
  expires_at: string | null;
  access_token: string | null;
}

// SSO session from ~/.aws/config [sso-session X]
export interface SsoSession {
  name: string;
  sso_start_url: string;
  sso_region: string;
  sso_registration_scopes: string | null;
}

// Charon profile stored in ~/.charon/profiles.json
export interface AwsProfile {
  name: string;
  sso_session: string;
  sso_account_id: string;
  sso_role_name: string;
  region: string | null;
  output: string | null;
  session_active: boolean;
}

// Account from SSO list-accounts
export interface SsoAccount {
  accountId: string;
  accountName: string;
  emailAddress: string;
}

// Role from SSO list-account-roles
export interface AccountRole {
  roleName: string;
  accountId: string;
}

// Device authorization flow info
export interface DeviceAuthInfo {
  user_code: string;
  verification_uri_complete: string;
  device_code: string;
  client_id: string;
  client_secret: string;
  interval: number;
  expires_in: number;
  region: string;
  start_url: string;
}

// App settings
export interface AppSettings {
  default_region: string;
  aws_cli_path: string;
  refresh_interval_secs: number;
  session_timeout_hours: number;
}

// SSM instance from describe-instance-information
export interface SsmInstance {
  instanceId: string;
  instanceName: string | null;
  computerName: string | null;
  ipAddress: string | null;
  platformType: string | null;
  pingStatus: string;
}

// Saved tunnel configuration
export interface TunnelConfig {
  id: string;
  name: string;
  accountId: string;
  roleName: string;
  instanceId: string;
  remoteHost: string;
  remotePort: number;
  localPort: number;
  region: string;
  useRandomPort: boolean;
}

// Active tunnel status
export type TunnelStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

// Active tunnel runtime state
export interface ActiveTunnel {
  id: string;
  configName: string | null;
  instanceId: string;
  remoteHost: string;
  remotePort: number;
  localPort: number;
  region: string;
  status: TunnelStatus;
  startedAt: string;
  errorMessage: string | null;
}

// Navigation pages
export type Page =
  | "accounts"
  | "sessions"
  | "profiles"
  | "settings"
  | "tunnels";
