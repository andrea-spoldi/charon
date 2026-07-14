import { Globe, AlertCircle, StopCircle } from "lucide-react";
import type { SsoTokenInfo, AppSettings } from "../types";

interface StatusBarProps {
  ssoStatus: SsoTokenInfo;
  settings: AppSettings;
  hasActiveSessions?: boolean;
  onStopAllSessions?: () => void;
  error?: string | null;
}

export function StatusBar({
  ssoStatus,
  settings,
  hasActiveSessions,
  onStopAllSessions,
  error,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      {error ? (
        <div className="statusbar-error">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      ) : (
        <div className="statusbar-left" />
      )}
      <div className="statusbar-right">
        <span className="statusbar-item">
          <Globe size={12} />
          {settings.default_region}
        </span>
        {ssoStatus.status === "active" && hasActiveSessions && (
          <button
            className="statusbar-stop-btn"
            onClick={onStopAllSessions}
            title="Stop all active CLI sessions"
          >
            <StopCircle size={12} />
          </button>
        )}
        <span
          className={`statusbar-dot ${ssoStatus.status === "active" ? "statusbar-dot-active" : "statusbar-dot-inactive"}`}
        />
      </div>
    </footer>
  );
}
