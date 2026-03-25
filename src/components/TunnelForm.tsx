import { useState, useEffect } from "react";
import { List, RefreshCw, Save, X } from "lucide-react";
import type {
  SsoTokenInfo,
  AwsProfile,
  SsmInstance,
  TunnelConfig,
  AppSettings,
} from "../types";

interface TunnelFormProps {
  ssoStatus: SsoTokenInfo;
  profiles: AwsProfile[];
  defaultProfile: string | null;
  instances: SsmInstance[];
  settings: AppSettings;
  loadingInstances: boolean;
  initial?: TunnelConfig | null;
  onFetchInstances: (
    accessToken: string,
    accountId: string,
    roleName: string,
    ssoRegion: string,
    targetRegion: string,
  ) => void;
  onRefreshProfiles: () => void;
  onSave: (config: TunnelConfig) => void;
  onCancel: () => void;
}

export function TunnelForm({
  ssoStatus,
  profiles,
  defaultProfile,
  instances,
  settings,
  loadingInstances,
  initial,
  onFetchInstances,
  onRefreshProfiles,
  onSave,
  onCancel,
}: TunnelFormProps) {
  // Eligible profiles: must have account + role
  const eligibleProfiles = profiles.filter(
    (p) => p.name !== "default" && p.sso_account_id && p.sso_role_name,
  );

  // Resolve initial profile: if editing, match by accountId+roleName; else use default
  const resolveInitialProfile = (): string => {
    if (initial) {
      const match = eligibleProfiles.find(
        (p) =>
          p.sso_account_id === initial.accountId &&
          p.sso_role_name === initial.roleName,
      );
      if (match) return match.name;
    }
    return defaultProfile ?? eligibleProfiles[0]?.name ?? "";
  };

  const [selectedProfileName, setSelectedProfileName] = useState(
    resolveInitialProfile,
  );
  const [instanceId, setInstanceId] = useState(initial?.instanceId ?? "");
  const [showBrowser, setShowBrowser] = useState(false);
  const [remoteHost, setRemoteHost] = useState(initial?.remoteHost ?? "");
  const [remotePort, setRemotePort] = useState(
    initial ? String(initial.remotePort) : "",
  );
  const [localPort, setLocalPort] = useState(
    initial && initial.localPort && !initial.useRandomPort
      ? String(initial.localPort)
      : "",
  );
  const [useRandomPort, setUseRandomPort] = useState(
    initial?.useRandomPort ?? false,
  );
  const [tunnelName, setTunnelName] = useState(initial?.name ?? "");

  const selectedProfile = eligibleProfiles.find(
    (p) => p.name === selectedProfileName,
  );
  const accountId = selectedProfile?.sso_account_id ?? "";
  const roleName = selectedProfile?.sso_role_name ?? "";
  const region = selectedProfile?.region ?? settings.default_region;
  const accessToken = ssoStatus.access_token;
  const ssoRegion = ssoStatus.region;
  const onlineInstances = instances.filter((i) => i.pingStatus === "Online");

  // Reset instance browser when profile changes
  useEffect(() => {
    setShowBrowser(false);
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

  const effectiveLocalPort = useRandomPort
    ? 0
    : localPort
      ? parseInt(localPort, 10)
      : parseInt(remotePort, 10) || 0;

  const canSave =
    selectedProfile &&
    instanceId.trim() &&
    remoteHost.trim() &&
    remotePort &&
    parseInt(remotePort, 10) > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id ?? "",
      name: tunnelName || `${remoteHost}:${remotePort}`,
      accountId,
      roleName,
      instanceId: instanceId.trim(),
      remoteHost: remoteHost.trim(),
      remotePort: parseInt(remotePort, 10),
      localPort: effectiveLocalPort,
      region,
      useRandomPort,
    });
  };

  return (
    <div className="settings-form tunnel-form">
      <div className="form-field">
        <label htmlFor="tunnel-profile">
          Profile
          <button
            className="icon-btn icon-btn-inline"
            title="Refresh profiles"
            onClick={onRefreshProfiles}
          >
            <RefreshCw size={12} />
          </button>
        </label>
        {eligibleProfiles.length <= 1 ? (
          <span className="form-value">
            {selectedProfile?.name ?? "—"}{" "}
            <span className="text-muted">
              ({accountId} / {roleName})
            </span>
          </span>
        ) : (
          <select
            id="tunnel-profile"
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
        <label htmlFor="tunnel-instance">Bridge Instance</label>
        <div className="input-with-action">
          <input
            id="tunnel-instance"
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
                    {i.instanceName ?? i.computerName ?? "—"} – {i.instanceId}
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

      <div className="form-field">
        <label htmlFor="tunnel-remote-host">Remote Host</label>
        <input
          id="tunnel-remote-host"
          type="text"
          placeholder="e.g., mydb.cluster-abc.us-east-1.rds.amazonaws.com"
          value={remoteHost}
          onChange={(e) => setRemoteHost(e.target.value)}
        />
      </div>

      <div className="form-field-inline">
        <div className="form-field">
          <label htmlFor="tunnel-remote-port">Remote Port</label>
          <input
            id="tunnel-remote-port"
            type="number"
            placeholder="e.g., 5432"
            value={remotePort}
            onChange={(e) => setRemotePort(e.target.value)}
            min={1}
            max={65535}
          />
        </div>
        <div className="form-field">
          <label htmlFor="tunnel-local-port">
            Local Port
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useRandomPort}
                onChange={(e) => setUseRandomPort(e.target.checked)}
              />
              Random
            </label>
          </label>
          <input
            id="tunnel-local-port"
            type="number"
            placeholder={remotePort || "Same as remote"}
            value={useRandomPort ? "" : localPort}
            onChange={(e) => setLocalPort(e.target.value)}
            disabled={useRandomPort}
            min={1}
            max={65535}
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="tunnel-name">Name (optional)</label>
        <input
          id="tunnel-name"
          type="text"
          placeholder="e.g., Production DB"
          value={tunnelName}
          onChange={(e) => setTunnelName(e.target.value)}
        />
        <span className="form-hint">
          A friendly name for this tunnel configuration.
        </span>
      </div>

      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!canSave}
        >
          <Save size={16} />
          <span>{initial ? "Update Tunnel" : "Save Tunnel"}</span>
        </button>
        <button className="btn btn-outline" onClick={onCancel}>
          <X size={16} />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
}
