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

// AWS profile from ~/.aws/config [profile X]
export interface AwsProfile {
  name: string;
  sso_session: string | null;
  sso_account_id: string | null;
  sso_role_name: string | null;
  region: string | null;
  output: string | null;
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
}

// Navigation pages
export type Page = "accounts" | "sessions" | "profiles" | "settings";
