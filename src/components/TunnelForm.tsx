import { useState } from "react";
import { RefreshCw, Save, Zap } from "lucide-react";
import type {
  SsoTokenInfo,
  SsoAccount,
  AccountRole,
  SsmInstance,
  TunnelConfig,
  AppSettings,
} from "../types";

interface TunnelFormProps {
  ssoStatus: SsoTokenInfo;
  accounts: SsoAccount[];
  roles: Record<string, AccountRole[]>;
  instances: SsmInstance[];
  settings: AppSettings;
  loadingInstances: boolean;
  onFetchRoles: (
    accessToken: string,
    accountId: string,
    region: string,
  ) => void;
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
  accounts,
  roles,
  instances,
  settings,
  loadingInstances,
  onFetchRoles,
  onFetchInstances,
  onConnect,
  onSave,
  onError,
}: TunnelFormProps) {
  const [accountId, setAccountId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [useRandomPort, setUseRandomPort] = useState(false);
  const [tunnelName, setTunnelName] = useState("");
  const [connecting, setConnecting] = useState(false);

  const region = settings.default_region;
  const accessToken = ssoStatus.access_token;
  const ssoRegion = ssoStatus.region;
  const accountRoles = accountId ? roles[accountId] || [] : [];
  const onlineInstances = instances.filter((i) => i.pingStatus === "Online");

  const handleAccountChange = (newAccountId: string) => {
    setAccountId(newAccountId);
    setRoleName("");
    setInstanceId("");
    if (newAccountId && accessToken && ssoRegion) {
      onFetchRoles(accessToken, newAccountId, ssoRegion);
    }
  };

  const handleRoleChange = (newRoleName: string) => {
    setRoleName(newRoleName);
    setInstanceId("");
    if (accountId && newRoleName && accessToken && ssoRegion) {
      onFetchInstances(accessToken, accountId, newRoleName, ssoRegion, region);
    }
  };

  const handleRefreshInstances = () => {
    if (accountId && roleName && accessToken && ssoRegion) {
      onFetchInstances(accessToken, accountId, roleName, ssoRegion, region);
    }
  };

  const effectiveLocalPort = useRandomPort
    ? 0
    : localPort
      ? parseInt(localPort, 10)
      : parseInt(remotePort, 10) || 0;

  const canConnect =
    accountId &&
    roleName &&
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
    <div className="tunnel-form">
      <h3>New Tunnel</h3>

      <div className="form-row">
        <label>Account</label>
        <select
          value={accountId}
          onChange={(e) => handleAccountChange(e.target.value)}
        >
          <option value="">Select account...</option>
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.accountName} ({a.accountId})
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>Role</label>
        <select
          value={roleName}
          onChange={(e) => handleRoleChange(e.target.value)}
          disabled={!accountId}
        >
          <option value="">Select role...</option>
          {accountRoles.map((r) => (
            <option key={r.roleName} value={r.roleName}>
              {r.roleName}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>
          Bridge Instance
          {roleName && (
            <button
              className="icon-btn"
              title="Refresh instances"
              onClick={handleRefreshInstances}
              disabled={loadingInstances}
            >
              <RefreshCw size={12} className={loadingInstances ? "spin" : ""} />
            </button>
          )}
        </label>
        <select
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          disabled={!roleName || loadingInstances}
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
          <span className="text-muted form-hint">
            No online instances found
          </span>
        )}
      </div>

      <div className="form-row">
        <label>Remote Host</label>
        <input
          type="text"
          placeholder="e.g., mydb.cluster-abc.us-east-1.rds.amazonaws.com"
          value={remoteHost}
          onChange={(e) => setRemoteHost(e.target.value)}
        />
      </div>

      <div className="form-row-inline">
        <div className="form-row">
          <label>Remote Port</label>
          <input
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
        <div className="form-row">
          <label>
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

      <div className="form-row">
        <label>Name (optional)</label>
        <input
          type="text"
          placeholder="e.g., Production DB"
          value={tunnelName}
          onChange={(e) => setTunnelName(e.target.value)}
        />
      </div>

      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={!canConnect || connecting}
        >
          <Zap size={14} />
          {connecting ? "Connecting..." : "Connect"}
        </button>
        <button
          className="btn btn-outline"
          onClick={handleSave}
          disabled={!canConnect}
          title="Save configuration for quick re-use"
        >
          <Save size={14} />
          Save Config
        </button>
      </div>
    </div>
  );
}
