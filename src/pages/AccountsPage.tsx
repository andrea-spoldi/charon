import { useState, useRef, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Search,
  X,
  Terminal,
  Bookmark,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { SsoTokenInfo, SsoSession, SsoAccount, AccountRole, AppSettings } from "../types";

interface AccountsPageProps {
  ssoStatus: SsoTokenInfo;
  sessions: SsoSession[];
  accounts: SsoAccount[];
  roles: Record<string, AccountRole[]>;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onFetchRoles: (accessToken: string, accountId: string, region: string) => void;
  settings: AppSettings;
}

export function AccountsPage({
  ssoStatus,
  sessions,
  accounts,
  roles,
  loading,
  error,
  onRefresh,
  onFetchRoles,
  settings,
}: AccountsPageProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter accounts by search query (name, id, or email)
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.accountName.toLowerCase().includes(q) ||
        a.accountId.includes(q) ||
        a.emailAddress.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const toggleExpand = (accountId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
        // Fetch roles on-demand when expanding
        if (!roles[accountId] && ssoStatus.access_token && ssoStatus.region) {
          onFetchRoles(ssoStatus.access_token, accountId, ssoStatus.region);
        }
      }
      return next;
    });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const clearSearch = () => {
    setSearch("");
    searchRef.current?.focus();
  };

  const handleOpenConsole = async (accountId: string, roleName: string) => {
    if (!ssoStatus.access_token || !ssoStatus.region) return;
    const key = `${accountId}-${roleName}-console`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      await invoke("open_aws_console", {
        accessToken: ssoStatus.access_token,
        accountId,
        roleName,
        ssoRegion: ssoStatus.region,
        consoleRegion: settings.default_region,
        sessionDurationSecs: settings.session_timeout_hours * 3600,
      });
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch (err) {
      console.error("Failed to open console:", err);
      setActionError(`Console: ${err}`);
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(() => {
      setActionStatus((prev) => ({ ...prev, [key]: "" }));
      setActionError(null);
    }, 5000);
  };

  const handleConfigureCli = async (
    accountId: string,
    roleName: string,
    accountName: string,
  ) => {
    if (!ssoStatus.access_token || !ssoStatus.region) return;
    const key = `${accountId}-${roleName}-cli`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    // Profile name: sanitized account name + role
    const profileName = `${accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${roleName}`;
    try {
      await invoke("configure_cli_credentials", {
        accessToken: ssoStatus.access_token,
        accountId,
        roleName,
        ssoRegion: ssoStatus.region,
        cliRegion: settings.default_region,
        profileName,
      });
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch (err) {
      console.error("Failed to configure CLI:", err);
      setActionError(`CLI config: ${err}`);
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(() => {
      setActionStatus((prev) => ({ ...prev, [key]: "" }));
      setActionError(null);
    }, 5000);
  };

  const handleBookmark = async (
    accountId: string,
    roleName: string,
    accountName: string,
  ) => {
    const key = `${accountId}-${roleName}-bookmark`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    const profileName = `${accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${roleName}`;
    try {
      await invoke("save_profile", {
        profile: {
          name: profileName,
          sso_session: sessions.length > 0 ? sessions[0].name : null,
          sso_account_id: accountId,
          sso_role_name: roleName,
          region: settings.default_region,
          output: null,
        },
      });
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch (err) {
      console.error("Failed to bookmark profile:", err);
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(() => setActionStatus((prev) => ({ ...prev, [key]: "" })), 3000);
  };

  if (ssoStatus.status !== "active") {
    return (
      <div className="page">
        <div className="page-header">
          <h2>Accounts</h2>
        </div>
        <div className="empty-state">
          <p>Login to SSO to view your accounts and roles.</p>
          <p className="text-muted">
            Use the Login button in the top bar to authenticate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Accounts</h2>
        <div className="page-header-actions">
          <span className="text-muted">
            {search
              ? `${filteredAccounts.length} / ${accounts.length}`
              : accounts.length}{" "}
            accounts
          </span>
          <button
            className="icon-btn"
            title="Refresh accounts"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="search-bar">
          <Search size={14} className="search-icon" />
          <input
            ref={searchRef}
            type="text"
            className="search-input"
            placeholder="Search by name, account ID, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="search-clear"
              onClick={clearSearch}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {loading && accounts.length === 0 && (
        <div className="loading">Loading accounts...</div>
      )}
      {error && <div className="error-msg">{error}</div>}
      {actionError && <div className="error-msg">{actionError}</div>}

      <div className="account-list">
        {filteredAccounts.map((account) => (
          <div key={account.accountId} className="account-card">
            <button
              className="account-header"
              onClick={() => toggleExpand(account.accountId)}
            >
              <span className="account-chevron">
                {expanded.has(account.accountId) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </span>
              <span className="account-name">{account.accountName}</span>
              <span className="account-id">{account.accountId}</span>
              <span className="account-email text-muted">
                {account.emailAddress}
              </span>
            </button>

            {expanded.has(account.accountId) && (
              <div className="role-list">
                {(roles[account.accountId] || []).map((role) => {
                  const consoleKey = `${account.accountId}-${role.roleName}-console`;
                  const cliKey = `${account.accountId}-${role.roleName}-cli`;
                  const bookmarkKey = `${account.accountId}-${role.roleName}-bookmark`;
                  return (
                    <div key={role.roleName} className="role-row">
                      <span className="role-name">{role.roleName}</span>
                      <div className="role-actions">
                        <button
                          className="icon-btn"
                          title="Copy account ID"
                          onClick={() =>
                            handleCopy(
                              account.accountId,
                              `${account.accountId}-copy`,
                            )
                          }
                        >
                          <Copy size={14} />
                          {copied === `${account.accountId}-copy` && (
                            <span className="copied-tooltip">Copied!</span>
                          )}
                        </button>
                        <button
                          className={`icon-btn ${actionStatus[consoleKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[consoleKey] === "error" ? "icon-btn-error" : ""}`}
                          title="Open AWS Console"
                          onClick={() =>
                            handleOpenConsole(
                              account.accountId,
                              role.roleName,
                            )
                          }
                          disabled={actionStatus[consoleKey] === "loading"}
                        >
                          <ExternalLink size={14} />
                        </button>
                        <button
                          className={`icon-btn ${actionStatus[cliKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[cliKey] === "done" ? "icon-btn-success" : ""} ${actionStatus[cliKey] === "error" ? "icon-btn-error" : ""}`}
                          title={`Configure CLI credentials (~/.aws/credentials)`}
                          onClick={() =>
                            handleConfigureCli(
                              account.accountId,
                              role.roleName,
                              account.accountName,
                            )
                          }
                          disabled={actionStatus[cliKey] === "loading"}
                        >
                          <Terminal size={14} />
                          {actionStatus[cliKey] === "done" && (
                            <span className="copied-tooltip">Configured!</span>
                          )}
                        </button>
                        <button
                          className={`icon-btn ${actionStatus[bookmarkKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[bookmarkKey] === "done" ? "icon-btn-success" : ""} ${actionStatus[bookmarkKey] === "error" ? "icon-btn-error" : ""}`}
                          title="Save as profile"
                          onClick={() =>
                            handleBookmark(
                              account.accountId,
                              role.roleName,
                              account.accountName,
                            )
                          }
                          disabled={actionStatus[bookmarkKey] === "loading"}
                        >
                          <Bookmark size={14} />
                          {actionStatus[bookmarkKey] === "done" && (
                            <span className="copied-tooltip">Saved!</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!roles[account.accountId] && (
                  <div className="role-row text-muted">Loading roles...</div>
                )}
              </div>
            )}
          </div>
        ))}

        {!loading && accounts.length > 0 && filteredAccounts.length === 0 && (
          <div className="empty-state">
            <p>No accounts match "{search}"</p>
          </div>
        )}

        {!loading && accounts.length === 0 && (
          <div className="empty-state">
            <p>No accounts found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
