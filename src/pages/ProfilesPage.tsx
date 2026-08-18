import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  Play,
  Square,
  CircleCheck,
  Circle,
  Copy,
  RefreshCw,
  LogIn,
  Import,
  PenLine,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useProfiles } from "../hooks/useProfiles";
import { ProfileForm } from "./ProfileForm";
import type {
  AwsProfile,
  SsoTokenInfo,
  AppSettings,
  DeviceAuthInfo,
  ConfigureCliCredentialsResult,
} from "../types";

// Refresh a profile's credentials this long before they actually expire.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Bulk refresh paused because some SSO sessions need a fresh login
interface PendingBulkRefresh {
  targets: AwsProfile[];
  tokens: Map<string, SsoTokenInfo | null>;
  expired: string[];
}

interface ProfilesPageProps {
  ssoStatus: SsoTokenInfo;
  settings: AppSettings;
  onError?: (message: string, type?: "error" | "success" | "info") => void;
}

export function ProfilesPage({
  ssoStatus,
  settings,
  onError,
}: ProfilesPageProps) {
  const {
    profiles,
    sessions,
    defaultProfile,
    credentialProfiles,
    loading,
    refresh,
    saveProfile,
    deleteProfile,
    setDefault,
    importCredentialProfiles,
    renameProfile,
  } = useProfiles();
  const [editing, setEditing] = useState<AwsProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedProfile, setCopiedProfile] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"stop" | "refresh" | null>(null);
  const [copiedNames, setCopiedNames] = useState(false);
  const [pendingRefresh, setPendingRefresh] =
    useState<PendingBulkRefresh | null>(null);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthInfo | null>(null);
  const [authSession, setAuthSession] = useState<string | null>(null);
  const authAbortRef = useRef(false);
  const [importDismissed, setImportDismissed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Per-profile credential expiration (epoch ms), for active (played) profiles only.
  const [expirations, setExpirations] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  const handleSave = async (profile: AwsProfile) => {
    await saveProfile(profile);
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (name: string) => {
    if (confirmDelete === name) {
      await deleteProfile(name);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(name);
      // Auto-clear confirmation after 3 seconds
      setTimeout(
        () => setConfirmDelete((prev) => (prev === name ? null : prev)),
        3000,
      );
    }
  };

  const handleEdit = (profile: AwsProfile) => {
    setEditing(profile);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleSetDefault = async (name: string) => {
    try {
      await setDefault(name);
    } catch (err) {
      console.error("Failed to set default profile:", err);
      onError?.(`Set default failed: ${err}`, "error");
    }
  };

  const resolveSessionToken = useCallback(
    async (profile: AwsProfile): Promise<SsoTokenInfo> => {
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
    },
    [ssoStatus],
  );

  // Fetch fresh role credentials for a profile and record their expiry.
  // Shared by the Play button and the background auto-refresh loop.
  const applyCredentials = useCallback(
    async (profile: AwsProfile): Promise<ConfigureCliCredentialsResult> => {
      const cliRegion = profile.region || settings.default_region;
      const token = await resolveSessionToken(profile);
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
      setExpirations((prev) => ({ ...prev, [profile.name]: result.expiresAt }));
      return result;
    },
    [resolveSessionToken, settings.default_region],
  );

  const handleOpenConsole = async (profile: AwsProfile) => {
    if (!profile.sso_account_id || !profile.sso_role_name) return;
    const consoleRegion = profile.region || settings.default_region;
    const key = `${profile.name}-console`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const token = await resolveSessionToken(profile);
      await invoke("open_aws_console", {
        accessToken: token.access_token,
        accountId: profile.sso_account_id,
        roleName: profile.sso_role_name,
        ssoRegion: token.region,
        consoleRegion,
        sessionDurationSecs: settings.session_timeout_hours * 3600,
      });
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch (err) {
      console.error("Failed to open console:", err);
      setActionError(`Console: ${err}`);
      onError?.(`Console: ${err}`, "error");
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(() => {
      setActionStatus((prev) => ({ ...prev, [key]: "" }));
      setActionError(null);
    }, 2000);
  };

  const handleStartSession = async (profile: AwsProfile) => {
    const key = `${profile.name}-cli`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const result = await applyCredentials(profile);
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
      onError?.(result.message, "success");
      refresh();
    } catch (err) {
      console.error("Failed to start session:", err);
      onError?.(`Start session: ${err}`, "error");
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(() => {
      setActionStatus((prev) => ({ ...prev, [key]: "" }));
    }, 3000);
  };

  const handleStopSession = async (profile: AwsProfile) => {
    const key = `${profile.name}-cli`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      await invoke("stop_session", { profileName: profile.name });
      setExpirations((prev) => {
        const next = { ...prev };
        delete next[profile.name];
        return next;
      });
      setActionStatus((prev) => ({ ...prev, [key]: "stopped" }));
      onError?.(`Session stopped for ${profile.name}`, "info");
      refresh();
    } catch (err) {
      console.error("Failed to stop session:", err);
      onError?.(`Stop session: ${err}`, "error");
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(() => {
      setActionStatus((prev) => ({ ...prev, [key]: "" }));
    }, 3000);
  };

  // A tracked profile's credentials expired without being refreshed in
  // time (its SSO session died before we could renew them). Stop treating
  // it as active: clean up its dead ~/.aws/credentials entry so the UI
  // reverts to "off" (Play) instead of a stale "Stop".
  const abandonExpiredProfile = useCallback(async (profile: AwsProfile) => {
    setExpirations((prev) => {
      const next = { ...prev };
      delete next[profile.name];
      return next;
    });
    try {
      await invoke("stop_session", { profileName: profile.name });
    } catch {
      // Best-effort cleanup; it's untracked in the UI either way.
    }
  }, []);

  // Background auto-refresh: shortly before a played profile's credentials
  // expire, reissue them — but only while its SSO session is still active.
  useEffect(() => {
    const intervalMs = (settings.refresh_interval_secs || 30) * 1000;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const nowMs = Date.now();
      for (const profile of profiles) {
        const expiresAt = expirations[profile.name];
        if (expiresAt == null) continue;
        if (expiresAt <= nowMs) {
          await abandonExpiredProfile(profile);
          continue;
        }
        if (expiresAt - nowMs > REFRESH_BUFFER_MS) continue;
        try {
          const token = await resolveSessionToken(profile);
          if (token.status !== "active") continue;
          await applyCredentials(profile);
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
    profiles,
    expirations,
    resolveSessionToken,
    applyCredentials,
    abandonExpiredProfile,
  ]);

  const handleCopyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedProfile(name);
      setTimeout(() => setCopiedProfile(null), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const canConnect = (profile: AwsProfile) =>
    ssoStatus.status === "active" &&
    !!profile.sso_account_id &&
    !!profile.sso_role_name;

  const visibleProfiles = profiles.filter((p) => p.name !== "default");
  const selectedProfiles = visibleProfiles.filter((p) => selected.has(p.name));
  const hasSelection = selectedProfiles.length > 0;
  // Bulk actions operate on the selection, or on every profile when nothing is selected
  const targetProfiles = hasSelection ? selectedProfiles : visibleProfiles;
  const bulkLocked =
    bulkBusy !== null || pendingRefresh !== null || deviceAuth !== null;

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProfiles.length === visibleProfiles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleProfiles.map((p) => p.name)));
    }
  };

  const handleCopyNames = async () => {
    try {
      await navigator.clipboard.writeText(
        targetProfiles.map((p) => p.name).join(" "),
      );
      setCopiedNames(true);
      setTimeout(() => setCopiedNames(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleBulkStop = async () => {
    const active = targetProfiles.filter((p) => p.session_active);
    if (active.length === 0) {
      onError?.("No active sessions to stop", "info");
      return;
    }
    setBulkBusy("stop");
    try {
      const errors: string[] = [];
      for (const profile of active) {
        try {
          await invoke("stop_session", { profileName: profile.name });
        } catch (err) {
          errors.push(`${profile.name}: ${err}`);
        }
      }
      const stopped = active.length - errors.length;
      if (stopped > 0) {
        onError?.(`Stopped ${stopped} session(s)`, "info");
      }
      if (errors.length > 0) {
        onError?.(`Stop failed for: ${errors.join("; ")}`, "error");
      }
    } finally {
      setBulkBusy(null);
      refresh();
    }
  };

  // Validate each distinct SSO session once before touching credentials
  const validateSessions = async (targets: AwsProfile[]) => {
    const tokens = new Map<string, SsoTokenInfo | null>();
    for (const profile of targets) {
      const key = profile.sso_session || "";
      if (tokens.has(key)) continue;
      try {
        const token = await resolveSessionToken(profile);
        tokens.set(
          key,
          token.status === "active" && token.access_token && token.region
            ? token
            : null,
        );
      } catch {
        tokens.set(key, null);
      }
    }
    return tokens;
  };

  const doBulkRefresh = async (
    targets: AwsProfile[],
    tokens: Map<string, SsoTokenInfo | null>,
  ) => {
    try {
      const invalid = targets.filter((p) => !tokens.get(p.sso_session || ""));
      const errors: string[] = [];
      let refreshed = 0;
      for (const profile of targets) {
        const token = tokens.get(profile.sso_session || "");
        if (!token) continue;
        try {
          await invoke("configure_cli_credentials", {
            accessToken: token.access_token,
            accountId: profile.sso_account_id,
            roleName: profile.sso_role_name,
            ssoRegion: token.region,
            cliRegion: profile.region || settings.default_region,
            profileName: profile.name,
          });
          refreshed++;
        } catch (err) {
          errors.push(`${profile.name}: ${err}`);
        }
      }

      if (refreshed > 0) {
        onError?.(
          `Refreshed credentials for ${refreshed} profile(s)`,
          "success",
        );
      }
      if (invalid.length > 0) {
        onError?.(
          `Skipped (SSO session expired or missing): ${invalid.map((p) => p.name).join(", ")}`,
          "error",
        );
      }
      if (errors.length > 0) {
        onError?.(`Refresh failed for: ${errors.join("; ")}`, "error");
      }
    } finally {
      setBulkBusy(null);
      refresh();
    }
  };

  const handleBulkRefresh = async () => {
    // Without a selection only refresh profiles that already have an active
    // session; an explicit selection refreshes (starts) every selected profile.
    const candidates = hasSelection
      ? targetProfiles
      : targetProfiles.filter((p) => p.session_active);
    const refreshable = candidates.filter(
      (p) => p.sso_account_id && p.sso_role_name,
    );
    if (refreshable.length === 0) {
      onError?.(
        hasSelection
          ? "Selected profiles have no SSO account/role to refresh"
          : "No active sessions to refresh",
        "info",
      );
      return;
    }
    setBulkBusy("refresh");
    const tokens = await validateSessions(refreshable);
    // Expired sessions can be re-authenticated: propose logging in before
    // failing the refresh for their profiles.
    const expired = [
      ...new Set(
        refreshable
          .filter((p) => p.sso_session && !tokens.get(p.sso_session))
          .map((p) => p.sso_session),
      ),
    ];
    if (expired.length > 0) {
      setPendingRefresh({ targets: refreshable, tokens, expired });
      setBulkBusy(null);
      return;
    }
    await doBulkRefresh(refreshable, tokens);
  };

  const handleLoginAndRefresh = async () => {
    if (!pendingRefresh) return;
    const { targets, expired } = pendingRefresh;
    setPendingRefresh(null);
    setBulkBusy("refresh");
    authAbortRef.current = false;
    try {
      for (const session of expired) {
        const info = await invoke<DeviceAuthInfo>("start_device_auth", {
          sessionName: session,
        });
        setAuthSession(session);
        setDeviceAuth(info);
        await invoke("poll_device_auth", {
          sessionName: session,
          deviceCode: info.device_code,
          clientId: info.client_id,
          clientSecret: info.client_secret,
          region: info.region,
          startUrl: info.start_url,
          interval: info.interval,
        });
        if (authAbortRef.current) return;
      }
      setDeviceAuth(null);
      // Re-validate now that the sessions are (hopefully) fresh, then refresh
      const tokens = await validateSessions(targets);
      await doBulkRefresh(targets, tokens);
    } catch (err) {
      if (!authAbortRef.current) {
        onError?.(`SSO login: ${err}`, "error");
      }
      setDeviceAuth(null);
      setBulkBusy(null);
    }
  };

  const handleSkipExpired = async () => {
    if (!pendingRefresh) return;
    const { targets, tokens } = pendingRefresh;
    setPendingRefresh(null);
    setBulkBusy("refresh");
    await doBulkRefresh(targets, tokens);
  };

  const handleCancelBulkAuth = () => {
    authAbortRef.current = true;
    setDeviceAuth(null);
    setBulkBusy(null);
    onError?.("Refresh cancelled", "info");
  };

  const startRename = (name: string) => {
    setRenaming(name);
    setRenameValue(name);
  };

  const confirmRename = async (oldName: string) => {
    const newName = renameValue.trim();
    setRenaming(null);
    if (!newName || newName === oldName) return;
    try {
      await renameProfile(oldName, newName);
      // Keep the multi-selection consistent with the new name
      setSelected((prev) => {
        if (!prev.has(oldName)) return prev;
        const next = new Set(prev);
        next.delete(oldName);
        next.add(newName);
        return next;
      });
      onError?.(`Profile renamed to ${newName}`, "success");
    } catch (err) {
      onError?.(`Rename: ${err}`, "error");
    }
  };

  const handleImportCredentialProfiles = async () => {
    setImporting(true);
    try {
      await importCredentialProfiles(credentialProfiles);
      onError?.(
        `Imported ${credentialProfiles.length} profile(s) from ~/.aws/credentials`,
        "success",
      );
    } catch (err) {
      onError?.(`Import: ${err}`, "error");
    } finally {
      setImporting(false);
    }
  };

  if (showForm) {
    return (
      <div className="page">
        <div className="page-header">
          <h2>{editing ? "Edit Profile" : "New Profile"}</h2>
        </div>
        <ProfileForm
          initial={editing}
          sessions={sessions}
          defaultRegion={settings.default_region}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Profiles</h2>
        <button className="btn btn-primary" onClick={handleAdd}>
          <Plus size={16} />
          <span>Add Profile</span>
        </button>
      </div>

      {loading && <div className="loading">Loading profiles...</div>}
      {actionError && <div className="error-msg">{actionError}</div>}

      {credentialProfiles.length > 0 && !importDismissed && (
        <div className="bulk-panel">
          <span>
            Found in <code>~/.aws/credentials</code> (manually added):{" "}
            <strong>{credentialProfiles.join(", ")}</strong>
          </span>
          <div className="bulk-panel-actions">
            <button
              className="btn btn-primary btn-sm"
              title="Add these profiles to Charon (the credentials file is left untouched)"
              onClick={handleImportCredentialProfiles}
              disabled={importing}
            >
              <Import size={14} />
              <span>
                {importing
                  ? "Importing..."
                  : `Import ${credentialProfiles.length} profile(s)`}
              </span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setImportDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {visibleProfiles.length > 0 && (
        <div className="bulk-toolbar">
          <label className="checkbox-label bulk-select-all">
            <input
              type="checkbox"
              checked={
                hasSelection &&
                selectedProfiles.length === visibleProfiles.length
              }
              ref={(el) => {
                if (el) {
                  el.indeterminate =
                    hasSelection &&
                    selectedProfiles.length < visibleProfiles.length;
                }
              }}
              onChange={toggleSelectAll}
            />
            <span>
              {hasSelection
                ? `${selectedProfiles.length} selected`
                : "Select all"}
            </span>
          </label>
          <div className="bulk-actions">
            <button
              className="btn btn-secondary btn-sm"
              title="Copy profile names separated by space"
              onClick={handleCopyNames}
              disabled={bulkLocked}
            >
              <Copy size={14} />
              <span>
                {copiedNames
                  ? "Copied!"
                  : hasSelection
                    ? `Copy names (${selectedProfiles.length})`
                    : "Copy all names"}
              </span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              title="Re-fetch CLI credentials after checking the SSO sessions are still valid"
              onClick={handleBulkRefresh}
              disabled={bulkLocked}
            >
              <RefreshCw size={14} />
              <span>
                {bulkBusy === "refresh"
                  ? "Refreshing..."
                  : hasSelection
                    ? `Refresh selected (${selectedProfiles.length})`
                    : "Refresh all"}
              </span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              title="Stop CLI sessions"
              onClick={handleBulkStop}
              disabled={bulkLocked}
            >
              <Square size={14} />
              <span>
                {bulkBusy === "stop"
                  ? "Stopping..."
                  : hasSelection
                    ? `Stop selected (${selectedProfiles.length})`
                    : "Stop all"}
              </span>
            </button>
          </div>
        </div>
      )}

      {pendingRefresh && (
        <div className="bulk-panel">
          <span>
            SSO session{pendingRefresh.expired.length > 1 ? "s" : ""} expired:{" "}
            <strong>{pendingRefresh.expired.join(", ")}</strong>. Log in again
            before refreshing?
          </span>
          <div className="bulk-panel-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleLoginAndRefresh}
            >
              <LogIn size={14} />
              <span>Log in & refresh</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSkipExpired}
            >
              Skip expired
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPendingRefresh(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deviceAuth && (
        <div className="bulk-panel">
          <span>
            Signing in to <strong>{authSession}</strong> — enter code{" "}
            <code className="device-code-inline">{deviceAuth.user_code}</code>{" "}
            in the browser window that just opened.
          </span>
          <div className="bulk-panel-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCancelBulkAuth}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="profile-list">
        <div className="section">
          {visibleProfiles.map((profile) => {
            const consoleKey = `${profile.name}-console`;
            const cliKey = `${profile.name}-cli`;
            const connectable = canConnect(profile);
            const isDefault = defaultProfile === profile.name;
            const expiresAt = expirations[profile.name];
            const credentialsExpired =
              expiresAt != null ? expiresAt <= now : false;
            return (
              <div key={profile.name} className="profile-card">
                {isDefault && (
                  <span className="default-badge default-badge-corner">
                    default
                  </span>
                )}
                <div className="profile-card-left">
                  <input
                    type="checkbox"
                    className="profile-select"
                    title="Select profile"
                    checked={selected.has(profile.name)}
                    onChange={() => toggleSelect(profile.name)}
                  />
                  <div className="profile-info">
                    <div className="profile-name-row">
                      <span className="profile-name">
                        {renaming === profile.name ? (
                          <input
                            className="rename-input"
                            value={renameValue}
                            autoFocus
                            title="Rename profile (Enter to confirm, Esc to cancel)"
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                confirmRename(profile.name);
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            onBlur={() => setRenaming(null)}
                          />
                        ) : (
                          <>
                            {profile.name}
                            <button
                              className="icon-btn icon-btn-inline"
                              title="Copy profile name"
                              onClick={() => handleCopyName(profile.name)}
                            >
                              <Copy size={12} />
                              {copiedProfile === profile.name && (
                                <span className="copied-tooltip">Copied!</span>
                              )}
                            </button>
                            <button
                              className="icon-btn icon-btn-inline"
                              title="Rename profile"
                              onClick={() => startRename(profile.name)}
                            >
                              <PenLine size={12} />
                            </button>
                            {profile.manual && (
                              <span className="default-badge badge-manual">
                                manual
                              </span>
                            )}
                          </>
                        )}
                      </span>
                      {profile.manual && (
                        <span className="text-muted">
                          Credentials: manual (~/.aws/credentials)
                        </span>
                      )}
                      {expiresAt != null && (
                        <span
                          className={`sso-token-badge sso-token-badge--${credentialsExpired ? "expired" : "active"}`}
                        >
                          {credentialsExpired ? (
                            <ShieldOff size={13} />
                          ) : (
                            <ShieldCheck size={13} />
                          )}
                          <span>
                            {credentialsExpired
                              ? "Credentials expired"
                              : "Auto-refreshing"}
                          </span>
                        </span>
                      )}
                    </div>
                    {profile.session_active && expiresAt != null && (
                      <span className="text-muted sso-token-expiry">
                        {credentialsExpired ? "Expired" : "Credentials expire"}:{" "}
                        {new Date(expiresAt).toLocaleTimeString()}
                      </span>
                    )}
                    {profile.sso_session && (
                      <span className="text-muted">
                        Session: {profile.sso_session}
                      </span>
                    )}
                    {profile.sso_account_id && (
                      <span className="text-muted">
                        Account: {profile.sso_account_id}
                      </span>
                    )}
                    {profile.sso_role_name && (
                      <span className="text-muted">
                        Role: {profile.sso_role_name}
                      </span>
                    )}
                    {profile.region && (
                      <span className="text-muted">
                        Region: {profile.region}
                      </span>
                    )}
                  </div>
                </div>
                <div className="profile-actions">
                  <button
                    className={`icon-btn ${isDefault ? "icon-btn-active" : ""}`}
                    title={
                      isDefault
                        ? "Current default profile"
                        : "Set as default profile"
                    }
                    onClick={() => handleSetDefault(profile.name)}
                    disabled={isDefault}
                  >
                    {isDefault ? (
                      <CircleCheck size={14} />
                    ) : (
                      <Circle size={14} />
                    )}
                  </button>
                  {!profile.manual && (
                    <>
                      <button
                        className={`icon-btn ${actionStatus[consoleKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[consoleKey] === "error" ? "icon-btn-error" : ""}`}
                        title={
                          connectable
                            ? "Open AWS Console"
                            : "Login to SSO first"
                        }
                        onClick={() => handleOpenConsole(profile)}
                        disabled={
                          !connectable || actionStatus[consoleKey] === "loading"
                        }
                      >
                        <ExternalLink size={14} />
                      </button>
                      {expiresAt != null ? (
                        <button
                          className={`icon-btn icon-btn-active ${actionStatus[cliKey] === "loading" ? "icon-btn-loading" : ""}`}
                          title="Stop CLI session"
                          onClick={() => handleStopSession(profile)}
                          disabled={actionStatus[cliKey] === "loading"}
                        >
                          <Square size={14} />
                        </button>
                      ) : (
                        <button
                          className={`icon-btn ${actionStatus[cliKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[cliKey] === "done" ? "icon-btn-success" : ""} ${actionStatus[cliKey] === "error" ? "icon-btn-error" : ""}`}
                          title={
                            connectable
                              ? "Start CLI session"
                              : "Login to SSO first"
                          }
                          onClick={() => handleStartSession(profile)}
                          disabled={
                            !connectable || actionStatus[cliKey] === "loading"
                          }
                        >
                          <Play size={14} />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        title="Edit"
                        onClick={() => handleEdit(profile)}
                      >
                        <Edit3 size={14} />
                      </button>
                    </>
                  )}
                  <button
                    className={`icon-btn icon-btn-danger ${confirmDelete === profile.name ? "icon-btn-confirm" : ""}`}
                    title={
                      confirmDelete === profile.name
                        ? "Click again to confirm"
                        : "Delete"
                    }
                    onClick={() => handleDelete(profile.name)}
                  >
                    <Trash2 size={14} />
                    {confirmDelete === profile.name && (
                      <span className="copied-tooltip">Confirm?</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {!loading && visibleProfiles.length === 0 && (
            <div className="empty-state">
              <p>No profiles configured.</p>
              <p className="text-muted">
                Add a profile or bookmark an account+role from the Accounts
                page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
