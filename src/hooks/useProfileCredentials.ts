import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AwsProfile,
  SsoTokenInfo,
  AppSettings,
  ConfigureCliCredentialsResult,
} from "../types";

// Refresh a profile's credentials this long before they actually expire.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Resolve the SSO token that a profile's credentials should be issued from. */
export async function resolveSessionToken(
  profile: AwsProfile,
  ssoStatus: SsoTokenInfo,
): Promise<SsoTokenInfo> {
  if (profile.sso_session) {
    return await invoke<SsoTokenInfo>("get_session_sso_token", {
      sessionName: profile.sso_session,
    });
  }
  // Profiles without an explicit session fall back to the global active token
  if (!ssoStatus.access_token || !ssoStatus.region) {
    throw new Error("No active SSO session");
  }
  return ssoStatus;
}

interface TrackedProfile {
  profile: AwsProfile;
  expiresAt: number;
}

interface UseProfileCredentialsArgs {
  ssoStatus: SsoTokenInfo;
  settings: AppSettings;
}

/**
 * App-level tracking of profiles started (Played) in this run, with
 * background auto-refresh. Lives above the pages so it survives navigation.
 * Only profiles explicitly started via `start` are ever tracked (see T-011).
 */
export function useProfileCredentials({
  ssoStatus,
  settings,
}: UseProfileCredentialsArgs) {
  const [tracked, setTracked] = useState<Record<string, TrackedProfile>>({});
  const [now, setNow] = useState(() => Date.now());

  const expirations = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [name, t] of Object.entries(tracked)) out[name] = t.expiresAt;
    return out;
  }, [tracked]);

  const untrack = useCallback((name: string) => {
    setTracked((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  /** Keep a tracked profile's stored definition in sync after an edit. */
  const updateProfile = useCallback((profile: AwsProfile) => {
    setTracked((prev) =>
      profile.name in prev
        ? { ...prev, [profile.name]: { ...prev[profile.name], profile } }
        : prev,
    );
  }, []);

  // Fetch fresh role credentials for a profile and record their expiry.
  // Shared by Play, auto-start, and the background auto-refresh loop.
  const start = useCallback(
    async (profile: AwsProfile): Promise<ConfigureCliCredentialsResult> => {
      const cliRegion = profile.region || settings.default_region;
      const token = await resolveSessionToken(profile, ssoStatus);
      const result = await invoke<ConfigureCliCredentialsResult>(
        "configure_cli_credentials",
        {
          accessToken: token.access_token,
          accountId: profile.sso_account_id,
          roleName: profile.sso_role_name,
          ssoRegion: token.region,
          cliRegion,
          profileName: profile.name,
        },
      );
      setTracked((prev) => ({
        ...prev,
        [profile.name]: { profile, expiresAt: result.expiresAt },
      }));
      return result;
    },
    [ssoStatus, settings.default_region],
  );

  const stop = useCallback(
    async (profile: AwsProfile) => {
      await invoke("stop_session", { profileName: profile.name });
      untrack(profile.name);
    },
    [untrack],
  );

  // Stop every session (StatusBar "stop all") and forget all tracking, so
  // auto-refresh can't re-issue the credentials that were just removed.
  const stopAll = useCallback(async (): Promise<string> => {
    const msg = await invoke<string>("stop_all_sessions");
    setTracked({});
    return msg;
  }, []);

  // A tracked profile's credentials expired without being refreshed in
  // time (its SSO session died before we could renew them). Stop treating
  // it as active: clean up its dead ~/.aws/credentials entry so the UI
  // reverts to "off" (Play) instead of a stale "Stop".
  const abandonExpired = useCallback(
    async (profile: AwsProfile) => {
      untrack(profile.name);
      try {
        await invoke("stop_session", { profileName: profile.name });
      } catch {
        // Best-effort cleanup; it's untracked in the UI either way.
      }
    },
    [untrack],
  );

  // Background auto-refresh: shortly before a started profile's credentials
  // expire, reissue them, but only while its SSO session is still active.
  useEffect(() => {
    const intervalMs = (settings.refresh_interval_secs || 30) * 1000;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const nowMs = Date.now();
      for (const { profile, expiresAt } of Object.values(tracked)) {
        if (expiresAt <= nowMs) {
          await abandonExpired(profile);
          continue;
        }
        if (expiresAt - nowMs > REFRESH_BUFFER_MS) continue;
        try {
          const token = await resolveSessionToken(profile, ssoStatus);
          if (token.status !== "active") continue;
          await start(profile);
        } catch (err) {
          console.error(
            `Auto-refresh failed for profile [${profile.name}]:`,
            err,
          );
        }
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [
    settings.refresh_interval_secs,
    tracked,
    ssoStatus,
    start,
    abandonExpired,
  ]);

  return { expirations, now, start, stop, stopAll, untrack, updateProfile };
}

export type ProfileCredentials = ReturnType<typeof useProfileCredentials>;
