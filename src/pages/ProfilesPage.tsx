import { useState } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  Terminal,
  CircleCheck,
  Circle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useProfiles } from "../hooks/useProfiles";
import { ProfileForm } from "./ProfileForm";
import type { AwsProfile, SsoTokenInfo } from "../types";

interface ProfilesPageProps {
  ssoStatus: SsoTokenInfo;
}

export function ProfilesPage({ ssoStatus }: ProfilesPageProps) {
  const {
    profiles,
    sessions,
    defaultProfile,
    loading,
    saveProfile,
    deleteProfile,
    setDefault,
  } = useProfiles();
  const [editing, setEditing] = useState<AwsProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

  const handleSave = async (profile: AwsProfile) => {
    await saveProfile(profile);
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (name: string) => {
    if (window.confirm(`Delete profile "${name}"?`)) {
      await deleteProfile(name);
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
    }
  };

  const handleOpenConsole = async (profile: AwsProfile) => {
    if (
      !ssoStatus.access_token ||
      !profile.sso_account_id ||
      !profile.sso_role_name
    )
      return;
    const region = profile.region || ssoStatus.region || "us-east-1";
    const key = `${profile.name}-console`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      await invoke("open_aws_console", {
        accessToken: ssoStatus.access_token,
        accountId: profile.sso_account_id,
        roleName: profile.sso_role_name,
        region,
      });
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch (err) {
      console.error("Failed to open console:", err);
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(
      () => setActionStatus((prev) => ({ ...prev, [key]: "" })),
      2000,
    );
  };

  const handleConfigureCli = async (profile: AwsProfile) => {
    if (
      !ssoStatus.access_token ||
      !profile.sso_account_id ||
      !profile.sso_role_name
    )
      return;
    const region = profile.region || ssoStatus.region || "us-east-1";
    const key = `${profile.name}-cli`;
    setActionStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      await invoke("configure_cli_credentials", {
        accessToken: ssoStatus.access_token,
        accountId: profile.sso_account_id,
        roleName: profile.sso_role_name,
        region,
        profileName: profile.name,
      });
      setActionStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch (err) {
      console.error("Failed to configure CLI:", err);
      setActionStatus((prev) => ({ ...prev, [key]: "error" }));
    }
    setTimeout(
      () => setActionStatus((prev) => ({ ...prev, [key]: "" })),
      3000,
    );
  };

  const canConnect = (profile: AwsProfile) =>
    ssoStatus.status === "active" &&
    !!ssoStatus.access_token &&
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

      <div className="profile-list">
        <div className="section">
          {profiles
            .filter((p) => p.name !== "default")
            .map((profile) => {
              const consoleKey = `${profile.name}-console`;
              const cliKey = `${profile.name}-cli`;
              const connectable = canConnect(profile);
              const isDefault = defaultProfile === profile.name;
              return (
                <div key={profile.name} className="profile-card">
                  <div className="profile-info">
                    <span className="profile-name">
                      {profile.name}
                      {isDefault && (
                        <span className="default-badge">default</span>
                      )}
                    </span>
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
                        connectable
                          ? "Open AWS Console"
                          : "Login to SSO first"
                      }
                      onClick={() => handleOpenConsole(profile)}
                      disabled={
                        !connectable ||
                        actionStatus[consoleKey] === "loading"
                      }
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      className={`icon-btn ${actionStatus[cliKey] === "loading" ? "icon-btn-loading" : ""} ${actionStatus[cliKey] === "done" ? "icon-btn-success" : ""} ${actionStatus[cliKey] === "error" ? "icon-btn-error" : ""}`}
                      title={
                        connectable
                          ? "Configure CLI credentials (~/.aws/credentials)"
                          : "Login to SSO first"
                      }
                      onClick={() => handleConfigureCli(profile)}
                      disabled={
                        !connectable || actionStatus[cliKey] === "loading"
                      }
                    >
                      <Terminal size={14} />
                      {actionStatus[cliKey] === "done" && (
                        <span className="copied-tooltip">Configured!</span>
                      )}
                    </button>
                    <button
                      className="icon-btn"
                      title="Edit"
                      onClick={() => handleEdit(profile)}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      title="Delete"
                      onClick={() => handleDelete(profile.name)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

          {!loading && profiles.filter((p) => p.name !== "default").length === 0 && (
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
