import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import { ToastContainer } from "./components/ToastContainer";
import { AccountsPage } from "./pages/AccountsPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TunnelsPage } from "./pages/TunnelsPage";
import { ShellPage } from "./pages/ShellPage";
import { useSsoStatus } from "./hooks/useSsoStatus";
import { useProfiles } from "./hooks/useProfiles";
import { useAccounts } from "./hooks/useAccounts";
import { useTunnels } from "./hooks/useTunnels";
import { useToast } from "./hooks/useToast";
import { useFontSize } from "./components/FontSizeToggle";
import type { Page, AppSettings } from "./types";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [activePage, setActivePage] = useState<Page>("accounts");
  const [settings, setSettings] = useState<AppSettings>({
    default_region: "us-east-1",
    aws_cli_path: "aws",
    refresh_interval_secs: 30,
    session_timeout_hours: 8,
  });
  const { status: ssoStatus, refresh: refreshSsoStatus } = useSsoStatus();
  const {
    profiles,
    sessions,
    defaultProfile,
    loading: sessionsLoading,
    refresh: refreshProfiles,
  } = useProfiles();
  const {
    accounts,
    roles,
    loading: accountsLoading,
    error: accountsError,
    fetchAllPortalAccounts,
    fetchRoles,
    reset: resetAccounts,
  } = useAccounts();
  const tunnels = useTunnels();
  const { toasts, addToast, dismissToast } = useToast();
  const { fontSize, setFontSize } = useFontSize();
  const hasFetched = useRef(false);
  const [profileExpiration, setProfileExpiration] = useState<number | null>(
    null,
  );

  // Load settings once on mount
  useEffect(() => {
    invoke<AppSettings>("get_settings").then(setSettings).catch(console.error);
  }, []);

  // Fetch default profile credential expiration when SSO is active
  useEffect(() => {
    if (
      ssoStatus.status !== "active" ||
      !ssoStatus.access_token ||
      !ssoStatus.region
    ) {
      setProfileExpiration(null);
      return;
    }
    const defaultProf = profiles.find((p) => p.name === defaultProfile);
    if (!defaultProf?.sso_account_id || !defaultProf?.sso_role_name) {
      setProfileExpiration(null);
      return;
    }
    invoke<{ expiration: number }>("get_role_credentials", {
      accessToken: ssoStatus.access_token,
      accountId: defaultProf.sso_account_id,
      roleName: defaultProf.sso_role_name,
      region: ssoStatus.region,
    })
      .then((creds) => setProfileExpiration(creds.expiration))
      .catch(() => setProfileExpiration(null));
  }, [
    ssoStatus.status,
    ssoStatus.access_token,
    ssoStatus.region,
    defaultProfile,
    profiles,
  ]);

  // Surface account errors as toasts
  useEffect(() => {
    if (accountsError) {
      addToast(accountsError, "error");
    }
  }, [accountsError, addToast]);

  // Auto-fetch accounts once when any SSO portal becomes active
  useEffect(() => {
    if (ssoStatus.status === "active" && !hasFetched.current) {
      hasFetched.current = true;
      fetchAllPortalAccounts();
    }
  }, [ssoStatus.status, fetchAllPortalAccounts]);

  // Reset when session ends
  useEffect(() => {
    if (ssoStatus.status !== "active") {
      hasFetched.current = false;
      resetAccounts();
    }
  }, [ssoStatus.status, resetAccounts]);

  const refreshAccounts = useCallback(() => {
    fetchAllPortalAccounts();
  }, [fetchAllPortalAccounts]);

  const renderPage = () => {
    switch (activePage) {
      case "accounts":
        return (
          <AccountsPage
            ssoStatus={ssoStatus}
            accounts={accounts}
            roles={roles}
            loading={accountsLoading}
            error={accountsError}
            onRefresh={refreshAccounts}
            onFetchRoles={fetchRoles}
            settings={settings}
          />
        );
      case "sessions":
        return (
          <SessionsPage
            sessions={sessions}
            loading={sessionsLoading}
            onRefresh={refreshProfiles}
            onStatusChange={refreshSsoStatus}
            onError={addToast}
          />
        );
      case "profiles":
        return (
          <ProfilesPage
            ssoStatus={ssoStatus}
            settings={settings}
            onError={addToast}
          />
        );
      case "tunnels":
        return (
          <TunnelsPage
            ssoStatus={ssoStatus}
            profiles={profiles}
            defaultProfile={defaultProfile}
            instances={tunnels.instances}
            activeTunnels={tunnels.activeTunnels}
            configs={tunnels.configs}
            settings={settings}
            pluginInstalled={tunnels.pluginInstalled}
            loadingInstances={tunnels.loadingInstances}
            onFetchInstances={tunnels.fetchInstances}
            onConnect={async (params) => {
              await tunnels.startTunnel(params);
            }}
            onStop={tunnels.stopTunnel}
            onSaveConfig={tunnels.saveConfig}
            onDeleteConfig={tunnels.deleteConfig}
            onRefreshProfiles={refreshProfiles}
            onError={addToast}
          />
        );
      case "shell":
        return (
          <ShellPage
            ssoStatus={ssoStatus}
            profiles={profiles}
            defaultProfile={defaultProfile}
            instances={tunnels.instances}
            settings={settings}
            pluginInstalled={tunnels.pluginInstalled}
            loadingInstances={tunnels.loadingInstances}
            onFetchInstances={tunnels.fetchInstances}
            onRefreshProfiles={refreshProfiles}
            onError={addToast}
          />
        );
      case "settings":
        return (
          <SettingsPage
            onSettingsChanged={() =>
              invoke<AppSettings>("get_settings").then(setSettings)
            }
          />
        );
    }
  };

  return (
    <div className="app-layout">
      <TopBar
        ssoStatus={ssoStatus}
        sessions={sessions}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main>{renderPage()}</main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <StatusBar
        ssoStatus={ssoStatus}
        settings={settings}
        defaultProfile={defaultProfile}
        profileExpiration={profileExpiration}
        onStopAllSessions={async () => {
          try {
            const msg = await invoke<string>("stop_all_sessions");
            setProfileExpiration(null);
            addToast(msg, "info");
          } catch (err) {
            addToast(`Failed to stop sessions: ${err}`, "error");
          }
        }}
      />
    </div>
  );
}

export default App;
