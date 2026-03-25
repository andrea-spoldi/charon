import { useState } from "react";
import { AlertTriangle, Edit3, Plus, Trash2, Zap } from "lucide-react";
import type {
  SsoTokenInfo,
  AwsProfile,
  SsmInstance,
  TunnelConfig,
  ActiveTunnel,
  AppSettings,
} from "../types";
import { TunnelForm } from "../components/TunnelForm";
import { ActiveTunnelCard } from "../components/ActiveTunnelCard";

interface TunnelsPageProps {
  ssoStatus: SsoTokenInfo;
  profiles: AwsProfile[];
  defaultProfile: string | null;
  instances: SsmInstance[];
  activeTunnels: ActiveTunnel[];
  configs: TunnelConfig[];
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
  onRefreshProfiles: () => void;
  onError: (msg: string, type?: "error" | "info") => void;
}

export function TunnelsPage({
  ssoStatus,
  profiles,
  defaultProfile,
  instances,
  activeTunnels,
  configs,
  settings,
  pluginInstalled,
  loadingInstances,
  onFetchInstances,
  onConnect,
  onStop,
  onSaveConfig,
  onDeleteConfig,
  onRefreshProfiles,
  onError,
}: TunnelsPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TunnelConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleDeleteConfig = (id: string) => {
    if (deleteConfirm === id) {
      onDeleteConfig(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleConnect = async (config: TunnelConfig) => {
    if (!ssoStatus.access_token || !ssoStatus.region) return;
    setConnectingId(config.id);
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
      setConnectingId(null);
    }
  };

  const handleSaveConfig = (config: TunnelConfig) => {
    onSaveConfig(config);
    setShowForm(false);
    setEditingConfig(null);
  };

  const handleEdit = (config: TunnelConfig) => {
    setEditingConfig(config);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingConfig(null);
  };

  const ssoActive = ssoStatus.status === "active";

  return (
    <div className="page">
      <div className="page-header">
        <h2>Tunnels</h2>
        <div className="page-header-actions">
          {activeTunnels.length > 0 && (
            <span className="text-muted">
              {activeTunnels.filter((t) => t.status === "connected").length}{" "}
              active
            </span>
          )}
          {!showForm && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setEditingConfig(null);
                setShowForm(true);
              }}
            >
              <Plus size={14} />
              <span>New</span>
            </button>
          )}
        </div>
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
            to use port-forwarding.
          </span>
        </div>
      )}

      {/* New / Edit Tunnel Form (collapsible) */}
      {showForm && (
        <section className="tunnels-section">
          <TunnelForm
            ssoStatus={ssoStatus}
            profiles={profiles}
            defaultProfile={defaultProfile}
            instances={instances}
            settings={settings}
            loadingInstances={loadingInstances}
            initial={editingConfig}
            onFetchInstances={onFetchInstances}
            onRefreshProfiles={onRefreshProfiles}
            onSave={handleSaveConfig}
            onCancel={handleCancel}
          />
        </section>
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

      {/* Saved Tunnel Configs */}
      {configs.length > 0 ? (
        <section className="tunnels-section">
          <h3>Saved Tunnels</h3>
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
                    onClick={() => handleConnect(config)}
                    disabled={!ssoActive || connectingId === config.id}
                    title={ssoActive ? "Connect" : "SSO session required"}
                  >
                    <Zap size={12} />
                    {connectingId === config.id ? "Connecting..." : "Connect"}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => handleEdit(config)}
                    title="Edit"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    className={`icon-btn icon-btn-danger ${deleteConfirm === config.id ? "icon-btn-confirm" : ""}`}
                    onClick={() => handleDeleteConfig(config.id)}
                    title={
                      deleteConfirm === config.id
                        ? "Click again to confirm"
                        : "Delete"
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        !showForm && (
          <div className="empty-state">
            <p>No saved tunnels yet.</p>
            <p className="text-muted">
              Click <strong>New</strong> to create a tunnel configuration.
            </p>
          </div>
        )
      )}
    </div>
  );
}
