import { useState, useCallback, useEffect, useRef } from "react";
import {
  TerminalSquare,
  Power,
  List,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import type {
  SsoTokenInfo,
  AwsProfile,
  SsmInstance,
  AppSettings,
} from "../types";
import { Terminal } from "../components/Terminal";
import { useShellSession } from "../hooks/useShellSession";

interface ShellPageProps {
  ssoStatus: SsoTokenInfo;
  profiles: AwsProfile[];
  defaultProfile: string | null;
  instances: SsmInstance[];
  settings: AppSettings;
  pluginInstalled: boolean | null;
  loadingInstances: boolean;
  onFetchInstances: (
    accessToken: string,
    accountId: string,
    roleName: string,
    ssoRegion: string,
    targetRegion: string,
  ) => void;
  onError: (msg: string, type?: "error" | "info" | "success") => void;
}

export function ShellPage({
  ssoStatus,
  profiles,
  defaultProfile,
  instances,
  settings,
  pluginInstalled,
  loadingInstances,
  onFetchInstances,
  onError,
}: ShellPageProps) {
  const {
    session,
    connecting,
    error,
    startSession,
    writeInput,
    resize,
    stopSession,
    setOnData,
  } = useShellSession();

  // Instance selection state
  const [selectedProfileName, setSelectedProfileName] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [showBrowser, setShowBrowser] = useState(false);
  const writeRef = useRef<((data: Uint8Array) => void) | null>(null);

  // Eligible profiles
  const eligibleProfiles = profiles.filter(
    (p) => p.name !== "default" && p.sso_account_id && p.sso_role_name,
  );

  // Set initial profile
  useEffect(() => {
    if (!selectedProfileName && eligibleProfiles.length > 0) {
      setSelectedProfileName(defaultProfile ?? eligibleProfiles[0]?.name ?? "");
    }
  }, [eligibleProfiles, defaultProfile, selectedProfileName]);

  const selectedProfile = eligibleProfiles.find(
    (p) => p.name === selectedProfileName,
  );
  const accountId = selectedProfile?.sso_account_id ?? "";
  const roleName = selectedProfile?.sso_role_name ?? "";
  const region = selectedProfile?.region ?? settings.default_region;
  const accessToken = ssoStatus.access_token;
  const ssoRegion = ssoStatus.region;
  const onlineInstances = instances.filter((i) => i.pingStatus === "Online");

  // Show error toast
  useEffect(() => {
    if (error) {
      onError(error, "error");
    }
  }, [error, onError]);

  // Reset instance browser when profile changes
  useEffect(() => {
    setShowBrowser(false);
    setSelectedInstance("");
  }, [selectedProfileName]);

  const handleBrowseInstances = () => {
    if (accessToken && ssoRegion && accountId && roleName) {
      setShowBrowser(true);
      onFetchInstances(accessToken, accountId, roleName, ssoRegion, region);
    }
  };

  const handleConnect = async () => {
    if (!accessToken || !ssoRegion || !selectedInstance) return;

    const inst = instances.find((i) => i.instanceId === selectedInstance);

    try {
      await startSession({
        accessToken,
        accountId,
        roleName,
        ssoRegion,
        instanceId: selectedInstance,
        instanceName: inst?.instanceName ?? undefined,
        region,
      });
      onError("Shell session started", "success");
    } catch {
      // Error is already set via hook
    }
  };

  const handleDisconnect = async () => {
    await stopSession();
    onError("Shell session ended", "info");
  };

  // Wire up PTY output -> xterm
  const handleTerminalReady = useCallback(
    (write: (data: Uint8Array) => void) => {
      writeRef.current = write;
      setOnData(write);
    },
    [setOnData],
  );

  // Wire up xterm input -> PTY
  const handleTerminalData = useCallback(
    (data: Uint8Array) => {
      writeInput(data);
    },
    [writeInput],
  );

  // Wire up xterm resize -> PTY resize
  const handleTerminalResize = useCallback(
    (rows: number, cols: number) => {
      resize(rows, cols);
    },
    [resize],
  );

  const ssoActive =
    ssoStatus.status === "active" && !!accessToken && !!ssoRegion;

  // If connected, show the terminal full-screen
  if (session) {
    return (
      <div className="page shell-page">
        <div className="page-header">
          <h2>
            <TerminalSquare size={20} />
            <span>
              {session.instanceName || session.instanceId}
              <span className="text-muted" style={{ marginLeft: 8 }}>
                {session.region}
              </span>
            </span>
          </h2>
          <button
            className="btn btn-danger"
            onClick={handleDisconnect}
            title="Disconnect"
          >
            <Power size={16} />
            <span>Disconnect</span>
          </button>
        </div>
        <div className="shell-terminal-wrapper">
          <Terminal
            onData={handleTerminalData}
            onResize={handleTerminalResize}
            onReady={handleTerminalReady}
            active={true}
          />
        </div>
      </div>
    );
  }

  // Connection form
  return (
    <div className="page">
      <div className="page-header">
        <h2>Shell Sessions</h2>
      </div>

      {pluginInstalled === false && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>
            session-manager-plugin is not installed.{" "}
            <a
              href="https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Install it
            </a>{" "}
            to use shell sessions.
          </span>
        </div>
      )}

      {!ssoActive && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>Login to SSO first to connect to instances.</span>
        </div>
      )}

      <div className="section">
        <div className="form-group">
          <label>Profile</label>
          {eligibleProfiles.length <= 1 ? (
            <input
              type="text"
              readOnly
              value={selectedProfile?.name ?? "No profiles available"}
              className="form-input"
            />
          ) : (
            <select
              className="form-input"
              value={selectedProfileName}
              onChange={(e) => setSelectedProfileName(e.target.value)}
            >
              {eligibleProfiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group">
          <label>Instance</label>
          <div className="input-group">
            <input
              type="text"
              className="form-input"
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              placeholder="i-0123456789abcdef0"
            />
            <button
              className="btn btn-secondary"
              onClick={handleBrowseInstances}
              disabled={!ssoActive || loadingInstances}
              title="Browse instances"
            >
              {loadingInstances ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <List size={14} />
              )}
              <span>Browse</span>
            </button>
          </div>
        </div>

        {showBrowser && (
          <div className="instance-browser">
            {loadingInstances && (
              <div className="loading">Loading instances...</div>
            )}
            {!loadingInstances && onlineInstances.length === 0 && (
              <div className="empty-state">
                <p>No online SSM instances found.</p>
              </div>
            )}
            {onlineInstances.map((inst) => (
              <button
                key={inst.instanceId}
                className={`instance-item ${selectedInstance === inst.instanceId ? "selected" : ""}`}
                onClick={() => {
                  setSelectedInstance(inst.instanceId);
                  setShowBrowser(false);
                }}
              >
                <span className="instance-name">
                  {inst.instanceName || inst.instanceId}
                </span>
                <span className="text-muted">
                  {inst.instanceId}
                  {inst.ipAddress && ` · ${inst.ipAddress}`}
                  {inst.platformType && ` · ${inst.platformType}`}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={!ssoActive || !selectedInstance || connecting}
          >
            <TerminalSquare size={16} />
            <span>{connecting ? "Connecting..." : "Connect"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
