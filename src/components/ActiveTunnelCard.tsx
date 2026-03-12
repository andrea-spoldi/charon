import { useState } from "react";
import { Copy, XCircle } from "lucide-react";
import type { ActiveTunnel } from "../types";

interface ActiveTunnelCardProps {
  tunnel: ActiveTunnel;
  onStop: (tunnelId: string) => void;
}

export function ActiveTunnelCard({ tunnel, onStop }: ActiveTunnelCardProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStop = () => {
    if (confirmStop) {
      onStop(tunnel.id);
      setConfirmStop(false);
    } else {
      setConfirmStop(true);
      setTimeout(() => setConfirmStop(false), 3000);
    }
  };

  const handleCopyPort = () => {
    navigator.clipboard.writeText(`localhost:${tunnel.localPort}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusClass =
    tunnel.status === "connected"
      ? "tunnel-status-connected"
      : tunnel.status === "connecting"
        ? "tunnel-status-connecting"
        : tunnel.status === "error"
          ? "tunnel-status-error"
          : "tunnel-status-disconnected";

  return (
    <div className={`tunnel-card ${statusClass}`}>
      <div className="tunnel-card-header">
        <span className={`tunnel-status-dot ${statusClass}`} />
        <span className="tunnel-card-name">
          {tunnel.configName || `${tunnel.remoteHost}:${tunnel.remotePort}`}
        </span>
        <span className="tunnel-card-status">{tunnel.status}</span>
      </div>
      <div className="tunnel-card-details">
        <div className="tunnel-card-row">
          <span className="text-muted">Remote:</span>
          <span>
            {tunnel.remoteHost}:{tunnel.remotePort}
          </span>
        </div>
        <div className="tunnel-card-row">
          <span className="text-muted">Local:</span>
          <span className="tunnel-local-port">
            localhost:{tunnel.localPort}
            <button
              className="icon-btn"
              title="Copy local address"
              onClick={handleCopyPort}
            >
              <Copy size={12} />
              {copied && <span className="copied-tooltip">Copied!</span>}
            </button>
          </span>
        </div>
        <div className="tunnel-card-row">
          <span className="text-muted">Instance:</span>
          <span>{tunnel.instanceId}</span>
        </div>
        {tunnel.errorMessage && (
          <div className="tunnel-card-row tunnel-error">
            {tunnel.errorMessage}
          </div>
        )}
      </div>
      <div className="tunnel-card-actions">
        <button
          className={`btn btn-sm ${confirmStop ? "btn-danger" : "btn-outline"}`}
          onClick={handleStop}
          title={confirmStop ? "Click again to confirm" : "Disconnect tunnel"}
        >
          <XCircle size={14} />
          {confirmStop ? "Confirm disconnect" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}
