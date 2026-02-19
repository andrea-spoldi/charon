import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import { ToastContainer } from "./components/ToastContainer";
import { AccountsPage } from "./pages/AccountsPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useSsoStatus } from "./hooks/useSsoStatus";
import { useProfiles } from "./hooks/useProfiles";
import { useAccounts } from "./hooks/useAccounts";
import { useToast } from "./hooks/useToast";
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
    sessions,
    loading: sessionsLoading,
    refresh: refreshProfiles,
  } = useProfiles();
  const {
    accounts,
    roles,
    loading: accountsLoading,
    error: accountsError,
    fetchAccounts,
    fetchRoles,
    reset: resetAccounts,
  } = useAccounts();
  const { toasts, addToast, dismissToast } = useToast();
  const hasFetched = useRef(false);

  // Load settings once on mount
  useEffect(() => {
    invoke<AppSettings>("get_settings").then(setSettings).catch(console.error);
  }, []);

  // Login trigger: when TopBar login is clicked, navigate to Sessions and start login
  const [loginSessionName, setLoginSessionName] = useState<string | null>(null);

  // Surface account errors as toasts
  useEffect(() => {
    if (accountsError) {
      addToast(accountsError, "error");
    }
  }, [accountsError, addToast]);

  // Auto-fetch accounts once when SSO becomes active
  useEffect(() => {
    if (
      ssoStatus.status === "active" &&
      ssoStatus.access_token &&
      ssoStatus.region &&
      !hasFetched.current
    ) {
      hasFetched.current = true;
      fetchAccounts(ssoStatus.access_token, ssoStatus.region);
    }
  }, [
    ssoStatus.status,
    ssoStatus.access_token,
    ssoStatus.region,
    fetchAccounts,
  ]);

  // Reset when session ends
  useEffect(() => {
    if (ssoStatus.status !== "active") {
      hasFetched.current = false;
      resetAccounts();
    }
  }, [ssoStatus.status, resetAccounts]);

  const refreshAccounts = useCallback(() => {
    if (ssoStatus.access_token && ssoStatus.region) {
      fetchAccounts(ssoStatus.access_token, ssoStatus.region);
    }
  }, [ssoStatus.access_token, ssoStatus.region, fetchAccounts]);

  // TopBar login: navigate to Sessions page and trigger login
  const handleTopBarLogin = useCallback(() => {
    const firstSession = sessions.length > 0 ? sessions[0] : null;
    if (!firstSession) return;
    setActivePage("sessions");
    setLoginSessionName(firstSession.name);
  }, [sessions]);

  const renderPage = () => {
    switch (activePage) {
      case "accounts":
        return (
          <AccountsPage
            ssoStatus={ssoStatus}
            sessions={sessions}
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
            loginSessionName={loginSessionName}
            onLoginHandled={() => setLoginSessionName(null)}
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
        onStatusChange={refreshSsoStatus}
        onLogin={handleTopBarLogin}
        onError={addToast}
      />
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main>{renderPage()}</main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <StatusBar ssoStatus={ssoStatus} settings={settings} />
    </div>
  );
}

export default App;
