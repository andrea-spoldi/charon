import { useState, useEffect, useCallback } from "react";
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
  ConfigureCliCredentialsResult,
} from "../types";

// Refresh a profile's credentials this long before they actually expire.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

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
    loading,
    refresh,
    saveProfile,
    deleteProfile,
    setDefault,
  } = useProfiles();
  const [editing, setEditing] = useState<AwsProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedProfile, setCopiedProfile] = useState<string | null>(null);

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

  // Background auto-refresh: shortly before a played profile's credentials
  // expire, reissue them — but only while its SSO session is still active.
  useEffect(() => {
    const intervalMs = (settings.refresh_interval_secs || 30) * 1000;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const nowMs = Date.now();
      for (const profile of profiles) {
        const expiresAt = expirations[profile.name];
        if (!profile.session_active || expiresAt == null) continue;
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

      <div className="profile-list">
        <div className="section">
          {profiles
            .filter((p) => p.name !== "default")
            .map((profile) => {
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
                  <div className="profile-info">
                    <div className="profile-name-row">
                      <span className="profile-name">
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
                      </span>
                      {profile.session_active && expiresAt != null && (
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
                    <button
                      className={`icon-btn ${actionStatus[consoleKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[consoleKey] === "error" ? "icon-btn-error" : ""}`}
                      title={
                        connectable ? "Open AWS Console" : "Login to SSO first"
                      }
                      onClick={() => handleOpenConsole(profile)}
                      disabled={
                        !connectable || actionStatus[consoleKey] === "loading"
                      }
                    >
                      <ExternalLink size={14} />
                    </button>
                    {profile.session_active ? (
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

          {!loading &&
            profiles.filter((p) => p.name !== "default").length === 0 && (
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
