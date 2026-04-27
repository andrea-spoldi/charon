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
  Key,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type {
  SsoSession,
  DeviceAuthInfo,
  GoogleWorkspaceSession,
  GoogleAuthInfo,
} from "../types";

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

type Provider = "aws_identity_center" | "google_workspace";

interface SessionsPageProps {
  sessions: SsoSession[];
  googleSessions: GoogleWorkspaceSession[];
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
  googleSessions,
  loading,
  onRefresh,
  onStatusChange,
  loginSessionName,
  onLoginHandled,
  onError,
}: SessionsPageProps) {
  const [activeProvider, setActiveProvider] =
    useState<Provider>("aws_identity_center");

  // ── AWS Identity Center form state ──────────────────────────────────────
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

  // Device authorization state (AWS Identity Center)
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthInfo | null>(null);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const pollAbortRef = useRef(false);
  const loginTriggeredRef = useRef<string | null>(null);

  // ── Google Workspace form state ─────────────────────────────────────────
  const [showGoogleForm, setShowGoogleForm] = useState(false);
  const [editingGoogle, setEditingGoogle] =
    useState<GoogleWorkspaceSession | null>(null);
  const [gName, setGName] = useState("google-ws");
  const [gIdpUrl, setGIdpUrl] = useState("");
  const [gProviderArn, setGProviderArn] = useState("");
  const [gRoleArn, setGRoleArn] = useState("");
  const [gRegion, setGRegion] = useState("us-east-1");
  const [gPort, setGPort] = useState(14173);
  const [gDuration, setGDuration] = useState(3600);
  const [gSaving, setGSaving] = useState(false);
  const [gError, setGError] = useState<string | null>(null);
  const [gConfirmDelete, setGConfirmDelete] = useState<string | null>(null);
  const [gValidationErrors, setGValidationErrors] = useState<
    Record<string, string>
  >({});

  // Google auth-in-progress state
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthInfo | null>(null);
  const [googleLoggingIn, setGoogleLoggingIn] = useState<string | null>(null);

  // ── Handle login trigger from TopBar ────────────────────────────────────
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

  // ── AWS Identity Center helpers ──────────────────────────────────────────
  const resetForm = () => {
    setSessionName("my-sso");
    setStartUrl("");
    setRegion("us-east-1");
    setEditing(null);
    setShowForm(false);
    setError(null);
    setValidationErrors({});
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
    setValidationErrors({});
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
      const info = await invoke<DeviceAuthInfo>("start_device_auth", {
        sessionName: name,
      });
      setDeviceAuth(info);

      await invoke("poll_device_auth", {
        sessionName: name,
        deviceCode: info.device_code,
        clientId: info.client_id,
        clientSecret: info.client_secret,
        region: info.region,
        startUrl: info.start_url,
        interval: info.interval,
      });

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

  // ── Google Workspace helpers ─────────────────────────────────────────────
  const resetGoogleForm = () => {
    setGName("google-ws");
    setGIdpUrl("");
    setGProviderArn("");
    setGRoleArn("");
    setGRegion("us-east-1");
    setGPort(14173);
    setGDuration(3600);
    setEditingGoogle(null);
    setShowGoogleForm(false);
    setGError(null);
    setGValidationErrors({});
  };

  const handleGoogleAdd = () => {
    resetGoogleForm();
    setShowGoogleForm(true);
  };

  const handleGoogleEdit = (session: GoogleWorkspaceSession) => {
    setEditingGoogle(session);
    setGName(session.name);
    setGIdpUrl(session.idp_initiated_url);
    setGProviderArn(session.aws_saml_provider_arn);
    setGRoleArn(session.aws_role_arn);
    setGRegion(session.aws_region);
    setGPort(session.callback_port);
    setGDuration(session.session_duration_secs);
    setShowGoogleForm(true);
    setGError(null);
    setGValidationErrors({});
  };

  const validateGoogleForm = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!gName) errs.name = "Session name is required";
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(gName))
      errs.name =
        "Only lowercase letters, numbers, and hyphens (must start with letter or number)";
    if (!gIdpUrl) errs.idpUrl = "IDP-initiated URL is required";
    else if (!/^https?:\/\/.+/.test(gIdpUrl))
      errs.idpUrl = "Must be a valid URL starting with https://";
    if (!gProviderArn) errs.providerArn = "SAML provider ARN is required";
    else if (
      !/^arn:aws:iam::\d+:saml-provider\/.+$/.test(gProviderArn)
    )
      errs.providerArn =
        "Must match arn:aws:iam::ACCOUNT:saml-provider/NAME";
    if (!gRoleArn) errs.roleArn = "Role ARN is required";
    else if (!/^arn:aws:iam::\d+:role\/.+$/.test(gRoleArn))
      errs.roleArn = "Must match arn:aws:iam::ACCOUNT:role/NAME";
    if (gPort < 1024 || gPort > 65535)
      errs.port = "Port must be between 1024 and 65535";
    if (gDuration < 900 || gDuration > 43200)
      errs.duration = "Duration must be between 900 (15 min) and 43200 (12 h)";
    return errs;
  };

  const handleGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGError(null);

    const errs = validateGoogleForm();
    if (Object.keys(errs).length > 0) {
      setGValidationErrors(errs);
      return;
    }

    setGSaving(true);
    try {
      const session: GoogleWorkspaceSession = {
        name: gName,
        idp_initiated_url: gIdpUrl,
        aws_saml_provider_arn: gProviderArn,
        aws_role_arn: gRoleArn,
        aws_region: gRegion,
        callback_port: gPort,
        session_duration_secs: gDuration,
      };
      await invoke("create_google_session", { session });
      resetGoogleForm();
      onRefresh();
    } catch (err) {
      const msg = String(err);
      setGError(msg);
      onError?.(msg, "error");
    } finally {
      setGSaving(false);
    }
  };

  const handleGoogleDelete = async (name: string) => {
    if (gConfirmDelete === name) {
      setGConfirmDelete(null);
      try {
        await invoke("delete_google_session", { name });
        onRefresh();
      } catch (err) {
        const msg = String(err);
        setGError(msg);
        onError?.(msg, "error");
      }
    } else {
      setGConfirmDelete(name);
      setTimeout(
        () => setGConfirmDelete((prev) => (prev === name ? null : prev)),
        3000,
      );
    }
  };

  const handleGoogleLogin = async (name: string) => {
    setGoogleLoggingIn(name);
    setGError(null);

    try {
      const info = await invoke<GoogleAuthInfo>("start_google_auth", {
        sessionName: name,
      });
      setGoogleAuth(info);

      await invoke("poll_google_auth", { sessionName: name });

      setGoogleAuth(null);
      onStatusChange();
    } catch (err) {
      const msg = String(err);
      setGError(msg);
      onError?.(msg, "error");
      setGoogleAuth(null);
    } finally {
      setGoogleLoggingIn(null);
    }
  };

  const handleCancelGoogleAuth = () => {
    // The backend will time out on its own; we just clear local state
    setGoogleAuth(null);
    setGoogleLoggingIn(null);
  };

  // ── Derived booleans ─────────────────────────────────────────────────────
  const hasAnySessions = sessions.length > 0 || googleSessions.length > 0;
  const showEmptyState = !loading && !hasAnySessions && !showForm && !showGoogleForm;

  // ── AWS device auth waiting screen ───────────────────────────────────────
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

  // ── Google SAML waiting screen ────────────────────────────────────────────
  if (googleAuth) {
    return (
      <div className="page">
        <div className="device-auth-panel">
          <div className="device-auth-header">
            <Key size={24} />
            <h3>Sign in with Google Workspace</h3>
          </div>

          <p className="device-auth-instruction">
            A browser window has been opened to your Google Workspace login
            page. Complete sign-in there to continue.
          </p>

          <p className="text-muted" style={{ fontSize: "0.82rem" }}>
            Charon is listening on{" "}
            <code>localhost:{googleAuth.callback_port}</code> for the SAML
            response. Make sure your Google Workspace SAML app is configured
            with this as the ACS URL.
          </p>

          <div className="device-auth-status">
            <Loader size={16} className="spin" />
            <span>Waiting for Google authentication...</span>
          </div>

          <button
            className="btn btn-secondary device-auth-cancel"
            onClick={handleCancelGoogleAuth}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Main page ────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <h2>Sessions</h2>
        {hasAnySessions && !showForm && !showGoogleForm && (
          <button
            className="btn btn-primary"
            onClick={
              activeProvider === "aws_identity_center"
                ? handleAdd
                : handleGoogleAdd
            }
          >
            <Plus size={16} />
            <span>Add Session</span>
          </button>
        )}
      </div>

      {/* Provider tabs */}
      {!showForm && !showGoogleForm && (
        <div className="provider-tabs">
          <button
            className={`provider-tab${activeProvider === "aws_identity_center" ? " provider-tab-active" : ""}`}
            onClick={() => setActiveProvider("aws_identity_center")}
          >
            AWS Identity Center
            {sessions.length > 0 && (
              <span className="provider-tab-count">{sessions.length}</span>
            )}
          </button>
          <button
            className={`provider-tab${activeProvider === "google_workspace" ? " provider-tab-active" : ""}`}
            onClick={() => setActiveProvider("google_workspace")}
          >
            Google Workspace
            {googleSessions.length > 0 && (
              <span className="provider-tab-count">{googleSessions.length}</span>
            )}
          </button>
        </div>
      )}

      {/* Global errors */}
      {error && activeProvider === "aws_identity_center" && (
        <div className="error-msg">{error}</div>
      )}
      {gError && activeProvider === "google_workspace" && (
        <div className="error-msg">{gError}</div>
      )}

      {/* Empty state */}
      {showEmptyState && (
        <div className="setup-container">
          <div className="setup-header">
            <h2>
              {activeProvider === "aws_identity_center"
                ? "Connect to AWS Identity Center"
                : "Connect via Google Workspace"}
            </h2>
            <p className="text-muted">
              {activeProvider === "aws_identity_center"
                ? "Add your organization's AWS Identity Center (SSO) session to get started."
                : "Add a Google Workspace SAML federation session to access AWS accounts via Google."}
            </p>
          </div>
          <div className="setup-actions">
            <button
              className="btn btn-primary setup-btn"
              onClick={
                activeProvider === "aws_identity_center"
                  ? handleAdd
                  : handleGoogleAdd
              }
            >
              <Plus size={16} />
              <span>
                {activeProvider === "aws_identity_center"
                  ? "Add SSO Session"
                  : "Add Google Session"}
              </span>
            </button>
          </div>
        </div>
      )}

      {loading && <div className="loading">Loading sessions...</div>}

      {/* ── AWS Identity Center tab ─────────────────────────────────────── */}
      {activeProvider === "aws_identity_center" && (
        <>
          {showForm && (
            <div className="session-form-wrapper">
              <div className="page-header">
                <h3>
                  {editing ? `Edit "${editing.name}"` : "New SSO Session"}
                </h3>
                <button
                  className="icon-btn"
                  title="Cancel"
                  onClick={resetForm}
                >
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

          {!showForm && sessions.length > 0 && (
            <div className="profile-list">
              {sessions.map((session) => (
                <div key={session.name} className="profile-card">
                  <div className="profile-info">
                    <span className="profile-name">{session.name}</span>
                    <span className="text-muted">{session.sso_start_url}</span>
                    <span className="text-muted">
                      Region: {session.sso_region}
                    </span>
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

          {!showForm && sessions.length === 0 && !showEmptyState && (
            <div className="setup-container">
              <div className="setup-header">
                <h2>No SSO Sessions</h2>
                <p className="text-muted">
                  Add an AWS Identity Center session to get started.
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
        </>
      )}

      {/* ── Google Workspace tab ────────────────────────────────────────── */}
      {activeProvider === "google_workspace" && (
        <>
          {showGoogleForm && (
            <div className="session-form-wrapper">
              <div className="page-header">
                <h3>
                  {editingGoogle
                    ? `Edit "${editingGoogle.name}"`
                    : "New Google Workspace Session"}
                </h3>
                <button
                  className="icon-btn"
                  title="Cancel"
                  onClick={resetGoogleForm}
                >
                  <X size={16} />
                </button>
              </div>

              <form className="profile-form" onSubmit={handleGoogleSubmit}>
                <div className="form-field">
                  <label htmlFor="g-name">Session Name</label>
                  <input
                    id="g-name"
                    type="text"
                    value={gName}
                    onChange={(e) => {
                      const v = e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/[^a-z0-9-]/g, "");
                      setGName(v);
                      setGValidationErrors((prev) => ({
                        ...prev,
                        name: "",
                      }));
                    }}
                    placeholder="google-ws"
                    required
                    disabled={!!editingGoogle}
                    className={gValidationErrors.name ? "input-error" : ""}
                  />
                  {gValidationErrors.name ? (
                    <span className="form-error">{gValidationErrors.name}</span>
                  ) : (
                    <span className="form-hint">
                      A short name to identify this Google Workspace connection
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="g-idp-url">
                    <Globe
                      size={14}
                      style={{ marginRight: 4, verticalAlign: -2 }}
                    />
                    IDP-Initiated SSO URL
                  </label>
                  <input
                    id="g-idp-url"
                    type="url"
                    value={gIdpUrl}
                    onChange={(e) => {
                      setGIdpUrl(e.target.value);
                      setGValidationErrors((prev) => ({
                        ...prev,
                        idpUrl: "",
                      }));
                    }}
                    placeholder="https://accounts.google.com/o/saml2/initsso?idpid=..."
                    required
                    className={gValidationErrors.idpUrl ? "input-error" : ""}
                  />
                  {gValidationErrors.idpUrl ? (
                    <span className="form-error">
                      {gValidationErrors.idpUrl}
                    </span>
                  ) : (
                    <span className="form-hint">
                      IDP-initiated SSO URL from the Google Workspace SAML app
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="g-provider-arn">
                    <Key
                      size={14}
                      style={{ marginRight: 4, verticalAlign: -2 }}
                    />
                    SAML Provider ARN
                  </label>
                  <input
                    id="g-provider-arn"
                    type="text"
                    value={gProviderArn}
                    onChange={(e) => {
                      setGProviderArn(e.target.value);
                      setGValidationErrors((prev) => ({
                        ...prev,
                        providerArn: "",
                      }));
                    }}
                    placeholder="arn:aws:iam::123456789012:saml-provider/GoogleWorkspace"
                    required
                    className={
                      gValidationErrors.providerArn ? "input-error" : ""
                    }
                  />
                  {gValidationErrors.providerArn ? (
                    <span className="form-error">
                      {gValidationErrors.providerArn}
                    </span>
                  ) : (
                    <span className="form-hint">
                      IAM SAML provider ARN from the AWS console
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="g-role-arn">Role ARN</label>
                  <input
                    id="g-role-arn"
                    type="text"
                    value={gRoleArn}
                    onChange={(e) => {
                      setGRoleArn(e.target.value);
                      setGValidationErrors((prev) => ({
                        ...prev,
                        roleArn: "",
                      }));
                    }}
                    placeholder="arn:aws:iam::123456789012:role/GoogleWorkspaceAccess"
                    required
                    className={gValidationErrors.roleArn ? "input-error" : ""}
                  />
                  {gValidationErrors.roleArn ? (
                    <span className="form-error">
                      {gValidationErrors.roleArn}
                    </span>
                  ) : (
                    <span className="form-hint">
                      IAM role ARN to assume via the SAML assertion
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="g-region">
                    <MapPin
                      size={14}
                      style={{ marginRight: 4, verticalAlign: -2 }}
                    />
                    AWS Region
                  </label>
                  <select
                    id="g-region"
                    value={gRegion}
                    onChange={(e) => setGRegion(e.target.value)}
                  >
                    {AWS_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <span className="form-hint">
                    AWS region for STS AssumeRoleWithSAML calls
                  </span>
                </div>

                <div className="form-field">
                  <label htmlFor="g-port">Callback Port</label>
                  <input
                    id="g-port"
                    type="number"
                    min={1024}
                    max={65535}
                    value={gPort}
                    onChange={(e) => {
                      setGPort(Number(e.target.value));
                      setGValidationErrors((prev) => ({
                        ...prev,
                        port: "",
                      }));
                    }}
                    className={gValidationErrors.port ? "input-error" : ""}
                  />
                  {gValidationErrors.port ? (
                    <span className="form-error">{gValidationErrors.port}</span>
                  ) : (
                    <span className="form-hint">
                      Local port Charon listens on for the SAML POST — must
                      match the ACS URL configured in your Google Workspace SAML
                      app (e.g.{" "}
                      <code>http://localhost:{gPort}/saml/callback</code>)
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="g-duration">Session Duration (seconds)</label>
                  <input
                    id="g-duration"
                    type="number"
                    min={900}
                    max={43200}
                    step={900}
                    value={gDuration}
                    onChange={(e) => {
                      setGDuration(Number(e.target.value));
                      setGValidationErrors((prev) => ({
                        ...prev,
                        duration: "",
                      }));
                    }}
                    className={
                      gValidationErrors.duration ? "input-error" : ""
                    }
                  />
                  {gValidationErrors.duration ? (
                    <span className="form-error">
                      {gValidationErrors.duration}
                    </span>
                  ) : (
                    <span className="form-hint">
                      900 – 43200 seconds (15 min – 12 h). Default: 3600 (1 h)
                    </span>
                  )}
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetGoogleForm}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={gSaving}
                  >
                    <ArrowRight size={16} />
                    <span>
                      {gSaving
                        ? "Saving..."
                        : editingGoogle
                          ? "Update"
                          : "Create"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {!showGoogleForm && googleSessions.length > 0 && (
            <div className="profile-list">
              {googleSessions.map((session) => (
                <div key={session.name} className="profile-card">
                  <div className="profile-info">
                    <span className="profile-name">{session.name}</span>
                    <span className="text-muted">{session.idp_initiated_url}</span>
                    <span className="text-muted">
                      Region: {session.aws_region}
                    </span>
                    <span className="text-muted">
                      Role: {session.aws_role_arn.split("/").pop()}
                    </span>
                  </div>
                  <div className="profile-actions">
                    <button
                      className="icon-btn"
                      title="Login"
                      onClick={() => handleGoogleLogin(session.name)}
                      disabled={googleLoggingIn === session.name}
                    >
                      <LogIn size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Edit"
                      onClick={() => handleGoogleEdit(session)}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      className={`icon-btn icon-btn-danger ${gConfirmDelete === session.name ? "icon-btn-confirm" : ""}`}
                      title={
                        gConfirmDelete === session.name
                          ? "Click again to confirm"
                          : "Delete"
                      }
                      onClick={() => handleGoogleDelete(session.name)}
                    >
                      <Trash2 size={14} />
                      {gConfirmDelete === session.name && (
                        <span className="copied-tooltip">Confirm?</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showGoogleForm &&
            googleSessions.length === 0 &&
            !showEmptyState && (
              <div className="setup-container">
                <div className="setup-header">
                  <h2>No Google Workspace Sessions</h2>
                  <p className="text-muted">
                    Add a Google Workspace SAML session to federate into AWS
                    accounts.
                  </p>
                </div>
                <div className="setup-actions">
                  <button
                    className="btn btn-primary setup-btn"
                    onClick={handleGoogleAdd}
                  >
                    <Plus size={16} />
                    <span>Add Google Session</span>
                  </button>
                </div>
              </div>
            )}
        </>
      )}
    </div>
  );
}
