import { useState } from "react";
import { AlertTriangle, Trash2, Zap } from "lucide-react";
import type {
  SsoTokenInfo,
  SsoAccount,
  AccountRole,
  SsmInstance,
  TunnelConfig,
  ActiveTunnel,
  AppSettings,
} from "../types";
import { TunnelForm } from "../components/TunnelForm";
import { ActiveTunnelCard } from "../components/ActiveTunnelCard";

interface TunnelsPageProps {
  ssoStatus: SsoTokenInfo;
  accounts: SsoAccount[];
  roles: Record<string, AccountRole[]>;
  instances: SsmInstance[];
  activeTunnels: ActiveTunnel[];
  configs: TunnelConfig[];
  settings: AppSettings;
  pluginInstalled: boolean | null;
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
  onStop: (tunnelId: string) => void;
  onSaveConfig: (config: TunnelConfig) => void;
  onDeleteConfig: (id: string) => void;
  onError: (msg: string, type?: "error" | "info") => void;
}

export function TunnelsPage({
  ssoStatus,
  accounts,
  roles,
  instances,
  activeTunnels,
  configs,
  settings,
  pluginInstalled,
  loadingInstances,
  onFetchRoles,
  onFetchInstances,
  onConnect,
  onStop,
  onSaveConfig,
  onDeleteConfig,
  onError,
}: TunnelsPageProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [quickConnecting, setQuickConnecting] = useState<string | null>(null);

  const handleDeleteConfig = (id: string) => {
    if (deleteConfirm === id) {
      onDeleteConfig(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleQuickConnect = async (config: TunnelConfig) => {
    if (!ssoStatus.access_token || !ssoStatus.region) return;
    setQuickConnecting(config.id);
    try {
      await onConnect({
        accessToken: ssoStatus.access_token,
        accountId: config.accountId,
        roleName: config.roleName,
        ssoRegion: ssoStatus.region,
        instanceId: config.instanceId,
        remoteHost: config.remoteHost,
        remotePort: config.remotePort,
        localPort: config.useRandomPort ? 0 : config.localPort,
        region: config.region,
        configName: config.name,
      });
    } catch (err) {
      onError(String(err), "error");
    } finally {
      setQuickConnecting(null);
    }
  };

  if (ssoStatus.status !== "active") {
    return (
      <div className="page">
        <div className="page-header">
          <h2>Tunnels</h2>
        </div>
        <div className="empty-state">
          <p>Login to SSO to use port-forwarding tunnels.</p>
          <p className="text-muted">
            Use the Login button in the top bar to authenticate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Tunnels</h2>
        {activeTunnels.length > 0 && (
          <span className="text-muted">
            {activeTunnels.filter((t) => t.status === "connected").length}{" "}
            active
          </span>
        )}
      </div>

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
            to use port-forwarding.
          </span>
        </div>
      )}

      {/* Active Tunnels */}
      {activeTunnels.length > 0 && (
        <section className="tunnels-section">
          <h3>Active Tunnels</h3>
          <div className="tunnel-cards">
            {activeTunnels.map((tunnel) => (
              <ActiveTunnelCard
                key={tunnel.id}
                tunnel={tunnel}
                onStop={onStop}
              />
            ))}
          </div>
        </section>
      )}

      {/* Saved Configs */}
      {configs.length > 0 && (
        <section className="tunnels-section">
          <h3>Saved Configurations</h3>
          <div className="config-list">
            {configs.map((config) => (
              <div key={config.id} className="config-card">
                <div className="config-card-info">
                  <span className="config-card-name">{config.name}</span>
                  <span className="text-muted">
                    {config.remoteHost}:{config.remotePort} via{" "}
                    {config.instanceId}
                  </span>
                </div>
                <div className="config-card-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleQuickConnect(config)}
                    disabled={quickConnecting === config.id}
                    title="Quick connect"
                  >
                    <Zap size={12} />
                    {quickConnecting === config.id
                      ? "Connecting..."
                      : "Connect"}
                  </button>
                  <button
                    className={`btn btn-sm ${deleteConfirm === config.id ? "btn-danger" : "btn-outline"}`}
                    onClick={() => handleDeleteConfig(config.id)}
                    title={
                      deleteConfirm === config.id
                        ? "Click again to confirm"
                        : "Delete config"
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* New Tunnel Form */}
      <section className="tunnels-section">
        <TunnelForm
          ssoStatus={ssoStatus}
          accounts={accounts}
          roles={roles}
          instances={instances}
          settings={settings}
          loadingInstances={loadingInstances}
          onFetchRoles={onFetchRoles}
          onFetchInstances={onFetchInstances}
          onConnect={async (params) => {
            await onConnect(params);
          }}
          onSave={onSaveConfig}
          onError={(msg) => onError(msg, "error")}
        />
      </section>
    </div>
  );
}
