import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { AccountsPage } from "./pages/AccountsPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useSsoStatus } from "./hooks/useSsoStatus";
import { useProfiles } from "./hooks/useProfiles";
import { useAccounts } from "./hooks/useAccounts";
import type { Page } from "./types";

function App() {
  const [activePage, setActivePage] = useState<Page>("accounts");
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
  const hasFetched = useRef(false);

  // Login trigger: when TopBar login is clicked, navigate to Sessions and start login
  const [loginSessionName, setLoginSessionName] = useState<string | null>(null);

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
  }, [ssoStatus.status, ssoStatus.access_token, ssoStatus.region, fetchAccounts]);

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
          />
        );
      case "profiles":
        return <ProfilesPage ssoStatus={ssoStatus} />;
      case "settings":
        return <SettingsPage />;
    }
  };

  return (
    <div className="app-layout">
      <TopBar
        ssoStatus={ssoStatus}
        sessions={sessions}
        onStatusChange={refreshSsoStatus}
        onLogin={handleTopBarLogin}
      />
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main>{renderPage()}</main>
    </div>
  );
}

export default App;
