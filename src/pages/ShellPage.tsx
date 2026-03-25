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
  const [instanceId, setInstanceId] = useState("");
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
    setInstanceId("");
  }, [selectedProfileName]);

  const handleBrowseInstances = () => {
    if (accessToken && ssoRegion && accountId && roleName) {
      setShowBrowser(true);
      onFetchInstances(accessToken, accountId, roleName, ssoRegion, region);
    }
  };

  const handleSelectInstance = (id: string) => {
    if (id) {
      setInstanceId(id);
      setShowBrowser(false);
    }
  };

  const handleConnect = async () => {
    if (!accessToken || !ssoRegion || !instanceId) return;

    const inst = instances.find((i) => i.instanceId === instanceId);

    try {
      await startSession({
        accessToken,
        accountId,
        roleName,
        ssoRegion,
        instanceId,
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
          <h2>Shell</h2>
          <div className="page-header-actions">
            <span className="text-muted">
              {session.instanceName || session.instanceId} · {session.region}
            </span>
            <button
              className="btn btn-sm btn-danger"
              onClick={handleDisconnect}
              title="Disconnect"
            >
              <Power size={14} />
              <span>Disconnect</span>
            </button>
          </div>
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

  // Connection form — mirrors TunnelForm style
  return (
    <div className="page">
      <div className="page-header">
        <h2>Shell</h2>
      </div>

      {!ssoActive && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>
            SSO session expired — connect and browse instances are disabled. Use
            the Login button in the top bar to authenticate.
          </span>
        </div>
      )}

      {pluginInstalled === false && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>
            <strong>session-manager-plugin</strong> is not installed. Install it
            from the{" "}
            <a
              href="https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              AWS documentation
            </a>{" "}
            to use shell sessions.
          </span>
        </div>
      )}

      <section className="tunnels-section">
        <div className="settings-form tunnel-form">
          <div className="form-field">
            <label htmlFor="shell-profile">Profile</label>
            {eligibleProfiles.length <= 1 ? (
              <span className="form-value">
                {selectedProfile?.name ?? "—"}{" "}
                <span className="text-muted">
                  ({accountId} / {roleName})
                </span>
              </span>
            ) : (
              <select
                id="shell-profile"
                value={selectedProfileName}
                onChange={(e) => setSelectedProfileName(e.target.value)}
              >
                {eligibleProfiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.sso_account_id} / {p.sso_role_name})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="shell-instance">Instance</label>
            <div className="input-with-action">
              <input
                id="shell-instance"
                type="text"
                placeholder="e.g., i-0abc123def456789"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
              />
              <button
                className="btn btn-sm btn-outline"
                onClick={handleBrowseInstances}
                disabled={loadingInstances || !selectedProfile}
                title="Browse instances"
              >
                {loadingInstances ? (
                  <RefreshCw size={12} className="spin" />
                ) : (
                  <List size={12} />
                )}
                <span>{loadingInstances ? "Loading..." : "Browse"}</span>
              </button>
            </div>
            {showBrowser && !loadingInstances && (
              <select
                className="instance-picker"
                size={Math.min(onlineInstances.length + 1, 6)}
                onChange={(e) => handleSelectInstance(e.target.value)}
                defaultValue=""
              >
                {onlineInstances.length === 0 ? (
                  <option value="" disabled>
                    No online instances found
                  </option>
                ) : (
                  <>
                    <option value="" disabled>
                      Select an instance...
                    </option>
                    {onlineInstances.map((i) => (
                      <option key={i.instanceId} value={i.instanceId}>
                        {i.instanceName ?? i.computerName ?? "—"} –{" "}
                        {i.instanceId}
                        {i.ipAddress ? ` – ${i.ipAddress}` : ""}
                      </option>
                    ))}
                  </>
                )}
              </select>
            )}
            <span className="form-hint">
              Type an instance ID directly or browse available instances.
            </span>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={!ssoActive || !instanceId.trim() || connecting}
            >
              <TerminalSquare size={16} />
              <span>{connecting ? "Connecting..." : "Connect"}</span>
            </button>
          </div>
        </div>
      </section>

      {!session && (
        <div className="empty-state">
          <p>No active shell session.</p>
          <p className="text-muted">
            Select a profile and instance above, then click{" "}
            <strong>Connect</strong> to start an interactive session.
          </p>
        </div>
      )}
    </div>
  );
}
