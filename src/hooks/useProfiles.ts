import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AwsProfile, SsoSession, GoogleWorkspaceSession } from "../types";

export function useProfiles() {
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [sessions, setSessions] = useState<SsoSession[]>([]);
  const [googleSessions, setGoogleSessions] = useState<GoogleWorkspaceSession[]>([]);
  const [defaultProfile, setDefaultProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [profileList, sessionList, googleSessionList, defaultName] =
        await Promise.all([
          invoke<AwsProfile[]>("list_profiles"),
          invoke<SsoSession[]>("list_sso_sessions"),
          invoke<GoogleWorkspaceSession[]>("list_google_sessions"),
          invoke<string | null>("get_default_profile"),
        ]);
      setProfiles(profileList);
      setSessions(sessionList);
      setGoogleSessions(googleSessionList);
      setDefaultProfile(defaultName);
    } catch (err) {
      console.error("Failed to load profiles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveProfile = useCallback(
    async (profile: AwsProfile) => {
      await invoke("save_profile", { profile });
      await refresh();
    },
    [refresh],
  );

  const deleteProfile = useCallback(
    async (name: string) => {
      await invoke("delete_profile", { name });
      await refresh();
    },
    [refresh],
  );

  const setDefault = useCallback(async (name: string) => {
    await invoke("set_default_profile", { name });
    setDefaultProfile(name);
  }, []);

  return {
    profiles,
    sessions,
    googleSessions,
    defaultProfile,
    loading,
    refresh,
    saveProfile,
    deleteProfile,
    setDefault,
  };
}
