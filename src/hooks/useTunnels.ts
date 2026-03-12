import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsmInstance, TunnelConfig, ActiveTunnel } from "../types";

export function useTunnels() {
  const [configs, setConfigs] = useState<TunnelConfig[]>([]);
  const [activeTunnels, setActiveTunnels] = useState<ActiveTunnel[]>([]);
  const [instances, setInstances] = useState<SsmInstance[]>([]);
  const [pluginInstalled, setPluginInstalled] = useState<boolean | null>(null);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check plugin on mount
  useEffect(() => {
    invoke<boolean>("check_session_manager_plugin").then(setPluginInstalled);
  }, []);

  // Load saved configs on mount
  const refreshConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const result = await invoke<TunnelConfig[]>("list_tunnel_configs");
      setConfigs(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    refreshConfigs();
  }, [refreshConfigs]);

  // Poll active tunnels every 2s when there are active tunnels
  const pollActiveTunnels = useCallback(async () => {
    try {
      const result = await invoke<ActiveTunnel[]>("list_active_tunnels");
      setActiveTunnels(result);
    } catch {
      // Ignore polling errors
    }
  }, []);

  useEffect(() => {
    // Always poll to catch new tunnels
    pollRef.current = setInterval(pollActiveTunnels, 2000);
    // Initial poll
    pollActiveTunnels();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollActiveTunnels]);

  // Fetch SSM instances for a given account/role/region
  const fetchInstances = useCallback(
    async (
      accessToken: string,
      accountId: string,
      roleName: string,
      ssoRegion: string,
      targetRegion: string,
    ) => {
      setLoadingInstances(true);
      setError(null);
      setInstances([]);
      try {
        const result = await invoke<SsmInstance[]>("list_ssm_instances", {
          accessToken,
          accountId,
          roleName,
          ssoRegion,
          targetRegion,
        });
        setInstances(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingInstances(false);
      }
    },
    [],
  );

  // Start a tunnel
  const startTunnel = useCallback(
    async (params: {
      accessToken: string;
      accountId: string;
      roleName: string;
      ssoRegion: string;
      instanceId: string;
      remoteHost: string;
      remotePort: number;
      localPort: number;
      region: string;
      configName?: string;
    }) => {
      setError(null);
      try {
        const result = await invoke<ActiveTunnel>("start_tunnel", {
          params,
        });
        setActiveTunnels((prev) => [...prev, result]);
        return result;
      } catch (err) {
        setError(String(err));
        throw err;
      }
    },
    [],
  );

  // Stop a tunnel
  const stopTunnel = useCallback(async (tunnelId: string) => {
    try {
      await invoke("stop_tunnel", { tunnelId });
      setActiveTunnels((prev) => prev.filter((t) => t.id !== tunnelId));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // Save a tunnel config
  const saveConfig = useCallback(
    async (config: TunnelConfig) => {
      try {
        await invoke("save_tunnel_config", { config });
        await refreshConfigs();
      } catch (err) {
        setError(String(err));
      }
    },
    [refreshConfigs],
  );

  // Delete a tunnel config
  const deleteConfig = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_tunnel_config", { id });
        await refreshConfigs();
      } catch (err) {
        setError(String(err));
      }
    },
    [refreshConfigs],
  );

  return {
    configs,
    activeTunnels,
    instances,
    pluginInstalled,
    loadingInstances,
    loadingConfigs,
    error,
    fetchInstances,
    startTunnel,
    stopTunnel,
    saveConfig,
    deleteConfig,
    refreshConfigs,
    clearError: useCallback(() => setError(null), []),
  };
}
