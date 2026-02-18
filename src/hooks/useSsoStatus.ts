import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsoTokenInfo } from "../types";

const DEFAULT_STATUS: SsoTokenInfo = {
  status: "none",
  start_url: null,
  region: null,
  expires_at: null,
  access_token: null,
};

export function useSsoStatus(pollIntervalMs = 30000) {
  const [status, setStatus] = useState<SsoTokenInfo>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<SsoTokenInfo>("get_sso_status");
      setStatus(result);
    } catch (err) {
      console.error("Failed to get SSO status:", err);
      setStatus(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  return { status, loading, refresh };
}
