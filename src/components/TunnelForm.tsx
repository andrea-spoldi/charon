import { useState } from "react";
import { RefreshCw, Save, Zap } from "lucide-react";
import type {
  SsoTokenInfo,
  AwsProfile,
  SsmInstance,
  TunnelConfig,
  AppSettings,
} from "../types";

interface TunnelFormProps {
  ssoStatus: SsoTokenInfo;
  profile: AwsProfile;
  instances: SsmInstance[];
  settings: AppSettings;
  loadingInstances: boolean;
  onFetchInstances: (
    accessToken: string,
    accountId: string,
    roleName: string,
    ssoRegion: string,
    targetRegion: string,
  ) => void;
  onConnect: (params: {
    accessToken: string;
    accountId: string;
    roleName: string;
    ssoRegion: string;
    instanceId: string;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    region: string;
    configName?: string;
  }) => Promise<void>;
  onSave: (config: TunnelConfig) => void;
  onError: (msg: string) => void;
}

export function TunnelForm({
  ssoStatus,
  profile,
  instances,
  settings,
  loadingInstances,
  onFetchInstances,
  onConnect,
  onSave,
  onError,
}: TunnelFormProps) {
  const [instanceId, setInstanceId] = useState("");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [useRandomPort, setUseRandomPort] = useState(false);
  const [tunnelName, setTunnelName] = useState("");
  const [connecting, setConnecting] = useState(false);

  const accountId = profile.sso_account_id!;
  const roleName = profile.sso_role_name!;
  const region = profile.region ?? settings.default_region;
  const accessToken = ssoStatus.access_token;
  const ssoRegion = ssoStatus.region;
  const onlineInstances = instances.filter((i) => i.pingStatus === "Online");

  const handleRefreshInstances = () => {
    if (accessToken && ssoRegion) {
      onFetchInstances(accessToken, accountId, roleName, ssoRegion, region);
    }
  };

  const effectiveLocalPort = useRandomPort
    ? 0
    : localPort
      ? parseInt(localPort, 10)
      : parseInt(remotePort, 10) || 0;

  const canConnect =
    instanceId &&
    remoteHost.trim() &&
    remotePort &&
    parseInt(remotePort, 10) > 0 &&
    accessToken &&
    ssoRegion;

  const handleConnect = async () => {
    if (!canConnect || !accessToken || !ssoRegion) return;
    setConnecting(true);
    try {
      await onConnect({
        accessToken,
        accountId,
        roleName,
        ssoRegion,
        instanceId,
        remoteHost: remoteHost.trim(),
        remotePort: parseInt(remotePort, 10),
        localPort: effectiveLocalPort,
        region,
        configName: tunnelName || undefined,
      });
    } catch (err) {
      onError(String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleSave = () => {
    if (!canConnect) return;
    onSave({
      id: "",
      name: tunnelName || `${remoteHost}:${remotePort}`,
      accountId,
      roleName,
      instanceId,
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
        <label>Profile</label>
        <span className="form-value">
          {profile.name}{" "}
          <span className="text-muted">
            ({accountId} / {roleName})
          </span>
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="tunnel-instance">
          Bridge Instance
          <button
            className="icon-btn inline-icon-btn"
            title="Refresh instances"
            onClick={handleRefreshInstances}
            disabled={loadingInstances}
          >
            <RefreshCw size={12} className={loadingInstances ? "spin" : ""} />
          </button>
        </label>
        <select
          id="tunnel-instance"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          disabled={loadingInstances}
        >
          <option value="">
            {loadingInstances ? "Loading instances..." : "Select instance..."}
          </option>
          {onlineInstances.map((i) => (
            <option key={i.instanceId} value={i.instanceId}>
              {i.instanceId}
              {i.computerName ? ` (${i.computerName})` : ""}
              {i.ipAddress ? ` - ${i.ipAddress}` : ""}
            </option>
          ))}
        </select>
        {instances.length > 0 && onlineInstances.length === 0 && (
          <span className="form-hint">No online instances found</span>
        )}
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
            onChange={(e) => {
              setRemotePort(e.target.value);
              if (!localPort && !useRandomPort) {
                setLocalPort(e.target.value);
              }
            }}
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
          A friendly name for saving this tunnel configuration.
        </span>
      </div>

      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={!canConnect || connecting}
        >
          <Zap size={16} />
          <span>{connecting ? "Connecting..." : "Connect"}</span>
        </button>
        <button
          className="btn btn-outline"
          onClick={handleSave}
          disabled={!canConnect}
          title="Save configuration for quick re-use"
        >
          <Save size={16} />
          <span>Save Config</span>
        </button>
      </div>
    </div>
  );
}
