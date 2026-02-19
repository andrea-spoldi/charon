import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  LogIn,
  Globe,
  MapPin,
  ArrowRight,
  X,
  Copy,
  Check,
  Loader,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { SsoSession, DeviceAuthInfo } from "../types";

const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-east-1",
  "ca-central-1",
  "sa-east-1",
  "me-south-1",
  "af-south-1",
];

interface SessionsPageProps {
  sessions: SsoSession[];
  loading: boolean;
  onRefresh: () => void;
  onStatusChange: () => void;
  /** Set externally (e.g. from TopBar) to trigger login for a session */
  loginSessionName?: string | null;
  onLoginHandled?: () => void;
  onError?: (message: string, type?: "error" | "success" | "info") => void;
}

export function SessionsPage({
  sessions,
  loading,
  onRefresh,
  onStatusChange,
  loginSessionName,
  onLoginHandled,
  onError,
}: SessionsPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SsoSession | null>(null);
  const [sessionName, setSessionName] = useState("my-sso");
  const [startUrl, setStartUrl] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Device authorization state
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthInfo | null>(null);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const pollAbortRef = useRef(false);
  const loginTriggeredRef = useRef<string | null>(null);

  // Handle login trigger from TopBar (guard against StrictMode double-fire)
  useEffect(() => {
    if (
      loginSessionName &&
      !deviceAuth &&
      !loggingIn &&
      loginTriggeredRef.current !== loginSessionName
    ) {
      loginTriggeredRef.current = loginSessionName;
      handleLogin(loginSessionName);
      onLoginHandled?.();
    }
  }, [loginSessionName]);

  const resetForm = () => {
    setSessionName("my-sso");
    setStartUrl("");
    setRegion("us-east-1");
    setEditing(null);
    setShowForm(false);
    setError(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (session: SsoSession) => {
    setEditing(session);
    setSessionName(session.name);
    setStartUrl(session.sso_start_url);
    setRegion(session.sso_region);
    setShowForm(true);
    setError(null);
  };

  const validateSessionName = (value: string): string | null => {
    if (!value) return "Session name is required";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(value))
      return "Only lowercase letters, numbers, and hyphens (must start with letter or number)";
    return null;
  };

  const validateStartUrl = (value: string): string | null => {
    if (!value) return "Start URL is required";
    if (!/^https:\/\/d-[a-z0-9]+\.awsapps\.com\/start\/?$/.test(value))
      return "Must match https://d-xxxxxxxxxx.awsapps.com/start/";
    return null;
  };

  const handleSessionNameChange = (value: string) => {
    // Auto-sanitize: lowercase, replace spaces with hyphens
    const sanitized = value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    setSessionName(sanitized);
    const err = validateSessionName(sanitized);
    setValidationErrors((prev) => ({ ...prev, name: err || "" }));
  };

  const handleStartUrlChange = (value: string) => {
    setStartUrl(value);
    const err = validateStartUrl(value);
    setValidationErrors((prev) => ({ ...prev, url: err || "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameErr = validateSessionName(sessionName);
    const urlErr = validateStartUrl(startUrl);
    if (nameErr || urlErr) {
      setValidationErrors({ name: nameErr || "", url: urlErr || "" });
      return;
    }

    setSaving(true);
    try {
      // Ensure URL ends with trailing slash
      const normalizedUrl = startUrl.endsWith("/") ? startUrl : startUrl + "/";
      const session: SsoSession = {
        name: sessionName,
        sso_start_url: normalizedUrl,
        sso_region: region,
        sso_registration_scopes: "sso:account:access",
      };
      await invoke("create_sso_session", { session });
      resetForm();
      onRefresh();
    } catch (err) {
      const msg = String(err);
      setError(msg);
      onError?.(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (confirmDelete === name) {
      setConfirmDelete(null);
      try {
        await invoke("delete_sso_session", { name });
        onRefresh();
      } catch (err) {
        const msg = String(err);
        setError(msg);
        onError?.(msg, "error");
      }
    } else {
      setConfirmDelete(name);
      setTimeout(
        () => setConfirmDelete((prev) => (prev === name ? null : prev)),
        3000,
      );
    }
  };

  const handleLogin = async (name: string) => {
    setLoggingIn(name);
    setError(null);
    setCodeCopied(false);
    pollAbortRef.current = false;

    try {
      // Step 1: Start device authorization (opens browser)
      const info = await invoke<DeviceAuthInfo>("start_device_auth", {
        sessionName: name,
      });
      setDeviceAuth(info);

      // Step 2: Poll for completion in background
      await invoke("poll_device_auth", {
        sessionName: name,
        deviceCode: info.device_code,
        clientId: info.client_id,
        clientSecret: info.client_secret,
        region: info.region,
        startUrl: info.start_url,
        interval: info.interval,
      });

      // Success!
      setDeviceAuth(null);
      onStatusChange();
    } catch (err) {
      if (!pollAbortRef.current) {
        const msg = String(err);
        setError(msg);
        onError?.(msg, "error");
      }
      setDeviceAuth(null);
    } finally {
      setLoggingIn(null);
      loginTriggeredRef.current = null;
    }
  };

  const handleCancelAuth = () => {
    pollAbortRef.current = true;
    setDeviceAuth(null);
    setLoggingIn(null);
    loginTriggeredRef.current = null;
  };

  const handleCopyCode = async () => {
    if (!deviceAuth) return;
    try {
      await navigator.clipboard.writeText(deviceAuth.user_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  // If no sessions at all, show the form prominently
  const showEmptyState = !loading && sessions.length === 0 && !showForm;

  // Device authorization panel
  if (deviceAuth) {
    return (
      <div className="page">
        <div className="device-auth-panel">
          <div className="device-auth-header">
            <LogIn size={24} />
            <h3>Sign in to AWS</h3>
          </div>

          <p className="device-auth-instruction">
            A browser window has been opened. Enter this code when prompted:
          </p>

          <div className="device-code-container">
            <span className="device-code">{deviceAuth.user_code}</span>
            <button
              className="icon-btn device-code-copy"
              onClick={handleCopyCode}
              title="Copy code"
            >
              {codeCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <a
            className="device-auth-link"
            href={deviceAuth.verification_uri_complete}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
            <span>Open verification page</span>
          </a>

          <div className="device-auth-status">
            <Loader size={16} className="spin" />
            <span>Waiting for authorization...</span>
          </div>

          <button
            className="btn btn-secondary device-auth-cancel"
            onClick={handleCancelAuth}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>SSO Sessions</h2>
        {sessions.length > 0 && !showForm && (
          <button className="btn btn-primary" onClick={handleAdd}>
            <Plus size={16} />
            <span>Add Session</span>
          </button>
        )}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {showEmptyState && (
        <div className="setup-container">
          <div className="setup-header">
            <h2>Connect to AWS Identity Center</h2>
            <p className="text-muted">
              Add your organization's AWS Identity Center (SSO) session to get
              started.
            </p>
          </div>
          <div className="setup-actions">
            <button className="btn btn-primary setup-btn" onClick={handleAdd}>
              <Plus size={16} />
              <span>Add SSO Session</span>
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="session-form-wrapper">
          <div className="page-header">
            <h3>{editing ? `Edit "${editing.name}"` : "New SSO Session"}</h3>
            <button className="icon-btn" title="Cancel" onClick={resetForm}>
              <X size={16} />
            </button>
          </div>

          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="session-name">Session Name</label>
              <input
                id="session-name"
                type="text"
                value={sessionName}
                onChange={(e) => handleSessionNameChange(e.target.value)}
                placeholder="my-sso"
                required
                disabled={!!editing}
                className={validationErrors.name ? "input-error" : ""}
              />
              {validationErrors.name ? (
                <span className="form-error">{validationErrors.name}</span>
              ) : (
                <span className="form-hint">
                  A short name to identify this SSO connection
                </span>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="start-url">
                <Globe
                  size={14}
                  style={{ marginRight: 4, verticalAlign: -2 }}
                />
                SSO Start URL
              </label>
              <input
                id="start-url"
                type="url"
                value={startUrl}
                onChange={(e) => handleStartUrlChange(e.target.value)}
                placeholder="https://d-xxxxxxxxxx.awsapps.com/start"
                required
                className={validationErrors.url ? "input-error" : ""}
              />
              {validationErrors.url ? (
                <span className="form-error">{validationErrors.url}</span>
              ) : (
                <span className="form-hint">
                  Your organization's AWS access portal URL
                </span>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="region">
                <MapPin
                  size={14}
                  style={{ marginRight: 4, verticalAlign: -2 }}
                />
                SSO Region
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                {AWS_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="form-hint">
                The AWS region where Identity Center is configured
              </span>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !startUrl}
              >
                <ArrowRight size={16} />
                <span>
                  {saving ? "Saving..." : editing ? "Update" : "Create"}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="loading">Loading sessions...</div>}

      {!showForm && sessions.length > 0 && (
        <div className="profile-list">
          {sessions.map((session) => (
            <div key={session.name} className="profile-card">
              <div className="profile-info">
                <span className="profile-name">{session.name}</span>
                <span className="text-muted">{session.sso_start_url}</span>
                <span className="text-muted">Region: {session.sso_region}</span>
                {session.sso_registration_scopes && (
                  <span className="text-muted">
                    Scopes: {session.sso_registration_scopes}
                  </span>
                )}
              </div>
              <div className="profile-actions">
                <button
                  className="icon-btn"
                  title="Login"
                  onClick={() => handleLogin(session.name)}
                  disabled={loggingIn === session.name}
                >
                  <LogIn size={14} />
                </button>
                <button
                  className="icon-btn"
                  title="Edit"
                  onClick={() => handleEdit(session)}
                >
                  <Edit3 size={14} />
                </button>
                <button
                  className={`icon-btn icon-btn-danger ${confirmDelete === session.name ? "icon-btn-confirm" : ""}`}
                  title={
                    confirmDelete === session.name
                      ? "Click again to confirm"
                      : "Delete"
                  }
                  onClick={() => handleDelete(session.name)}
                >
                  <Trash2 size={14} />
                  {confirmDelete === session.name && (
                    <span className="copied-tooltip">Confirm?</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
