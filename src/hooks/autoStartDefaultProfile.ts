import { invoke } from "@tauri-apps/api/core";
import type { AwsProfile, ConfigureCliCredentialsResult } from "../types";

interface AutoStartArgs {
  /** The SSO session that just logged in. */
  sessionName: string;
  /** `settings.auto_start_default_profile`. */
  enabled: boolean;
  /** The shared tracker's `start`, so the profile is tracked and refreshed. */
  start: (profile: AwsProfile) => Promise<ConfigureCliCredentialsResult>;
}

/**
 * After a successful SSO login, start the default profile if the setting is
 * on and that profile belongs to the session that logged in (D-008).
 * Reads the default and the profile list fresh from the backend, because
 * the copies held in React state can lag behind edits made on other pages.
 * Returns the started profile, or null if nothing was started; a failure
 * to start is thrown to the caller.
 */
export async function autoStartDefaultProfile({
  sessionName,
  enabled,
  start,
}: AutoStartArgs): Promise<AwsProfile | null> {
  if (!enabled) return null;
  const defaultName = await invoke<string | null>("get_default_profile");
  if (!defaultName) return null;
  const profiles = await invoke<AwsProfile[]>("list_profiles");
  const profile = profiles.find((p) => p.name === defaultName);
  if (!profile || profile.sso_session !== sessionName) return null;
  await start(profile);
  return profile;
}
